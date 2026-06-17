import {
  Clock,
  Matrix4,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  LCCRender,
  type LCCObject,
  type LCCPoint,
} from '../vendor/lcc/lcc-0.6.0.js';
import { XGRIDS_APP_KEY } from '../config';
import { FirstPersonController } from './FirstPersonController';

export interface ViewerEvents {
  onProgress: (percent: number) => void;
  onLoaded: () => void;
  onError: (error?: unknown) => void;
}

/**
 * The only two navigation modes that exist in this build. There is
 * deliberately no avatar / third-person mode.
 */
export type CameraMode = 'first-person' | 'pivot';

/**
 * Splat budget override. The LCC SDK auto-detects the device and, on phones
 * (and weaker GPUs), throttles the loaded splat count hard — as low as 1M,
 * versus a 3M desktop default — which is what makes captures look noticeably
 * worse on mobile. We lift the ceiling so the full capture streams in on every
 * device; real construction captures sit well under this, so in practice it
 * means "load everything, no mobile downgrade."
 */
const MAX_LOAD_SPLAT_COUNT = 16_000_000;

/** Keep-out distance between the camera and collision geometry (meters). */
const COLLISION_BUFFER = 0.35;
const PICK_MAX_DISTANCE = 1000;
const PICK_RADIUS = 0.1;

/** Double-tap detection: max gap between taps and max finger travel. */
const DOUBLE_TAP_MS = 400;
const DOUBLE_TAP_DIST_PX = 28;
const TAP_SLOP_PX = 8;

/**
 * Core Three.js viewer: scene, camera, renderer, render loop, and the
 * LCC-Web-SDK streaming loader — tuned for mobile GPUs.
 */
export class Viewer {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  readonly controls: FirstPersonController;

  private readonly orbit: OrbitControls;
  private mode: CameraMode = 'first-person';

  private readonly clock = new Clock();
  private model: LCCObject | null = null;
  private readonly frameListeners: Array<() => void> = [];

  private tapStart: { x: number; y: number } | null = null;
  private lastTap: { x: number; y: number; t: number } | null = null;

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
    // Render at the device's native resolution. The previous 2x DPR cap
    // visibly softened the model on high-density phone screens; honoring the
    // full devicePixelRatio is the single biggest mobile fidelity win.
    this.renderer.setPixelRatio(window.devicePixelRatio);
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
    this.controls.collisionGuard = this.collisionGuard;

    // Pivot (orbit) mode — created up front, enabled on demand.
    this.orbit = new OrbitControls(this.camera, canvas);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.08;
    this.orbit.enabled = false;

