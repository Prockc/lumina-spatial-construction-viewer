import {
  Clock,
  Matrix4,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import * as THREE from 'three';
import { LCCRender, type LCCObject } from '../vendor/lcc/lcc-0.6.0.js';
import { XGRIDS_APP_KEY } from '../config';
import { FirstPersonController } from './FirstPersonController';

export interface ViewerEvents {
  onProgress: (percent: number) => void;
  onLoaded: (model: LCCObject) => void;
  onError: (error?: unknown) => void;
}

/**
 * Core Three.js viewer: scene, camera, renderer, render loop, and the
 * LCC-Web-SDK streaming loader — tuned for mobile GPUs.
 */
export class Viewer {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  readonly controls: FirstPersonController;

  private readonly clock = new Clock();
  private model: LCCObject | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      canvas,
      // Gaussian splats are resolution-bound, not edge-bound; skipping MSAA
      // is a large win on mobile GPUs with no visible quality cost.
      antialias: false,
      powerPreference: 'high-performance',
      // Splat alpha-blending composites against the clear color, not the page.
      alpha: false,
      stencil: false,
    });
    // Cap DPR: rendering at 3x on modern phones triples fill-rate for
    // imperceptible gains with splats.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x0e0e12);

    this.camera = new PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      150000,
    );
    this.camera.position.set(0, 1.7, 0); // eye height for a walkthrough start
    this.camera.lookAt(new Vector3(0, 1.7, -1));

    this.controls = new FirstPersonController(this.camera, canvas);

    window.addEventListener('resize', this.handleResize);
  }

  /** Begin streaming an .lcc2 capture from the given URL. */
  load(dataPath: string, events: ViewerEvents): void {
    // LCC captures are Z-up; this basis change (from the official SDK
    // examples) brings them into Three.js Y-up space.
    const modelMatrix = new Matrix4().set(
      -1, 0, 0, 0,
      0, 0, 1, 0,
      0, 1, 0, 0,
      0, 0, 0, 1,
    );

    this.model = LCCRender.load(
      {
        camera: this.camera,
        scene: this.scene,
        dataPath,
        renderLib: THREE,
        canvas: this.renderer.domElement,
        renderer: this.renderer,
        useEnv: true,
        useIndexDB: true,
        // The SDK's own loading effect stays off — the Lumina-branded
        // loading screen owns all loading UI (white-label requirement).
        useLoadingEffect: false,
        modelMatrix,
        appKey: XGRIDS_APP_KEY,
      },
      (mesh) => events.onLoaded(mesh),
      (percent) => events.onProgress(percent),
      (error) => events.onError(error),
    );
  }

  start(): void {
    this.renderer.setAnimationLoop(() => {
      const dt = this.clock.getDelta();
      this.controls.update(dt);
      LCCRender.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.handleResize);
    this.controls.dispose();
    this.model?.dispose?.();
    this.renderer.dispose();
  }

  private readonly handleResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };
}
