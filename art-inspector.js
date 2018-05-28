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

const ORIGINAL = 0;
const DITHERED = 1;
const INKED = 2;
const FINAL = 3;

document.body.onkeydown = async e => {
  if (e.key === 'r') {
    window.location.reload();
  }
};

export async function dither(img, all = false) {
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
  img.className = 'scale';
  img.__canvas = canvas;
  return new Promise(resolve => (img.onload = () => resolve(img)));
}

const click = function(node) {
  var event = new MouseEvent('click');
  node.dispatchEvent(event);
};

function download(data, filename = 'image.png', type = 'image/png') {
  const a = document.createElement('a');
  a.download = filename;
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  a.href = url;
  click(a);
  URL.revokeObjectURL(url);
}

export default async function main(
  filename = prompt('Image or @twitter handle')
) {
  if (!filename) filename = 'rem';
  const img = new Image();
  if (filename.startsWith('@')) {
    img.crossOrigin = 'anonymous';
    img.src = `https://twivatar.glitch.me/${filename.slice(1)}`;
  } else {
    if (filename.includes('.')) {
      img.src = `/images/${filename}`;
    } else {
      img.src = `/images/${filename}.jpg`;
    }
  }

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });

  // ctx = drawing context with our source image
  const { pixels, inkData, pixelData, originalData } = await dither(img, true);

  const scrBlob = new Blob([pixels], {
    'content-type': 'application/binary',
  });
  const scrURL = URL.createObjectURL(scrBlob);

  const container = document.createElement('div');
  document.body.appendChild(container);
  container.className = 'flex';

  const ctx = document.createElement('canvas').getContext('2d');
  ctx.canvas.width = 256;
  ctx.canvas.height = 192;

  container.appendChild(ctx.canvas);

  ctx.canvas.className = 'artwork';
  // validate our pixels by translating the SCR binary back into a canvas
  pixelsForSCR(pixels, ctx);

  const layers = new Map();

  const finalData = ctx.getImageData(0, 0, 256, 192);
  ctx.clearRect(0, 0, 256, 192);

  layers.set(FINAL, { data: finalData, img: await pixelsToImage(finalData) });
  layers.set(DITHERED, { data: inkData, img: await pixelsToImage(inkData) });
  layers.set(INKED, { data: pixelData, img: await pixelsToImage(pixelData) });
  layers.set(ORIGINAL, {
    data: originalData,
    img: await pixelsToImage(originalData),
  });

  let index = -1;

  // cycle the images + shift goes backwards
  container.onclick = async e => {
    if (e.shiftKey) {
      index--;
      if (index < 0) {
        index = 3;
      }
    } else {
      index++;
    }

    const img = layers.get(index % 4).img;

    ctx.canvas.style.backgroundImage = `url(${img.src})`;
    container.className = `flex zoom-${index % 4}`;
  };

  document.documentElement.onkeydown = async e => {
    if (e.key === 'd') {
      const canvas = layers.get(index % 4).img.__canvas;
      const blob = await new Promise(resolve => canvas.toBlob(resolve));
      download(blob);

      return;
    }

    if (e.key === 'D') {
      download(scrBlob, 'image.scr', 'application/binary');
      return;
    }
  };

  container.onclick({});

  const list = document.createElement('div');
  container.appendChild(list);

  list.style =
    'display: flex; flex-direction: column; flex-shrink: 1; width: 180px;';

  const zoomOriginal = new Zoom(
    layers.get(ORIGINAL).data,
    list,
    `zoom-${ORIGINAL}`
  );
  const zoomPixel = new Zoom(layers.get(INKED).data, list, `zoom-${INKED}`);
  const zoomInk = new Zoom(layers.get(DITHERED).data, list, `zoom-${DITHERED}`);
  const zoomResult = new Zoom(layers.get(FINAL).data, list, `zoom-${FINAL}`);

  // const binary = document.createElement('pre');
  // list.appendChild(binary);

  zoomResult.sourceCtx = ctx;

  const rootCanvas = ctx.canvas;
  rootCanvas.classList.add('crosshair');

  let hover = true;

  rootCanvas.onmousemove = e => {
    if (!hover) return;
    const x = (e.pageX / 8) | 0;
    const y = (e.pageY / 8) | 0;
    zoomResult.seeXY(x, y);
    zoomOriginal.seeXY(x, y);
    zoomInk.seeXY(x, y);
    zoomPixel.seeXY(x, y);
    // li.innerHTML = `{ x: ${x}, y: ${y} }`;
    const block = zoomInk.pixel(x, y);
    const byte = attributesForBlock(block);
    window.attributesForBlock = attributesForBlock.bind(null, block);
    const debug = y === 18 && x === 20;
    const attribs = readAttributes(byte, debug);
    const ink = attribs.ink.join(',');
    const paper = attribs.paper.join(',');
    // console.log(attribs);
  };
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

  if (print) console.log(attributes);

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

if (window.location.search.includes('art-inspector')) main();
