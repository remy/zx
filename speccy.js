import { dither } from './retrofy.js';
import BufferLoader from './BufferLoader.js';
import audioContext from './ctx.js';
import Audio from './audio.js';
import ROMLoader from './ROMLoader.js';
import Bars, { PRE_PILOT } from './bars.js';
import { stream } from './image-manip/scr.js';

var click = null;

const bufferLoader = new BufferLoader(audioContext, ['chr.m4a'], bufferList => {
  click = async () => {
    const sound = audioContext.createBufferSource();
    sound.buffer = bufferList[0];

    sound.connect(audioContext.destination);
    sound.start(0);
  };
});
bufferLoader.load();

function setupDOM() {
  const styles = document.createElement('link');
  styles.href = 'speccy.css';
  styles.rel = 'stylesheet';
  document.head.appendChild(styles);

  const outer = document.createElement('div');
  document.body.appendChild(outer);
  outer.id = 'speccy';
  outer.ondblclick = () => document.documentElement.requestFullscreen();

  const div = document.createElement('div');
  outer.appendChild(div);

  const screen = document.createElement('canvas');
  screen.width = 256;
  screen.height = 192;
  screen.className = 'styled';
  div.appendChild(screen);

  return { div, screen };
}

const commands = new Map();
commands.set(74, 'LOAD ');

function handleKeys(ctx) {
  return new Promise(resolve => {
    let state = null;

    ctx.font = '7px ZX-Spectrum';
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = 'black';
    ctx.fillText('© 1982 Sinclair Research Ltd', 0, ctx.canvas.height - 1);

    let timer = null;
    let flip = false;

    const updateScreen = () => {
      ctx.fillStyle = PRE_PILOT;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

      ctx.fillStyle = 'black';
      const str = state.commands.join('');
      ctx.fillText(str, 0, ctx.canvas.height - 1);

      const size = ctx.measureText(str);
      if (flip) {
        const blinker = ctx.measureText(state.next);
        ctx.fillRect(
          size.width,
          ctx.canvas.height - blinker.width,
          blinker.width,
          blinker.width
        );
        ctx.fillStyle = PRE_PILOT;
      }

      flip = !flip;

      ctx.fillText(state.next, size.width, ctx.canvas.height - 1);
    };

    const stop = (window.stop = () => clearInterval(timer));

    document.documentElement.onkeydown = e => {
      // play sound
      if (state === null) {
        state = { next: 'K', commands: [] };
        window.state = state;
        timer = setInterval(updateScreen, 500);
        return;
      }
      const key = e.keyCode;

      const command = commands.get(key);

      if (state.next === 'K' && command) {
        click();
        state.commands.push(command);
        state.next = 'L';
      } else if (state.next === 'L') {
        if (e.key.length === 1) {
          state.commands.push(e.key);
          click();
        } else if (e.key === 'Delete') {
          click();
          state.commands.pop();
          if (state.commands.length === 0) {
            state.next = 'K';
          }
        } else if (e.key === 'Enter') {
          click();
          ctx.fillStyle = PRE_PILOT;
          ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

          stop();
          document.documentElement.onkeydown = () => {};
          resolve(state.commands.join('').replace(/^LOAD ['"](.*?)['"]/, '$1'));
        }
      }
      // }
    };
  });
}

async function main() {
  // 1. read twitter handle from loading prompt

  const { div, screen } = setupDOM();
  const bars = new Bars();
  div.appendChild(bars.canvas);
  // bars.pilot();

  const rom = (window.rom = new ROMLoader());

  const screenCtx = screen.getContext('2d');

  const username = await handleKeys(screenCtx);

  // 2. then dither

  let pixels = [];
  try {
    pixels = await dither(`https://twivatar.glitch.me/${username}`);
  } catch (e) {
    const ctx = screenCtx;
    ctx.fillStyle = PRE_PILOT;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    ctx.fillStyle = 'black';
    ctx.fillText('R Tape loading error, 0:1', 0, ctx.canvas.height - 1);

    return;
  }

  // 3. play as audio
  bars.pilot();
  const audio = (window.audio = new Audio());
  await audio.loadFromData(pixels);
  rom.connect(audio);
  audio.volume = 100;

  let prevLength = 0;
  let newBytes = new Uint8Array(0); // updated as this type later

  rom.handlers.bytes = bytes => {
    if (bytes.length !== prevLength) {
      newBytes = bytes.slice(prevLength);
      bars.draw(newBytes);
      newBytes.forEach((byte, i) => stream(screenCtx, byte, prevLength + i));
      prevLength = bytes.length;
    }
  };

  rom.handlers.pilot = () => {
    bars.pilotDone();
  };

  rom.handlers.end = () => {
    console.log('finished');
    // canvas.stop();
    audio.stop();
    bars.reset();
  };

  let pilot = 170;
  rom.handlers.update = () => {
    if (rom.state.pilot !== true && rom.state.pilot > 1500) {
      pilot ^= 0xff;
      bars.draw(new Uint8Array(Array.from({ length: 4 }, () => pilot)));
    }
  };

  setTimeout(() => audio.start(), 0);
}

main();
