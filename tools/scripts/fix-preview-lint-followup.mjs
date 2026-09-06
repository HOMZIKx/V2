import { readFileSync, writeFileSync } from 'node:fs';

const path = 'apps/web/src/technik/panels-api.ts';
const helper = `function stringField(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}`;
const doubleHelper = `${helper}\n\n${helper}`;
let source = readFileSync(path, 'utf8');
if (!source.includes(helper)) {
  throw new Error('stringField helper not found');
}
let removed = 0;
while (source.includes(doubleHelper)) {
  source = source.replace(doubleHelper, helper);
  removed += 1;
}
if (removed > 0) {
  writeFileSync(path, source, 'utf8');
  console.log(`removed ${removed} duplicate stringField helper(s)`);
} else {
  console.log('stringField helper already singular');
}
