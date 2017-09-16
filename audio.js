import ctx from './ctx.js';
export const SAMPLE_RATE = ctx.sampleRate;
export const T = 1 / 3500000; // pulse width (half a wave cycle) in ms @ 3.5Mhz

/**
 * notes
 * 440Hz = 1 tick every 2.2727ms
 * 855 * 2 * T = 1710 * T = ZERO sound = 0.489ms
 * 1.19047619ms ~ the 840Hz which should be equal to 2168 T (.619428571ms)
 * Pilot is 2168 T for a length of 8063, therefore: (8063 * 2168) * (1/3500000) = ~5 (5 seconds)
 */

export const asHz = pulse => 1 / (T * pulse);
const toAngularFrequency = hz => hz * 2 * Math.PI;

const HIGH = 0.15;
const LOW = -0.15;

export const PILOT = 2168;
export const ZERO = 855;
export const ONE = 2 * ZERO;
export const SYN_ON = 667;
export const SYN_OFF = 735;

const zeroBit = generateBit(ZERO);
const oneBit = generateBit(ONE);

const _volume = Symbol('volume');
const _frequency = Symbol('frequency');

// IMPORTANT: mutates buffer
export function generateFlatSamples({
  output,
  i,
  pulse,
  length = pulse,
  value = HIGH,
}) {
  length = length * T * SAMPLE_RATE;
  i = (i + 0.5) | 0; // round the i value
  length = (i + length + 0.5) | 0;
  for (; i < length; i++) {
    const noise = 0; // Math.random() * 0.01 * (value < 0 ? -1 : 0);
    output[i] = value + noise;
  }

  return length;
}

export function generateSamplesForRange({ output, i, pulse, length = pulse }) {
  length = length * T * SAMPLE_RATE;
  const freq = toAngularFrequency(asHz(pulse));
  i = (i + 0.5) | 0; // round the i value
  length = (i + length + 0.5) | 0;
  for (; i < length; i++) {
    const sampleTime = i / SAMPLE_RATE;
    const sampleAngle = sampleTime * freq;
    const noise = Math.random() * 0.01;
    output[i] = Math.sin(sampleAngle) < 0 ? LOW - noise : HIGH + noise;
  }
}

function generateBit(pulse) {
  const output = new Float32Array((pulse * 2 * T * SAMPLE_RATE + 0.5) | 0);
  generateFlatSamples({
    output,
    i: 0,
    pulse,
    value: HIGH,
  });

  const offset = pulse * T * SAMPLE_RATE;
  generateFlatSamples({
    output,
    i: offset,
    pulse,
    value: LOW,
  });

  return output;
}

function generatePilot(output, count = 8063) {
  const pulse = PILOT;
  let offset = 0;
  const add = pulse * T * SAMPLE_RATE;
  // const output = new Float32Array(
  //   (pulse * 2 * count * T * SAMPLE_RATE + 0.5) | 0
  // );

  console.log('pilot values: %s', (count / 2 + 1) | 0);

  for (let i = 0; i < ((count / 2 + 1) | 0); i++) {
    generateFlatSamples({
      output,
      i: offset,
      pulse,
      value: 0.16,
    });

    offset += add;
    generateFlatSamples({
      output,
      i: offset,
      pulse,
      value: -0.16,
    });

    offset += add;
  }

  return offset;
}

function generateBytes({ offset = 0, data, output }) {
  for (let j = 0; j < data.length; j++) {
    const pulse = data[j];
    // console.log(pulse);
    for (let i = 0; i < 8; i++) {
      // IMPORTANT: this is specifically a left shift AND 128 so that
      // the bits are collected in the correct order to build up a byte.
      // using a left shift reads from left to right through the byte,
      // and using logical AND to 128 (0b10000000) it allows me to test
      // for the most significant bit, and correctly build the byte,
      // bit by bit (as it were).
      const bit = ((pulse << i) & 128) === 128 ? ONE : ZERO;
      const buffer = bit === ONE ? oneBit : zeroBit;
      output.set(buffer, offset);
      offset += buffer.length;
    }
  }
  return offset;
}

/**
 * Returns XOR checksum for array
 * @param {Uint8Array} array
 */
export const calculateXORChecksum = array =>
  array.reduce((checksum, item) => checksum ^ item, 0);

// const toBinary = s =>
//   parseInt(s, 16)
//     .toString(2)
//     .padStart(8, '0');

// const charToBinary = s =>
//   s
//     .charCodeAt(0)
//     .toString(2)
//     .padStart(8, '0');

/**
 * Construct buffer for pilot, syn(on|off), header and data binary
 * @param {AudioContext} ctx
 * @param {String} filename
 * @param {ArrayBuffer} data
 * @returns AudioBuffer
 */
