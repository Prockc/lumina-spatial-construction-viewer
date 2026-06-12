/**
 * White-label brand guard.
 *
 * The LCC-Web-SDK is licensed via `appKey` (which removes the XGrids GL
 * watermark legitimately), but for absolute certainty no third-party branding
 * ever paints we also police the DOM: any element the SDK (or a future SDK
 * update) injects that matches XGrids/LCC branding signatures is suppressed
 * the moment it is attached, before the next paint.
 *
 * Works in tandem with the static CSS kill-rules in index.html / style.css.
 */

const BRAND_SIGNATURES = [
  'xgrids',
  'lcc-logo',
  'lcc-splash',
  'lcc-loading',
  'lcc-watermark',
  'lixel',
];

/** Elements created by this app are never suppressed. */
const LUMINA_PREFIX = 'lumina';

function matchesBranding(el: Element): boolean {
  const id = el.id?.toLowerCase() ?? '';
  const cls =
    typeof el.className === 'string' ? el.className.toLowerCase() : '';

  if (id.startsWith(LUMINA_PREFIX) || cls.includes(LUMINA_PREFIX)) {
    return false;
  }

  if (BRAND_SIGNATURES.some((sig) => id.includes(sig) || cls.includes(sig))) {
    return true;
  }

  if (el instanceof HTMLImageElement) {
    const src = el.src.toLowerCase();
    if (BRAND_SIGNATURES.some((sig) => src.includes(sig))) return true;
  }

  // Text nodes such as "Powered by XGrids" inside injected overlays.
  if (
    el.childElementCount === 0 &&
    /xgrids|lixel/i.test(el.textContent ?? '')
  ) {
    return true;
  }

  return false;
}

function suppress(el: Element): void {
  el.classList.add('lumina-brand-suppressed');
  if (el instanceof HTMLElement) {
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
    el.style.setProperty('opacity', '0', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
  }
}

function sweep(root: ParentNode): void {
  if (root instanceof Element && matchesBranding(root)) {
    suppress(root);
  }
  root.querySelectorAll('*').forEach((el) => {
    if (matchesBranding(el)) suppress(el);
  });
}

/**
 * Start watching the document for injected third-party branding.
 * Returns a disposer (never needed in practice — the guard runs for the
 * lifetime of the page).
 */
export function installBrandGuard(): () => void {
  // Initial sweep for anything already present.
  sweep(document.body);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) sweep(node);
      }
      if (
        mutation.type === 'attributes' &&
        mutation.target instanceof Element &&
        matchesBranding(mutation.target)
      ) {
        suppress(mutation.target);
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'id', 'src'],
  });

  return () => observer.disconnect();
}
