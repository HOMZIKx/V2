import { readFileSync, writeFileSync } from 'node:fs';

const path = 'tools/scripts/apply-timers-party-online-sync.mjs';
const source = readFileSync(path, 'utf8');
const from = `replaceOnce(
  partyUi,
  \`        patch: { sessionKills: nextKills },\`,
  \`        patch: { sessionKillsDelta: 1 },\`,
);
replaceOnce(
  partyUi,
  \`                patch: { sessionKills: nextKills },\`,
  \`                patch: { sessionKillsDelta: 1 },\`,
);`;
const to = `replaceAllChecked(
  partyUi,
  /(^\\s*)patch: \\{ sessionKills: nextKills \\},/gm,
  (_match, indent) => \\`${'${indent}'}patch: { sessionKillsDelta: 1 },\\`,
  2,
);`;
if (!source.includes(from)) {
  throw new Error('Expected sessionKills patcher block was not found');
}
writeFileSync(path, source.replace(from, to), 'utf8');
console.log('Temporary patcher repaired.');