export function generateHeader(ctx, filename = 'ZX Loader', data = [0]) {
  const pilotLength = 8063 * PILOT;
  const synLength = SYN_ON + SYN_OFF;

  const length = data.length; // data is in binary, but we want to store byte length

  // console.log('source length: %s', length);
  // source: https://www.uelectronics.info/2015/03/21/zx-spectrum-and-loaders-part-one/
  // and param values taken from Manic Miner hex dump (for a better sample)
  //
  // POS LEN DESC
  // 0	 1	 Type (0=program, 1=number array, 2=character array, 3=code)
  // 1	 10	 Name (right padded with spaces to 10 characters)
  // 11	 2	 Length of data block
  // 13	 2	 Parameter 1. Eg. for programs it is a parameter LINE, for ‘code’ it is the address of beginning of the code block
  // 15	2	Parameter 2. Eg. for programs it is the beginning of variables

  // convert the filename to 10 chars and then in to single values
  // FIXME this is far from perfect, and possibly should use TextEncoder.encode(<String>)
  const name = filename
    .substr(0, 10)
    .padEnd(10, ' ')
    .split('')
    .map(c => {
      return parseInt(c.charCodeAt(0).toString(16), 16);
    });

  if (length > 0xffff) {
    console.error('Data too long: %s > %s', length, 0xffff);
    return;
  }

  let header = new Uint8Array([
    0xbf, // 0=program
    ...name, // Name (filename)
    length >> 8,
    length & 0x00ff,
    0x0a, // param 1
    0x00, // ""
    0x45, // param 2
    0x00, // ""
    0x00, // this will be changed
  ]);

  // 19 header bytes (which are 8 bits)
  header[header.length - 1] = calculateXORChecksum(header.slice(0, -1));
  const headerLen = header.length * 8 * (ONE * 2);
  const dataLen = data.length * 8 * (ONE * 2);

  const bufferLength =
    (synLength + pilotLength + headerLen + dataLen) * T * SAMPLE_RATE;

  const buffer = ctx.createBuffer(1, (bufferLength + 0.5) | 0, SAMPLE_RATE);
  const output = buffer.getChannelData(0);

  // pilot tone
  // generateSamplesForRange({
  //   output,
  //   i: 0,
  //   length: 8063 * PILOT,
  //   pulse: PILOT * 2,
  // });
  let offset = generatePilot(output);

  // syn on
  offset = generateFlatSamples({
    output,
    i: offset,
    pulse: SYN_ON,
    value: HIGH,
  });

  // syn off
  offset = generateFlatSamples({
    output,
    i: offset,
    pulse: SYN_OFF,
    value: LOW,
  });

  // offset += (1000 * T * SAMPLE_RATE + 1.5) | 0;

  console.log(header);

  offset = generateBytes({
    offset,
    output,
    data: header,
  });

  offset = generateBytes({
    offset,
    output,
    data,
  });

  return buffer;
}

export default class Audio {
  constructor({ volume = 30, frequency = 807 } = {}) {
    // const src = (this.src = ctx.createScriptProcessor(
    //   256 * Math.pow(2, FACTOR),
    //   1,
    //   1
    // ));

    const header = generateHeader(ctx);
    const src = (this.src = ctx.createBufferSource());
    src.buffer = header;

    const oscillator = (this.oscillator = ctx.createOscillator());
    oscillator.type = 'square';
    const gain = (this.gain = ctx.createGain());

    this.volume = volume;
    this.frequency = frequency;

    src.connect(gain);
    src.start();
  }

  start() {
    this.gain.connect(ctx.destination);
  }

  stop() {
    this.gain.disconnect();
  }

  get node() {
    return this.src;
  }

  play(data = '0000 0000 0000 1111'.repeat(8)) {
    data = data
      .replace(/\s/g, '')
      .split('')
      .map(_ => (_ === '1' ? 1 : 0));

    // const LEN = data.length * ONE;
  }

  get frequency() {
    return this[_frequency];
  }

  set frequency(v) {
    this[_frequency] = v;
    this.oscillator.frequency.value = v;
  }

  get volume() {
    return this[_volume];
  }

  set volume(volume) {
    this[_volume] = volume;
    const f = volume / 100;
    this.gain.gain.value = f * f;
  }
}

// export const generateSample = ({
//   degree,
//   method = 'sin',
//   debug = false,
//   freq = 440,
// }) => {
//   const sampleTime = degree / SAMPLE_RATE;
//   const sampleAngle = sampleTime * Math.PI * freq;
//   if (debug) {
//     console.log(sampleAngle);
//   }
//   return Math[method](sampleAngle);
// };
