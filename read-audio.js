import ctx from './ctx.js';
import main from './main.js';
import Audio from './audio.js';

window.onkeydown = e => {
  if (e.which === 27) {
    window.audio.stop();
  }
};

async function start() {
  const audio = (window.audio = new Audio());
  await audio.loadFromAudioURL('/audio/joeblade.wav');
  audio.volume = 20;

  setTimeout(() => audio.start(), 100);
  main(audio);
}

start();
