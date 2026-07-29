import sharp from 'sharp';
import { resolve } from 'node:path';

const SRC = resolve(__dirname, '../public/icon.svg');
const OUT_DIR = resolve(__dirname, '../public');

const targets = [
  { file: 'icon-192x192.png', size: 192 },
  { file: 'icon-512x512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'favicon-32x32.png', size: 32 },
  { file: 'favicon-16x16.png', size: 16 },
];

async function main() {
  for (const { file, size } of targets) {
    await sharp(SRC).resize(size, size).png().toFile(resolve(OUT_DIR, file));
    console.log(`generated ${file} (${size}x${size})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
