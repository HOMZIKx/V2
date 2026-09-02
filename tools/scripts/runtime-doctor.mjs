import { evaluatePublicOrigin } from '../runtime/public-origin.mjs';
import {
  loadServiceRegistry,
  summarizeChecks,
  validateFrontendProductionContract,
  validateServiceRegistry,
} from '../runtime/validate-registry.mjs';

const BLOCKED_EXTERNAL = 'BLOCKED_EXTERNAL';

function formatCheck(check) {
  const lines = [
    `${check.code}`,
    `${check.status}`,
    `Expected: ${check.expected}`,
    `Observed: ${check.observed}`,
  ];
  if (check.status !== 'PASS') {
    lines.push(`Impact: ${check.impact}`, `Action: ${check.action}`);
  }
  return lines.join('\n');
}

function isHttpOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function probe(code, url, expected) {
  try {
    const response = await fetch(url, { redirect: 'manual' });
    const ok = response.status >= 200 && response.status < 400;
    return {
      code,
      status: ok ? 'PASS' : 'FAIL',
      expected,
      observed: `${response.status} ${url}`,
      impact: ok ? 'none' : 'deployed endpoint is not usable',
      action: ok ? 'none' : 'inspect logs and health of the owning service',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      code,
      status: BLOCKED_EXTERNAL,
      expected,
      observed: message,
      impact: 'remote runtime could not be reached from this environment',
      action: 'retry from a network that can reach the public URL, or skip remote probes',
    };
  }
}

async function probeRevision(expectedSha, apiLiveUrl) {
  if (!isHttpOrigin(apiLiveUrl)) {
    return null;
  }
  try {
    const response = await fetch(apiLiveUrl, { redirect: 'manual' });
    const body = await response.json().catch(() => ({}));
    const runningSha = typeof body.gitCommitSha === 'string' ? body.gitCommitSha : undefined;
    const comparison =
      expectedSha === undefined || expectedSha.trim() === '' || runningSha === undefined
        ? 'UNKNOWN'
        : expectedSha.trim() === runningSha
          ? 'MATCH'
          : 'MISMATCH';
    const status = comparison === 'MISMATCH' ? 'FAIL' : comparison === 'UNKNOWN' ? 'WARN' : 'PASS';
    return {
      code: 'VERSION_DRIFT',
      status,
      expected: expectedSha?.trim() || 'EXPECTED SHA via V2_EXPECTED_SHA',
      observed: `${comparison} running=${runningSha ?? 'unknown'}`,
      impact:
        comparison === 'MISMATCH'
          ? 'Discord or Admin may be older/newer than the repository tip'
          : 'revision cannot be confirmed until GIT_COMMIT_SHA is baked or set',
      action:
        comparison === 'MATCH'
          ? 'none'
          : 'set GIT_COMMIT_SHA on each app to the deployed image revision, then redeploy',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      code: 'VERSION_DRIFT',
      status: BLOCKED_EXTERNAL,
      expected: expectedSha?.trim() || 'EXPECTED SHA via V2_EXPECTED_SHA',
      observed: message,
      impact: 'cannot compare running revision',
      action: 'provide a reachable V2_SMOKE_API_BASE',
    };
  }
}

async function probeVersion(url) {
  try {
    const response = await fetch(url, { redirect: 'manual' });
    if (response.status === 404) {
      return {
        code: 'API_VERSION',
        status: 'WARN',
        expected: 'HTTP 200 from /version after this operability SHA is deployed',
        observed: `404 ${url}`,
        impact: 'running image predates the /version alias; use /health/live gitCommitSha',
        action: 'redeploy api-gateway from the current branch tip',
      };
    }
    const ok = response.status >= 200 && response.status < 400;
    return {
      code: 'API_VERSION',
      status: ok ? 'PASS' : 'FAIL',
      expected: 'HTTP 200 from /version',
      observed: `${response.status} ${url}`,
      impact: ok ? 'none' : 'version identity endpoint is not usable',
      action: ok ? 'none' : 'inspect api-gateway logs and routes',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      code: 'API_VERSION',
      status: BLOCKED_EXTERNAL,
      expected: 'HTTP 200 from /version',
      observed: message,
      impact: 'cannot probe /version',
      action: 'retry from a network that can reach the public API',
    };
  }
}

async function probeActivityRead(apiOrigin) {
  const url = `${apiOrigin}/activity/v1/admin/guilds`;
  try {
    const response = await fetch(url, { redirect: 'manual' });
    const ok = response.status === 401 || response.status === 403 || response.status === 200;
    return {
      code: 'ACTIVITY_READ',
      status: ok ? 'PASS' : 'FAIL',
      expected: 'non-destructive GET /activity/v1/admin/guilds returns 401/403/200',
      observed: `${response.status} ${url}`,
      impact: ok ? 'none' : 'activity read path is not reachable through api-gateway',
      action: ok
        ? 'none'
        : 'inspect api-gateway ACTIVITY_SERVICE_BASE_URL and activity-service logs',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      code: 'ACTIVITY_READ',
      status: BLOCKED_EXTERNAL,
      expected: 'non-destructive GET /activity/v1/admin/guilds',
      observed: message,
      impact: 'cannot probe the activity read path',
      action: 'retry from a network that can reach the public API',
    };
  }
}

