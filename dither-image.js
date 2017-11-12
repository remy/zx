import Dither from './Dither.js';
import Zoom from './Zoom.js';
import { imageToCanvas, imageToBlob, contrast, threshold } from './image.js';
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

function getInkFromPixel(rgb) {
  rgb = rgb.toString();
  let ink = brightColours.get(rgb);

  if (!ink) {
    ink = normalColours.get(rgb); // << 3;
  }

  return ink;
}

function attributesForBlock(block, print = false) {
  if (print) console.log(block);
  window.block = block;

  let attribute = 0;
  const inks = new Uint8Array((0b111 << 3) + 1).fill(0); // container array

  for (let i = 0; i < block.length / 4; i++) {
    const ink = getInkFromPixel([...block.subarray(i * 4, i * 4 + 3)]);
    inks[ink]++;
  }

  let [{ ink: paper }, { ink } = { ink: 0 }] = Array.from(inks)
    .map((count, ink) => ({ ink, count }))
    .filter(({ count }) => count)
    .sort((a, b) => a.count - b.count)
    .slice(-2);

  if (paper === null) {
    paper = ink;
  }

  if (print) console.log('paper set on %s', paper);
  if (print) console.log('ink pre shift: ', ink);

  // this helps massage the colours into a better position
  if (ink === 7 && paper !== 7) {
    [ink, paper] = [paper, ink];
  }

  // work out based on majority ink, whether we need a bright block
  if (ink >> 3 === 0 || paper >> 3 === 0) {
    // we're dealing with bright
    if (ink >> 3 === 0 && inks[ink] > inks[paper]) {
      attribute += 64;
    } else if (paper >> 3 === 0 && inks[paper] > inks[ink]) {
      attribute += 64;
    }
  }

  if (ink >> 3 !== 0) {
    ink = ink >> 3;
  }

  if (paper >> 3 !== 0) {
    paper = paper >> 3;
  }

  if (print) {
    console.log('ink: %s, paper: %s', ink, paper);
    inks.forEach(
      (count, ink) => count && console.log('ink %s (count: %s)', ink, count)
    );
  }

  attribute += paper << 3;
  attribute += ink;

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
  const img = document.querySelector('#jake');
  // ctx = drawing context with our source image
  const ctx = imageToCanvas(img, { width: 256, height: 192 });

  const canvas = ctx.canvas;
  const w = canvas.width;
  const h = canvas.height;

  // adjust contrast
  // ctx.putImageData(contrast(ctx.getImageData(0, 0, w, h), 25), 0, 0);

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

  // inkData is the 8x8 coloured attribute reference
  const { imageData: inkData, img: inkImg } = await render(
    ctx,
    bufferCtx,
    dither,
    {
      step: 1,
      diffusionFactor: 0.1,
      matrix: Dither.matrices.none,
      add: true,
    }
  );

  const { imageData: pixelData, img: pixelImg } = await renderFromInk(
    bufferCtx,
    bufferCtx,
    threshold,
    { value: 138 }
  );

  // // pixelData is black and white pixels (the binary SCR image)
  // const { imageData: pixelData, img: pixelImg } = await render(
  //   ctx, // threshold off the ink'ed canvas rather than the original
  //   bufferCtx,
  //   { dither: threshold },
  //   138
  //   // 46
  // );

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
  ul.innerHTML = `<li><a href="${scrURL}" download="image.scr">Download .SCR file</a> (<a href="${true}">img</a></li>`;

  const li = document.createElement('li');
  ul.appendChild(li);
  const attribsLI = document.createElement('li');
  ul.appendChild(attribsLI);
  document.body.appendChild(ul);

  const zoomOriginal = new Zoom(img2);
  const zoomPixel = new Zoom(pixelImg);
  const zoomInk = new Zoom(inkImg);
  const zoomResult = new Zoom(scrCtx);

  const rootCanvas = document.querySelector('canvas');
  rootCanvas.classList.add('crosshair');

  let hover = true;

  rootCanvas.onclick = () => {
    hover = !hover;
  };

  rootCanvas.onmousemove = e => {
    if (!hover) return;
    const x = (e.pageX / 8) | 0;
    const y = (e.pageY / 8) | 0;
    zoomOriginal.seeXY(x, y);
    zoomInk.seeXY(x, y);
    zoomPixel.seeXY(x, y);
    zoomResult.seeXY(x, y);
    li.innerHTML = `{ x: ${x}, y: ${y} }`;
    const block = zoomInk.pixel(x, y);
    const byte = attributesForBlock(block);
    window.attributesForBlock = attributesForBlock.bind(null, block);
    const debug = y === 18 && x === 20;
    const attribs = readAttributes(byte, debug);
    const ink = attribs.ink.join(',');
    const paper = attribs.paper.join(',');
    attribsLI.innerHTML = `ink: ${ink} (${attribs.values
      .ink}) <span class="block" style="background: rgb(${ink})"></span>, paper: ${paper} (${attribs
      .values
      .paper}) <span class="block" style="background: rgb(${paper})"></span>`;
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

function getInkForBlock(zoom, x, y) {
  const block = zoom.pixel(x, y);
  // 1: find how many colours we're dealing with (256 elements)
  // 2: if 2 - switch them to majority paper (0b0) and least ink (0b1)
  // 3: if more than two, order then select
  const byte = attributesForBlock(block);
  const attributes = readAttributes(byte);
  const newBlock = new Uint8ClampedArray(8 * 8 * 4);

  const inks = new Uint8Array((0b111 << 3) + 1).fill(0); // container array

  for (let i = 0; i < block.length / 4; i++) {
    const ink = getInkFromPixel([...block.subarray(i * 4, i * 4 + 3)]);
    inks[ink]++;
  }

  // 22, 17
  const print = x === 22 && y === 17;

  const usedInks = inks.filter((count, ink) => {
    // count && console.log('ink %s (count: %s)', ink, count);
    return count > 0;
  }).length;

  if (print) console.log('inks used: %s', usedInks);

  for (let i = 0; i < 64; i++) {
    const ink = getInkFromPixel([...block.subarray(i * 4, i * 4 + 3)]);

    if (print)
      console.log(
        'ink found: %s, ink: %s, paper: %s',
        ink,
        attributes.values.ink,
        attributes.values.paper
      );

    if (usedInks === 1) {
      newBlock.set([255, 255, 255, 255], i * 4);
    } else if (ink === attributes.values.ink) {
      newBlock.set([0, 0, 0, 255], i * 4);
    } else if (ink === attributes.values.paper) {
      newBlock.set([255, 255, 255, 255], i * 4);
    } else {
      newBlock.set([0, 0, 0, 255], i * 4);
    }
  }

  if (print) console.log(newBlock);

  return newBlock;
}

window.getInkForBlock = getInkForBlock;

async function renderFromInk(ctx, bufferCtx, dither, options = {}) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const buffer = ctx.getImageData(0, 0, w, h);

  const res = new Uint8ClampedArray(h * w * 4);
  const zoom = new Zoom(buffer.data);
  window.inkZoom = zoom;
  let ptr = 0;

  for (let y = 0; y < 192 / 8; y++) {
    for (let x = 0; x < 256 / 8; x++) {
      const newBlock = getInkForBlock(zoom, x, y);

      bufferCtx.putImageData(new ImageData(newBlock, 8, 8), x * 8, y * 8);
      // if (x === 0) console.log(block);
      //  = attributesForBlock(block, print);

      ptr++;
    }
  }

  const imageData = bufferCtx.getImageData(0, 0, w, h);
  // bufferCtx.putImageData(imageData, 0, 0);

  const blob = await imageToBlob(null, bufferCtx);
  const img2 = new Image();
  img2.src = URL.createObjectURL(blob, { 'content-type': 'image/png' });

  return new Promise(resolve => {
    img2.onload = setTimeout(() => resolve({ imageData, img: img2 }), 10);
    document.body.appendChild(img2);
  });
}

main();
