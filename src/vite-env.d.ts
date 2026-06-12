/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_S3_BUCKET_URL?: string;
  readonly VITE_XGRIDS_APP_KEY?: string;
  readonly VITE_DEFAULT_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
