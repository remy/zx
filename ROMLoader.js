import ctx from './ctx.js';
import {
  calculateXORChecksum,
  asHz,
  PILOT,
  ONE,
  ZERO,
  SYN_ON,
  SYN_OFF,
} from './audio.js';

const decode = a => new TextDecoder().decode(a);

const bufferSize = 2 ** 12;
const round = (n, i = 4) => n.toFixed(i);
const pilotLength = round(1 / asHz(PILOT));
const oneLength = round(1 / asHz(ONE * 2), 3);
// const zeroLength = round(1 / asHz(ZERO * 2), 3);
let SAMPLE_RATE = 0;

export const isEdge = (a, b) => !((a >= 0) ^ (b < 0));

export default class ROMLoader {
  constructor() {
    this.pulseBuffer = new Float32Array(bufferSize * 2);
    this.edgePtr = 0;
    this.pulseBufferPtr = 0;
    // this.byteBuffer = new Uint8Array(1);
    // this.bytesBuffer = new Uint8Array(0xffff);
    // this.bytesPtr = 0;

    this.lastCall = null;
    this.timing = 0;

    //*
    this.node = ctx.createScriptProcessor(bufferSize, 1, 1);
    this.node.onaudioprocess = audioProcessingEvent => {
      const channel = 0;
      const inputBuffer = audioProcessingEvent.inputBuffer;
      const input = inputBuffer.getChannelData(channel);

      // then we'll read the values for own processing
      this.read(input, performance.now());

      // copy the input directly across to the output
      const outputBuffer = audioProcessingEvent.outputBuffer;
      const output = outputBuffer.getChannelData(channel);
      inputBuffer.copyFromChannel(output, channel, channel);
    };

    //*/

    this.readCount = 0;
    this.edgeCounter = 0;

    this.state = {
      pilot: 0,
      synOn: false,
      synOff: false,
      header: false,
      data: [],
      bad: [],
      pulses: [],
    };

    this.handlers = {
      pilot: [],
      syn: [],
      header: [],
      bytes: [],
      end: [],
    };
  }

  connect(target) {
    target.node.connect(this.node);
    this.node.connect(target.gain);
    this.lastCall = window.performance.now();
  }

  update() {
    window.requestAnimationFrame(() => {
      this.handlers.update(this);
    });
  }

  read(data, callTime) {
    this.readCount++;

    // const data = Float32Array.from(_data);

    this.edgePtr = 0;
    this.timing = (callTime - this.lastCall) | 0;

    this.lastCall = callTime;

    this.SAMPLE_RATE = SAMPLE_RATE = 44100; //(data.length * (1000 / this.timing)) | 0;

    if (this.state.synOff) {
      return;
    }

    // if (this.readCount > 2) {
    //   return;
    // }

    if (this.readCount > 1) {
      // eval('debugger');
    }

    if (data.filter(Boolean).length === 0) {
      return;
    }

    console.log('read: %s', this.pulseBufferPtr);

    let pulse = null;
    while ((pulse = this.readPulse(data))) {
      this.readPilot(pulse);
      this.readSyn(pulse);
      this.update();
      this.state.pulses.push(pulse);
    }
  }

  readPulse(buffer) {
    const length = buffer.length;

    if (!length) {
      return null;
    }

    let previously = this.pulseBufferPtr;

    let last =
      this.pulseBufferPtr > 0 ? this.pulseBuffer[this.pulseBufferPtr] : null;

    for (; this.edgePtr < length; this.edgePtr++) {
      let point = buffer[this.edgePtr];

      if (previously) {
        console.log(
          '%s: %s (last %s), edge? %s',
          this.state.pulses.length,
          point,
          last,
          isEdge(point, last),
          this.pulseBufferPtr
        );
        previously = false;
      }

      // search for when the buffer point crosses the zero threshold
      if (last !== null) {
        if (point === 0) {
          continue;
        }

        if (!previously && isEdge(point, last)) {
          // important: when we hit an edge, the data doesn't include the edge
          // itself as determined by the use of `i` rather than edgePtr
          const pulse = this.pulseBufferPtr; // this.pulseBuffer.subarray(1, this.pulseBufferPtr - 1);

          // if (pulse === 1) {
          console.log('edge found: %s', pulse);
          // }
          this.pulseBufferPtr = 0;
          this.edgeCounter++;
          return pulse;
        }
        this.pulseBuffer[this.pulseBufferPtr] = point;
      }

      last = point;
      this.pulseBufferPtr++;
    }

    // const pulse = this.pulseBufferPtr;
    this.pulseBufferPtr--; // back up one point
    // this.edgeCounter++;

    // return pulse;

    return null; // no edge found
  }

  readHeader(pulse) {}

  readByte(high) {
    const bytes = new Uint8Array(length); // FIXME move to readHeader

    for (let i = 0; i < length * 8; i++) {
      // const [high, low] = loadEdge2(buffer, false);

      if (!high || !low) {
        console.log('bad byte - missing pair of pulses @ %s', i, high, low);
        return;
      }

      // we're collecting the bits for an array of 8 bit bytes,
      // first left shifting by 1 bit, then adding the new bit
      // until we have a full byte
      const waveLength = round(1 / SAMPLE_RATE * (high.length + low.length), 3);
      const p = (i / 8) | 0;
      bytes[p] <<= 1; // left shift
      bytes[p] += waveLength === oneLength ? 0b1 : 0b0;
    }

    console.log(bytes);

    return bytes;
  }

  readPilot(pulse) {
    const state = this.state;
    if (state.pilot !== true) {
      // check that the pulse width is right
      const length = round(1 / SAMPLE_RATE * pulse);
      if (length !== pilotLength) {
        if (length < pilotLength) {
          // edgePtr -= pulse;
          console.log(
            'bad pulse (%s) %s !== %s @ %s',
            pulse,
            length,
            pilotLength,
            this.state.pulses.length
          );

          this.state.bad.push({
            length,
            pulse,
            i: this.state.pulses.length,
            ptr: this.pulseBufferPtr,
          });

          // this.edgeCounter -= pulse;
          // this.pulseBufferPtr += pulse;
        } else {
          console.log('failed pilot was longer');
        }

        return;
      }
      state.pilot++;

      if (state.pilot === 8063) {
        state.pilot = true;
        console.log('PILOT: OK');
      }
    }
  }

  readSyn(pulse) {
    const state = this.state;
    if (state.pilot !== true) {
      return;
    }

    if (state.synOn === false) {
      state.synOn = this.expectPulse(pulse, SYN_ON);
      if (state.synOn) {
        console.log('SYN_ON: OK');
      }
    }

    if (state.synOff === false) {
      state.synOff = this.expectPulse(pulse, SYN_OFF);
      if (state.synOff) {
        console.log('SYN_OFF: OK');
      }
    }
  }

  expectPulse(pulse, tStates) {
    const expect = round(1 / asHz(tStates));
    const length = round(1 / SAMPLE_RATE * pulse);
    if (length !== expect) {
      // console.error('!expectPulse length: %s, expected: %s', length, expect);
    }
    return length === expect;
  }

  on(event, handler) {
    if (!this.handlers[event]) {
      throw new Error(`unknown event ${event}`);
    }

    this.handlers[event].push(handler);
  }
}
