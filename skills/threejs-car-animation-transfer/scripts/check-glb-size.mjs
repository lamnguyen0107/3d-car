import { statSync } from 'node:fs';
import { resolve } from 'node:path';

const [fileArg, limitArg = '5'] = process.argv.slice(2);

if (!fileArg) {
  console.error('Usage: node skills/threejs-car-animation-transfer/scripts/check-glb-size.mjs <path-to-glb> [limit-mb]');
  process.exit(1);
}

const filePath = resolve(process.cwd(), fileArg);
const limitMb = Number(limitArg);

if (!Number.isFinite(limitMb) || limitMb <= 0) {
  console.error(`Invalid size limit: ${limitArg}`);
  process.exit(1);
}

const { size } = statSync(filePath);
const sizeMb = size / (1024 * 1024);

console.log(`GLB: ${filePath}`);
console.log(`Size: ${sizeMb.toFixed(2)} MB (${size} bytes)`);

if (sizeMb > limitMb) {
  console.log(`Result: OVER_LIMIT (${limitMb} MB) - optimize before transfer.`);
  process.exit(2);
}

console.log(`Result: WITHIN_LIMIT (${limitMb} MB) - transfer may proceed.`);
