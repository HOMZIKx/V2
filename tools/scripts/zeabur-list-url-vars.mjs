#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const environmentID = '6a720a3e5f062718bc7b3421';
const services = [
  ['api-gateway', '6a8211c9bdeaa87e2cf6ad34'],
  ['activity-service', '6a8211c2a21454a2cf6ad77b'],
];

for (const [name, id] of services) {
  const proc = spawnSync(
    'npx',
    [
      'zeabur@latest',
      '-i=false',
      'variable',
      'list',
      '--id',
      id,
      '--env-id',
      environmentID,
      '--json',
    ],
    { encoding: 'utf8', shell: true },
  );
  const jsonStart = proc.stdout.indexOf('{');
  const jsonText = jsonStart >= 0 ? proc.stdout.slice(jsonStart) : proc.stdout;
  try {
    const parsed = JSON.parse(jsonText);
    const vars = [...(parsed.variables ?? []), ...(parsed.readonlyVariables ?? [])];
    console.log(`\n${name}:`);
    for (const v of vars
      .filter((x) => /ACTIVITY|IDENTITY|PORT|URL|BASE/i.test(x.key))
      .sort((a, b) => a.key.localeCompare(b.key))) {
      const val =
        v.key.includes('SECRET') || v.key.includes('PEM') || v.key.includes('PASSWORD')
          ? '(redacted)'
          : String(v.value).slice(0, 120);
      console.log(`  ${v.key}=${val}`);
    }
  } catch (e) {
    console.log(name, 'parse error', proc.stdout.slice(0, 200));
  }
}
