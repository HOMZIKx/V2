#!/usr/bin/env node
const html = await (await fetch('https://v2-admin.zeabur.app/')).text();
const scripts = [...html.matchAll(/src="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
console.log('adminScripts', scripts);
for (const s of scripts.slice(0, 3)) {
  const t = await (await fetch(`https://v2-admin.zeabur.app${s}`)).text();
  console.log(s, {
    len: t.length,
    hasLocalhost: /localhost|127\.0\.0\.1/.test(t),
    hasApi: /v2-api\.zeabur\.app/.test(t),
    hasDevActor: /dev-actor|DEV_ACTOR|local-token/i.test(t),
  });
}
const web = await (await fetch('https://v2-web.zeabur.app/profil')).text();
console.log({
  webHasLocalhost: /localhost|127\.0\.0\.1/.test(web),
  webHasApi: /v2-api\.zeabur\.app/.test(web),
});
