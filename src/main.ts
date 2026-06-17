import './style.css';
import { Amplify } from 'aws-amplify';
import { installBrandGuard } from './ui/brandGuard';
import { LoadingScreen } from './ui/LoadingScreen';
import { installJoysticks } from './ui/joystick';
import { installToolbar } from './ui/toolbar';
import { installQualityToggle } from './ui/qualityToggle';
import { MeasureTool } from './tools/MeasureTool';
import { Viewer } from './viewer/Viewer';
import { resolveModelUrl } from './config';

// Brand guard first: nothing non-Lumina may ever paint.
installBrandGuard();

// Amplify is initialized up front so backend categories (Auth-gated model
// access, Storage, Analytics) can be attached later without restructuring.
// Hosting itself needs no client config, hence the empty resource map.
Amplify.configure({});

function buildHud(): void {
  const hud = document.createElement('div');
  hud.id = 'lumina-hud';
  hud.innerHTML = `<img class="lumina-hud__logo" src="/logo.png" alt="Lumina Spatial" />`;
  document.body.appendChild(hud);

  const hint = document.createElement('div');
  hint.id = 'lumina-hint';
  hint.textContent = 'Drag to look · WASD to move · Shift to sprint';
  document.body.appendChild(hint);
}

function main(): void {
  buildHud();

  const { url, name, error } = resolveModelUrl();
  const loadingScreen = new LoadingScreen(name);

  if (!url) {
    loadingScreen.showError(error ?? 'Unable to resolve model.');
    return;
  }

  const canvas = document.getElementById('viewer-canvas') as HTMLCanvasElement;
  const viewer = new Viewer(canvas);

  viewer.load(url, {
    onProgress: (percent) => loadingScreen.setProgress(percent),
    onLoaded: () => {
      loadingScreen.setProgress(1);
      loadingScreen.hide();
    },
    onError: (err) => {
      console.error('[Lumina] model load failed:', err);
      loadingScreen.showError(
        'This capture could not be loaded. Please verify the model name and try again.',
      );
    },
  });

  // Measurement (distance / area) on top of the SDK raycast interface.
  const measureTool = new MeasureTool({
    scene: viewer.scene,
    camera: viewer.camera,
    canvas,
    pick: viewer.pickPoint,
  });
  viewer.addFrameListener(() => measureTool.update());

  // HD quality toggle (bottom-right). Defaults ON; flips the viewer between
  // full desktop fidelity and the SDK's native mobile profile on the fly.
  installQualityToggle((hd) => viewer.setHighQuality(hd), viewer.getHighQuality());

  // Mobile: single left movement stick; look = touch-drag on the canvas.
  const joystick = installJoysticks(viewer.controls);

  const toolbar = installToolbar({
    onCameraMode: (mode) => {
      viewer.setCameraMode(mode);
      // The movement stick is a first-person control only.
      joystick.setVisible(mode === 'first-person');
    },
    onMeasureMode: (mode) => measureTool.setMode(mode),
    onClearMeasurements: () => measureTool.clear(),
  });
  measureTool.onChange = (count) => toolbar.setHasMeasurements(count > 0);

  const hint = document.getElementById('lumina-hint');
  viewer.controls.setFirstInteractionCallback(() => {
    hint?.classList.add('lumina-hint--hidden');
  });

  viewer.start();
}

main();
