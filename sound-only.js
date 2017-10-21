import Audio from './audio.js';
// import ROMLoader from './ROMLoader.js';
import canvas from './canvas.js';

async function main() {
  const audio = (window.audio = new Audio());
  await audio.loadFromURL('./image-manip/midnight.scr');
  audio.volume = 100;
  canvas.connect(audio.node);

  document.documentElement.onkeydown = e => {
    if (e.which === 27) {
      audio.stop();
    }
  };
  setTimeout(() => audio.start(), 0);

  document.documentElement.ontouchstart = () => audio.stop();
}

main();
