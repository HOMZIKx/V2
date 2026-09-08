import { createHash } from 'node:crypto';
import fs from 'node:fs';

const outDir = process.env.ZEABUR_OUTPUT_DIR || 'ops/zeabur/out';
const base = 'https://desapp.zeabur.app';
fs.mkdirSync(outDir, { recursive: true });

function fingerprint(value) {
  return createHash('sha256').update(String(value ?? '')).digest('hex').slice(0, 16);
}

function write(result, code = 0) {
  fs.writeFileSync(`${outDir}/result.json`, JSON.stringify(result, null, 2));
  fs.writeFileSync(
    `${outDir}/summary.md`,
    `# Technika persistence probe\n\n- API: **${result.status ?? 'n/a'}**\n- Revision: **${result.revision ?? 'n/a'}**\n- Has draft: **${String(result.hasDraft ?? 'n/a')}**\n- Timers template fingerprint: \`${result.fingerprints?.timersNotify ?? 'n/a'}\`\n- Character timers template fingerprint: \`${result.fingerprints?.characterTimers ?? 'n/a'}\`\n- Kingdom War template fingerprint: \`${result.fingerprints?.kingdomWar ?? 'n/a'}\`\n`,
  );
  process.exit(code);
}

try {
  const response = await fetch(`${base}/discord-gateway/discord/v1/config`, {
    cache: 'no-store',
  });
  let body = null;
  try {
    body = await response.json();
  } catch {}

  const config = body?.config ?? null;
  const timersTemplate = config?.timersNotify?.messageTemplate;
  const characterTemplate = config?.characterTimers?.messageTemplate;
  const warTemplate = config?.kingdomWar?.messageTemplate;
  const ok =
    response.ok &&
    config !== null &&
    typeof timersTemplate === 'string' &&
    typeof characterTemplate === 'string' &&
    typeof warTemplate === 'string';

  write(
    {
      ok,
      at: new Date().toISOString(),
      status: response.status,
      revision: Number(body?.revision) || null,
      updatedAt: typeof body?.updatedAt === 'string' ? body.updatedAt : null,
      hasDraft: body?.hasDraft === true,
      canRollback: body?.canRollback === true,
      fingerprints: {
        timersNotify: fingerprint(timersTemplate),
        characterTimers: fingerprint(characterTemplate),
        kingdomWar: fingerprint(warTemplate),
      },
      aliasTemplatesMatch:
        typeof timersTemplate === 'string' &&
        typeof characterTemplate === 'string' &&
        timersTemplate === characterTemplate,
    },
    ok ? 0 : 1,
  );
} catch (error) {
  write(
    {
      ok: false,
      at: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    },
    1,
  );
}
