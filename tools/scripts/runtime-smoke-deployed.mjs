/**
 * Safe non-destructive probes of a deployed P4 runtime.
 * Mutations are never performed.
 *
 * Optional env:
 *   V2_SMOKE_API_BASE
 *   V2_SMOKE_ADMIN_BASE
 *   V2_SMOKE_WEB_BASE
 *   V2_SMOKE_DISCORD_HEALTH
 *   V2_EXPECTED_SHA
 */

import { runRuntimeDoctor } from './runtime-doctor.mjs';

const defaults = {
  V2_SMOKE_API_BASE: process.env.V2_SMOKE_API_BASE,
  V2_SMOKE_ADMIN_BASE: process.env.V2_SMOKE_ADMIN_BASE,
  V2_SMOKE_WEB_BASE: process.env.V2_SMOKE_WEB_BASE,
  V2_SMOKE_DISCORD_HEALTH: process.env.V2_SMOKE_DISCORD_HEALTH,
  V2_EXPECTED_SHA: process.env.V2_EXPECTED_SHA,
};

const remoteRequested = Object.entries(defaults).some(
  ([key, value]) => key !== 'V2_EXPECTED_SHA' && typeof value === 'string' && value.length > 0,
);

if (!remoteRequested) {
  process.stdout.write(
    'SMOKE_RUNTIME\nBLOCKED_EXTERNAL\nExpected: V2_SMOKE_API_BASE and/or Admin/WWW/Discord public URLs\nObserved: no public endpoints provided\nImpact: deployed runtime was not probed\nAction: set V2_SMOKE_API_BASE=https://v2-api.zeabur.app (and optional Admin/WWW URLs)\n',
  );
  process.exit(2);
}

const summary = await runRuntimeDoctor({ ...process.env, ...defaults });
let failed = false;
for (const check of summary.checks) {
  if (
    check.code === 'API_GATEWAY' ||
    check.code === 'ADMIN' ||
    check.code === 'WWW' ||
    check.code === 'DISCORD_HEALTH' ||
    check.code === 'VERSION_DRIFT' ||
    check.code === 'ADMIN_API_BASE' ||
    check.code === 'WEB_API_BASE'
  ) {
    process.stdout.write(
      `${check.code}\n${check.status}\nExpected: ${check.expected}\nObserved: ${check.observed}\nImpact: ${check.impact}\nAction: ${check.action}\n\n`,
    );
    if (check.status === 'FAIL') {
      failed = true;
    }
  }
}

process.exit(failed ? 1 : 0);
