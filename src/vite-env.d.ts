/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin (no trailing slash). Empty = same-origin `/api/v1` (Vite dev proxy). */
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_FRONTEND_ONLY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
