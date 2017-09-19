import Analyser from './analyser.js';
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

const round = (n, i = 4) => n.toFixed(i);
const pilotLength = round(1 / asHz(PILOT));
const oneLength = round(1 / asHz(ONE * 2), 3);
const zeroLength = round(1 / asHz(ZERO * 2), 3);
let SAMPLE_RATE = 0;

export const isEdge = (a, b) => !((a >= 0) ^ (b < 0));

export default class ROMLoader extends Analyser {
  constructor() {
    super();
    this.read = this.read.bind(this);
    this.callback = this.read;
    this.pulseBuffer = new Float32Array(this.analyser.fftSize * 2);
    this.edgePtr = 0;
    this.pulseBufferPtr = 0;
    this.byteBuffer = new Uint8Array(1);
    this.bytesBuffer = new Uint8Array(0xffff);
    this.bytesPtr = 0;
    this.lastCall = null;
    this.timing = 0;

    this.readCount = 0;
    this.zeroCounter = 0;
    this.edgeCounter = 0;

    this.state = {
      pilot: 0,
      synOn: false,
      synOff: false,
      header: false,
      data: [],
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
    target.node.connect(this.analyser);
    this.lastCall = window.performance.now();
    this.start();
  }

  update() {
    window.cancelAnimationFrame(this.updateTimer);
    this.updateTimer = window.requestAnimationFrame(() => {
      this.handlers.update(this);
    });
  }

  // FIXME this will break if we're in the middle of a pulse
  read(data, callTime) {
    this.readCount++;

    this.edgePtr = 0;
    this.timing = callTime - this.lastCall;
    this.lastCall = callTime;

    SAMPLE_RATE = data.length; //data.length * (1000 / this.timing);
    this.SAMPLE_RATE = SAMPLE_RATE;

    if (this.state.synOff) {
      return;
    }

    if (this.readCount > 400) {
      this.stop();
      return;
    }

    // if (data.filter(Boolean).length === 0) {
    //   return;
    // }

    let pulse = null;
    do {
      pulse = this.readPulse(data);
      if (pulse !== null) {
        this.readPilot(pulse);
        this.readSyn(pulse);
      }
      this.update();
    } while (pulse !== null);
  }

  readPulse(buffer, log = false) {
    // log = true;
    const length = buffer.length;

    if (!length) {
      return null;
    }

    let last =
      this.pulseBufferPtr > 0 ? this.pulseBuffer[this.pulseBufferPtr] : null;

    for (; this.edgePtr < length; this.edgePtr++) {
      let point = buffer[this.edgePtr];

      // search for when the buffer point crosses the zero threshold
      if (last !== null) {
        if (point === 0) {
          this.zeroCounter++;
          continue;
          // console.log('zero edge: %s', isEdge(point, last));
        }
        if (log) {
          console.log(
            '%s: %s (last %s), edge? %s',
            this.pulseBufferPtr,
            point,
            last,
            isEdge(point, last)
          );
        }
        if (isEdge(point, last)) {
          // important: when we hit an edge, the data doesn't include the edge
          // itself as determined by the use of `i` rather than edgePtr
          const res = this.pulseBuffer.subarray(1, this.pulseBufferPtr - 1);
          this.pulseBufferPtr = 0;
          this.edgeCounter++;
          // res.forEach((_, i) => console.log('%s: %s', i, _));
          return res;
        }
        this.pulseBuffer[this.pulseBufferPtr] = point;
      }

      last = point;
      this.pulseBufferPtr++;
    }

    // console.error('found no edge');
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
      const length = 1 / SAMPLE_RATE * pulse.length;
      if (round(length) !== pilotLength) {
        // edgePtr -= pulse.length;
        // console.log(
        //   'pilot found %s good pulses',
        //   state.pilot - 1,
        //   round(length)
        // );
        // console.log('bad pulse %s !== %s', round(length), pilotLength);
        // pulse.forEach((_, i) => console.log('%s: %s', i, _));
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
    const length = round(1 / SAMPLE_RATE * pulse.length);
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
