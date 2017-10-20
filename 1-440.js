import ctx from './ctx.js'; // new AudioContext()
import canvas from './canvas.js';

const src = ctx.createOscillator();
src.frequency.setTargetAtTime(440, ctx.currentTime, 0); // A

src.connect(ctx.destination);
src.start();
canvas.connect(src);
