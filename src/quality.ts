/**
 * HD quality preference + the device-profile override that actually unlocks
 * desktop fidelity on phones.
 *
 * Why this is necessary (verified against lcc-0.6.0.js):
 * The LCC SDK classifies the device from `navigator.userAgent`. An Android/iOS
 * UA flips an internal `devType` to "mobile", which hard-codes:
 *   - MaxLodDistance 200 -> 30  (the big one: fine LOD is only applied within
 *     MaxLodDistance of the camera, so on a room-scale capture almost the whole
 *     scene drops to the coarsest LOD => blurry / pixelated),
 *   - maxLoadSplatCount 3M+ -> 1M,
 *   - LodLevelUpSpatsInNode -> 0.5M, fewer sort/decode threads.
 * None of the LOD-distance caps have a public runtime setter, and the probe
 * re-runs on every load — so the only way to get desktop LODs on a phone is to
 * make that probe see a desktop UA *before* LCCRender.load() runs. That is a
 * one-time startup decision, which is why the HD toggle persists to
 * localStorage and reloads rather than hot-swapping.
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

/** A desktop UA the SDK's OS parser will not classify as Android or iOS. */
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Force the SDK's device probe to take the desktop path (full LOD distance and
 * splat budgets) by overriding the one input it keys off: navigator.userAgent.
 *
 * MUST be called before the SDK touches navigator — i.e. before Viewer.load().
 * We override only userAgent to keep the blast radius minimal: the SDK reads
 * the real WebGL strings for GPU detection and matchMedia for touch, neither of
 * which we touch, and the app does no UA-based analytics. No-op if the browser
 * locks the property (HD then simply falls back to the SDK's mobile LODs).
 */
export function forceDesktopDeviceProfile(): void {
  try {
    Object.defineProperty(navigator, 'userAgent', {
      get: () => DESKTOP_UA,
      configurable: true,
    });
  } catch {
    /* navigator.userAgent is locked here; nothing else to try */
  }
}
