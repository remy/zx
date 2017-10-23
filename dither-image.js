import Dither from './Dither.js';
import Zoom from './Zoom.js';
import { imageToCanvas, imageToBlob, contrast } from './image.js';
import { readAttributes, pixelsForSCR } from './image-manip/scr.js';

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

window.findColor = findColor;

function findColorAlt([r, g, b]) {
  let shortestDistance;
  let index;
  const rgb = [255 - r, 255 - g, 255 - b];

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

function attributesForBlock(block, print = false) {
  if (print) console.log(block);

  let attribute = 0;
  const inks = new Uint8Array((0b111 << 3) + 1).fill(0);

  for (let i = 0; i < block.length / 4; i++) {
    let inkRGB = [...block.subarray(i * 4, i * 4 + 3)].toString();
    let ink = brightColours.get(inkRGB);

    if (!ink) {
      ink = normalColours.get(inkRGB) << 3;
    }

    if (print) console.log(inkRGB, ink);
    inks[ink]++;
  }

  let ink = null;
  let paper = null;
  const paperThreshold = 64 / 100 * 2; // %
  inks.forEach((count, i) => {
    if ((paper === null && count > 0) || (count < paper && count > 0)) {
      // if (count > paperThreshold) {
      paper = i;
      // }
    }
    if (count > ink && count > 0) {
      ink = i;
    }
  });

  if (paper === null) {
    paper = ink;
  }

  if (print) console.log('paper set on %s', paper);
  if (print) console.log('ink pre shift: ', ink);

  if (ink >> 3 === 0) {
    attribute += 64;
  } else {
    ink = ink >> 3;
  }

  if (paper >> 3 !== 0) {
    paper >>= 3;
  }

  if (print) {
    console.log('ink: %s, paper: %s', ink, paper);
    inks.forEach(
      (count, ink) => count && console.log('ink %s (count: %s)', ink, count)
    );
  }

  attribute += ink << 3;
  attribute += paper;

  return attribute;
}

function loadAttributes(pixels, inkData) {
  let ptr = 0;
  const zoom = new Zoom(inkData);
  for (let y = 0; y < 192 / 8; y++) {
    for (let x = 0; x < 256 / 8; x++) {
      const block = zoom.pixel(x, y);
      const print = y === 18 && x === 20;

      pixels[2048 * 3 + ptr] = attributesForBlock(block, print);

      ptr++;
    }
  }
}

async function main() {
  const img = document.querySelector('#rem');
  // ctx = drawing context with our source image
  const ctx = imageToCanvas(img, { width: 256, height: 192 });

  const canvas = ctx.canvas;
  const w = canvas.width;
  const h = canvas.height;

  // adjust contrast
  ctx.putImageData(contrast(ctx.getImageData(0, 0, w, h), 25), 0, 0);

  // buffer to draw into rather than making a new canvas each time
  const bufferCtx = document.createElement('canvas').getContext('2d');
  bufferCtx.canvas.width = w;
  bufferCtx.canvas.height = h;

  const dither = new Dither({
    matrix: Dither.matrices.none,
    // matrix: Dither.matrices.atkinson,
    step: 1,
    findColor,
  });

  // pull the image from the canvas (since it might be cropped and may not match original)
  const blob = await imageToBlob(null, ctx);
  const img2 = new Image();
  img2.src = URL.createObjectURL(blob, { 'content-type': 'image/png' });
  document.body.appendChild(img2);

  // pixelData is black and white pixels (the binary SCR image)
  const { imageData: pixelData, img: pixelImg } = await render(
    ctx,
    bufferCtx,
    dither,
    {
      matrix: Dither.matrices.atkinson,
      diffusionFactor: 1,
      step: 1,
      findColor: Dither.defaultFindColor,
    }
  );
  // const paperData = await render(bufferCtx, bufferCtx, dither, {
  //   matrix: Dither.matrices.atkinson,
  //   step: 8,
  //   findColor: findColor,
  // });

  // inkData is the 8x8 coloured attribute reference
  const { imageData: inkData, img: inkImg } = await render(
    ctx,
    bufferCtx,
    dither,
    {
      step: 1,
      matrix: Dither.matrices.atkinson,
      add: true,
    }
  );

  // load all the final output into SCR format - starting with binary for pixels
  const pixels = new Uint8Array(256 * 192 / 8 + 768);
  loadPixels(0, pixels, pixelData.data);
  loadPixels(1, pixels, pixelData.data);
  loadPixels(2, pixels, pixelData.data);

  // …then try to work out the attributes (bright, ink and paper)
  loadAttributes(pixels, inkData);

  const scrCtx = document.createElement('canvas').getContext('2d');
  scrCtx.canvas.width = 256;
  scrCtx.canvas.height = 192;
  document.body.appendChild(scrCtx.canvas);
  // validate our pixels by translating the SCR binary back into a canvas
  pixelsForSCR(pixels, scrCtx);

  const ul = document.createElement('ul');
  const scrBlob = new Blob([pixels], { 'content-type': 'application/binary' });
  const scrURL = URL.createObjectURL(scrBlob);
  // const link = document.createElement('a');
  // link.download = 'image.scr';
  // link.href = scrURL;
  // link.innerHTML = 'Download .SCR file';
  ul.innerHTML = `<li><a href="${scrURL}" download="image.scr">Download .SCR file</a></li>`;

  const li = document.createElement('li');
  ul.appendChild(li);
  const attribsLI = document.createElement('li');
  ul.appendChild(attribsLI);
  document.body.appendChild(ul);

  const zoomInk = new Zoom(inkImg);
  const zoomPixel = new Zoom(pixelImg);
  const zoomResult = new Zoom(scrCtx);

  img2.onmousemove = e => {
    const x = (e.pageX / 8) | 0;
    const y = (e.pageY / 8) | 0;
    zoomInk.seeXY(x, y);
    zoomResult.seeXY(x, y);
    zoomPixel.seeXY(x, y);
    li.innerHTML = `{ x: ${x}, y: ${y} }`;
    const block = zoomInk.pixel(x, y);
    const byte = attributesForBlock(block);
    window.attributesForBlock = attributesForBlock.bind(null, block);
    const debug = y === 18 && x === 20;
    attribsLI.innerHTML = JSON.stringify(readAttributes(byte, debug));
  };
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

  return new Promise(resolve => {
    img2.onload = setTimeout(() => resolve({ imageData, img: img2 }), 10);
    document.body.appendChild(img2);
  });
}

main();
