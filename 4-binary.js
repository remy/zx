import ctx from './ctx.js';
import canvas from './canvas.js';
import {
  ONE,
  T,
  generateBytes,
} from './audio.js';

import { source } from './hex.js';

// ONE is imported with a value of 1710
// note: `+ 0.5 | 0` rounds up to the nearest int
const bufferSize = (ctx.sampleRate * (source.length * 8 * ONE * 2 * T) + 0.5) | 0;

const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
const output = buffer.getChannelData(0);

generateBytes({ data: source, output });

const src = ctx.createBufferSource();
src.buffer = buffer;
src.start();
src.connect(ctx.destination);

// visualise the data
canvas.connect(src);
