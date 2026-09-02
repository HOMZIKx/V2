import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets');

const jobs = [
  {
    from: 'centrum-aktywnosci-icon.webp',
    to: 'centrum-aktywnosci-icon.png',
    max: 512,
  },
  {
    from: 'moje-aktywnosci-icon.webp',
    to: 'moje-aktywnosci-icon.png',
    max: 256,
  },
  {
    from: 'powiadomienia-icon.webp',
    to: 'powiadomienia-icon.png',
    max: 256,
  },
  {
    from: 'szukam-ekipy-icon.webp',
    to: 'szukam-ekipy-icon.png',
    max: 256,
  },
  {
    from: 'utworz-wydarzenie-icon.webp',
    to: 'utworz-wydarzenie-icon.png',
    max: 256,
  },
  {
    from: 'v2-activity-banner.webp',
    to: 'v2-activity-banner.png',
    max: null,
  },
];

for (const job of jobs) {
  const input = path.join(dir, job.from);
  if (!fs.existsSync(input)) {
    console.log(JSON.stringify({ skip: job.from }));
    continue;
  }
  let pipeline = sharp(fs.readFileSync(input));
  if (job.max !== null) {
    pipeline = pipeline.resize({
      width: job.max,
      height: job.max,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }
  const outBuf = await pipeline.png({ compressionLevel: 9 }).toBuffer();
  fs.writeFileSync(path.join(dir, job.to), outBuf);
  if (job.from !== job.to) {
    fs.unlinkSync(input);
  }
  const meta = await sharp(outBuf).metadata();
  console.log(
    JSON.stringify({
      to: job.to,
      bytes: outBuf.length,
      wh: [meta.width, meta.height],
      format: meta.format,
    }),
  );
}
