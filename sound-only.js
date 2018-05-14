import Audio from './audio.js';
import { stream } from './image-manip/scr.js';
import TAPLoader from './TAPLoader.js';

async function main() {
  const audio = (window.audio = new Audio());
  const tap = (window.tap = new TAPLoader());

  await audio.loadFromURL('./screens/tap-js.scr');
  audio.volume = 10;
  tap.connect(audio);

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 192;
  canvas.style.setProperty('--scale', 2);

  const ctx = canvas.getContext('2d');
  canvas.classList.add('styled');
  document.body.appendChild(canvas);

  let newBytes = new Uint8Array(0); // updated as this type later
  let prevLength = 0;
  tap.handlers.bytes = bytes => {
    if (bytes.length !== prevLength) {
      newBytes = bytes.slice(prevLength);
      newBytes.forEach((byte, i) => stream(ctx, byte, prevLength + i));
      prevLength = bytes.length;
    }
  };

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
      tap.stop();
      running = false;
    } else {
      window.location.reload();
    }
  };
}

main();
