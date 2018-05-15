import Audio from './audio.js';
import ROMLoader from './TAPLoader.js';
import canvas from './canvas.js';
import Bars from './bars.js';
import { stream } from './image-manip/scr.js';

async function main() {
  const bars = new Bars();
  bars.pilot();
  const audio = (window.audio = new Audio());
  // await audio.load(document.querySelector('img'));
  await audio.loadFromURL('./image-manip/Batman-TheCapedCrusader.scr');
  audio.volume = 100;
  const rom = (window.rom = new ROMLoader());
  rom.connect(audio);
  canvas.connect(audio);

  document.documentElement.onkeydown = e => {
    if (e.which === 27) {
      canvas.stop();
      audio.stop();
    }
  };

  const pre = document.createElement('pre');
  document.body.appendChild(pre);
  pre.style.position = 'relative';
  pre.style.zIndex = 1;

  const img = document.createElement('canvas');
  img.width = 256;
  img.height = 192;
  img.className = 'styled';
  document.body.appendChild(img);
  const imgCtx = img.getContext('2d');

  let prevLength = 0;
  let newBytes = new Uint8Array(0); // updated as this type later

  rom.handlers.bytes = bytes => {
    if (bytes.length !== prevLength) {
      newBytes = bytes.slice(prevLength);
      bars.draw(newBytes);
      newBytes.forEach((byte, i) => stream(imgCtx, byte, prevLength + i));
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
    const blob = new Blob([rom.state.data], {
      type: 'application/octet-binary',
    });
    const url = URL.createObjectURL(blob);
    img.src = url;
  };

  let pilot = 170;
  rom.handlers.update = () => {
    if (rom.state.pilot !== true && rom.state.pilot > 1500) {
      pilot ^= 0xff;
      bars.draw(new Uint8Array(Array.from({ length: 4 }, () => pilot)));
    }
    const progress = rom.state.data ? rom.state.data.length : 0;
    const length = rom.state.header ? rom.state.header.length - 1 : 0;
    pre.innerHTML = `edgePtr: ${rom.edgePtr}
pulseBufferPtr: ${rom.pulseBufferPtr}
readCount: ${rom.readCount}
edgeCounter: ${rom.edgeCounter}
timing: ${rom.timing}
last byte: ${rom.byteBuffer[0].toString(2).padStart(8, '0')}
new bytes: ${Array.from(newBytes)
      .map(_ =>
        _.toString(16)
          .toUpperCase()
          .padStart(2, '0')
      )
      .join(' ')}

SAMPLE_RATE: ${rom.SAMPLE_RATE}
PILOT: ${rom.state.pilot}
SYN_ON: ${rom.state.synOn}
SYN_OFF: ${rom.state.synOff}
FILE: ${rom.state.header ? rom.state.header.filename : '???'}
BYTES: ${progress || '?'}/${length || '?'} / ${(progress / length * 100) | 0}%`;
  };

  setTimeout(() => audio.start(), 0);
}

main();
