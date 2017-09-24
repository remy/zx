import Audio from './audio.js';
import ROMLoader from './ROMLoader.js';
import canvas from './canvas.js';

async function main() {
  const audio = (window.audio = new Audio());
  await audio.load(document.querySelector('img'));
  audio.volume = 1;
  const rom = (window.rom = new ROMLoader());
  rom.connect(audio);
  canvas.connect(audio.node);

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

  const img = new Image();
  document.body.appendChild(img);

  // rom.handlers.bit = bit => {
  //   img.className = `bit${bit}`;
  // };

  let prevLength = 0;
  rom.handlers.bytes = bytes => {
    if (bytes.length !== prevLength) {
      prevLength = bytes.length;
      const blob = new Blob([bytes], { type: 'application/octet-binary' }); // pass a useful mime type here
      const url = URL.createObjectURL(blob);
      img.src = url;
    }
  };

  rom.handlers.end = () => {
    console.log('finished');
    canvas.stop();
    const blob = new Blob([rom.state.data], {
      type: 'application/octet-binary',
    });
    const url = URL.createObjectURL(blob);
    img.src = url;
  };

  rom.handlers.update = () => {
    const progress = rom.state.data ? rom.state.data.length : 0;
    const length = rom.state.header ? rom.state.header.length - 1 : 0;
    pre.innerHTML = `edgePtr: ${rom.edgePtr}
pulseBufferPtr: ${rom.pulseBufferPtr}
readCount: ${rom.readCount}
edgeCounter: ${rom.edgeCounter}
timing: ${rom.timing}
last byte: ${rom.byteBuffer[0].toString(2).padStart(8, '0')}

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
