import { load, pixelsForSCR } from './scr.js';

// main();

async function main() {
  const buffer = await load('./midnight.scr');

  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  canvas.width = 256;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');

  window.ctx = ctx;

  const pixels = pixelsForSCR(buffer, ctx);
}

main();
