import ctx from './ctx.js';
import image from './image.js';
export const SAMPLE_RATE = ctx.sampleRate;
export const T = 1 / 3500000; // pulse width (half a wave cycle) in ms @ 3.5Mhz

/**
 * notes
 * 440Hz = 1 tick every 2.2727ms
 * 855 * 2 * T = 1710 * T = ZERO bit sound = 0.489ms
 * 1.19047619ms ~ the 840Hz which should be equal to 2168 T (.619428571ms)
 * Pilot is 2168 T for a length of 8063, therefore: (8063 * 2168) * (1/3500000) = ~5 (5 seconds)
 */

export const asHz = pulse => 1 / (T * pulse);
// const toAngularFrequency = hz => hz * 2 * Math.PI;

// these are how high and low the pulse value goes in the audio buffer
// 1 and -1 being the extreme max
const HIGH = 0.15;
const LOW = -0.15;

// pulse lengths defined by ZX ROM documentation
export const PILOT = 2168;
export const PILOT_COUNT = 8063;
export const ZERO = 855;
export const ONE = 2 * ZERO;
export const SYN_ON = 667;
export const SYN_OFF = 735;

const zeroBit = generateBit(ZERO);
const oneBit = generateBit(ONE);

const _volume = Symbol('volume');

/**
 * Generates AudioContext buffer compatible values into options.output
 * @param {Object} options - options to generate samples
 * @param {Float32Array} options.output - array buffer to mutate
 * @param {Number} options.i - offset to insert samples into output
 * @param {Number} options.pulse - pulse length in t-states
 * @param {Number=HIGH} options.value - value to use for sample
 * @returns {Number} Updated offset
 */
export function generateFlatSamples({ output, i, pulse, value = HIGH }) {
  pulse = pulse * T * SAMPLE_RATE;
  // round values to integers
  i = (i + 0.5) | 0;
  pulse = (i + pulse + 0.5) | 0;
  for (; i < pulse; i++) {
    const noise = Math.random() * 0.01 * (value < 0 ? -1 : 1);
    output[i] = value + noise;
  }

  return pulse;
}

// function generateSamplesForRange({ output, i, pulse, length = pulse }) {
//   length = length * T * SAMPLE_RATE;
//   const freq = toAngularFrequency(asHz(pulse));
//   i = (i + 0.5) | 0; // round the i value
//   length = (i + length + 0.5) | 0;
//   for (; i < length; i++) {
//     const sampleTime = i / SAMPLE_RATE;
//     const sampleAngle = sampleTime * freq;
//     const noise = Math.random() * 0.01;
//     output[i] = Math.sin(sampleAngle) < 0 ? LOW - noise : HIGH + noise;
//   }
// }

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

function generatePilot(output, count = PILOT_COUNT) {
  const pulse = PILOT;
  let offset = 0;

  // small bug in my own logic, this produces 8064 half pulses
  // this is because the immediately next pulse is a syn on, which
  // is also high, so it doesn't offer any edge detection.
  for (let i = 0; i < count; i++) {
    offset = generateFlatSamples({
      output,
      i: offset,
      pulse,
      value: i % 2 === 0 ? LOW : HIGH,
    });
  }

  return offset;
}

function generateBytes({ offset = 0, data, output }) {
  for (let j = 0; j < data.length; j++) {
    const pulse = data[j];
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

/**
 * Construct buffer for pilot, syn(on|off), header and data binary
 * @param {AudioContext} ctx
 * @param {String} filename
 * @param {ArrayBuffer} data
 * @returns AudioBuffer
 */
export function generateHeader(ctx, filename = 'ZX Loader', data = [0]) {
  const pilotLength = PILOT_COUNT * PILOT;
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
  constructor({ volume = 30 } = {}) {
    const src = (this.src = ctx.createBufferSource());
    const gain = (this.gain = ctx.createGain());

    this.volume = volume;

    src.connect(gain);
  }

  async load(element) {
    const filename = element.src.split('/').pop();
    const binary = await image(element);
    const buffer = generateHeader(ctx, filename, binary);
    this.src.buffer = buffer;
  }

  start() {
    this.gain.connect(ctx.destination);
    this.src.start();
  }

  stop() {
    this.gain.disconnect();
  }

  get node() {
    return this.src;
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
