import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const SERVICE_REGISTRY_RELATIVE_PATH = 'tools/runtime/service-registry.json';

const HEALTH_PATH = /^\/$|^\/[A-Za-z0-9/_-]+$/;
const EMPTY_ARG_DEFAULT = /^\s*ARG\s+([A-Z0-9_]+)=\s*$/m;
const LOCALHOST_ORIGIN = /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i;

/**
 * @typedef {'PASS' | 'WARN' | 'FAIL'} CheckStatus
 * @typedef {{
 *   code: string,
 *   status: CheckStatus,
 *   expected: string,
 *   observed: string,
 *   impact: string,
 *   action: string
 * }} DoctorCheck
 */

export function loadServiceRegistry(repositoryRoot = defaultRoot) {
  const registryPath = path.join(repositoryRoot, SERVICE_REGISTRY_RELATIVE_PATH);
  const raw = readFileSync(registryPath, 'utf8');
  return JSON.parse(raw);
}

function fail(code, expected, observed, impact, action) {
  return { code, status: 'FAIL', expected, observed, impact, action };
}

function pass(code, expected, observed, impact = 'none', action = 'none') {
  return { code, status: 'PASS', expected, observed, impact, action };
}

function warn(code, expected, observed, impact, action) {
  return { code, status: 'WARN', expected, observed, impact, action };
}

function listRootDockerfiles(repositoryRoot) {
  return readdirSync(repositoryRoot)
    .filter((name) => /^Dockerfile\.[a-z0-9-]+$/.test(name))
    .sort();
}

function uniqueNames(values) {
  const seen = new Set();
  const duplicates = [];
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.push(value);
    }
    seen.add(value);
  }
  return duplicates;
}

export function validateServiceRegistry(registry, repositoryRoot = defaultRoot) {
  /** @type {DoctorCheck[]} */
  const checks = [];

  if (registry === null || typeof registry !== 'object' || Array.isArray(registry)) {
    checks.push(
      fail(
        'REGISTRY_SHAPE',
        'object with services[] and addons[]',
        String(registry),
        'deploy tooling cannot enumerate services',
        `fix ${SERVICE_REGISTRY_RELATIVE_PATH}`,
      ),
    );
    return checks;
  }

  const services = Array.isArray(registry.services) ? registry.services : [];
  const addons = Array.isArray(registry.addons) ? registry.addons : [];

  if (services.length === 0) {
    checks.push(
      fail(
        'REGISTRY_SERVICES',
        'at least one APP service',
        'empty services[]',
        'no deployable apps are registered',
        `add current P4 services to ${SERVICE_REGISTRY_RELATIVE_PATH}`,
      ),
    );
  }

  const serviceNames = services.map((service) => service.name);
  const addonNames = addons.map((addon) => addon.name);
  const knownNames = new Set([...serviceNames, ...addonNames]);

  const duplicateServices = uniqueNames(serviceNames);
  if (duplicateServices.length > 0) {
    checks.push(
      fail(
        'REGISTRY_DUPLICATE_NAME',
        'unique service names',
        duplicateServices.join(', '),
        'tooling cannot map a name to one service',
        'remove duplicate entries from the registry',
      ),
    );
  } else {
    checks.push(pass('REGISTRY_DUPLICATE_NAME', 'unique service names', serviceNames.join(', ')));
  }

  const duplicateAddons = uniqueNames(addonNames);
  if (duplicateAddons.length > 0) {
    checks.push(
      fail(
        'REGISTRY_DUPLICATE_ADDON',
        'unique addon names',
        duplicateAddons.join(', '),
        'addon topology is ambiguous',
        'remove duplicate addon entries',
      ),
    );
  }

  for (const service of services) {
    const dockerfile = typeof service.dockerfile === 'string' ? service.dockerfile : '';
    const dockerfilePath = path.join(repositoryRoot, dockerfile);
    if (!existsSync(dockerfilePath)) {
      checks.push(
        fail(
          'DOCKERFILE_MISSING',
          `${dockerfile} exists at repo root`,
          'file not found',
          `${String(service.name)} cannot be built`,
          `add ${dockerfile} or remove the registry entry`,
        ),
      );
    }

    const suffix = dockerfile.replace(/^Dockerfile\./, '');
    if (service.zbpackDockerfileName !== suffix) {
      checks.push(
        fail(
          'ZBPACK_DOCKERFILE_NAME',
          suffix,
          String(service.zbpackDockerfileName),
          'Zeabur will build the wrong Dockerfile',
          `set zbpackDockerfileName to "${suffix}"`,
        ),
      );
    }

    if (service.rootDirectory !== '/') {
      checks.push(
        fail(
          'ROOT_DIRECTORY',
          '/',
          String(service.rootDirectory),
          'monorepo Dockerfiles expect repo root',
          'set rootDirectory to /',
        ),
      );
    }

    const health = service.health ?? {};
    for (const [key, value] of Object.entries(health)) {
      if (typeof value !== 'string' || !HEALTH_PATH.test(value)) {
        checks.push(
          fail(
            'HEALTH_PATH',
            'path starting with / (letters, digits, /, _, -)',
            `${String(service.name)}.health.${key}=${String(value)}`,
            'runtime doctor/smoke cannot probe the service',
            'use a valid health path such as /health/live',
          ),
        );
      }
    }

    for (const dependency of service.dependencies ?? []) {
      if (!knownNames.has(dependency)) {
        checks.push(
          fail(
            'DEPENDENCY_UNKNOWN',
            'dependency name in registry',
            `${String(service.name)} → ${String(dependency)}`,
            'startup order and doctor graphs are wrong',
            'point dependencies at registered service or addon names',
          ),
        );
      }
    }
  }

  const registeredDockerfiles = new Set(services.map((service) => service.dockerfile));
  const rootDockerfiles = listRootDockerfiles(repositoryRoot);
  for (const dockerfile of rootDockerfiles) {
    if (!registeredDockerfiles.has(dockerfile)) {
      checks.push(
        fail(
          'REGISTRY_MISSING_DOCKERFILE',
          `${dockerfile} listed in ${SERVICE_REGISTRY_RELATIVE_PATH}`,
          'not registered',
          'a deployable image exists without operability metadata',
          `add an APP entry for ${dockerfile.replace(/^Dockerfile\./, '')}`,
        ),
      );
    }
  }

  if (
    checks.every(
      (check) =>
        check.code !== 'DOCKERFILE_MISSING' && check.code !== 'REGISTRY_MISSING_DOCKERFILE',
    )
  ) {
    checks.push(
      pass(
        'DOCKERFILE_MAPPING',
        rootDockerfiles.join(', '),
        [...registeredDockerfiles].sort().join(', '),
      ),
    );
  }

  return checks;
}

