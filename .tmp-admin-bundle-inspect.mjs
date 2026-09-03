#!/usr/bin/env node
const t = await (await fetch('https://v2-admin.zeabur.app/assets/index-DOLXxRzm.js')).text();
const apiHits = [...t.matchAll(/https:\/\/v2-api\.zeabur\.app/g)].length;
const samples = [];
let i = t.indexOf('127.0.0.1');
while (i >= 0 && samples.length < 5) {
  samples.push(t.slice(Math.max(0, i - 50), i + 70));
  i = t.indexOf('127.0.0.1', i + 1);
}
let j = t.indexOf('localhost');
const localSamples = [];
while (j >= 0 && localSamples.length < 5) {
  localSamples.push(t.slice(Math.max(0, j - 50), j + 70));
  j = t.indexOf('localhost', j + 1);
}
console.log(JSON.stringify({ apiHits, samples, localSamples }, null, 2));
