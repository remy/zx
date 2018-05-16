import ctx from './ctx.js';
import image from './image.js';

import {
  SAMPLE_RATE,
  T,
  HIGH,
  LOW,
  asHz,
  toAngularFrequency,
  PILOT,
  PILOT_COUNT,
  PILOT_DATA_COUNT,
  ZERO,
  ONE,
  SYN_ON,
  SYN_OFF,
  calculateXORChecksum,
} from './audio-consts.js';

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
export function generateFlatSamples({ output, offset, pulse, value = HIGH }) {
  pulse = pulse * T * SAMPLE_RATE;
  // round values to integers
  offset = (offset + 0.5) | 0;
  pulse = (offset + pulse + 0.5) | 0;
  for (; offset < pulse; offset++) {
    const noise = 0; //Math.random() * 0.01 * (value < 0 ? -1 : 1);
    output[offset] = value + noise;
  }

  return pulse;
}

export function generateSamplesForRange({ output, i, pulse, length = pulse }) {
  length = length * T * SAMPLE_RATE;
  const freq = toAngularFrequency(asHz(pulse));
  i = (i + 0.5) | 0; // round the i value
  length = (i + length + 0.5) | 0;
  for (; i < length; i++) {
    const sampleTime = i / SAMPLE_RATE;
    const sampleAngle = sampleTime * freq;
    const noise = 0; //Math.random() * 0.01;
    output[i] = Math.sin(sampleAngle) < 0 ? LOW - noise : HIGH + noise;
  }
}

function generateBit(pulse) {
  const output = new Float32Array((pulse * 2 * T * SAMPLE_RATE + 0.5) | 0);
  generateFlatSamples({
    output,
    offset: 0,
    pulse,
    value: HIGH,
  });

  const offset = pulse * T * SAMPLE_RATE;
  generateFlatSamples({
    output,
    offset,
    pulse,
    value: LOW,
  });

  return output;
}

function generateSilence({ output, offset = 0, count = PILOT_DATA_COUNT }) {
  const pulse = PILOT;

  // small bug in my own logic, this produces 8064 half pulses
  // this is because the immediately next pulse is a syn on, which
  // is also high, so it doesn't offer any edge detection.
  for (let i = 0; i < count; i++) {
    offset = generateFlatSamples({
      output,
      offset,
      pulse,
      value: 0,
    });
  }

  return offset;
}

function generatePilot({ output, offset = 0, count = PILOT_COUNT }) {
  const pulse = PILOT;

  // small bug in my own logic, this produces 8064 half pulses
  // this is because the immediately next pulse is a syn on, which
  // is also high, so it doesn't offer any edge detection.
  for (let i = 0; i < count; i++) {
    offset = generateFlatSamples({
      output,
      offset,
      pulse,
      value: i % 2 === 0 ? LOW : HIGH,
    });
  }

  return offset;
}

export function generateByte({ offset = 0, output, byte }) {
  for (let i = 0; i < 8; i++) {
    // IMPORTANT: this is specifically a left shift AND 128 so that
    // the bits are collected in the correct order to build up a byte.
    // using a left shift reads from left to right through the byte,
    // and using logical AND to 128 (0b10000000) it allows me to test
    // for the most significant bit, and correctly build the byte,
    // bit by bit (as it were).
    const bit = ((byte << i) & 128) === 128 ? ONE : ZERO;
    const buffer = bit === ONE ? oneBit : zeroBit;
    output.set(buffer, offset);
    offset += buffer.length;
  }
  return offset;
}

export function generateBytes({ offset = 0, data, output, blockType = 0x00 }) {
  offset = generateByte({ offset, output, byte: blockType });

  for (let j = 0; j < data.length; j++) {
    const byte = data[j];
    offset = generateByte({ offset, output, byte });
  }

  const parity = calculateXORChecksum([blockType, ...Array.from(data)]);
  offset = generateByte({ offset, output, byte: parity });

  // always append a single pulse so that the edge detection works
  // otherwise the last bit is /""\__ and no final (upward) edge
  offset = generateFlatSamples({
    output,
    offset,
    pulse: ZERO,
    value: HIGH,
  });

  return offset;
}

/**
 * Construct buffer for pilot, syn(on|off), header and data binary
 * @param {AudioContext} ctx
 * @param {String} filename
 * @param {ArrayBuffer} data
 * @returns AudioBuffer
 */
