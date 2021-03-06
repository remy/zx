const brightColours = {
  0b000: [0, 0, 0],
  0b001: [0, 0, 0xff],
  0b010: [0xff, 0, 0],
  0b011: [0xff, 0, 0xff],
  0b100: [0, 0xff, 0],
  0b101: [0, 0xff, 0xff],
  0b110: [0xff, 0xff, 0],
  0b111: [0xff, 0xff, 0xff],
};

const normalColours = {
  0b000: [0, 0, 0],
  0b001: [0, 0, 0xd7],
  0b010: [0xd7, 0, 0],
  0b011: [0xd7, 0, 0xd7],
  0b100: [0, 0xd7, 0],
  0b101: [0, 0xd7, 0xd7],
  0b110: [0xd7, 0xd7, 0],
  0b111: [0xd7, 0xd7, 0xd7],
};

const toBlink = [];
let blinkOn = false;

function block(
  x = 0,
  y = 0,
  buffer, // expected to be 6912 long (2048 * 3 + 768)
  attribute = buffer.subarray(2048 * 3)[y * 32 + x]
) {
  // console.log(x, y);
  const start = ((y / 8) | 0) * 2048;
  const pixels = buffer.subarray(start, start + 2048);

  // reminder: paper is binary 0, ink is 1
  const { ink, paper } = readAttributes(attribute);
  const pixel = new Uint8ClampedArray(4 * 8 * 8);
  y = y % 8;

  for (let i = 0; i < 8; i++) {
    const ptr = x + 256 * i + y * 32;
    const byte = pixels[ptr];

    // imageData rgba 8x1
    for (let j = 0; j < 8; j++) {
      // determines bit for i, based on MSb as left most pixel
      const colour = (byte & (1 << (7 - j))) === 0 ? paper : ink;

      const offset = j * 4 + 4 * 8 * i;
      pixel[offset + 0] = colour[0]; //ptr % 256;
      pixel[offset + 1] = colour[1];
      pixel[offset + 2] = colour[2];
      pixel[offset + 3] = 255; // - bit; // alpha
    }
  }

  return pixel;
}

class Zoom {
  constructor(buffer) {
    const canvas = document.createElement('canvas');
    canvas.id = 'zoom';
    document.body.appendChild(canvas);
    this.ctx = canvas.getContext('2d');

    this.buffer = buffer;

    const scale = 20;
    const w = (canvas.width = 8);
    const h = (canvas.height = 8);
    canvas.style.imageRendering = 'pixelated';
    canvas.style.width = `${w * scale}px`;
    canvas.style.height = `${h * scale}px`;
  }

  put(imageData) {
    const ctx = this.ctx;
    ctx.putImageData(imageData, 0, 0);
  }

  seeXY(x, y) {
    const imageData = new ImageData(this.pixel(x, y), 8, 8);
    this.ctx.putImageData(imageData, 0, 0);
  }

  pixel(x = 0, y = 0) {
    return block(x, y, this.buffer);
  }
}

async function load(url) {
  return new Uint8Array(await (await fetch(url)).arrayBuffer());
}

async function sleep(ms) {
  // return;
  if (!ms) return;
  return new Promise(resolve => setTimeout(() => resolve(), ms));
}

function put(ctx, imageData, x, y) {
  ctx.putImageData(imageData, x, y);
  //   await sleep(0);
}

function asHex(n) {
  return `0x${n
    .toString(16)
    .padStart(2, '0')
    .toUpperCase()}`;
}

function draw(ctx, third, data) {
  const imageData = new ImageData(new Uint8ClampedArray(4 * 256 * 64), 256, 64);
  let ctr = 0;
  for (let offset = 0; offset < 8; offset++) {
    for (let line = 0; line < 8; line++) {
      for (let i = 0; i < 32; i++) {
        let j = 0;
        const ptr = ctr++; //line * (8 + offset) * 32 + i;
        const byte = data[ptr];

        const x = i * 8;
        const y = ctx.canvas.height / 3 * third + line * 8 + offset;

        // imageData rgba 8x1
        for (; j < 8; j++) {
          // determines bit for i, based on MSb
          const bit = (byte & (1 << (7 - j))) === 0 ? 0 : 255;

          const ptr = x + 256 * i + y * 32;
          const offset = ptr + j * 4;
          imageData.data[offset + 0] = bit; //ptr % 256;
          imageData.data[offset + 1] = bit;
          imageData.data[offset + 2] = bit;
          imageData.data[offset + 3] = 255; // - bit; // alpha
        }
        // put(ctx, imageData, x, y);
      }
    }
  }
  put(ctx, imageData, 0, ctx.canvas.height / 3 * third);
}

