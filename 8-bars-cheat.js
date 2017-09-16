import ctx from './ctx.js';
import bars from './bars.js';
import Analyser from './analyser.js';
import spectrum from './canvas.js';
import {
  generateSamplesForRange,
  calculateXORChecksum,
  ONE,
  ZERO,
  PILOT,
  SYN_OFF,
  SYN_ON,
  T,
  SAMPLE_RATE,
} from './audio.js';
import binary from './hex.js';

const LEN = (T * (8063 / 5) * PILOT).toFixed(2) * 1;
const pulses = LEN + (SYN_ON + SYN_OFF) * T;
// now header bytes - 17 + 2 bytes for start and checksum
let header = `${0x00}${0x00}Connect 4 ${0x4500}${0x0a00}${0x4500}`.split('');
header.push(calculateXORChecksum(header));
const headerLen = header.length * 8 * ONE * T;

// 19 header bytes (which are 8 bits) assumed as 0b1
const pilotLength =
  (pulses + headerLen + binary.length * ONE * 2) * SAMPLE_RATE;

const buffer = ctx.createBuffer(1, (pilotLength + 0.5) | 0, SAMPLE_RATE);
const output = buffer.getChannelData(0);
let offset = 0;

// // pilot tone
generateSamplesForRange({
  output,
  i: 0,
  length: 8063 / 5 * PILOT,
  pulse: PILOT,
});

// syn on
offset = 8063 / 5 * PILOT * T * SAMPLE_RATE;
generateSamplesForRange({
  output,
  i: offset,
  pulse: SYN_ON,
});

// syn off
offset += SYN_ON * T * SAMPLE_RATE;
generateSamplesForRange({
  output,
  i: offset,
  pulse: SYN_OFF,
});

offset += SYN_OFF * T * SAMPLE_RATE;

for (let i = 0; i < binary.length; i++) {
  const pulse = binary[i] === 0 ? ZERO : ONE;
  generateSamplesForRange({
    output,
    i: offset,
    pulse,
  });
  offset += (pulse * T * SAMPLE_RATE + 0.5) | 0;
}

const src = ctx.createBufferSource();
src.buffer = buffer;
src.start();
src.connect(ctx.destination);
spectrum.connect(src);

const analyser = new Analyser();
analyser.connect({ node: src });
bars(analyser);
