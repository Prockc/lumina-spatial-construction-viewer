import { isHdPreferred, setHdPreferred } from '../quality';

/**
 * Bottom-right "HD" quality toggle.
 *
 * A dark-glass pill that switches the viewer between HD (full desktop fidelity)
 * and Performance (the SDK's native mobile tuning). Glows in the Lumina brand
 * color when HD is on, fades to neutral white when off. Defaults ON.
 *
 * The switch persists the choice and reloads the page rather than hot-swapping:
 * the SDK's quality (LOD distance, splat caps, worker threads) is decided once,
 * from the device profile, at load time and has no runtime override — so a
 * reload is the only way to actually change it. See ../quality.ts.
 *
 * (The brief referenced a neighboring "Reset" button; this build ships no such
 * control, so the toggle stands alone in the bottom-right control dock.)
 */
export function installQualityToggle(): void {
  const dock = document.createElement('div');
  dock.id = 'lumina-bottom-controls';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'lumina-hd-toggle';
  btn.className = 'lumina-pill-btn';
  btn.textContent = 'HD';
  btn.setAttribute('role', 'switch');
  btn.setAttribute('aria-label', 'HD quality');

  const hd = isHdPreferred();
  btn.classList.toggle('lumina-pill-btn--on', hd);
  btn.setAttribute('aria-checked', String(hd));
  btn.title = hd ? 'HD quality: on' : 'HD quality: off (performance)';

  btn.addEventListener('click', () => {
    const next = !isHdPreferred();
    setHdPreferred(next);
    // Reflect the new state before the reload registers visually.
    btn.classList.toggle('lumina-pill-btn--on', next);
    btn.setAttribute('aria-checked', String(next));
    // Quality is set from the device profile at init; reload to re-apply it.
    window.location.reload();
  });

  dock.appendChild(btn);
  document.body.appendChild(dock);
}