export function generateHeader(ctx, filename = 'ZX Loader', data = [0]) {
  const pilotLength = PILOT_COUNT * PILOT;
  const pilotDataLength = PILOT_DATA_COUNT * PILOT;
  const synLength = SYN_ON + SYN_OFF;

  const length = data.length; // data is in binary, but we want to store byte length

  // source: https://www.uelectronics.info/2015/03/21/zx-spectrum-and-loaders-part-one/
  // and param values taken from Manic Miner hex dump (for a better sample)
  //
  // POS LEN DESC
  // 0	 1	 Type (0=program, 1=number array, 2=character array, 3=code)
  // 1	 10	 Name (right padded with spaces to 10 characters)
  // 11	 2	 Length of data block (word LSb)
  // 13	 2	 Parameter 1. for `code` this is 4000h LSb (0x0040)
  // 15	 2	Parameter 2. Eg. for programs it is the beginning of variables

  // convert the filename to 10 chars and then in to single values
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
    0x03, // 0=header
    ...name, // Name (filename 10 chars padded with white space)
    length & 0x00ff, // LSb
    length >> 8, // MSb
    0x00, // param 1 (address)
    0x40, // "0x4000"
    0x00, // param 2
    0x80, // "unused"
  ]);

  // 19 header bytes (which are 8 bits)
  const headerLen = (header.length + 2) * 8 * (ONE * 2);
  const dataLen = (data.length + 2) * 8 * (ONE * 2);

  const silenceLength = pilotDataLength; // arbitrary value

  const bufferLength =
    (pilotLength +
      synLength +
      headerLen +
      silenceLength +
      pilotDataLength +
      synLength +
      dataLen) *
    T *
    SAMPLE_RATE;

  // the +0.5 is just a little "wiggle" room
  const buffer = ctx.createBuffer(1, (bufferLength + 0.5) | 0, SAMPLE_RATE);
  const output = buffer.getChannelData(0);

  // pilot tone
  let offset = generatePilot({ output });

  // syn on
  offset = generateFlatSamples({
    output,
    offset,
    pulse: SYN_ON,
    value: HIGH,
  });

  // syn off
  offset = generateFlatSamples({
    output,
    offset,
    pulse: SYN_OFF,
    value: LOW,
  });

  // bytes also include the blockType byte and the XOR checksum
  offset = generateBytes({
    offset,
    output,
    data: header,
  });

  offset = generateSilence({
    output,
    offset,
  });

  offset = generatePilot({ output, offset, count: PILOT_DATA_COUNT });

  // syn on
  offset = generateFlatSamples({
    output,
    offset,
    pulse: SYN_ON,
    value: HIGH,
  });

  // syn off
  offset = generateFlatSamples({
    output,
    offset,
    pulse: SYN_OFF,
    value: LOW,
  });

  offset = generateBytes({
    blockType: 0xff,
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
    this.loadFromBuffer(buffer);
  }

  async loadFromData(data, filename = 'image.scr') {
    this.loadFromBuffer(generateHeader(ctx, filename, new Uint8Array(data)));
  }

  async loadFromAudioURL(url) {
    const res = await fetch(url);
    const arrayBuffer = await res.arrayBuffer();
    ctx.decodeAudioData(
      arrayBuffer,
      buffer => {
        this.loadFromBuffer(buffer);
      },
      err => {
        console.error(err);
        throw err;
      }
    );
  }

  async loadFromStream(stream) {
    const audio = ctx.createMediaStreamSource(stream);
    this.src = audio;
    this.src.connect(this.gain);
    this.gain.connect(ctx.destination);
  }

  async loadFromURL(url) {
    const res = await fetch(url);
    const binary = await res.arrayBuffer();
    const buffer = generateHeader(
      ctx,
      url.split('/').pop(),
      new Uint8Array(binary)
    );
    this.loadFromBuffer(buffer);
  }

  loadFromBuffer(buffer) {
    this.src.buffer = buffer;
  }

  outTo(node) {
    this.src.connect(node);
  }

  inFrom(node) {
    node.connect(this.gain);
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
    this.gain.gain.setTargetAtTime(f * f, ctx.currentTime, 0);
  }
}
