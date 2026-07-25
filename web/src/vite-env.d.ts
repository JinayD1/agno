/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of Workstream A's API. When set, the web app talks to the real
   *  backend (REST + SSE); when unset it runs entirely on local mock fixtures. */
  readonly VITE_API_URL?: string;
  /** The single Orbit repo id this UI is bound to (v1 is single-repo). */
  readonly VITE_ORBIT_REPO_ID?: string;
  /** Display name for that repo, shown in the repo list. */
  readonly VITE_ORBIT_REPO_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
