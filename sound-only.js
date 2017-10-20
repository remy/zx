import Audio from './audio.js';
import ROMLoader from './ROMLoader.js';
import canvas from './canvas.js';

async function main() {
  const audio = (window.audio = new Audio());
  await audio.load(document.querySelector('img'));
  audio.volume = 100;
  const rom = (window.rom = new ROMLoader());
  rom.connect(audio);
  canvas.connect(audio.node);

  const img = new Image();
  document.body.appendChild(img);

  document.documentElement.onkeydown = e => {
    if (e.which === 27) {
      // canvas.stop();
      audio.stop();
    }
  };

  rom.handlers.end = () => {
    console.log('finished');
    // canvas.stop();
    audio.stop();
    const blob = new Blob([rom.state.data], {
      type: 'application/octet-binary',
    });
    const url = URL.createObjectURL(blob);
    img.src = url;
  };

  setTimeout(() => audio.start(), 0);
}

main();
