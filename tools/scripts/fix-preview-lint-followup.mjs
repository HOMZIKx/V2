import { readFileSync, writeFileSync } from 'node:fs';

const path = 'apps/web/src/technik/panels-api.ts';
const helper = `function stringField(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}`;
const doubleHelper = `${helper}\n\n${helper}`;
const source = readFileSync(path, 'utf8');
if (source.includes(doubleHelper)) {
  writeFileSync(path, source.replace(doubleHelper, helper), 'utf8');
  console.log('removed duplicate stringField helper');
} else if (source.includes(helper)) {
  console.log('stringField helper already singular');
} else {
  throw new Error('stringField helper not found');
}
