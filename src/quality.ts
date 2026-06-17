/**
 * HD quality preference (persisted).
 *
 * The actual quality lever — making the LCC SDK take its desktop path instead
 * of the blurry mobile profile (MaxLodDistance 200 vs 30, full splat budget) —
 * is a navigator.userAgent override that MUST run before the SDK module loads.
 * It therefore lives as an inline <head> script in index.html, not here; this
 * module only owns the persisted on/off preference that the inline script and
 * the HD toggle both read. Keep the storage key below in sync with index.html.
 */

const STORAGE_KEY = 'lumina:hd-quality';

/** HD preference, defaulting ON (maximum crispness) when nothing is stored. */
export function isHdPreferred(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setHdPreferred(hd: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, hd ? '1' : '0');
  } catch {
    /* private mode / storage disabled — the choice just won't persist */
  }
}
