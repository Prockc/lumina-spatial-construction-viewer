import { Euler, Vector3, type PerspectiveCamera } from 'three';

const PITCH_LIMIT = Math.PI / 2 - 0.05;

/**
 * Strictly first-person camera controller (the viewer's only navigation
 * mode — there is intentionally no orbit / third-person / robot mode).
 *
 * Inputs:
 *  - Desktop: pointer-drag to look, WASD / arrow keys to move,
 *    Q/E for down/up, Shift to sprint.
 *  - Mobile: `setMoveInput` / `setLookInput` are fed by the nipplejs
 *    joysticks ([-1, 1] each axis), and single-finger drags on the canvas
 *    outside the stick zones also rotate the view.
 *
 * Movement is fly-style (forward follows the full view direction), with
 * critically-damped smoothing for the fluid SuperSplat feel.
 */
export class FirstPersonController {
  /** Base movement speed in scene units per second. */
  movementSpeed = 2.5;
  sprintMultiplier = 3;
  /** Radians per second at full joystick deflection. */
  lookSpeed = 1.6;
  /** Radians per CSS pixel of pointer drag. */
  dragSensitivity = 0.0035;

  /** When false (e.g. pivot mode is active) all input and motion stop. */
  enabled = true;

  /**
   * Optional collision clamp: receives the current and proposed camera
   * positions and returns the permitted one (Viewer wires this to the
   * SDK's collision-mesh ray query so the camera can't pass through
   * walls or floors).
   */
  collisionGuard: ((from: Vector3, to: Vector3) => Vector3) | null = null;

  private readonly camera: PerspectiveCamera;
  private readonly domElement: HTMLElement;
  private readonly euler = new Euler(0, 0, 0, 'YXZ');

  private readonly keys = new Set<string>();
  private moveInput = { x: 0, y: 0 };
  private lookInput = { x: 0, y: 0 };

  private readonly velocity = new Vector3();
  private readonly targetVelocity = new Vector3();
  private readonly proposed = new Vector3();
  private readonly forward = new Vector3();
  private readonly right = new Vector3();

  private dragging = false;
  private lastPointer = { x: 0, y: 0 };
  private disposed = false;

  private onFirstInteraction: (() => void) | null = null;

  constructor(camera: PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.euler.setFromQuaternion(camera.quaternion);

    this.bindPointer();
    this.bindKeyboard();
  }

  /** Fires once on the first look/move interaction (used to dismiss hints). */
  setFirstInteractionCallback(cb: () => void): void {
    this.onFirstInteraction = cb;
  }

  /** Joystick translation input: x = strafe, y = forward (+1 = forward). */
  setMoveInput(x: number, y: number): void {
    this.moveInput.x = clamp(x);
    this.moveInput.y = clamp(y);
    if (x !== 0 || y !== 0) this.notifyInteraction();
  }

  /** Joystick rotation input: x = yaw, y = pitch (+1 = look up). */
  setLookInput(x: number, y: number): void {
    this.lookInput.x = clamp(x);
    this.lookInput.y = clamp(y);
    if (x !== 0 || y !== 0) this.notifyInteraction();
  }

  lookAt(target: Vector3): void {
    this.camera.lookAt(target);
    this.euler.setFromQuaternion(this.camera.quaternion);
  }

  /** Re-adopt the camera's current orientation (after pivot mode moved it). */
  syncFromCamera(): void {
    this.euler.setFromQuaternion(this.camera.quaternion);
    this.velocity.set(0, 0, 0);
    this.moveInput = { x: 0, y: 0 };
    this.lookInput = { x: 0, y: 0 };
  }

  update(dt: number): void {
    if (this.disposed || !this.enabled) return;
    const step = Math.min(dt, 0.1);

    // --- Rotation (joystick axes are rate-based) ---
    this.euler.y -= this.lookInput.x * this.lookSpeed * step;
    this.euler.x += this.lookInput.y * this.lookSpeed * step;
    this.euler.x = clamp(this.euler.x, PITCH_LIMIT);
    this.camera.quaternion.setFromEuler(this.euler);

    // --- Translation ---
    const keyForward =
      (this.isDown('KeyW', 'ArrowUp') ? 1 : 0) -
      (this.isDown('KeyS', 'ArrowDown') ? 1 : 0);
    const keyStrafe =
      (this.isDown('KeyD', 'ArrowRight') ? 1 : 0) -
      (this.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
    const keyVertical =
      (this.isDown('KeyE', 'Space') ? 1 : 0) - (this.isDown('KeyQ') ? 1 : 0);

    const forwardAmount = clamp(keyForward + this.moveInput.y);
    const strafeAmount = clamp(keyStrafe + this.moveInput.x);

    const sprint = this.isDown('ShiftLeft', 'ShiftRight')
      ? this.sprintMultiplier
      : 1;
    const speed = this.movementSpeed * sprint;

    this.camera.getWorldDirection(this.forward);
    this.right.crossVectors(this.forward, this.camera.up).normalize();

    this.targetVelocity
      .set(0, 0, 0)
      .addScaledVector(this.forward, forwardAmount * speed)
      .addScaledVector(this.right, strafeAmount * speed)
      .addScaledVector(this.camera.up, keyVertical * speed);

    // Exponential smoothing toward the target velocity — gives the gliding
    // acceleration/deceleration feel instead of binary stop/start.
    const smoothing = 1 - Math.exp(-10 * step);
    this.velocity.lerp(this.targetVelocity, smoothing);

    if (this.velocity.lengthSq() > 1e-8) {
      this.proposed
        .copy(this.camera.position)
        .addScaledVector(this.velocity, step);
      const allowed = this.collisionGuard
        ? this.collisionGuard(this.camera.position, this.proposed)
        : this.proposed;
      this.camera.position.copy(allowed);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
  }

  // ----------------------------------------------------------------- //

  private bindPointer(): void {
    this.domElement.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    // The canvas owns its gestures; stop iOS/Android from scrolling,
    // zooming, or pull-to-refreshing while navigating.
    this.domElement.addEventListener(
      'touchmove',
      (e) => e.preventDefault(),
      { passive: false },
    );
  }

  private bindKeyboard(): void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  private readonly handlePointerDown = (e: PointerEvent): void => {
    if (!e.isPrimary || !this.enabled) return;
    this.dragging = true;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.domElement.setPointerCapture?.(e.pointerId);
  };

  private readonly handlePointerMove = (e: PointerEvent): void => {
    if (!this.dragging || !e.isPrimary || !this.enabled) return;
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    this.lastPointer = { x: e.clientX, y: e.clientY };

    this.euler.y -= dx * this.dragSensitivity;
    this.euler.x -= dy * this.dragSensitivity;
    this.euler.x = clamp(this.euler.x, PITCH_LIMIT);
    this.camera.quaternion.setFromEuler(this.euler);
    this.notifyInteraction();
  };

  private readonly handlePointerUp = (): void => {
    this.dragging = false;
  };

  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    this.keys.add(e.code);
    this.notifyInteraction();
  };

  private readonly handleKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private isDown(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  private notifyInteraction(): void {
    if (this.onFirstInteraction) {
      const cb = this.onFirstInteraction;
      this.onFirstInteraction = null;
      cb();
    }
  }
}

function clamp(value: number, limit = 1): number {
  return Math.max(-limit, Math.min(limit, value));
}
