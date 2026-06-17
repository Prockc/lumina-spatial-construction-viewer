/**
 * Central configuration for the Lumina Spatial .ios Viewer.
 *
 * Deployment values come from Vite env vars (set them in the Amplify console
 * under App settings > Environment variables, or in a local `.env` file):
 *
 *   VITE_S3_BUCKET_URL   e.g. https://lumina-spatial-models.s3.us-east-1.amazonaws.com
 *   VITE_XGRIDS_APP_KEY  XGrids developer app key (licenses the SDK and
 *                        removes the XGrids GL watermark)
 */

export const BRAND_COLOR = '#DB146B';

const FALLBACK_BUCKET_URL =
  'https://lumina-spatial-models.s3.us-east-1.amazonaws.com';

/** Base URL of the S3 bucket that hosts the .lcc2 captures (no trailing slash). */
export const S3_BUCKET_URL: string = (
  import.meta.env.VITE_S3_BUCKET_URL ?? FALLBACK_BUCKET_URL
).replace(/\/+$/, '');

/** XGrids SDK license key; null falls back to the SDK's unlicensed mode. */
export const XGRIDS_APP_KEY: string | null =
  import.meta.env.VITE_XGRIDS_APP_KEY ?? null;

/** Model the viewer loads when no ?model= parameter is supplied. */
export const DEFAULT_MODEL: string | null =
  import.meta.env.VITE_DEFAULT_MODEL ?? null;

/**
 * Resolve the .lcc2 asset URL for this page view.
 *
 * Supported forms:
 *   ?model=site-42            -> {S3_BUCKET_URL}/site-42.lcc2
 *   ?model=jobs/site-42.lcc2  -> {S3_BUCKET_URL}/jobs/site-42.lcc2
 *   ?src=https://...lcc2      -> used verbatim (must be an https URL)
 */
export function resolveModelUrl(search = window.location.search): {
  url: string | null;
  name: string | null;
  error: string | null;
} {
  const params = new URLSearchParams(search);

  const src = params.get('src');
  if (src) {
    try {
      const parsed = new URL(src);
      if (parsed.protocol !== 'https:') {
        return { url: null, name: null, error: 'Model source must use HTTPS.' };
      }
      return { url: parsed.toString(), name: prettyName(parsed.pathname), error: null };
    } catch {
      return { url: null, name: null, error: 'Invalid model source URL.' };
    }
  }

  const model = params.get('model') ?? DEFAULT_MODEL;
  if (!model) {
    return {
      url: null,
      name: null,
      error:
        'No model specified. Open this viewer with ?model=<filename> in the URL.',
    };
  }

  // Allow nested S3 keys but reject traversal and absolute/protocol forms.
  if (!/^[\w][\w\-./ ]*$/.test(model) || model.includes('..')) {
    return { url: null, name: null, error: 'Invalid model name.' };
  }

  const key = model.endsWith('.lcc2') ? model : `${model}.lcc2`;
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  return {
    url: `${S3_BUCKET_URL}/${encodedKey}`,
    name: prettyName(key),
    error: null,
  };
}

function prettyName(path: string): string {
  const base = path.split('/').pop() ?? path;
  return decodeURIComponent(base.replace(/\.lcc2?$/i, ''));
}
