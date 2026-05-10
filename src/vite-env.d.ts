/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Backend origin only — no path (no `/api/v1`). Empty = same-origin `/api/v1`
   * (Vite dev proxy or production nginx). Use `https://api.example.com`, not `http://`
   * when the SPA is served over HTTPS (mixed content is blocked); production builds
   * fall back to same-origin if `http:` is set while the page is HTTPS.
   */
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_FRONTEND_ONLY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
