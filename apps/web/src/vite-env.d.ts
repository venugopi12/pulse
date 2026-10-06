/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin when the frontend is hosted separately, e.g. https://pulse-api.onrender.com */
  readonly VITE_API_URL?: string;
  /** WebSocket URL when hosted separately, e.g. wss://pulse-api.onrender.com/ws */
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
