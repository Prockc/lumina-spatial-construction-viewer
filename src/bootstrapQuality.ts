/**
 * Side-effect module: applies the HD device-profile override at import time.
 *
 * This MUST be imported before the LCC SDK module (./vendor/lcc) so the SDK's
 * device probe — whether it runs at module-eval or at load() — sees the spoofed
 * desktop userAgent. Keep it first in main.ts's import list. See ./quality.ts.
 */
import { isHdPreferred, forceDesktopDeviceProfile } from './quality';

if (isHdPreferred()) {
  forceDesktopDeviceProfile();
}
