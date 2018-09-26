import Audio from './audio.js';
import { encode } from './audio-consts.js';
import { stream } from './image-manip/scr.js';
import TAPLoader from './TAPLoader.js';
import Bars from './bars.js';

async function main() {
  const audio = (window.audio = new Audio());
  const tap = (window.tap = new TAPLoader());

  await audio.loadFromURL('./screens/tap-js.scr');
  audio.volume = 100;
  tap.connect(audio);

  const div = document.createElement('div');
  document.body.appendChild(div);
  const bars = new Bars();
  div.appendChild(bars.canvas);
  bars.canvas.classList.add('flex');
  bars.pilot();

  let newBytes = new Uint8Array(0); // updated as this type later
  let prevLength = 0;

  tap.handlers.bytes = bytes => {
    if (bytes.length !== prevLength) {
      newBytes = bytes.slice(prevLength);
      bars.draw(newBytes);

      bars.ctx.save();
      bars.ctx.fillStyle = 'black';
      bars.ctx.font = '7px Cabal';

      let data = '';
      let ctr = 0;
      let line = 0;
      for (let i = bytes.length - 1; i >= 0; i--) {
        for (let j = 7; j >= 0; j--) {
          data += (bytes[i] >> j) & 1 ? '1' : '0';
        }
        ctr++;
        if (ctr % 4 === 0) {
          bars.ctx.fillText(data, bars.padLeft, bars.padTop + 7 + 8 * line);
          data = '';
          line++;

          if (line === 24) {
            break;
          }
        }
      }

      bars.ctx.restore();

      prevLength = bytes.length;
    }
  };

  // TEST CODE - allows for previewing the data
  // let bytes = new Uint8Array(
  //   await (await fetch('./bars-only.js')).arrayBuffer()
  // );
  // let ptr = 2;
  // let timer = setInterval(() => {
  //   bars.clear();
  //   tap.handlers.bytes(bytes.subarray(0, ptr));
  //   ptr += 4;
  // }, 50);

  tap.handlers.pilot = () => {
    bars.pilotDone();
  };

  tap.handlers.reset = () => {
    bars.reset();
    bars.pilot();
  };

  tap.handlers.end = () => {
    console.log('finished');
    audio.stop();
    bars.reset();
  };

  let pilot = 170;
  tap.handlers.update = () => {
    if (tap.state.pilot !== true && tap.state.pilot > 1500) {
      pilot ^= 0xff;
      bars.draw(new Uint8Array(Array.from({ length: 4 }, () => pilot)));
    }
  };

  document.documentElement.onkeydown = e => {
    if (e.which === 27) {
      // clearInterval(timer);
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
