/**
 * HD quality preference (persisted).
 *
 * The actual quality lever lives in the vendored SDK: scripts/patch-lcc-sdk.mjs
 * gates the SDK's mobile throttle (MaxLodDistance 200 vs 30, splat/node budgets)
 * on a `window.__LUMINA_HD__` global, which the inline <head> script in
 * index.html sets from this same preference before the SDK loads. This module
 * only owns the persisted on/off value read by that script and the HD toggle.
 * Keep the storage key below in sync with index.html.
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
