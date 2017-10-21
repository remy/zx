import { stream } from './image-manip/scr.js';

async function main() {
  const res = await fetch('./image-manip/midnight.scr');
  const arrayBuffer = await res.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 192;
  canvas.style.setProperty('--scale', 2);

  const ctx = canvas.getContext('2d');
  canvas.classList.add('styled');
  document.body.appendChild(canvas);

  for (let i = 0; i < buffer.length; i++) {
    await stream(ctx, buffer[i], i);
  }
}

main();
