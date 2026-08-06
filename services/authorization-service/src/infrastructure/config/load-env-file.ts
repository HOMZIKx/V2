import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Load a dotenv-style file into `process.env` without overriding keys that are
 * already set (shell / CI wins). Missing files are ignored.
 */
export function loadEnvFile(filePath = path.resolve(process.cwd(), '.env')): void {
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/**
 * Candidate `.env` paths for authorization-service when started via
 * `pnpm --dir services/authorization-service …` (cwd = package) or from the
 * monorepo root. First existing file wins per key; later files only fill gaps.
 */
export function resolveAuthorizationEnvFilePaths(cwd = process.cwd()): string[] {
  return [
    path.resolve(cwd, '.env'),
    path.resolve(cwd, '../../.env'),
    path.resolve(cwd, 'services/authorization-service/.env'),
  ];
}

/** Load authorization env files in {@link resolveAuthorizationEnvFilePaths} order. */
export function loadAuthorizationEnvFiles(cwd = process.cwd()): void {
  for (const filePath of resolveAuthorizationEnvFilePaths(cwd)) {
    loadEnvFile(filePath);
  }
}