export function validateFrontendProductionContract(repositoryRoot = defaultRoot) {
  /** @type {DoctorCheck[]} */
  const checks = [];
  const files = [
    {
      code: 'ADMIN_API_BASE',
      file: 'Dockerfile.admin',
      varName: 'VITE_API_BASE_URL',
    },
    {
      code: 'WEB_API_BASE',
      file: 'Dockerfile.web',
      varName: 'NEXT_PUBLIC_API_BASE_URL',
    },
  ];

  for (const item of files) {
    const contents = readFileSync(path.join(repositoryRoot, item.file), 'utf8');
    const emptyArg = contents.match(EMPTY_ARG_DEFAULT);
    if (emptyArg !== null && emptyArg[1] === item.varName) {
      checks.push(
        fail(
          item.code,
          `public api-gateway origin baked at image build (${item.varName})`,
          `${item.file} ARG ${item.varName}= overwrites Zeabur env with empty string`,
          'deployed browser cannot reach the backend',
          `remove empty ARG ${item.varName}= from ${item.file} and rebuild`,
        ),
      );
      continue;
    }

    if (LOCALHOST_ORIGIN.test(contents) && contents.includes(`ENV ${item.varName}`)) {
      checks.push(
        fail(
          item.code,
          `no localhost production bake for ${item.varName}`,
          `${item.file} assigns a localhost origin`,
          'deployed browser calls loopback instead of api-gateway',
          `bake a public https origin into ${item.varName}`,
        ),
      );
      continue;
    }

    if (!contents.includes(`${item.varName} must be a public http`)) {
      checks.push(
        warn(
          item.code,
          `${item.file} fails closed when ${item.varName} is missing`,
          'no fail-closed build check found',
          'a blank origin can ship silently',
          `fail the image build unless ${item.varName} is an http(s) origin`,
        ),
      );
      continue;
    }

    checks.push(
      pass(
        item.code,
        `public api-gateway origin at image build (${item.varName})`,
        `${item.file} fail-closed, no empty ARG default`,
      ),
    );
  }

  return checks;
}

export function summarizeChecks(checks) {
  const failCount = checks.filter((check) => check.status === 'FAIL').length;
  const warnCount = checks.filter((check) => check.status === 'WARN').length;
  return {
    ok: failCount === 0,
    failCount,
    warnCount,
    checks,
  };
}
