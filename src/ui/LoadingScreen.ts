/**
 * Lumina Spatial LLC branded loading screen.
 * Full-screen overlay with wordmark, spinner, and a #DB146B progress bar.
 */
export class LoadingScreen {
  private readonly root: HTMLDivElement;
  private readonly barFill: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private hidden = false;

  constructor(modelName: string | null) {
    this.root = document.createElement('div');
    this.root.id = 'lumina-loader';
    this.root.innerHTML = `
      <div class="lumina-loader__wordmark">
        <div class="lumina-loader__title">Lumina<em>Spatial</em></div>
        <div class="lumina-loader__subtitle">Construction Viewer</div>
      </div>
      <div class="lumina-loader__ring" role="progressbar" aria-label="Loading model"></div>
      <div class="lumina-loader__bar"><div class="lumina-loader__bar-fill"></div></div>
      <div class="lumina-loader__status"></div>
    `;
    document.body.appendChild(this.root);

    this.barFill = this.root.querySelector('.lumina-loader__bar-fill')!;
    this.status = this.root.querySelector('.lumina-loader__status')!;
    this.setStatus(
      modelName ? `Preparing <strong>${escapeHtml(modelName)}</strong>` : 'Preparing scene',
    );
  }

  /** progress in [0, 1] */
  setProgress(progress: number): void {
    const pct = Math.max(0, Math.min(1, progress)) * 100;
    this.barFill.style.width = `${pct.toFixed(1)}%`;
    this.setStatus(`Streaming capture <strong>${pct.toFixed(0)}%</strong>`);
  }

  setStatus(html: string): void {
    this.status.innerHTML = html;
  }

  showError(message: string): void {
    this.root.classList.add('lumina-loader--error');
    this.setStatus(escapeHtml(message));
  }

  hide(): void {
    if (this.hidden) return;
    this.hidden = true;
    this.root.classList.add('lumina-loader--hidden');
    // Remove from the DOM once the fade-out transition completes.
    window.setTimeout(() => this.root.remove(), 700);
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
