import Dither from './Dither.js';
import Zoom from './Zoom.js';
import { imageToCanvas, contrast } from './image.js';
import {
  attributesForBlock,
  readAttributes,
  pixelsForSCR,
  putAttributes,
  getInkFromPixel,
  putPixels,
} from './image-manip/scr.js';

export async function dither(url, all = false) {
  let img = url;
  if (typeof url === 'string') {
    img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
  }

  const ctx = imageToCanvas(img, { width: 256, height: 192 });
  const canvas = ctx.canvas;
  const w = canvas.width;
  const h = canvas.height;

  // the buffer is used to draw into as a temp space
  const bufferCtx = document.createElement('canvas').getContext('2d');
  bufferCtx.canvas.width = w;
  bufferCtx.canvas.height = h;

  const dither = new Dither({
    matrix: Dither.matrices.none,
    step: 1,
  });

  const { imageData: inkData } = await render(ctx, bufferCtx, dither, {
    diffusionFactor: 0.1,
    matrix: Dither.matrices.atkinson,
  });

  const { imageData: pixelData } = await renderFromInk(bufferCtx, bufferCtx);

  // load all the final output into SCR format - starting with binary for pixels
  const pixels = new Uint8Array(256 * 192 / 8 + 768);
  putPixels(0, pixels, pixelData.data);
  putPixels(1, pixels, pixelData.data);
  putPixels(2, pixels, pixelData.data);

  // …then try to work out the attributes (bright, ink and paper)
  putAttributes(pixels, inkData);

  if (all) {
    return {
      pixels,
      inkData,
      pixelData,
      originalData: ctx.getImageData(0, 0, w, h),
    };
  }

  return pixels; // this is the raw binary .src format
}

async function pixelsToImage(pixels) {
  const ctx = document.createElement('canvas').getContext('2d');
  const canvas = ctx.canvas;
  canvas.width = 256;
  canvas.height = 192;

  ctx.putImageData(pixels, 0, 0);

  const url = canvas.toDataURL('image/png');
  const img = new Image();
  img.src = url;
  return new Promise(resolve => (img.onload = () => resolve(img)));
}

export default async function main(url = './image-manip/ffconf-logo.png') {
  // ctx = drawing context with our source image
  const pixels = await dither(
    url, // URL must be CORS happy
    false
  );

  const container = document.createElement('div');
  document.body.appendChild(container);
  const scrCtx = document.createElement('canvas').getContext('2d');
  const w = (scrCtx.canvas.width = 256);
  const h = (scrCtx.canvas.height = 192);

  pixelsForSCR(pixels, scrCtx);
  const img2 = await pixelsToImage(scrCtx.getImageData(0, 0, w, h));
  container.appendChild(img2);
}

async function render(ctx, bufferCtx, dither, options = {}) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const buffer = contrast(ctx.getImageData(0, 0, w, h), 10);
  const res = dither.dither(buffer.data, w, options);
  const imageData = new ImageData(new Uint8ClampedArray(res), w, h);
  bufferCtx.putImageData(imageData, 0, 0);

  return { imageData };
}

function putInkForBlock(
  zoom,
  x,
  y,
  newBlock = new Uint8ClampedArray(8 * 8 * 4)
) {
  const block = zoom.pixel(x, y);
  // 1: find how many colours we're dealing with (256 elements)
  // 2: if 2 - switch them to majority paper (0b0) and least ink (0b1)
  // 3: if more than two, order then select
  const print = x === 3 && y === 1;
  const byte = attributesForBlock(block, print);
  const attributes = readAttributes(byte);

  for (let i = 0; i < 64; i++) {
    const ink = getInkFromPixel([...block.slice(i * 4, i * 4 + 3)]);

    if (ink === attributes.values.ink) {
      newBlock.set([0, 0, 0, 255], i * 4);
    } else if (ink === attributes.values.paper) {
      newBlock.set([255, 255, 255, 255], i * 4);
    } else {
      newBlock.set([0, 0, 0, 255], i * 4);
    }
  }

  return newBlock;
}

async function renderFromInk(ctx, bufferCtx) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const buffer = ctx.getImageData(0, 0, w, h);

  const zoom = new Zoom(buffer.data);

  const blockBuffer = new Uint8ClampedArray(8 * 8 * 4);

  for (let y = 0; y < 192 / 8; y++) {
    for (let x = 0; x < 256 / 8; x++) {
      putInkForBlock(zoom, x, y, blockBuffer);

      bufferCtx.putImageData(new ImageData(blockBuffer, 8, 8), x * 8, y * 8);
    }
  }

  const imageData = bufferCtx.getImageData(0, 0, w, h);

  return { imageData };
}

if (window.location.search.includes('oldify')) main();
