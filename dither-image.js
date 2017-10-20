import Dither from './Dither.js';
import { imageToCanvas, imageToBlob } from './image.js';
import { pixelsForSCR } from './image-manip/scr.js';

const colorMap = [
  [0, 0, 0xff],
  [0xff, 0, 0],
  [0xff, 0, 0xff],
  [0, 0xff, 0],
  [0, 0xff, 0xff],
  [0xff, 0xff, 0],
  [0xff, 0xff, 0xff],
  [0, 0, 0],
  [0, 0, 0xd7],
  [0xd7, 0, 0],
  [0xd7, 0, 0xd7],
  [0, 0xd7, 0],
  [0, 0xd7, 0xd7],
  [0xd7, 0xd7, 0],
  [0xd7, 0xd7, 0xd7],
];

const brightColours = new Map();
brightColours.set([0, 0, 0].toString(), 0b000);
brightColours.set([0, 0, 0xff].toString(), 0b001);
brightColours.set([0xff, 0, 0].toString(), 0b010);
brightColours.set([0xff, 0, 0xff].toString(), 0b011);
brightColours.set([0, 0xff, 0].toString(), 0b100);
brightColours.set([0, 0xff, 0xff].toString(), 0b101);
brightColours.set([0xff, 0xff, 0].toString(), 0b110);
brightColours.set([0xff, 0xff, 0xff].toString(), 0b111);

const normalColours = new Map();
normalColours.set([0, 0, 0].toString(), 0b000);
normalColours.set([0, 0, 0xd7].toString(), 0b001);
normalColours.set([0xd7, 0, 0].toString(), 0b010);
normalColours.set([0xd7, 0, 0xd7].toString(), 0b011);
normalColours.set([0, 0xd7, 0].toString(), 0b100);
normalColours.set([0, 0xd7, 0xd7].toString(), 0b101);
normalColours.set([0xd7, 0xd7, 0].toString(), 0b110);
normalColours.set([0xd7, 0xd7, 0xd7].toString(), 0b111);

window.normalColours = normalColours;

function getDistance(current, match) {
  const redDifference = current[0] - match[0];
  const greenDifference = current[1] - match[1];
  const blueDifference = current[2] - match[2];

  return (
    redDifference * redDifference +
    greenDifference * greenDifference +
    blueDifference * blueDifference
  );
}

// feels expensive, but https://www.cyotek.com/blog/finding-nearest-colors-using-euclidean-distance
function findColor(rgb) {
  let shortestDistance;
  let index;

  index = -1;
  shortestDistance = Number.MAX_SAFE_INTEGER;

  for (let i = 0; i < colorMap.length; i++) {
    const match = colorMap[i];
    const distance = getDistance(rgb, match);

    if (distance < shortestDistance) {
      index = i;
      shortestDistance = distance;
    }
  }

  return [...colorMap[index], 255];
}

function find2ndNearestColor(rgb) {
  let shortestDistance;
  const index = [];
  shortestDistance = Number.MAX_SAFE_INTEGER;

  for (let i = 0; i < colorMap.length; i++) {
    const match = colorMap[i];
    const distance = getDistance(rgb, match);

    if (distance < shortestDistance) {
      index.push(i);
      shortestDistance = distance;
    }
  }

  const match = index.length > 1 ? index.slice(-2)[0] : index[0];

  return [...colorMap[match], 255];
}

function getIndexForXY(width, x, y) {
  return width * y + x;
}

/**
 * Converts canvas image data to SCR binary format
 * @param {Number} third 0-2: the thirds of the screen data
 * @param {Uint8Array} allPixels expected to be 3 * 2048 + 768
 * @param {Uint8ClampedArray} allData canvas pixel data
 */
