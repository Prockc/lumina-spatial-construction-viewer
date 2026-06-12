import type { CameraMode } from '../viewer/Viewer';
import type { MeasureMode } from '../tools/MeasureTool';

export interface ToolbarCallbacks {
  onCameraMode: (mode: CameraMode) => void;
  onMeasureMode: (mode: MeasureMode) => void;
  onClearMeasurements: () => void;
}

export interface ToolbarHandle {
  /** Enable/disable the clear button based on sketch content. */
  setHasMeasurements: (has: boolean) => void;
}

const ICONS: Record<string, string> = {
  // First-person: eye
  fp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6"/></svg>`,
  // Pivot: orbit ring around a point
  pivot: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/><path d="M19.5 8.5a9.5 4.8 0 1 0 .5 3.5"/><path d="M20.5 6.5l-.4 3.6-3.4-1.2"/></svg>`,
  // Distance: ruler
  distance: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.2" y="9.5" width="17.6" height="5" rx="1" transform="rotate(-45 12 12)"/><path d="M9.2 11.6l1.4 1.4M12 8.8l1.4 1.4M14.8 6l1.4 1.4"/></svg>`,
  // Area: polygon
  area: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l7.5 5.5-2.9 9H7.4l-2.9-9z"/><circle cx="12" cy="3.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="19.5" cy="9" r="1.4" fill="currentColor" stroke="none"/><circle cx="16.6" cy="18" r="1.4" fill="currentColor" stroke="none"/><circle cx="7.4" cy="18" r="1.4" fill="currentColor" stroke="none"/><circle cx="4.5" cy="9" r="1.4" fill="currentColor" stroke="none"/></svg>`,
  // Clear: trash
  clear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2M6.5 7l1 13h9l1-13"/><path d="M10 11v6M14 11v6"/></svg>`,
};

/**
 * Sleek right-edge tool overlay: camera mode (first-person / pivot — there
 * is no avatar option) and measurement tools (distance / area / clear).
 * Active tools light up in the Lumina brand color.
 */
export function installToolbar(callbacks: ToolbarCallbacks): ToolbarHandle {
  const root = document.createElement('div');
  root.id = 'lumina-toolbar';

  const cameraGroup = group('Camera mode');
  const fpBtn = button('fp', 'First-person view');
  const pivotBtn = button('pivot', 'Pivot view');
  cameraGroup.append(fpBtn, pivotBtn);

  const measureGroup = group('Measure');
  const distanceBtn = button('distance', 'Measure distance');
  const areaBtn = button('area', 'Measure area');
  const clearBtn = button('clear', 'Clear measurements');
  clearBtn.disabled = true;
  measureGroup.append(distanceBtn, areaBtn, clearBtn);

  root.append(cameraGroup, measureGroup);
  document.body.appendChild(root);

  const toast = document.createElement('div');
  toast.id = 'lumina-toast';
  toast.className = 'lumina-toast--hidden';
  document.body.appendChild(toast);
  let toastTimer = 0;

  function showToast(text: string): void {
    toast.textContent = text;
    toast.classList.remove('lumina-toast--hidden');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(
      () => toast.classList.add('lumina-toast--hidden'),
      2600,
    );
  }

  fpBtn.classList.add('active');

  function setCameraMode(mode: CameraMode): void {
    fpBtn.classList.toggle('active', mode === 'first-person');
    pivotBtn.classList.toggle('active', mode === 'pivot');
    callbacks.onCameraMode(mode);
    showToast(
      mode === 'pivot'
        ? 'Pivot mode — drag to orbit, pinch to zoom'
        : 'First-person mode',
    );
  }

  fpBtn.addEventListener('click', () => setCameraMode('first-person'));
  pivotBtn.addEventListener('click', () => setCameraMode('pivot'));

  let measureMode: MeasureMode = null;

  function setMeasureMode(mode: MeasureMode): void {
    measureMode = measureMode === mode ? null : mode;
    distanceBtn.classList.toggle('active', measureMode === 'distance');
    areaBtn.classList.toggle('active', measureMode === 'area');
    callbacks.onMeasureMode(measureMode);
    if (measureMode === 'distance') {
      showToast('Tap the model to place points along a path');
    } else if (measureMode === 'area') {
      showToast('Tap 3+ points to outline an area');
    }
  }

  distanceBtn.addEventListener('click', () => setMeasureMode('distance'));
  areaBtn.addEventListener('click', () => setMeasureMode('area'));
  clearBtn.addEventListener('click', () => callbacks.onClearMeasurements());

  return {
    setHasMeasurements(has: boolean): void {
      clearBtn.disabled = !has;
    },
  };
}

function group(label: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'lumina-toolbar__group';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', label);
  return el;
}

function button(icon: keyof typeof ICONS, label: string): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'lumina-toolbar__btn';
  el.title = label;
  el.setAttribute('aria-label', label);
  el.innerHTML = ICONS[icon];
  return el;
}
