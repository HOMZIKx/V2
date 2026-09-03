#!/usr/bin/env node
/** Phase F smoke — no secrets. */
const tests = [
  ['admin-guilds-unauth', 'https://v2-api.zeabur.app/activity/v1/admin/guilds'],
  ['identity-profile-unauth', 'https://v2-api.zeabur.app/identity/v1/profile'],
  ['web-profil', 'https://v2-web.zeabur.app/profil'],
  ['admin-root', 'https://v2-admin.zeabur.app/'],
  ['admin-dashboard-route', 'https://v2-admin.zeabur.app/index.html'],
];

for (const [label, url] of tests) {
  const res = await fetch(url, { redirect: 'manual' });
  const text = await res.text();
  const hasLocalhost = /localhost|127\.0\.0\.1/.test(text);
  const apiHits = (text.match(/https:\/\/v2-api\.zeabur\.app/g) ?? []).length;
  console.log(
    JSON.stringify({
      label,
      status: res.status,
      hasLocalhostRef: hasLocalhost,
      apiOriginHits: apiHits,
      body: text.slice(0, 160).replace(/\s+/g, ' '),
    }),
  );
}
