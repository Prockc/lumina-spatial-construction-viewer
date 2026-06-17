/**
 * Bottom-right "HD" quality toggle.
 *
 * A dark-glass pill that flips the viewer between the HD (full desktop
 * fidelity) and performance (SDK native mobile) quality profiles live. Glows
 * in the Lumina brand color when HD is on, fades to neutral white when off.
 * Defaults ON so the viewer opens at maximum crispness.
 *
 * (The brief referenced a neighboring "Reset" button; this build ships no such
 * control, so the toggle stands alone in the bottom-right control dock — the
 * natural home for one were it added later.)
 */
export interface QualityToggleHandle {
  /** Current HD state. */
  isHd: () => boolean;
}

export function installQualityToggle(
  onChange: (hd: boolean) => void,
  initialHd = true,
): QualityToggleHandle {
  const dock = document.createElement('div');
  dock.id = 'lumina-bottom-controls';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'lumina-hd-toggle';
  btn.className = 'lumina-pill-btn';
  btn.textContent = 'HD';
  btn.setAttribute('role', 'switch');
  btn.setAttribute('aria-label', 'HD quality');

  let hd = initialHd;

  function render(): void {
    btn.classList.toggle('lumina-pill-btn--on', hd);
    btn.setAttribute('aria-checked', String(hd));
    btn.title = hd ? 'HD quality: on' : 'HD quality: off (performance)';
  }
  render();

  btn.addEventListener('click', () => {
    hd = !hd;
    render();
    onChange(hd);
  });

  dock.appendChild(btn);
  document.body.appendChild(dock);

  return { isHd: () => hd };
}
