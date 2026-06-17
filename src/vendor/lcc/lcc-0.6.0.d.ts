/**
 * Type surface for the XGrids LCC-Web-SDK (v0.6.0).
 * The SDK ships as a prebuilt ES module with no published typings, so this
 * sibling declaration covers only the API used by the
 * Lumina Spatial .ios Viewer.
 *
 * Verified against the bundle:
 *  - The exported `LCCRender` facade exposes load/update/raycast/
 *    raycastFromOrigin (plus lifecycle helpers).
 *  - `LCCRender.load()` returns the renderer instance, which additionally
 *    exposes the collision-mesh queries (`intersectsRay*`, `hasCollision`).
 *    Collision data is part of the capture and loads when `useCollision`
 *    is enabled.
 *  - `evt.x` / `evt.y` are CSS client coordinates (clientX / clientY);
 *    the SDK converts them to NDC against the canvas bounding rect.
 */
import type {
  Camera,
  Matrix4,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';

export interface LCCPoint {
  x: number;
  y: number;
  z: number;
}

export interface LCCScreenEvent {
  /** clientX in CSS pixels. */
  x: number;
  /** clientY in CSS pixels. */
  y: number;
}

export interface LCCRaycastOptions {
  evt: LCCScreenEvent;
  maxDistance: number;
  /** Splat-picking tolerance radius in scene units. */
  radius: number;
}

export interface LCCRayFromOriginOptions {
  origin: LCCPoint;
  direction: LCCPoint;
  maxDistance: number;
  radius: number;
}

export interface LCCIntersectOptions {
  evt: LCCScreenEvent;
  maxDistance: number;
}

export interface LCCIntersectFromOriginOptions {
  origin: LCCPoint;
  direction: LCCPoint;
  maxDistance: number;
}

export interface LCCLoadOptions {
  camera: Camera;
  scene: Scene;
  /** Absolute URL of the .lcc meta file or .lcc2 asset. */
  dataPath: string;
  /** The `three` module namespace. */
  renderLib: unknown;
  canvas: HTMLCanvasElement;
  renderer: WebGLRenderer;
  /** Force LCC2 parsing. Auto-detected from a `.lcc2` dataPath suffix. */
  useLcc2?: boolean;
  useEnv?: boolean;
  /** Enable IndexedDB tile caching. */
  useIndexDB?: boolean;
  /** SDK built-in shader reveal effect during streaming. */
  useLoadingEffect?: boolean;
  loadingEffectCenter?: Vector3 | null;
  modelMatrix?: Matrix4;
  /** XGrids developer app key. Licenses the SDK and removes the XGrids watermark. */
  appKey?: string | null;
  /** Load the capture's collision mesh (required for intersectsRay*). */
  useCollision?: boolean;
  maxLoadSplatCount?: number;
}

/**
 * Renderer handle returned by `LCCRender.load()`. Collision-mesh queries
 * are marked optional defensively: availability depends on the capture
 * containing collision data and on the renderer implementation.
 */
export interface LCCObject {
  /** Splat-based picking through the screen point. */
  raycast?(options: LCCRaycastOptions): LCCPoint | null;
  raycastFromOrigin?(options: LCCRayFromOriginOptions): LCCPoint | null;
  /** Collision-mesh picking through the screen point (precise surfaces). */
  intersectsRay?(options: LCCIntersectOptions): LCCPoint | null;
  intersectsRayFromOrigin?(
    options: LCCIntersectFromOriginOptions,
  ): LCCPoint | null;
  /** True once the capture's collision mesh is loaded and ready. */
  hasCollision?(): boolean;
  /**
   * Live splat budget. Writable: assigning re-applies the cap at runtime
   * (the SDK logs "set max splats: N" and flags the config dirty), which is
   * how we undo the SDK's automatic mobile/low-GPU downgrade after load.
   */
  maxLoadSplatCount?: number;
  /** Toggle the SDK's LOD auto-optimization (higher detail when stationary). */
  setLodAutoLevelUp?(enabled: boolean): void;
  dispose?(): void;
}

export declare const LCCRender: {
  load(
    options: LCCLoadOptions,
    onLoaded?: (mesh: unknown) => void,
    onProgress?: (percent: number) => void,
    onError?: (error?: unknown) => void,
  ): LCCObject;
  /** Must be called once per animation frame. */
  update(): void;
  /** Splat-based picking through a screen point (client coordinates). */
  raycast(options: LCCRaycastOptions): LCCPoint | null | undefined;
  raycastFromOrigin(
    options: LCCRayFromOriginOptions,
  ): LCCPoint | null | undefined;
  unload(obj: LCCObject): void;
  dispose(): void;
  clearIndexDB(): void;
  getVersion(): string;
};
