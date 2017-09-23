import Audio from './audio.js';
import ROMLoader from './ROMLoader.js';
import canvas from './canvas.js';

async function main() {
  const audio = (window.audio = new Audio());
  await audio.load(document.querySelector('img'));
  audio.volume = 20;
  const rom = (window.rom = new ROMLoader());
  rom.connect(audio);
  canvas.connect(audio.node);

  const pre = document.createElement('pre');
  document.body.appendChild(pre);
  pre.style.position = 'relative';
  pre.style.zIndex = 1;

  const img = new Image();
  document.body.appendChild(img);

  rom.handlers.bytes = bytes => {
    const blob = new Blob([bytes], { type: 'application/octet-binary' }); // pass a useful mime type here
    const url = URL.createObjectURL(blob);
    img.src = url;
  };

  rom.handlers.end = () => {
    console.log('stopping');
    canvas.stop();
  };

  rom.handlers.update = () => {
    pre.innerHTML = `edgePtr: ${rom.edgePtr}
pulseBufferPtr: ${rom.pulseBufferPtr}
readCount: ${rom.readCount}
edgeCounter: ${rom.edgeCounter}
timing: ${rom.timing}

SAMPLE_RATE: ${rom.SAMPLE_RATE}
PILOT: ${rom.state.pilot}
SYN_ON: ${rom.state.synOn}
SYN_OFF: ${rom.state.synOff}`;
  };

  setTimeout(() => audio.start(), 0);
}

main();
