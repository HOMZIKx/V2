import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets');
const jobs = [
  { name: 'centrum-aktywnosci-icon.png', out: 'centrum-aktywnosci-icon.webp', max: 512 },
  { name: 'moje-aktywnosci-icon.png', out: 'moje-aktywnosci-icon.webp', max: 256 },
  { name: 'powiadomienia-icon.png', out: 'powiadomienia-icon.webp', max: 256 },
  { name: 'szukam-ekipy-icon.png', out: 'szukam-ekipy-icon.webp', max: 256 },
  { name: 'utworz-wydarzenie-icon.png', out: 'utworz-wydarzenie-icon.webp', max: 256 },
];

for (const job of jobs) {
  const input = path.join(dir, job.name);
  if (!fs.existsSync(input)) {
    console.log(JSON.stringify({ skip: job.name, reason: 'missing' }));
    continue;
  }
  const buf = fs.readFileSync(input);
  const outBuf = await sharp(buf)
    .resize({ width: job.max, height: job.max, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  const outPath = path.join(dir, job.out);
  fs.writeFileSync(outPath, outBuf);
  fs.unlinkSync(input);
  const meta = await sharp(outBuf).metadata();
  console.log(
    JSON.stringify({
      from: job.name,
      to: job.out,
      bytes: outBuf.length,
      wh: [meta.width, meta.height],
      format: meta.format,
    }),
  );
}
