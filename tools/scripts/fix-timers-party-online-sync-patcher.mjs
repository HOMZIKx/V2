import { readFileSync, writeFileSync } from 'node:fs';

const path = 'tools/scripts/apply-timers-party-online-sync.mjs';
let source = readFileSync(path, 'utf8');

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
const to = [
  'replaceAllChecked(',
  '  partyUi,',
  '  /(^\\s*)patch: \\{ sessionKills: nextKills \\},/gm,',
  '  (_match, indent) => `${indent}patch: { sessionKillsDelta: 1 },`,',
  '  2,',
  ');',
].join('\n');
if (!source.includes(from)) {
  throw new Error('Expected sessionKills patcher block was not found');
}
source = source.replace(from, to);

const marker = `replaceOnce(
  partyUi,
  \`  const markSessionKill = () => {\\n    if (!party) return;\\n    const nextKills = party.sessionKills + 1;\\n    const next = incrementSessionKills(party);\`,`;
const removeKillAndDismissCounter = `replaceOnce(
  partyUi,
  \`  const killAndDismiss = (pinId: string) => {\\n    if (!party) return;\\n    const nextKills = party.sessionKills + 1;\\n    const next = incrementSessionKills(party);\`,
  \`  const killAndDismiss = (pinId: string) => {\\n    if (!party) return;\\n    const next = incrementSessionKills(party);\`,
);
`;
if (!source.includes(marker)) {
  throw new Error('Expected markSessionKill patch marker was not found');
}
source = source.replace(marker, `${removeKillAndDismissCounter}${marker}`);

writeFileSync(path, source, 'utf8');
console.log('Temporary patcher repaired.');
