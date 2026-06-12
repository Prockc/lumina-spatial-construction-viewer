import {
  BufferGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
} from 'three';

export type MeasureMode = 'distance' | 'area' | null;

const BRAND = 0xdb146b;
/** Max tap travel (px) before a gesture counts as a look-drag, not a pick. */
const TAP_SLOP_PX = 8;
const TAP_MAX_MS = 600;

interface MeasureDeps {
  scene: Scene;
  camera: PerspectiveCamera;
  canvas: HTMLCanvasElement;
  /** Resolves a screen point to a 3D point on the model (SDK raycast). */
  pick: (clientX: number, clientY: number) => Vector3 | null;
}

/**
 * Distance & area measurement built on the LCC SDK raycast interface.
 *
 * The SDK has no measurement UI of its own — it provides point picking
 * (splat raycast + collision-mesh intersection) and this tool does the
 * rest: tap/click to place vertices, polyline length in distance mode,
 * planar polygon area (Newell projection + shoelace) in area mode.
 * All gizmos render depth-test-off in the brand color so they stay
 * legible inside the splat cloud.
 */
export class MeasureTool {
  private readonly deps: MeasureDeps;
  private readonly group = new Group();
  private readonly labelLayer: HTMLDivElement;

  private mode: MeasureMode = null;
  private points: Vector3[] = [];
  private markers: Mesh[] = [];
  private labels: { el: HTMLDivElement; anchor: Vector3 }[] = [];
  private line: Line | null = null;

  private readonly markerGeometry = new SphereGeometry(1, 16, 12);
  private readonly markerMaterial = new MeshBasicMaterial({
    color: BRAND,
    depthTest: false,
    transparent: true,
  });
  private readonly lineMaterial = new LineBasicMaterial({
    color: BRAND,
    depthTest: false,
    transparent: true,
  });

  private pointerDown: { x: number; y: number; t: number } | null = null;
  private readonly projected = new Vector3();

  /** Notified whenever the measurement sketch changes (for UI state). */
  onChange: ((pointCount: number) => void) | null = null;

  constructor(deps: MeasureDeps) {
    this.deps = deps;
    this.group.renderOrder = 999;
    deps.scene.add(this.group);

    this.labelLayer = document.createElement('div');
    this.labelLayer.id = 'lumina-measure-labels';
    document.body.appendChild(this.labelLayer);

    deps.canvas.addEventListener('pointerdown', this.handlePointerDown);
    deps.canvas.addEventListener('pointerup', this.handlePointerUp);
  }

  getMode(): MeasureMode {
    return this.mode;
  }

  setMode(mode: MeasureMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    // A distance polyline and an area polygon are different sketches;
    // switching tools starts fresh.
    this.clear();
  }

  clear(): void {
    this.points = [];
    this.rebuildVisuals();
    this.onChange?.(0);
  }

  /** Call once per frame: keeps labels glued to their anchors and markers
   *  at a constant on-screen size. */
  update(): void {
    const { camera, canvas } = this.deps;

    for (const marker of this.markers) {
      const dist = marker.position.distanceTo(camera.position);
      const s = Math.max(0.008, dist * 0.008);
      marker.scale.setScalar(s);
    }

    const rect = canvas.getBoundingClientRect();
    for (const { el, anchor } of this.labels) {
      this.projected.copy(anchor).project(camera);
      const behind = this.projected.z > 1;
      if (behind) {
        el.style.display = 'none';
        continue;
      }
      el.style.display = '';
      const x = rect.left + ((this.projected.x + 1) / 2) * rect.width;
      const y = rect.top + ((1 - this.projected.y) / 2) * rect.height;
      el.style.transform = `translate(-50%, -130%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }

  dispose(): void {
    this.deps.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.deps.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.clear();
    this.deps.scene.remove(this.group);
    this.markerGeometry.dispose();
    this.markerMaterial.dispose();
    this.lineMaterial.dispose();
    this.labelLayer.remove();
  }

  // ----------------------------------------------------------------- //

  private readonly handlePointerDown = (e: PointerEvent): void => {
    if (!this.mode || !e.isPrimary) return;
    this.pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() };
  };

  private readonly handlePointerUp = (e: PointerEvent): void => {
    if (!this.mode || !e.isPrimary || !this.pointerDown) return;
    const start = this.pointerDown;
    this.pointerDown = null;

    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    const elapsed = performance.now() - start.t;
    // A drag is camera navigation, not a measurement pick.
    if (moved > TAP_SLOP_PX || elapsed > TAP_MAX_MS) return;

    const point = this.deps.pick(e.clientX, e.clientY);
    if (!point) return;

    this.points.push(point);
    this.rebuildVisuals();
    this.onChange?.(this.points.length);
  };

  private rebuildVisuals(): void {
    for (const m of this.markers) this.group.remove(m);
    this.markers = [];
    if (this.line) {
      this.group.remove(this.line);
      this.line.geometry.dispose();
      this.line = null;
    }
    for (const { el } of this.labels) el.remove();
    this.labels = [];

    for (const p of this.points) {
      const marker = new Mesh(this.markerGeometry, this.markerMaterial);
      marker.position.copy(p);
      marker.renderOrder = 1000;
      this.markers.push(marker);
      this.group.add(marker);
    }

    if (this.points.length >= 2) {
      const linePoints =
        this.mode === 'area' && this.points.length >= 3
          ? [...this.points, this.points[0]] // close the polygon
          : this.points;
      const geometry = new BufferGeometry().setFromPoints(linePoints);
      this.line = new Line(geometry, this.lineMaterial);
      this.line.renderOrder = 1000;
      this.group.add(this.line);
    }

    if (this.mode === 'distance') this.buildDistanceLabels();
    if (this.mode === 'area') this.buildAreaLabel();
  }

  private buildDistanceLabels(): void {
    let total = 0;
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1];
      const b = this.points[i];
      const len = a.distanceTo(b);
      total += len;
      const mid = new Vector3().addVectors(a, b).multiplyScalar(0.5);
      this.addLabel(formatLength(len), mid);
    }
    if (this.points.length > 2) {
      this.addLabel(
        `Σ ${formatLength(total)}`,
        this.points[this.points.length - 1],
        true,
      );
    }
  }

  private buildAreaLabel(): void {
    if (this.points.length < 3) return;
    const area = polygonArea(this.points);
    const centroid = new Vector3();
    for (const p of this.points) centroid.add(p);
    centroid.divideScalar(this.points.length);
    this.addLabel(formatArea(area), centroid, true);
  }

  private addLabel(text: string, anchor: Vector3, emphasis = false): void {
    const el = document.createElement('div');
    el.className = emphasis
      ? 'lumina-measure-label lumina-measure-label--total'
      : 'lumina-measure-label';
    el.textContent = text;
    this.labelLayer.appendChild(el);
    this.labels.push({ el, anchor: anchor.clone() });
  }
}

function formatLength(meters: number): string {
  if (meters < 1) return `${(meters * 100).toFixed(1)} cm`;
  return `${meters.toFixed(2)} m`;
}

function formatArea(squareMeters: number): string {
  return `${squareMeters.toFixed(2)} m²`;
}

/**
 * Area of a (possibly non-planar) 3D polygon: Newell's method gives the
 * best-fit plane normal; half its magnitude is the projected area.
 */
function polygonArea(points: Vector3[]): number {
  const normal = new Vector3();
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    normal.x += (a.y - b.y) * (a.z + b.z);
    normal.y += (a.z - b.z) * (a.x + b.x);
    normal.z += (a.x - b.x) * (a.y + b.y);
  }
  return normal.length() / 2;
}
