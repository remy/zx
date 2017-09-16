import ctx from './ctx.js';
import canvas from './canvas.js';
// create a 2 seconds buffer (more on this later)
const bufferSize = 2 * ctx.sampleRate;

// 1 = mono channel (i.e. mono)
// sampleRate defaults to 44.1Mhz
const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
const output = buffer.getChannelData(0);

// populate the buffer with random noise
for (let i = 0; i < bufferSize; i++) {
  // random value from -1 to 1
  output[i] = Math.random() * 2 - 1;
}

const src = ctx.createBufferSource();
src.buffer = buffer;
src.start();
src.connect(ctx.destination);

// visualise the data
canvas.connect(src);