async function probeWebLoginContract(webOrigin) {
  const url = `${webOrigin.replace(/\/$/, '')}/logowanie`;
  try {
    const response = await fetch(url, { method: 'GET', redirect: 'manual' });
    const body = typeof response.text === 'function' ? await response.text() : '';
    const loopback = /localhost|127\.0\.0\.1|\[::1\]/i.test(body);
    const identityMatch = body.match(
      /https?:\/\/[^"'\\\s>]+\/identity\/oauth\/discord[^"'\\\s>]*/i,
    );
    const identityUrl = identityMatch?.[0] ?? '';
    if (loopback) {
      return {
        code: 'WEB_LOGIN_ORIGIN',
        status: 'FAIL',
        expected: 'deployed /logowanie must not embed localhost/127.0.0.1/::1',
        observed: identityUrl || 'loopback origin present in login HTML',
        impact: 'Owner Discord login would open a local Identity process',
        action: 'rebuild WWW with public NEXT_PUBLIC_IDENTITY_URL / NEXT_PUBLIC_WEB_ORIGIN',
      };
    }
    if (identityUrl.length > 0) {
      let origin = '';
      try {
        origin = new URL(identityUrl).origin;
      } catch {
        origin = '';
      }
      const evaluated = evaluatePublicOrigin(origin, { requireHttps: true });
      return {
        code: 'WEB_LOGIN_ORIGIN',
        status: evaluated.ok ? 'PASS' : 'FAIL',
        expected: 'deployed /logowanie href uses public https Identity origin',
        observed: identityUrl,
        impact: evaluated.ok ? 'none' : 'WWW Discord start is not a public Identity origin',
        action: evaluated.ok
          ? 'none'
          : 'rebuild WWW with public NEXT_PUBLIC_IDENTITY_URL and NEXT_PUBLIC_WEB_ORIGIN',
      };
    }
    return {
      code: 'WEB_LOGIN_ORIGIN',
      status: 'WARN',
      expected: 'deployed /logowanie href uses public Identity origin',
      observed: `${response.status} no identity oauth href in HTML`,
      impact: 'cannot prove the baked WWW login URL from HTML alone',
      action: 'confirm NEXT_PUBLIC_IDENTITY_URL in the WWW image and retry after rebuild',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      code: 'WEB_LOGIN_ORIGIN',
      status: BLOCKED_EXTERNAL,
      expected: 'deployed /logowanie href uses public Identity origin',
      observed: message,
      impact: 'cannot prove the WWW Discord start URL',
      action: 'retry from a network that can reach the public WWW',
    };
  }
}

async function probeOAuthStart(apiOrigin, webOrigin) {
  const callbackURL = `${webOrigin.replace(/\/$/, '')}/aktywnosci`;
  const startUrl = `${apiOrigin.replace(/\/$/, '')}/identity/oauth/discord?callbackURL=${encodeURIComponent(callbackURL)}`;
  const expectedCallback = `${apiOrigin.replace(/\/$/, '')}/api/auth/callback/discord`;
  try {
    const response = await fetch(startUrl, { method: 'GET', redirect: 'manual' });
    const location = response.headers.get('location') ?? '';
    const haystack = `${startUrl}\n${location}`;
    const loopback = /localhost|127\.0\.0\.1|\[::1\]/i.test(haystack);
    const loopbackCheck = {
      code: 'OAUTH_LOOPBACK',
      status: loopback ? 'FAIL' : 'PASS',
      expected: 'OAuth start Location must not contain localhost/127.0.0.1/::1',
      observed: location === '' ? `${response.status} empty Location` : location,
      impact: loopback ? 'deployed WWW login would open a local Identity process' : 'none',
      action: loopback
        ? 'rebuild WWW with public NEXT_PUBLIC_IDENTITY_URL and redeploy identity/api-gateway'
        : 'none',
    };
    let redirectUri = '';
    try {
      redirectUri = new URL(location).searchParams.get('redirect_uri') ?? '';
    } catch {
      redirectUri = '';
    }
    const reachedDiscord = /discord\.com\/(?:api\/)?oauth2\/authorize/i.test(location);
    const callbackOk = redirectUri === expectedCallback;
    const ok = reachedDiscord && callbackOk && !loopback;
    return [
      loopbackCheck,
      {
        code: 'OAUTH_START',
        status: ok ? 'PASS' : 'FAIL',
        expected: `302 to Discord authorize with redirect_uri=${expectedCallback}`,
        observed: `${response.status} redirect_uri=${redirectUri || 'missing'} discord=${String(reachedDiscord)}`,
        impact: ok ? 'none' : 'deployed Discord login start is not the public V2 callback',
        action: ok
          ? 'none'
          : 'confirm IDENTITY_AUTH_BASE_URL and Discord Developer Portal redirect URI',
      },
    ];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [
      {
        code: 'OAUTH_LOOPBACK',
        status: 'BLOCKED_EXTERNAL',
        expected: 'OAuth start Location must not contain loopback',
        observed: message,
        impact: 'cannot prove the production OAuth start chain',
        action: 'retry from a network that can reach the public API',
      },
      {
        code: 'OAUTH_START',
        status: 'BLOCKED_EXTERNAL',
        expected: '302 to Discord authorize',
        observed: message,
        impact: 'cannot prove the production OAuth start chain',
        action: 'retry from a network that can reach the public API',
      },
    ];
  }
}

function checkDeployedPublicOrigin(code, value, expectedName) {
  const result = evaluatePublicOrigin(value, { requireHttps: true });
  return {
    code,
    status: result.ok ? 'PASS' : 'FAIL',
    expected: `public https ${expectedName}`,
    observed: result.ok ? result.origin : `${value} (${result.reason})`,
    impact: result.ok ? 'none' : `${expectedName} is missing, loopback, or not https`,
    action: result.ok
      ? 'none'
      : `set ${expectedName} to the public Zeabur https origin and rebuild`,
  };
}

export async function runRuntimeDoctor(env = process.env, repositoryRoot) {
  const registry = loadServiceRegistry(repositoryRoot);
  const checks = [
    ...validateServiceRegistry(registry, repositoryRoot),
    ...validateFrontendProductionContract(repositoryRoot),
  ];

  const expectedSha = env.V2_EXPECTED_SHA?.trim();
  const apiBase = env.V2_SMOKE_API_BASE?.trim();
  const adminBase = env.V2_SMOKE_ADMIN_BASE?.trim();
  const webBase = env.V2_SMOKE_WEB_BASE?.trim();
  const discordHealth = env.V2_SMOKE_DISCORD_HEALTH?.trim();

  const remoteConfigured = [apiBase, adminBase, webBase, discordHealth].some(
    (value) => value !== undefined && value.length > 0,
  );

  if (!remoteConfigured) {
    checks.push({
      code: 'REMOTE_ENDPOINTS',
      status: 'PASS',
      expected: 'optional public URLs via V2_SMOKE_* env',
      observed: 'not provided; static checks only',
      impact: 'none',
      action: 'none',
    });
  } else {
    if (apiBase !== undefined && apiBase.length > 0) {
      const origin = apiBase.replace(/\/$/, '');
      checks.push(
        await probe('API_GATEWAY', `${origin}/health/live`, 'HTTP 200 from public api-gateway'),
      );
      checks.push(await probeVersion(`${origin}/version`));
      checks.push(await probeActivityRead(origin));
      const revision = await probeRevision(expectedSha, `${origin}/health/live`);
      if (revision !== null) {
        checks.push(revision);
      }
    }
    if (adminBase !== undefined && adminBase.length > 0) {
      checks.push(
        await probe(
          'ADMIN',
          `${adminBase.replace(/\/$/, '')}/health`,
          'HTTP 200 from public Admin /health',
        ),
      );
    }
    if (webBase !== undefined && webBase.length > 0) {
      const origin = webBase.replace(/\/$/, '');
      checks.push(checkDeployedPublicOrigin('WEB_PUBLIC_ORIGIN_REMOTE', origin, 'WWW origin'));
      checks.push(await probe('WWW', `${origin}/health`, 'HTTP 200 from public member WWW'));
      checks.push(await probeWebLoginContract(origin));
    }
    if (apiBase !== undefined && apiBase.length > 0) {
      checks.push(checkDeployedPublicOrigin('WEB_API_BASE_REMOTE', apiBase, 'WWW API origin'));
      checks.push(
        checkDeployedPublicOrigin('WEB_IDENTITY_BASE_REMOTE', apiBase, 'WWW Identity origin'),
      );
    }
    if (
      apiBase !== undefined &&
      apiBase.length > 0 &&
      webBase !== undefined &&
      webBase.length > 0
    ) {
      checks.push(...(await probeOAuthStart(apiBase, webBase)));
    }
    if (discordHealth !== undefined && discordHealth.length > 0) {
      checks.push(
        await probe('DISCORD_HEALTH', discordHealth, 'HTTP 200 from discord-gateway health'),
      );
    }
  }

  return summarizeChecks(checks);
}

function printReport(summary) {
  for (const check of summary.checks) {
    process.stdout.write(`${formatCheck(check)}\n\n`);
  }
  process.stdout.write(
    `RESULT fail=${String(summary.failCount)} warn=${String(summary.warnCount)}\n`,
  );
}

const isDirectRun = process.argv[1]?.includes('runtime-doctor.mjs') === true;
if (isDirectRun) {
  const summary = await runRuntimeDoctor();
  printReport(summary);
  process.exit(summary.ok ? 0 : 1);
}
