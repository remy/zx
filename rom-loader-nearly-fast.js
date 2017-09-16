import ctx from './ctx.js';
import { draw } from './canvas.js';
import BufferLoader from './audio-buffer.js';
import image from './image.js';
import {
  generateHeader,
  calculateXORChecksum,
  T,
  SAMPLE_RATE,
  asHz,
  PILOT,
  ONE,
  ZERO,
} from './audio.js';

const decode = a => new TextDecoder().decode(a);

const round = (n, i = 4) => n.toFixed(i);
const pilotLength = round(1 / asHz(PILOT));
const oneLength = round(1 / asHz(ONE * 2), 4);
const zeroLength = round(1 / asHz(ZERO * 2), 4);
// const header = {
//   pilot: false,
//   sync: 0,
//   data: [],
// };

let pulseBuffer = [];

/*
  The following tape timing values are used by the ROM:

    - Each leader half-pulse takes 2,168 T
    - The first sync half-pulse takes 667 T
    - The second sync half-pulse takes 735 T
    - A '0' bit takes two 855 T half-pulses
    - A '1' bit takes two 1,710 T half-pulses (twice the length of a '0' bit)
*/

const edge = (a, b) => !((a >= 0) ^ (b < 0));

function loadBytes(length, buffer) {
  const bytes = new Uint8Array(length);
  console.log('get byte', buffer.length);
  for (let i = 0; i < length * 8; i++) {
    const [high, low] = loadEdge2(buffer);

    if (!high || !low) {
      console.log('bad byte - missing pair of pulses @ %s', i, high, low);
      return;
    }

    // we're collecting the bits for an array of 8 bit bytes,
    // first left shifting by 1 bit, then adding the new bit
    // until we have a full byte
    const waveLength = round(1 / SAMPLE_RATE * (high.length + low.length));
    const p = (i / 8) | 0;
    bytes[p] <<= 1; // left shift
    bytes[p] += waveLength === oneLength ? 0b1 : 0b0;
  }

  return bytes;
}

function loadPilot(buffer) {
  for (let i = 0; i < 9000; i++) {
    const [pulse, pulse1] = loadEdge2(buffer);

    if (!pulse) {
      console.log('exit pilot');
      return;
    }

    const length = 1 / SAMPLE_RATE * (pulse.length + pulse1.length);

    if (round(length) !== pilotLength) {
      console.log('pilot finished at', i, round(length), pulse.length);
      break;
    }
  }
}

function loadSync(buffer) {
  const on = expectPulse(buffer, 667);
  const off = expectPulse(buffer, 735);

  if (!(on && off)) {
    console.log('failed to find sync');
  }

  console.log('got sync');
}

function loadHeader(buffer) {
  return loadBytes(18, buffer);
}

function expectPulse(buffer, tStates) {
  const pulse = loadEdge1(buffer);
  const length = 1 / SAMPLE_RATE * pulse.length;
  return round(length) === round(1 / asHz(tStates));
}

function loadEdge2(buffer) {
  const pulse1 = loadEdge1(buffer);
  const pulse2 = loadEdge1(buffer);

  if (pulse1 && pulse2) {
    return [pulse1, pulse2];
  }

  return [null, null];
}

function loadEdge1(buffer) {
  const length = buffer.length;

  if (!length) {
    return null;
  }

  let last = null;

  for (let i = 0; i < length; i++) {
    let point = buffer[i];

    // search for when the buffer point crosses the zero threshold
    if (last !== null) {
      // important: when we hit an edge, the data doesn't include the edge itself
      if (edge(point, last)) {
        // collect the pulse into a result
        const res = Array.from(pulseBuffer);
        buffer.splice(0, res.length); // remove from buffer
        pulseBuffer = [];
        return res;
      }
    }

    pulseBuffer.push(point);
    last = point;
  }

  return null; // no edge found
}

export default function read(buffer) {
  // if we have left over data, then prefix the data with that first
  const data = pulseBuffer.concat(Array.from(buffer));

  loadPilot(data);
  loadSync(data);
  const header = loadHeader(data);
  const parity = calculateXORChecksum(header.slice(0, -1));

  if (parity !== header[header.length - 1]) {
    console.error('R Tape Loading Error', parity, header[header.length - 1]);
    return;
  }

  // header is good - load data for length
  // loadBytes(data);

  console.log(header);

  const filename = decode(header.slice(1, 10));
  const length = (header[11] << 8) + header[12];
  console.log('filename: "%s"', filename);
  console.log('length: "%s"', length);

  const bytes = loadBytes(length, data);
  console.log('bytes loaded: %s', bytes.length);
}

// const bufferLoader = new BufferLoader(ctx, ['/manic-minor.mp3'], function main(
//   bufferList
// ) {
//   console.log(bufferList);
//   const buffer = bufferList[0];
//   read(buffer.getChannelData(0));
// });

// bufferLoader.load();

image(document.querySelector('img')).then(binary => {
  const buffer = generateHeader(ctx, 'heart.png', binary);
  read(buffer.getChannelData(0));
});

// -------- bad code example

/*

function loadEdge1(buffer) {
  const length = buffer.length;
  if (!length) {
    return null;
  }

  let last = null;
  do {
    const point = buffer.shift();

    // search for when the buffer point crosses the zero threshold
    if (last !== null) {
      // important: when we hit an edge, the data doesn't include the edge itself
      if (edge(point, last)) {
        // collect the pulse into a result
        const res = Array.from(pulseBuffer);
        // put this cross point back into the buffer, so it's there for the next bit
        buffer.unshift(point);
        pulseBuffer = [];
        return res;
      }
    }

    pulseBuffer.push(point);
    last = point;
  } while (buffer.length);

  console.log('splicing buffer to empty');

  buffer.splice(0); // remove from buffer
  return null; // no edge found
}

//*/
