#!/usr/bin/env node
const html = await (await fetch('https://v2-admin.zeabur.app/')).text();
const asset = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
const js = await (await fetch(`https://v2-admin.zeabur.app${asset}`)).text();
console.log({
  asset,
  hasApi: /v2-api\.zeabur\.app/.test(js),
  has4400: /127\.0\.0\.1:4400/.test(js),
  hasLocalhostHttp: /http:\/\/localhost/.test(js),
});
