#!/usr/bin/env node
/** Public smoke after Zeabur deploy. Exit 1 when ZEABUR_EXPECT_SHA prefix not found in live health. */
const expectSha = process.env.ZEABUR_EXPECT_SHA?.trim().toLowerCase();

const targets = [
  ['admin', 'https://v2-admin.zeabur.app/'],
  ['web', 'https://v2-web.zeabur.app/'],
];

for (const [name, base] of targets) {
  const html = await fetch(base).then((r) => r.text());
  const script = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  if (!script) {
    console.log(`${name}: no script tag`);
    continue;
  }
  const js = await fetch(base.replace(/\/$/, '') + script).then((r) => r.text());
  const urls = [...js.matchAll(/https?:\/\/[a-zA-Z0-9._/-]+/g)]
    .map((m) => m[0])
    .filter((u) => u.includes('zeabur') || u.includes('localhost') || u.includes('127.0.0.1'));
  console.log(`${name} script=${script}`);
  console.log(
    [...new Set(urls)].join('\n') || '(no zeabur/localhost urls found — likely relative /api)',
  );
}

console.log('\nLive SHAs:');
let shaMismatch = false;
for (const [label, url] of [
  ['api', 'https://v2-api.zeabur.app/health/live'],
  ['discord', 'https://v22.zeabur.app/health/live'],
  ['web', 'https://v2-web.zeabur.app/health'],
]) {
  try {
    const body = await fetch(url).then((r) => r.text());
    console.log(`${label}: ${body.slice(0, 160)}`);
    if (expectSha) {
      const parsed = JSON.parse(body);
      const live = String(parsed.gitCommitSha ?? '').toLowerCase();
      if (
        live &&
        !live.startsWith(expectSha.slice(0, 7)) &&
        !live.startsWith(expectSha.slice(0, 12))
      ) {
        console.log(
          `${label}: SHA mismatch (live ${live.slice(0, 12)} vs expected ${expectSha.slice(0, 12)})`,
        );
        shaMismatch = true;
      }
    }
  } catch (error) {
    console.log(`${label}: ERROR ${error instanceof Error ? error.message : error}`);
    shaMismatch = true;
  }
}

if (expectSha && shaMismatch) {
  console.error(
    '\nSmoke failed: deployed revision does not match git tip yet (build may still be running).',
  );
  process.exitCode = 1;
}
