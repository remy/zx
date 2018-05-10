import ctx from './ctx.js';
import { stream } from './image-manip/scr.js';
import TAPLoader from './TAPLoader.js';
import canvas from './canvas.js';
import Bars from './bars.js';
import { PILOT, ONE, ZERO, SYN_OFF, SYN_ON } from './audio.js';

const PULSE_TYPES = (window.PULSE_TYPES = new Map());
PULSE_TYPES.set(null, 'SILENCE');
PULSE_TYPES.set(PILOT, 'PILOT');
PULSE_TYPES.set(ONE, 'ONE');
PULSE_TYPES.set(ZERO, 'ZERO');
PULSE_TYPES.set(SYN_OFF, 'SYN_OFF');
PULSE_TYPES.set(SYN_ON, 'SYN_ON');

let started = false;
// document.body.onclick = start;

start();

window.onkeydown = e => {
  if (e.which === 27) {
    window.stream.stop();
  }
};

async function start() {
  if (started) return;

  started = true;

  var request = new XMLHttpRequest();
  request.open('GET', '/audio/Batty.mp3', true);
  request.responseType = 'arraybuffer';

  // Decode asynchronously
  request.onload = () => {
    ctx.decodeAudioData(
      request.response,
      buffer => {
        const stream = (window.stream = ctx.createBufferSource());
        stream.buffer = buffer;
        stream.connect(ctx.destination);

        setTimeout(() => {
          stream.start(0); //, 0, 5.5);
        }, 100);
        main(stream);
      },
      err => console.error(err)
    );
  };
  request.send();
}

async function main(audio) {
  const container = document.createElement('div');
  container.style.display = 'inline-block';
  document.body.appendChild(container);
  const bars = new Bars();
  container.appendChild(bars.canvas);
  const tap = (window.tap = new TAPLoader());
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.setTargetAtTime(0, ctx.currentTime, 0); // mute
  tap.connect({ node: audio, gain });
  canvas.connect(audio);
  tap.node.connect(gain);

  document.documentElement.onkeydown = e => {
    if (e.which === 27) {
      canvas.stop();
      tap.stop();
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
  img.style.zIndex = 10;
  container.appendChild(img);
  const imgCtx = img.getContext('2d');

  let full = false;
  container.ondblclick = () => {
    if (!full) {
      container.requestFullscreen();
    }
  };

  let prevLength = 0;
  let newBytes = new Uint8Array(0); // updated as this type later

  tap.handlers.bytes = bytes => {
    if (bytes.length !== prevLength) {
      newBytes = bytes.slice(prevLength);
      bars.draw(newBytes);
      newBytes.forEach((byte, i) => stream(imgCtx, byte, prevLength + i));
      prevLength = bytes.length;
    }
  };

  tap.handlers.pilot = () => {
    bars.pilotDone();
  };

  tap.handlers.end = () => {
    console.log('finished');
    // canvas.stop();
    audio.stop();
    const blob = new Blob([tap.state.data], {
      type: 'application/octet-binary',
    });
    const url = URL.createObjectURL(blob);
    img.src = url;
  };

  const TYPES = new Map();
  TYPES.set(null, 'searching');
  TYPES.set(0, 'PROGRAM');
  TYPES.set(1, 'NUMERIC ARRAY');
  TYPES.set(2, 'ALPHA ARRAY');
  TYPES.set(3, 'BYTE HEADER');

  let pilot = 170;
  tap.handlers.update = () => {
    if (tap.state.pilot !== true && tap.state.pilot > 1500) {
      pilot ^= 0xff;
      bars.draw(new Uint8Array(Array.from({ length: 4 }, () => pilot)));
    }
    const progress = tap.state.data ? tap.state.data.length : 0;
    const length = tap.state.header ? tap.state.header.length : 0;
    pre.innerHTML = `bufferSize: ${tap.edgePtr}
pulseBufferPtr: ${tap.pulseBufferPtr}
readCount: ${tap.readCount}
edgeCounter: ${tap.edgeCounter}
timing: ${tap.timing}
last byte: ${tap.byteBuffer[0].toString(2).padStart(8, '0')}
new bytes: ${Array.from(newBytes)
      .map(_ =>
        _.toString(16)
          .toUpperCase()
          .padStart(2, '0')
      )
      .join(' ')}

LAST: ${PULSE_TYPES.get(tap.pulseType)}
BLOCK_TYPE: ${tap.blockType}
HEADER: ${TYPES.get(tap.state.type)}
PILOT: ${tap.state.pilot}
SYN_ON: ${tap.state.synOn}
SYN_OFF: ${tap.state.synOff}
FILE: ${tap.state.header ? tap.state.header.filename : '???'}
BYTES: ${progress || '?'}/${length || '?'} / ${(progress / length * 100) | 0}%`;
  };
}
