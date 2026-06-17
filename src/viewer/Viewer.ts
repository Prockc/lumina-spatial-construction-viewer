import {
  Clock,
  Matrix4,
  PerspectiveCamera,
  Quaternion,
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
 * Quality profiles applied to the Three.js renderer + LCC renderer handle.
 *
 * These cover the knobs reachable *after* load: the WebGL backbuffer scale
 * (pixel ratio) and the SDK's splat budgets. They are NOT the whole story —
 * the dominant mobile quality killer is the SDK's per-device LOD-distance cap
 * (MaxLodDistance 200 -> 30), which has no runtime setter. That one is handled
 * by the vendored-SDK patch (scripts/patch-lcc-sdk.mjs) gated on the
 * window.__LUMINA_HD__ flag set in index.html. These profiles complement it.
 *
 * `lodAutoLevelUp` maps to the SDK's `useLodAutoOptimization`. Verified in the
 * bundle: when the scene is under the splat budget it *raises* LOD detail up to
 * the screen-space-error cap — i.e. ON = more detail. Hence ON for HD, OFF for
 * performance (don't spend the budget chasing detail on weak devices).
 */
interface QualityProfile {
  /** Three.js renderer pixel ratio = WebGL backbuffer scale. */
  pixelRatio: number;
  maxLoadSplatCount: number;
  maxNodeSplats: number;
  lodAutoLevelUp: boolean;
}

const QUALITY_PROFILES: Record<'hd' | 'performance', QualityProfile> = {
  hd: {
    pixelRatio: window.devicePixelRatio,
    maxLoadSplatCount: 16_000_000,
    maxNodeSplats: 2_000_000,
    lodAutoLevelUp: true,
  },
  performance: {
    // Lower backbuffer scale is the biggest perf lever on dense phone screens.
    pixelRatio: Math.min(window.devicePixelRatio, 1.5),
    maxLoadSplatCount: 1_000_000,
    maxNodeSplats: 500_000,
    lodAutoLevelUp: false,
  },
};

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

  /** HD toggle state. Defaults ON so the viewer opens at full fidelity. */
  private highQuality = true;

  /** Starting view, captured at construction, for the Reset button. */
  private readonly initialPosition = new Vector3();
  private readonly initialQuaternion = new Quaternion();
  private readonly initialTarget = new Vector3();

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
    // Start at the HD profile's pixel ratio (native resolution). The previous
    // 2x DPR cap visibly softened the model on high-density phone screens;
    // honoring full devicePixelRatio is the single biggest mobile fidelity win.
    // The remaining SDK splat/LOD knobs are applied once the model is live
    // (see applyQuality), since they live on the renderer handle.
    this.renderer.setPixelRatio(QUALITY_PROFILES.hd.pixelRatio);
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

    // Snapshot the starting view so the Reset button can return to it exactly.
    this.initialPosition.copy(this.camera.position);
    this.initialQuaternion.copy(this.camera.quaternion);
    this.initialTarget.set(0, 1.7, -1);

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
        // Override the SDK's per-device splat throttle from the first byte,
        // honoring the active profile (set by main before load()).
        maxLoadSplatCount: this.profile().maxLoadSplatCount,
      },
      () => {
        // The SDK applies its mobile downgrade during device detection, which
        // can clobber the load-time ceiling. Re-assert the active quality
        // profile once the renderer handle is live (the splat/LOD setters only
        // exist there) so mobile honors the current HD toggle state.
        this.applyQuality();
        events.onLoaded();
      },
      (percent) => events.onProgress(percent),
      (error) => events.onError(error),
    );
  }

  getCameraMode(): CameraMode {
    return this.mode;
  }

  getHighQuality(): boolean {
    return this.highQuality;
  }

  /**
   * Snap the camera (and, in pivot mode, the orbit focus) back to the exact
   * starting view captured at construction.
   */
  resetView(): void {
    this.camera.position.copy(this.initialPosition);
    this.camera.quaternion.copy(this.initialQuaternion);

    if (this.mode === 'pivot') {
      this.orbit.target.copy(this.initialTarget);
      this.orbit.update();
    } else {
      // Re-derive the first-person controller's yaw/pitch from the camera.
      this.controls.syncFromCamera();
    }
  }

  /**
   * Select the HD or performance profile. Applies the pixel-ratio and splat
   * budgets immediately (these are genuinely live), but note the SDK's
   * LOD-distance profile is fixed at load from window.__LUMINA_HD__ — switching
   * that requires a reload (handled by installBottomControls). main calls this
   * once with the persisted preference before load(); it is safe to call before
   * the model exists (the splat/LOD setters are then re-applied from the load
   * callback).
   */
  setHighQuality(enabled: boolean): void {
    this.highQuality = enabled;
    this.applyQuality();
  }

  private profile(): QualityProfile {
    return this.highQuality
      ? QUALITY_PROFILES.hd
      : QUALITY_PROFILES.performance;
  }

  private applyQuality(): void {
    const profile = this.profile();

    // Resize the WebGL backbuffer to the profile's pixel ratio. setSize must
    // follow setPixelRatio for the new ratio to take effect.
    this.renderer.setPixelRatio(profile.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    if (!this.model) return;
    try {
      // Writable on this SDK build; older builds expose only the load option.
      this.model.maxLoadSplatCount = profile.maxLoadSplatCount;
    } catch {
      /* read-only — the load-time ceiling stands */
    }
    this.model.setMaxNodeSplats?.(profile.maxNodeSplats);
    this.model.setLodAutoLevelUp?.(profile.lodAutoLevelUp);
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
