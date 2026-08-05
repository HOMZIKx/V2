/**
 * Resolve HTTP bind address for local vs container/Zeabur runtimes.
 * Prefer PLATFORM `PORT`/`HOST` when present (Zeabur injects PORT).
 */
export function resolveHttpListen(input: {
  readonly defaultPort: number;
  readonly defaultHost: string;
  readonly env?: NodeJS.ProcessEnv;
}): { readonly port: number; readonly host: string } {
  const env = input.env ?? process.env;
  const portFromEnv = env.PORT !== undefined && env.PORT !== '' ? Number(env.PORT) : Number.NaN;
  const port =
    Number.isFinite(portFromEnv) && portFromEnv > 0 ? Math.trunc(portFromEnv) : input.defaultPort;

  if (env.HOST !== undefined && env.HOST.trim().length > 0) {
    return { port, host: env.HOST.trim() };
  }

  if (env.NODE_ENV === 'production') {
    return { port, host: '0.0.0.0' };
  }

  return { port, host: input.defaultHost };
}
