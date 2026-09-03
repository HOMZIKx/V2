import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function loadEnvFile(filePath = path.resolve(process.cwd(), '.env')): void {
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
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

export function loadPlayerTeamEnvFiles(cwd = process.cwd()): void {
  for (const filePath of [
    path.resolve(cwd, '.env'),
    path.resolve(cwd, '../../.env'),
    path.resolve(cwd, 'services/player-team-service/.env'),
  ]) {
    loadEnvFile(filePath);
  }
}
