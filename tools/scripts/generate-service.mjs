import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const serviceName = process.argv[2];

if (serviceName === undefined || !/^[a-z][a-z0-9-]*-service$/.test(serviceName)) {
  console.error('Usage: pnpm generate:service <kebab-case-name-service>');
  process.exit(1);
}

const serviceRoot = path.join(repositoryRoot, 'services', serviceName);

try {
  mkdirSync(serviceRoot);
} catch (error) {
  if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
    console.error(`Service "${serviceName}" already exists; generator made no changes.`);
    process.exit(1);
  }

  throw error;
}

const files = {
  'domain/index.ts': 'export {};\n',
  'application/index.ts': 'export {};\n',
  'infrastructure/index.ts': 'export {};\n',
  'interface/http/health.ts': `export const healthStatus = { status: 'ok' } as const;\n`,
  'package.json': JSON.stringify(
    {
      name: `@v2/${serviceName}`,
      version: '0.0.0',
      private: true,
      type: 'module',
      main: './interface/http/health.ts',
      types: './interface/http/health.ts',
    },
    null,
    2,
  ).concat('\n'),
  'project.json': JSON.stringify(
    {
      name: serviceName,
      projectType: 'application',
      root: `services/${serviceName}`,
      tags: ['type:service'],
    },
    null,
    2,
  ).concat('\n'),
  'README.md': `# ${serviceName}\n\nService scaffold with Domain, Application, Infrastructure, and Interface layers.\n`,
};

for (const [relativePath, contents] of Object.entries(files)) {
  const targetPath = path.join(serviceRoot, relativePath);
  mkdirSync(path.dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, contents, { encoding: 'utf8', flag: 'wx' });
}

console.log(`Created service scaffold at services/${serviceName}.`);
