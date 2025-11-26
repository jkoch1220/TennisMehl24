/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APPWRITE_PROJECT_ID: string;
  readonly VITE_APPWRITE_PROJECT_NAME: string;
  readonly VITE_APPWRITE_ENDPOINT: string;
  readonly VITE_APPWRITE_API_KEY?: string;
  readonly VITE_OPENROUTESERVICE_API_KEY?: string;
  readonly VITE_TANKERKOENIG_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