    // Double-click / double-tap in pivot mode re-centers the focal point.
    canvas.addEventListener('pointerdown', this.handleTapDown);
    canvas.addEventListener('pointerup', this.handleTapUp);

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
        // Stream the capture's collision mesh so camera collision and
        // precise measurement picking are available.
        useCollision: true,
        // The SDK's own loading effect stays off — the Lumina-branded
        // loading screen owns all loading UI (white-label requirement).
        useLoadingEffect: false,
        modelMatrix,
        appKey: XGRIDS_APP_KEY,
        // Override the SDK's per-device splat throttle (see constant above).
        maxLoadSplatCount: MAX_LOAD_SPLAT_COUNT,
      },
      () => {
        // The SDK applies its mobile downgrade during device detection, which
        // can clobber the load-time ceiling. Re-assert it (and enable LOD
        // auto-optimization) once the renderer is live so mobile renders at
        // full fidelity. Both are defensive: older SDK builds may omit them.
        if (this.model) {
          try {
            this.model.maxLoadSplatCount = MAX_LOAD_SPLAT_COUNT;
          } catch {
            /* read-only on this SDK build — load-time option still applies */
          }
          this.model.setLodAutoLevelUp?.(true);
        }
        events.onLoaded();
      },
      (percent) => events.onProgress(percent),
      (error) => events.onError(error),
    );
  }

  getCameraMode(): CameraMode {
    return this.mode;
  }

  /**
   * Switch between first-person and pivot navigation.
   * (Avatar / third-person mode is intentionally not implemented.)
   */
  setCameraMode(mode: CameraMode): void {
    if (mode === this.mode) return;
    this.mode = mode;

    if (mode === 'pivot') {
      this.controls.enabled = false;
      // Pivot around what the user is looking at; fall back to a point
      // 5 m ahead while the capture is still streaming.
      const target = this.pickScreenCenter() ?? this.forwardPoint(5);
      this.orbit.target.copy(target);
      this.orbit.enabled = true;
      this.orbit.update();
    } else {
      this.orbit.enabled = false;
      this.controls.enabled = true;
      this.controls.syncFromCamera();
    }
  }

  /**
   * Resolve a screen tap/click to a 3D point on the model. Prefers the
   * collision mesh (precise surfaces) and falls back to splat picking.
   */
  pickPoint = (clientX: number, clientY: number): Vector3 | null => {
    const evt = { x: clientX, y: clientY };

    if (this.model?.hasCollision?.() && this.model.intersectsRay) {
      const hit = this.model.intersectsRay({
        evt,
        maxDistance: PICK_MAX_DISTANCE,
      });
      if (hit) return toVector3(hit);
    }

    const hit =
      this.model?.raycast?.({
        evt,
        maxDistance: PICK_MAX_DISTANCE,
        radius: PICK_RADIUS,
      }) ??
      LCCRender.raycast({
        evt,
        maxDistance: PICK_MAX_DISTANCE,
        radius: PICK_RADIUS,
      });
    return hit ? toVector3(hit) : null;
  };

  /** Run a callback every frame (measurement label tracking, etc.). */
  addFrameListener(listener: () => void): void {
    this.frameListeners.push(listener);
  }

  start(): void {
    this.renderer.setAnimationLoop(() => {
      const dt = this.clock.getDelta();
      if (this.mode === 'first-person') {
        this.controls.update(dt);
      } else {
        this.orbit.update();
      }
      LCCRender.update();
      for (const listener of this.frameListeners) listener();
      this.renderer.render(this.scene, this.camera);
    });
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.handleResize);
    this.renderer.domElement.removeEventListener(
      'pointerdown',
      this.handleTapDown,
    );
    this.renderer.domElement.removeEventListener('pointerup', this.handleTapUp);
    this.controls.dispose();
    this.orbit.dispose();
    this.model?.dispose?.();
    this.renderer.dispose();
  }

  // ----------------------------------------------------------------- //

  /**
   * Collision clamp for first-person motion: cast the SDK collision-mesh
   * ray along the intended displacement and stop short of any surface,
   * so the camera cannot pass through walls or floors. No-op until the
   * capture's collision payload has streamed in.
   */
  private readonly collisionGuard = (from: Vector3, to: Vector3): Vector3 => {
    if (!this.model?.hasCollision?.() || !this.model.intersectsRayFromOrigin) {
      return to;
    }

    const direction = to.clone().sub(from);
    const distance = direction.length();
    if (distance < 1e-6) return to;
    direction.divideScalar(distance);

    const hit = this.model.intersectsRayFromOrigin({
      origin: { x: from.x, y: from.y, z: from.z },
      direction: { x: direction.x, y: direction.y, z: direction.z },
      maxDistance: distance + COLLISION_BUFFER,
    });
    if (!hit) return to;

    const hitDistance = from.distanceTo(toVector3(hit));
    const allowed = Math.max(0, hitDistance - COLLISION_BUFFER);
    if (allowed >= distance) return to;
    return from.clone().addScaledVector(direction, allowed);
  };

  /**
   * Manual double-tap detection on pointer events (works for both mouse
   * double-click and touch double-tap, which `dblclick` does not reliably
   * deliver under `touch-action: none`). In pivot mode, a double-tap on
   * the model re-targets OrbitControls to the tapped surface point.
   */
  private readonly handleTapDown = (e: PointerEvent): void => {
    if (!e.isPrimary) return;
    this.tapStart = { x: e.clientX, y: e.clientY };
  };

  private readonly handleTapUp = (e: PointerEvent): void => {
    if (!e.isPrimary || !this.tapStart) return;
    const start = this.tapStart;
    this.tapStart = null;

    // A drag is navigation, not a tap.
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    if (moved > TAP_SLOP_PX) {
      this.lastTap = null;
      return;
    }

    const now = performance.now();
    const prev = this.lastTap;
    this.lastTap = { x: e.clientX, y: e.clientY, t: now };

    const isDouble =
      prev !== null &&
      now - prev.t < DOUBLE_TAP_MS &&
      Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < DOUBLE_TAP_DIST_PX;
    if (!isDouble || this.mode !== 'pivot') return;
    this.lastTap = null;

    const point = this.pickPoint(e.clientX, e.clientY);
    if (point) {
      this.orbit.target.copy(point);
      this.orbit.update();
    }
  };

  private pickScreenCenter(): Vector3 | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return this.pickPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
  }

  private forwardPoint(meters: number): Vector3 {
    const dir = new Vector3();
    this.camera.getWorldDirection(dir);
    return this.camera.position.clone().addScaledVector(dir, meters);
  }

  private readonly handleResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };
}

function toVector3(p: LCCPoint): Vector3 {
  return new Vector3(p.x, p.y, p.z);
}
