/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DISCORD_GATEWAY_BASE_URL?: string;
  /** Optional activity-service base for Technician guild config READ only. */
  readonly VITE_ACTIVITY_ADMIN_BASE_URL?: string;
  /** Discord guild snowflake for activity-admin READ paths. */
  readonly VITE_ACTIVITY_ADMIN_GUILD_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
