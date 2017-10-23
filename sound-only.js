import Audio from './audio.js';
// import ROMLoader from './ROMLoader.js';
import canvas from './canvas.js';

async function main() {
  const audio = (window.audio = new Audio());
  await audio.loadFromURL('./image-manip/me-int.scr');
  audio.volume = 100;
  canvas.connect(audio.node);

  document.documentElement.onkeydown = e => {
    if (e.which === 27) {
      audio.stop();
    }
  };
  setTimeout(() => audio.start(), 0);

  let running = true;
  document.documentElement.onclick = async () => {
    if (running) {
      audio.stop();
      canvas.stop();
      running = false;
    } else {
      window.location.reload();
    }
  };
}

main();
