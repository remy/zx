import ctx from './ctx.js';
import canvas from './canvas.js';
import { generateSamplesForRange, ONE, ZERO, T } from './audio.js';

// 'Remy Sharp woz here'
const binary = [0,1,0,1,0,0,1,0,0,1,1,0,0,1,0,1,0,1,1,0,1,1,0,1,0,1,1,1,1,0,0,1,0,0,1,0,0,0,0,0,0,1,0,1,0,0,1,1,0,1,1,0,1,0,0,0,0,1,1,0,0,0,0,1,0,1,1,1,0,0,1,0,0,1,1,1,0,0,0,0,0,0,1,0,0,0,0,0,0,1,1,1,0,1,1,1,0,1,1,0,1,1,1,1,0,1,1,1,1,0,1,0,0,0,1,0,0,0,0,0,0,1,1,0,1,0,0,0,0,1,1,0,0,1,0,1,0,1,1,1,0,0,1,0,0,1,1,0,0,1,0,1]; // prettier-ignore

// ONE is imported with a value of 1710
// note: `+ 0.5 | 0` rounds up to the nearest int
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