function loadPixels(third, allPixels, allData) {
  const pixels = allPixels.subarray(third * 2048, (third + 1) * 2048);
  const data = allData.subarray(
    third * (allData.length / 3),
    (third + 1) * (allData.length / 3)
  );

  let ptr = 0;

  for (let offset = 0; offset < 8; offset++) {
    for (let y = 0; y < 8; y++) {
      const row = y * 8 + offset;

      for (let x = 0; x < 32; x++) {
        let bit = 0;

        for (let j = 0; j < 8; j++) {
          const index = getIndexForXY(256, x * 8 + j, row) * 4;
          bit += (data[index] === 0 ? 1 : 0) << (7 - j);
        }

        pixels[ptr] = bit;
        ptr++;
      }
    }
  }
}

async function main() {
  const img = document.querySelector('#rem');
  const ctx = imageToCanvas(img, { width: 256, height: 192 });

  const canvas = ctx.canvas;
  const w = canvas.width;
  const h = canvas.height;

  const bufferCtx = document.createElement('canvas').getContext('2d');
  bufferCtx.canvas.width = w;
  bufferCtx.canvas.height = h;

  const dither = new Dither({
    matrix: Dither.matrices.none,
    step: 2,
    findColor,
  });

  const blob = await imageToBlob(null, ctx);
  const img2 = new Image();
  img2.src = URL.createObjectURL(blob, { 'content-type': 'image/png' });
  document.body.appendChild(img2);

  const pixelData = await render(ctx, bufferCtx, dither, {
    matrix: Dither.matrices.atkinson,
    step: 1,
    findColor: Dither.defaultFindColor,
  });
  const inkData = await render(ctx, bufferCtx, dither, {
    matrix: Dither.matrices.atkinson,
    step: 8,
  });
  const paperData = await render(ctx, bufferCtx, dither, {
    matrix: Dither.matrices.atkinson,
    step: 8,
    findColor: find2ndNearestColor,
  });

  // console.log(pixels.data.length);

  const pixels = new Uint8Array(256 * 192 / 8 + 768);
  loadPixels(0, pixels, pixelData.data);
  loadPixels(1, pixels, pixelData.data);
  loadPixels(2, pixels, pixelData.data);

  console.log('attrib length', inkData.data.length);

  let ptr = 0;
  for (let y = 0; y < 192 / 8; y++) {
    for (let x = 0; x < 256 / 8; x++) {
      const i = getIndexForXY(256, x * 8, y * 8);
      const index = i * 4;
      let inkRGB = [...inkData.data.slice(index, index + 3)].toString();
      let ink = brightColours.get(inkRGB);

      let attribute = 0;
      if (ink) {
        attribute += 64; // bright bit
      } else {
        ink = normalColours.get(inkRGB);
      }

      const paperRGB = [...paperData.data.slice(index, index + 3)].toString();
      let paper = brightColours.get(paperRGB); // FIXME can *only* be bright if ink is bright
      if (!paper) {
        paper = normalColours.get(paperRGB);
      }

      attribute += ink;
      attribute += paper << 3;
      pixels[2048 * 3 + ptr] = 0b01111000; // attribute;

      ptr++;
    }
  }

  const scrCtx = document.createElement('canvas').getContext('2d');
  scrCtx.canvas.width = 256;
  scrCtx.canvas.height = 192;
  document.body.appendChild(scrCtx.canvas);
  pixelsForSCR(pixels, scrCtx);

  const scrBlob = new Blob([pixels], { 'content-type': 'application/binary' });
  const scrURL = URL.createObjectURL(scrBlob);
  const link = document.createElement('a');
  link.download = 'image.scr';
  link.href = scrURL;
  link.innerHTML = 'Download .SCR file';
  document.body.appendChild(link);
}

async function render(ctx, bufferCtx, dither, options = {}) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const buffer = ctx.getImageData(0, 0, w, h);
  const res = dither.dither(buffer.data, w, options);
  const imageData = new ImageData(new Uint8ClampedArray(res), w, h);
  bufferCtx.putImageData(imageData, 0, 0);
  const blob = await imageToBlob(null, bufferCtx);
  const img2 = new Image();
  img2.src = URL.createObjectURL(blob, { 'content-type': 'image/png' });
  document.body.appendChild(img2);
  return imageData;
}

main();
