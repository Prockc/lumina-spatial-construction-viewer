/**
 * Type surface for the XGrids LCC-Web-SDK (v0.6.0).
 * The SDK ships as a prebuilt ES module with no published typings, so this
 * sibling declaration covers only the API used by the
 * Lumina Spatial Construction Viewer.
 */
import type {
  Camera,
  Matrix4,
  Object3D,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';

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
  useCollision?: boolean;
  maxLoadSplatCount?: number;
}

export interface LCCObject extends Object3D {
  dispose?: () => void;
}

export declare const LCCRender: {
  load(
    options: LCCLoadOptions,
    onLoaded?: (mesh: LCCObject) => void,
    onProgress?: (percent: number) => void,
    onError?: (error?: unknown) => void,
  ): LCCObject;
  /** Must be called once per animation frame. */
  update(): void;
};
