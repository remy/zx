import ctx from './ctx.js';
import main from './main.js';
import Audio from './audio.js';

let started = false;

start();

window.onkeydown = e => {
  if (e.which === 27) {
    window.audio.stop();
  }
};

async function start() {
  if (started) return;

  started = true;

  const audio = (window.audio = new Audio());
  await audio.loadFromAudioURL('/audio/Paperboy.WAV');
  audio.volume = 0;

  setTimeout(() => audio.start(), 100);
  main(audio);
}
