import ROMLoader from './ROMLoader.js';
import ctx from './ctx.js';
import image from './image.js';
import { generateHeader } from './audio.js';

const img = document.createElement('img');
document.body.appendChild(img);

image(document.querySelector('#heart')).then(binary => {
  console.time('generateHeader');
  const audio = generateHeader(ctx, 'heart.png', binary);
  console.timeEnd('generateHeader');
  const buffer = (window.buffer = audio.getChannelData(0));
  console.log('channel data: %s', buffer.length);
  console.time('read');
  const rom = new ROMLoader();

  rom.on('bytes', bytes => {
    const blob = new Blob([bytes], { type: 'application/octet-binary' }); // pass a useful mime type here
    const url = URL.createObjectURL(blob);
    img.src = url;
  });

  rom.on('end', () => {
    console.log('end');
    console.timeEnd('read');
  });
  rom.fromBuffer(buffer);
});
