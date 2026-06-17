import { BRAND_COLOR } from '../config';
import { isHdPreferred, setHdPreferred } from '../quality';

/**
 * Bottom-right control dock: a "⟲ Reset" pill (solid brand pink) stacked above
 * an "HD" quality pill.
 *
 * - Reset snaps the camera back to the model's starting view (via onReset).
 * - HD switches between full desktop fidelity and the SDK's native mobile
 *   profile. Because that profile is chosen once at startup (see index.html /
 *   quality.ts) and has no runtime override, the toggle persists the choice and
 *   reloads. Its active (pink) state is applied from localStorage on boot via
 *   BOTH the CSS class and explicit inline styles, so it cannot fail to glow.
 *
 * (The brief mentioned neighboring AR buttons; this build ships none, so the
 * dock holds just these two controls.)
 */
export interface BottomControlsOptions {
  onReset: () => void;
}

export function installBottomControls(opts: BottomControlsOptions): void {
  const dock = document.createElement('div');
  dock.id = 'lumina-bottom-controls';

  // Reset (top): solid pink pill, white text.
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.id = 'lumina-reset-btn';
  resetBtn.className = 'lumina-pill-btn lumina-pill-btn--solid';
  resetBtn.textContent = '⟲ Reset';
  resetBtn.setAttribute('aria-label', 'Reset camera to starting view');
  resetBtn.title = 'Reset view';
  resetBtn.addEventListener('click', () => opts.onReset());

  // HD (bottom): quality toggle.
  const hdBtn = document.createElement('button');
  hdBtn.type = 'button';
  hdBtn.id = 'lumina-hd-toggle';
  hdBtn.className = 'lumina-pill-btn';
  hdBtn.textContent = 'HD';
  hdBtn.setAttribute('role', 'switch');
  hdBtn.setAttribute('aria-label', 'HD quality');

  /** Reflect HD on/off via the CSS class AND explicit inline styles. */
  function paintHd(on: boolean): void {
    hdBtn.classList.toggle('lumina-pill-btn--on', on);
    hdBtn.setAttribute('aria-checked', String(on));
    hdBtn.title = on ? 'HD quality: on' : 'HD quality: off (performance)';
    if (on) {
      hdBtn.style.color = BRAND_COLOR;
      hdBtn.style.borderColor = BRAND_COLOR;
      hdBtn.style.boxShadow = `0 0 14px ${BRAND_COLOR}59`;
    } else {
      hdBtn.style.color = '';
      hdBtn.style.borderColor = '';
      hdBtn.style.boxShadow = '';
    }
  }

  // Read the saved state on boot and glow immediately if HD is active.
  paintHd(isHdPreferred());

  hdBtn.addEventListener('click', () => {
    const next = !isHdPreferred();
    setHdPreferred(next);
    paintHd(next); // visible before the reload registers
    // Quality is decided from the device profile at init; reload to re-apply.
    window.location.reload();
  });

  dock.append(resetBtn, hdBtn);
  document.body.appendChild(dock);
}
