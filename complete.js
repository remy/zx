// import TAPProcessor from './tap-processor.js';
import ctx from './ctx.js';
import Audio from './audio.js';
// import canvas from './canvas.js';
import Bars from './bars.js';
import { stream } from './image-manip/scr.js';

const decode = a => new TextDecoder().decode(a);

class TapWorkletNode extends AudioWorkletNode {
  constructor(context) {
    super(context, 'tap-processor');
    this.counter = 0;
    this.port.onmessage = this.handleMessage.bind(this);
    this.port.postMessage({
      message: 'Are you ready?',
      timeStamp: this.context.currentTime,
    });

    this.handlers = {};
  }

  get handler() {
    return this.handlers;
  }

  handleMessage(event) {
    this.counter++;
    console.log(
      '[Node:Received] "' +
        event.data.message +
        '" (' +
        event.data.timeStamp +
        ')'
    );

    // Notify the processor when the node gets 10 messages. Then reset the
    // counter.
    if (this.counter > 10) {
      this.port.postMessage({
        message: '10 messages!',
        timeStamp: this.context.currentTime,
      });
      this.counter = 0;
    }
  }
}

function readFromMic() {
  return new Promise(async (resolve, reject) => {
    const devices = await navigator.mediaDevices.enumerateDevices();

    const usb = devices.filter(_ => _.label.includes('USB Audio Device'));
    let audioSource = null;
    if (usb.length) {
      audioSource = usb[0].deviceId;
      console.log('using usb audio', audioSource);
    }

    navigator.getUserMedia(
      {
        audio: {
          deviceId: audioSource ? audioSource : undefined,
          echoCancellation: false,
        },
      },
      stream => {
        resolve(stream);
      },
      err => reject(err)
    );
  });
}

async function main() {
  const bars = new Bars();
  bars.pilot();
  const audio = (window.audio = new Audio());
  // await audio.loadFromURL('./screens/tap-js.scr');
  const stream = await readFromMic();
  audio.loadFromStream(stream);
  audio.volume = 100;

  document.documentElement.onkeydown = e => {
    if (e.which === 27) {
      // canvas.stop();
      audio.stop();
    }
  };

  // canvas.connect(audio); // spectrum visualiser

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

  ctx.audioWorklet
    .addModule('./tap-processor.js')
    .then(() => {
      let rom = new AudioWorkletNode(ctx, 'tap-processor');

      // this doesn't make a great deal of sense, but our AudioWorklet
      // requires a destination, otherwise it won't start
      // audio.outTo(rom);
      audio.node.connect(rom);
      // audio.inFrom(rom);

      rom.connect(ctx.destination);

      const handlers = {};
      rom.port.onmessage = ({ data: e }) => {
        const { event, data } = e;

        if (handlers[event]) {
          handlers[event](data);
        }
      };

      // rom.port.postMessage({ message: 'ready' });

      handlers.bytes = bytes => {
        if (bytes.length !== prevLength) {
          newBytes = bytes.slice(prevLength);
          bars.draw(newBytes);
          newBytes.forEach((byte, i) => stream(imgCtx, byte, prevLength + i));
          prevLength = bytes.length;
        }
      };

      handlers.pilot = () => {
        bars.pilotDone();
      };

      handlers.end = data => {
        console.log('finished');
        // canvas.stop();
        audio.stop();
        const blob = new Blob([data], {
          type: 'application/octet-binary',
        });
        const url = URL.createObjectURL(blob);
        img.src = url;
      };

      let pilot = 170;
      handlers.update = state => {
        if (state.pilot !== true && state.pilot > 1500) {
          pilot ^= 0xff;
          bars.draw(new Uint8Array(Array.from({ length: 4 }, () => pilot)));
        }
        const progress = state.data ? state.data.length : 0;
        const length = state.header ? state.header.length - 1 : 0;
        // edgePtr: ${rom.edgePtr}
        // pulseBufferPtr: ${rom.pulseBufferPtr}
        // readCount: ${rom.readCount}
        // edgeCounter: ${rom.edgeCounter}
        // timing: ${rom.timing}
        // last byte: ${rom.byteBuffer[0].toString(2).padStart(8, '0')}
        pre.innerHTML = `
new bytes: ${Array.from(newBytes)
          .map(_ =>
            _.toString(16)
              .toUpperCase()
              .padStart(2, '0')
          )
          .join(' ')}

PILOT: ${state.pilot}
SYN_ON: ${state.synOn}
SYN_OFF: ${state.synOff}
FILE: ${state.header ? decode(state.header.filename) : '???'}
BYTES: ${progress || '?'}/${length || '?'} / ${(progress / length * 100) | 0}%`;
      };

      // audio.start();
    })
    .catch(e => console.log(e));
}

main();
