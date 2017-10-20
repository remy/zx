import ctx from './ctx.js';
import canvas from './canvas.js';

const src = ctx.createOscillator();
src.frequency.setTargetAtTime(830, ctx.currentTime, 0); // pilot tone
src.type = 'square';

src.connect(ctx.destination);
src.start();
canvas.connect(src);
