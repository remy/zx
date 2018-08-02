import ctx from './ctx.js';
import canvas from './canvas.js';
import { ONE, T } from './audio-consts.js';
import { generateBytes } from './audio.js';

// import { source } from './hex.js';
window.ctx = ctx;
window.onkeydown = e => {
  if (e.which === 27) {
    window.stream.stop();
  }
};

async function main() {
  const res = await fetch('./screens/tap-js.scr'); // jsconf home page HTML
  const source = new Uint8Array(await res.arrayBuffer()); //(await res.text()).split('').map(c => c.charCodeAt(0));
  const length = source.length || source.byteLength;
  // ONE is imported with a value of 1710
  // note: `+ 0.5 | 0` rounds up to the nearest int
  const bufferSize = (ctx.sampleRate * (length * 8 * ONE * 2 * T) + 0.5) | 0;

  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = buffer.getChannelData(0);

  generateBytes({ data: source, output });

  const src = (window.stream = ctx.createBufferSource());
  src.buffer = buffer;
  src.start();
  src.connect(ctx.destination);

  // visualise the data
  canvas.connect({ node: src });
}
main();
