import ctx from './ctx.js';
import {
  PILOT_COUNT,
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
const SAMPLE_RATE = 44100;

export const isEdge = (a, b) => !((a >= 0) ^ (b < 0));

export default class ROMLoader {
  constructor() {
    this.pulseBuffer = new Float32Array(bufferSize * 2);
    this.edgePtr = 0;
    this.pulseBufferPtr = 0;
    this.byteBuffer = new Uint8Array(1);
    this.bytePtr = 0;
    this.bitPair = [];
    this.bytesBuffer = new Uint8Array(0xffff);
    this.bytesPtr = 0;

    this.lastCall = null;
    this.timing = 0;

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

    this.readCount = 0;
    this.edgeCounter = 0;

    this.SAMPLE_RATE = SAMPLE_RATE;

    this.state = {
      pilot: 0,
      synOn: false,
      synOff: false,
      header: false,
      data: false,
      complete: false,
      bad: [],
      pulses: [],
    };

    this.queue = [];

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
      if (this.queue.length) {
        let event = null;
        while ((event = this.queue.shift())) {
          if (this.handlers[event.type]) {
            this.handlers[event.type](event.value);
          }
        }
      }
      if (this.state.data.length) {
        this.handlers.bytes(this.state.data, this.state.header);
      }
    });
  }

  read(data, callTime) {
    this.readCount++;

    this._data = data;

    // const data = Float32Array.from(_data);

    this.edgePtr = 0;
    this.timing = (callTime - this.lastCall) | 0;

    this.lastCall = callTime;

    // SAMPLE_RATE = (data.length * (1000 / this.timing)) | 0;

    if (data.filter(Boolean).length === 0) {
      return;
    }

    let pulse = null;
    while ((pulse = this.readPulse())) {
      this.readByte(pulse);
      this.readData();
      this.readHeader();
      this.readSyn(pulse);
      this.readPilot(pulse);
      this.update();
      // this.state.pulses.push(pulse);
    }
  }

  readPulse() {
    const buffer = this._data;
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
          continue;
        }

        if (isEdge(point, last)) {
          // important: when we hit an edge, the data doesn't include the edge
          // itself as determined by the use of `i` rather than edgePtr
          const pulse = this.pulseBufferPtr;

          this.pulseBufferPtr = 0;
          this.edgeCounter++;
          return pulse;
        }
        this.pulseBuffer[this.pulseBufferPtr] = point;
      }

      last = point;
      this.pulseBufferPtr++;
    }

    this.pulseBufferPtr--; // back up by one point

    return null; // no edge found
  }

  readHeader() {
    const state = this.state;
    if (state.synOff === true && state.header === false) {
      if (this.bytesPtr === 18) {
        const bytes = this.bytesBuffer.slice(0, 18);

        const parity = calculateXORChecksum(bytes.slice(0, -1));

        if (parity !== bytes[bytes.length - 1]) {
          console.error(
            'R Tape Loading Error',
            parity,
            bytes[bytes.length - 1]
          );
          return null;
        }

        console.log('HEADER: OK');

        const filename = decode(bytes.slice(1, 10)); // filename is in position 1…11
        const length = (bytes[11] << 8) + bytes[12]; // length is held in 2 bytes

        this.state.header = { filename, length };
        console.log('%s: %s bytes', filename, length);

        // reset the position of the byteBuffer
        this.bytesPtr = 0;
      }
    }
  }

  readByte(pulse) {
    if (this.state.synOff === false) {
      return;
    }

    const bitPair = this.bitPair;
    bitPair.push(pulse);

    if (bitPair.length < 2) {
      return;
    }

    const [high, low] = bitPair;

    const h = (high / 10) | 0;
    const l = (low / 10) | 0;

    if (h !== l) {
      console.error('😟 bad pair', high, low);
      bitPair.shift();
      return;
    }
    this.bitPair = [];

    // we're collecting the bits for an array of 8 bit bytes,
    // first left shifting by 1 bit, then adding the new bit
    // until we have a full byte
    const waveLength = round(1 / SAMPLE_RATE * (high + low), 3);
    const bit = waveLength === oneLength ? 0b1 : 0b0;
    this.byteBuffer[0] <<= 1; // left shift
    this.byteBuffer[0] += bit;

    this.queue.push({ type: 'bit', value: bit });

    this.bytePtr++;

    if (this.bytePtr === 8) {
      // move to the bytesBuffer
      const byte = (this.bytesBuffer[this.bytesPtr] = this.byteBuffer[0]);
      this.queue.push({ type: 'byte', value: byte });
      this.bytesPtr++;
      this.bytePtr = 0;
    }
  }

  readData() {
    if (this.state.header && !this.state.complete) {
      const fin = this.bytesPtr === this.state.header.length - 1;

      this.state.data = this.bytesBuffer.slice(0, this.bytesPtr);

      if (fin) {
        this.state.complete = true;
        this.handlers.end();
      }
    }
  }

  readPilot(pulse) {
    const state = this.state;
    if (state.pilot !== true) {
      // check that the pulse width is right
      const length = round(1 / SAMPLE_RATE * pulse);
      if (length !== pilotLength) {
        if (length < pilotLength) {
          this.state.bad.push({
            length,
            pulse,
            i: this.state.pulses.length,
            ptr: this.pulseBufferPtr,
          });
        } else {
          console.log('failed pilot was longer');
        }

        return;
      }
      state.pilot++;

      if (state.pilot === PILOT_COUNT) {
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

    if (state.synOff === false) {
      state.synOff = this.expectPulse(pulse, SYN_OFF);
      if (state.synOff) {
        console.log('SYN_OFF: OK');
      }
    }

    if (state.synOn === false) {
      state.synOn = this.expectPulse(pulse, SYN_ON);
      if (state.synOn) {
        console.log('SYN_ON: OK');
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
