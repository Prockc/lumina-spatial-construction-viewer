import nipplejs, { type JoystickManager } from 'nipplejs';
import type { FirstPersonController } from '../viewer/FirstPersonController';

/**
 * Dual on-screen joysticks (SuperSplat-style mobile navigation):
 *  - left stick  -> first-person translation (forward / backward / strafe)
 *  - right stick -> first-person rotation (yaw / pitch)
 *
 * Both are tinted with the Lumina brand color (#DB146B) via CSS in
 * style.css. Zones are only displayed on touch devices (body.lumina-touch).
 */
export function installJoysticks(controller: FirstPersonController): void {
  if (!isTouchDevice()) return;
  document.body.classList.add('lumina-touch');

  const moveZone = createZone('lumina-stick-zone--move');
  const lookZone = createZone('lumina-stick-zone--look');

  const moveStick = nipplejs.create({
    zone: moveZone,
    mode: 'static',
    position: { left: '50%', bottom: '90px' },
    size: 110,
    threshold: 0.05,
    restOpacity: 0.55,
    fadeTime: 150,
  });

  const lookStick = nipplejs.create({
    zone: lookZone,
    mode: 'static',
    position: { right: '50%', bottom: '90px' },
    size: 110,
    threshold: 0.05,
    restOpacity: 0.55,
    fadeTime: 150,
  });

  wireStick(moveStick, (x, y) => controller.setMoveInput(x, y));
  wireStick(lookStick, (x, y) => controller.setLookInput(x, y));
}

function wireStick(
  manager: JoystickManager,
  apply: (x: number, y: number) => void,
): void {
  manager.on('move', (_evt, data) => {
    // data.vector is normalized to the stick radius: x right+, y up+.
    const force = Math.min(data.force ?? 1, 1);
    apply(data.vector.x * force, data.vector.y * force);
  });
  manager.on('end', () => apply(0, 0));
}

function createZone(modifier: string): HTMLDivElement {
  const zone = document.createElement('div');
  zone.className = `lumina-stick-zone ${modifier}`;
  // Joystick gestures must never scroll, zoom, or pull-to-refresh the page.
  for (const type of ['touchstart', 'touchmove'] as const) {
    zone.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }
  document.body.appendChild(zone);
  return zone;
}

function isTouchDevice(): boolean {
  return (
    window.matchMedia('(pointer: coarse)').matches ||
    navigator.maxTouchPoints > 0
  );
}
