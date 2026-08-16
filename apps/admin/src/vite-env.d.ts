/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_ADMIN_DEV_ACTOR_DISCORD_ID?: string;
  readonly VITE_ADMIN_DEV_GUILDS?: string;
  readonly VITE_ADMIN_DEV_ORG_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
