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
  /** PostHog project API key (`phc_…`). Empty disables analytics entirely. */
  readonly VITE_PUBLIC_POSTHOG_KEY?: string;
  /** PostHog ingestion host, e.g. https://us.i.posthog.com */
  readonly VITE_PUBLIC_POSTHOG_HOST?: string;
  /** Standing Zoom room for "talk to the Prozpr team" calls. Empty = placeholder link. */
  readonly VITE_PROZPR_ZOOM_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
