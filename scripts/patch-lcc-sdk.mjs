/**
 * One-time surgical patch of the vendored XGrids LCC SDK (lcc-0.6.0.js).
 *
 * The SDK hard-throttles quality when it classifies the device as mobile
 * (devType N): MaxLodDistance 200->30 (the dominant blur cause), splat budget
 * ->1M, per-node budget ->0.5M, distance limit ->100. None of these have a
 * public setter. This patch gates ONLY those quality fields on a global flag
 * (window.__LUMINA_HD__, set by the inline script in index.html), leaving the
 * mobile-safe thread/cache settings untouched. Re-run safely; it is idempotent.
 *
 * Run: node scripts/patch-lcc-sdk.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('../src/vendor/lcc/lcc-0.6.0.js', import.meta.url);

const OLD =
  'e.devType==N?(this.maxLoadSplatCount=1e6,this.MaxLodDistance=30,' +
  'this.LodLevelUpSpatsInNode=5e5,this.CpuSortThreadNum=2,this.MinLodUsed=1,' +
  'this.MaxDistaneLimit=100';

const NEW =
  'e.devType==N?(this.maxLoadSplatCount=window.__LUMINA_HD__?16e6:1e6,' +
  'this.MaxLodDistance=window.__LUMINA_HD__?200:30,' +
  'this.LodLevelUpSpatsInNode=window.__LUMINA_HD__?2e6:5e5,' +
  'this.CpuSortThreadNum=2,this.MinLodUsed=1,' +
  'this.MaxDistaneLimit=window.__LUMINA_HD__?200:100';

const src = readFileSync(FILE, 'utf8');

if (src.includes(NEW)) {
  console.log('lcc-0.6.0.js already patched — nothing to do.');
  process.exit(0);
}

const count = src.split(OLD).length - 1;
if (count !== 1) {
  console.error(
    `Expected exactly 1 occurrence of the mobile-throttle snippet, found ${count}. ` +
      'SDK version may have changed; aborting without writing.',
  );
  process.exit(1);
}

writeFileSync(FILE, src.replace(OLD, NEW));
console.log('Patched lcc-0.6.0.js: HD-gated the mobile quality throttle.');
