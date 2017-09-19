import Audio from './audio.js';
import canvas from './canvas.js';

async function main() {
  const audio = (window.audio = new Audio());
  await audio.load(document.querySelector('img'));
  audio.volume = 100;
  audio.start();

  canvas.connect(audio.node);
}

main();
