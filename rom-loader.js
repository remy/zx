import ctx from './ctx.js';
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
const oneLength = round(1 / asHz(ONE * 2), 3);
const zeroLength = round(1 / asHz(ZERO * 2), 3);

let pulseBuffer = null;
let edgePtr = 0;

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
  // length = 2;
  console.log(
    'loading %s bytes from %s samples (offset @ %s)',
    length,
    buffer.length - edgePtr,
    edgePtr
  );

  const bytes = new Uint8Array(length);

  let byte = '';

  for (let i = 0; i < length * 8; i++) {
    const [high, low] = loadEdge2(buffer, false);

    if (!high || !low) {
      console.log('bad byte - missing pair of pulses @ %s', i, high, low);
      return;
    }

    // we're collecting the bits for an array of 8 bit bytes,
    // first left shifting by 1 bit, then adding the new bit
    // until we have a full byte
    const waveLength = round(1 / SAMPLE_RATE * (high.length + low.length), 3);
    const p = (i / 8) | 0;
    bytes[p] <<= 1; // left shift
    bytes[p] += waveLength === oneLength ? 0b1 : 0b0;

    if (i % 8 === 0) {
      byte = '';
    }
    byte += waveLength === oneLength ? '1' : '0';
    // console.log(
    //   'bit: %s',
    //   waveLength === zeroLength ? 0b0 : 0b1,
    //   i % 8,
    //   p,
    //   byte,
    //   bytes[p].toString(2).padStart(8, '0'),
    //   bytes[p]
    // );
  }

  console.log(bytes);

  return bytes;
}

function loadPilot(buffer) {
  const pulses = 8064;
  for (let i = 1; i <= pulses; i++) {
    const pulse = loadEdge1(buffer);

    if (!pulse) {
      console.log('exit pilot - missing edge');
      return;
    }

    const length = 1 / SAMPLE_RATE * pulse.length;

    if (round(length) !== pilotLength) {
      // edgePtr -= pulse.length;
      console.log('pilot found %s good pulses', i - 1);
      console.log('bad pulse %s !== %s', round(length), pilotLength);
      // pulse.forEach((_, i) => console.log('%s: %s', i, _));
      return;
    }
  }

  console.log('pilot OK');
}

function loadSync(buffer) {
  const on = expectPulse(buffer, 667);
  const off = expectPulse(buffer, 735);

  if (!(on && off)) {
    console.error('failed to find sync SYN_ON: %s, SYN_OFF: %s', on, off);
    return false;
  }

  console.log('got sync');
  return true;
}

function loadHeader(buffer) {
  const bytes = loadBytes(18, buffer);

  if (!bytes) {
    console.error('bad header - undefined');
    return null;
  }

  const parity = calculateXORChecksum(bytes.slice(0, -1));

  if (parity !== bytes[bytes.length - 1]) {
    console.error('R Tape Loading Error', parity, bytes[bytes.length - 1]);
    return null;
  }

  const filename = decode(bytes.slice(1, 10)); // filename is in position 1…11
  const length = (bytes[11] << 8) + bytes[12]; // length is held in 2 bytes

  return { filename, length };
}

function expectPulse(buffer, tStates, log = false) {
  const pulse = loadEdge1(buffer, log);
  const expect = round(1 / asHz(tStates));
  const length = round(1 / SAMPLE_RATE * pulse.length);
  if (length !== expect) {
    console.error('!expectPulse length: %s, expected: %s', length, expect);
  }
  return length === expect;
}

function loadEdge2(buffer, log = false) {
  return [loadEdge1(buffer, log), loadEdge1(buffer, log)];
}

function loadEdge1(buffer, log = false) {
  // log = false;
  const length = buffer.length;

  if (!length) {
    return null;
  }

  let last = null;
  let i = 0;

  for (; edgePtr < length; edgePtr++) {
    let point = buffer[edgePtr];

    // search for when the buffer point crosses the zero threshold
    if (last !== null) {
      if (log) {
        console.log(
          '%s: %s (last %s), edge? %s',
          i,
          point,
          last,
          edge(point, last)
        );
      }
      if (edge(point, last)) {
        // important: when we hit an edge, the data doesn't include the edge
        // itself as determined by the use of `i` rather than edgePtr
        const res = pulseBuffer.subarray(1, i - 1); //.filter(Boolean);
        if (log) res.forEach((_, i) => console.log('%s: %s', i, _));
        return res;
      }
      pulseBuffer[i] = point;
    }

    last = point;
    i++;
  }

  console.error('found no edge');
  return null; // no edge found
}

export default function read(data) {
  loadPilot(data);
  if (!loadSync(data)) {
    return;
  }

  const header = loadHeader(data);

  if (!header) {
    return;
  }

  console.log('filename: %s|', header.filename);
  console.log('bytes: %s|', header.length);

  const bytes = loadBytes(header.length, data);

  const blob = new Blob([bytes], { type: 'application/octet-binary' }); // pass a useful mime type here
  const url = URL.createObjectURL(blob);

  const img = new Image();
  img.src = url;
  document.body.appendChild(img);
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
  console.time('generateHeader');
  const audio = generateHeader(ctx, 'heart.png', binary);
  console.timeEnd('generateHeader');
  const buffer = audio.getChannelData(0);
  edgePtr = 0;
  pulseBuffer = new Float32Array(buffer.length);
  console.log('channel data: %s', buffer.length);
  console.time('read');
  read(buffer);
  console.timeEnd('read');

  // const rom = new ROMLoader(audio);
  // const header = rom.loadBytes(18);
  // console.log(header);
  // console.log(decode(header.slice(1, 11)));
});

// -------- bad code example

/*

function _loadEdge1(buffer) {
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
