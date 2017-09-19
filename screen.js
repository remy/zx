import Audio from './audio.js';
import ROMLoader from './ROMLoader.js';
import canvas from './canvas.js';

async function main() {
  const audio = (window.audio = new Audio());
  await audio.load(document.querySelector('img'));
  audio.volume = 100;
  const rom = (window.rom = new ROMLoader());
  rom.connect(audio);
  canvas.connect(audio.node);

  const pre = document.createElement('pre');
  document.body.appendChild(pre);
  pre.style.position = 'relative';
  pre.style.zIndex = 1;

  rom.handlers.update = () => {
    pre.innerHTML = `edgePtr: ${rom.edgePtr}
pulseBufferPtr: ${rom.pulseBufferPtr}
pulseBuffer: ${rom.pulseBuffer[1]}
zeroCounter: ${rom.zeroCounter}
readCount: ${rom.readCount}
edgeCounter: ${rom.edgeCounter}
timing: ${rom.timing}

SAMPLE_RATE: ${rom.SAMPLE_RATE}
PILOT: ${rom.state.pilot}
SYN_ON: ${rom.state.synOn}
SYN_OFF: ${rom.state.synOff}`;
  };

  audio.start();
}

main();
