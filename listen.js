import ctx from './ctx.js';
import Audio from './audio.js';
import ROMLoader from './ROMLoader.js';
import canvas from './canvas.js';
import Bars from './bars.js';

let started = false;
// document.body.onclick = start;
start();

function start() {
  if (started) return;
  started = true;
  navigator.getUserMedia =
    navigator.getUserMedia ||
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia;
  navigator.getUserMedia(
    {
      audio: {
        mandatory: {
          googEchoCancellation: false,
          googAutoGainControl: false,
          googNoiseSuppression: false,
          googHighpassFilter: false,
          echoCancellation: false,
          googAutoGainControl2: false,
          googTypingNoiseDetection: false,
        },
        optional: [{ echoCancellation: false }],
      },
    },
    stream => {
      main(ctx.createMediaStreamSource(stream));
    },
    err => console.error(err)
  );
}

async function main(audio) {
  const bars = new Bars();
  const rom = (window.rom = new ROMLoader());
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.setTargetAtTime(0, ctx.currentTime, 0); // mute
  rom.connect({ node: audio, gain });
  canvas.connect(audio);
  rom.node.connect(gain);

  document.documentElement.onkeydown = e => {
    if (e.which === 27) {
      canvas.stop();
      rom.stop();
    }
  };

  const pre = document.createElement('pre');
  document.body.appendChild(pre);
  pre.style.position = 'relative';
  pre.style.zIndex = 1;

  const img = new Image();
  document.body.appendChild(img);

  let prevLength = 0;
  let newBytes = new Uint8Array(0); // updated as this type later
  rom.handlers.bytes = bytes => {
    if (bytes.length !== prevLength) {
      newBytes = bytes.slice(prevLength);
      bars.draw(newBytes);
      prevLength = bytes.length;
      const blob = new Blob([bytes], { type: 'application/octet-binary' }); // pass a useful mime type here
      const url = URL.createObjectURL(blob);
      img.src = url;
    }
  };

  rom.handlers.end = () => {
    console.log('finished');
    canvas.stop();
    // audio.stop();
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

  // setTimeout(() => audio.start(), 0);
}

// main();