function colour(ctx, buffer) {
  const attribs = buffer.subarray(2048 * 3);
  const imageData = new ImageData(8, 8);

  for (let i = 0; i < attribs.length; i++) {
    const attribute = attribs[i];
    const { ink, paper, blink } = readAttributes(attribute);

    const x = i % (ctx.canvas.width / 8);
    const y = (i / (ctx.canvas.width / 8)) | 0;

    imageData.data.set(block(x, y, buffer));

    if (blink && ink.join('') !== paper.join('')) {
      toBlink.push({
        attribute,
        x,
        y,
      });
    }

    put(ctx, imageData, x * 8, y * 8); // replace the whole shebang

    // await sleep(1);
  }
}

function doBlink(ctx, buffer) {
  blinkOn = !blinkOn;

  toBlink.forEach(item => {
    const { x, y } = item;
    let attribute = item.attribute;
    if (blinkOn) {
      // swap the paper and ink
      attribute =
        (attribute & 192) + // bright + blink
        ((attribute & 7) << 3) + // ink moved to paper
        ((attribute & 56) >> 3); // paper moved to ink
    }
    const pixel = new ImageData(block(x, y, buffer, attribute), 8, 8);
    put(ctx, pixel, x * 8, y * 8);
  });
}

async function main() {
  const buffer = await load('./screens/midnight.scr');

  const canvas = document.createElement('canvas');
  const log = document.createElement('pre');

  document.body.appendChild(canvas);
  const zoom = new Zoom(buffer);
  document.body.appendChild(log);
  const ctx = canvas.getContext('2d');

  window.ctx = ctx;

  const scale = 3;
  const w = (canvas.width = 256);
  const h = (canvas.height = 192);
  canvas.style.imageRendering = 'pixelated';
  canvas.style.width = `${w * scale}px`;
  canvas.style.height = `${h * scale}px`;
  ctx.fillStyle = '#ccc';
  ctx.fillRect(0, 0, w, h);

  draw(ctx, 0, buffer.subarray(0, 2048));
  draw(ctx, 1, buffer.subarray(2048, 2048 * 2));
  draw(ctx, 2, buffer.subarray(2048 * 2, 2048 * 3));

  const attribs = buffer.subarray(2048 * 3);

  colour(ctx, buffer);
  zoom.seeXY(0, 0);

  // setInterval(() => zoom.seeXY(), 1000);

  canvas.onmousemove = e => {
    const { ptr, x, y, byte, bright, blink, ink, paper } = readFromPoint({
      attribs,
      scale,
      x: e.pageX,
      y: e.pageY,
    });

    zoom.seeXY(x / 8, y / 8);

    log.innerHTML = `ptr: ${ptr}
x: ${x} (${x / 8})
y: ${y} (${y / 8})
byte: ${byte}
ink: <span style="color: white; text-shadow: 1px 1px 0 #000; background: rgb(${ink.join(
      ','
    )})">${(byte & 7).toString(2).padStart(3, '0')}</span>
paper: <span style="color: white; text-shadow: 1px 1px 0 #000; background: rgb(${paper.join(
      ','
    )})">${((byte & 56) >> 3).toString(2).padStart(3, '0')}</span>
bright: ${bright}
blink: ${blink}
`;
  };

  canvas.onclick = e => {
    const { x, y, byte, bright, blink, ink, paper } = readFromPoint({
      attribs,
      scale,
      x: e.pageX,
      y: e.pageY,
    });

    toBlink.push({
      x,
      y,
      ink,
      paper,
    });
  };

  // console.log(buffer);
  // console.log(toBlink);
  // toBlink.splice(0);
  setInterval(() => doBlink(ctx, buffer), 333);
}

function readAttributes(byte) {
  const bright = !!(byte & 64);
  const source = bright ? brightColours : normalColours;

  const ink = source[byte & 7]; // 0b00000111
  const paper = source[(byte & 56) >> 3]; // 0b00111000
  const blink = !!(byte & 128);

  return {
    bright,
    ink,
    paper,
    blink,
  };
}

function readFromPoint({ x, y, scale = 1, attribs = [] }) {
  x = (((x / scale) | 0) / 8) | 0;
  y = (((y / scale) | 0) / 8) | 0;
  const ptr = y * 32 + x;
  const byte = attribs[ptr];

  const { ink, paper, bright, blink } = readAttributes(byte);

  return {
    ptr,
    x: x * 8,
    y: y * 8,
    byte,
    ink,
    paper,
    blink,
    bright,
  };
}

main();
