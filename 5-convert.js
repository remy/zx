import ctx from './ctx.js';
import canvas from './canvas.js';
import { generateSamplesForRange, ONE, ZERO, T, SAMPLE_RATE } from './audio.js';
import binary from './hex.js';

// const binary = 'Remy Sharp woz here'
//   // turn into array of characters
//   .split('')
//   // map into binary strings (4 x 8 bit binary representations)
//   .map(
//     chr =>
//       chr
//         .charCodeAt(0) // R = 82
//         .toString(2) // 82 = 1010010
//         .padStart(8, '0') // 1010010 = 01010010
//   )
//   // convert to one single binary array
//   .reduce((acc, byte) => {
//     return acc.concat(byte.split('').map(n => parseInt(n, 10)));
//   }, []);

// note: `+ 0.5 | 0` rounds up to the nearest int
// ONE is imported with a value of 1710
const bufferSize = (ctx.sampleRate * (binary.length * ONE * 2 * T) + 0.5) | 0;

const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
const output = buffer.getChannelData(0);

let offset = 0;
for (let i = 0; i < binary.length; i++) {
  const pulse = binary[i] === 0 ? ZERO : ONE;
  generateSamplesForRange({
    output,
    i: offset,
    pulse,
  });
  offset += (pulse * T * ctx.sampleRate + 0.5) | 0;
}

const src = ctx.createBufferSource();
src.buffer = buffer;
src.start();
src.connect(ctx.destination);

// visualise the data
canvas.connect(src);
