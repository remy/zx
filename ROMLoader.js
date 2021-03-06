import ctx from './ctx.js';
import {
  PILOT_COUNT,
  PILOT_DATA_COUNT,
  calculateXORChecksum,
  asHz,
  PILOT,
  ONE,
  ZERO,
  SYN_ON,
  SYN_OFF,
} from './audio-consts.js';

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

    this.updateTimer = null;

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

    this.reset();

    this.queue = [];

    let errors = 0;
    const start = Date.now();

    this.handlers = {
      pilot: () => {},
      syn: [],
      header: [],
      bytes: () => {},
      bit: () => {},
      end: () => {},
      update: () => {},
      error: (...error) => {
        console.error.apply(console, error);
        this.state.error = `#${++errors} ${error.join(' ')} :: ${Date.now() -
          start}ms`;
      },
    };
  }

  reset() {
    this.state = {
      currentType: null,
      pilot: 0,
      synOn: false,
      synOff: false,
      header: false,
      data: false,
      type: null,
      complete: false,
      bad: [],
      pulses: [],
      error: ['n/a'],
      silent: 0,
    };
  }

  decode(bytes) {
    return decode(bytes);
  }

  connect(target) {
    target.node.connect(this.node);
    if (target.gain) {
      this.node.connect(target.gain);
    }
    this.lastCall = window.performance.now();
  }

  stop() {
    this.node.disconnect();
  }

  fromBuffer(buffer) {
    this.read(buffer, performance.now());
  }

  update() {
    window.cancelAnimationFrame(this.updateTimer);
    this.updateTimer = window.requestAnimationFrame(() => {
      this.handlers.update(this);
      if (this.state.data.length) {
        this.handlers.bytes(this.state.data, this.state.header);
      }
      if (this.queue.length) {
        let event = null;
        while ((event = this.queue.shift())) {
          if (this.handlers[event.type]) {
            this.handlers[event.type](event.value);
          }
        }
      }
    });
  }

  read(data, callTime) {
    this.readCount++;

    this._data = data;

    this.edgePtr = 0;
    this.timing = (callTime - this.lastCall) | 0;

    this.lastCall = callTime;

    // does nothing: just for my own numbers
    this.SAMPLE_RATE = (data.length * (1000 / this.timing)) | 0;

    let pulse = null;
    this.state.silent++;
    while ((pulse = this.readPulse())) {
      this.checkFinished();
      this.readByte(pulse);
      this.readData();
      this.readHeader();
      this.readSyn(pulse);
      this.readPilot(pulse);
      this.state.silent = 0;
    }

    if (this.state.silent > 1 && this.state.header !== false) {
      if (this.state.type !== 3) {
        // FIXME changing to 1 causes new header to read
        // 2nd leg
        this.state.synOff = false;
        this.state.synOn = false;
        this.state.pilot = false;
        this.state.type = null;
        this.pulseBufferPtr = 0;
      } else {
        this.state.pilot = false;
        this.state.synOff = false;
        this.state.synOn = false;
        this.state.pilot = false;
        // PILOT_DATA_COUNT
      }
    }

    this.update();
  }

  checkFinished() {
    if (this.bytesPtr === this.state.header.length - 1) {
      this.state.complete = true;
      this.stop();
      this.queue.push({ type: 'end' });
    }
  }

  readPulse() {
    const buffer = this._data;
    const length = buffer.length;

    if (this.state.complete) {
      return null;
    }

    if (!length) {
      return null;
    }

    let last =
      this.pulseBufferPtr > 0 ? this.pulseBuffer[this.pulseBufferPtr] : null;

    const limit = 0.0006; // used when reading from mic

    // for each item in the buffer; do:
    for (; this.edgePtr < length; this.edgePtr++) {
      let point = buffer[this.edgePtr];

      // search for when the buffer point crosses the zero threshold
      if (last !== null) {
        if (point === 0) {
          // bad data
          continue;
        }

        // this is bad sound data
        if (point > limit * -1 && point < limit) {
          continue;
        }

        // an edge is where the audio crosses the zero line in a wave
        if (isEdge(point, last)) {
          // pulse is the length of the half pulse wave
          const pulse = this.pulseBufferPtr;

          this.pulseBufferPtr = 0;

          // important: when we hit an edge, the data doesn't include the edge
          // itself as determined by the use of `i` rather than edgePtr

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
    if (
      (state.synOff === true && state.header === false) ||
      (state.synOff && state.type === null)
    ) {
      // ref https://faqwiki.zxnet.co.uk/wiki/TAP_format#Format_Description
      if (this.bytesPtr === 19) {
        const bytes = this.bytesBuffer.slice(0, 19);

        const parity = calculateXORChecksum(bytes.slice(0, -1));

        if (parity !== bytes[bytes.length - 1]) {
          this.handlers.error(
            'R Tape Loading Error',
            'parity: ' + parity,
            'checksum: ' + bytes[bytes.length - 1],
            bytes.length,
            bytes
          );
          return null;
        }

        console.log('HEADER: OK', bytes);

        this.state.type = bytes[1];

        if (this.state.type !== 3) {
          const filename = decode(bytes.slice(2, 2 + 10)); // filename is in position 1…11
          const length = (bytes[12] << 8) + bytes[13]; // length is held in 2 bytes

          this.state.header = { filename, length };
          console.log('%s: %s bytes', filename, length);
        } else {
          this.state.header = { length: 6912 };
        }

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

    let h = (high / 10) | 0;
    let l = (low / 10) | 0;

    // tiny bit of hand massaging. there would be an error on the size of the
    // pulse, but that would then have a massive knock on effect, so I correct
    // it here manually if it's an expected margin of error.
    if (h !== l) {
      if (low === 11) {
        l = 1;
      }

      if (high === 22) {
        h = 1;
      }

      if (low === 9) {
        l = 1;
      } else if (high === 9 && low === 10) {
        h = 1;
      } else if (high === 9 && low === 11) {
        h = 1;
      }
    }

    if (h !== l) {
      this.handlers.error(
        'bad pair',
        high,
        low,
        `${h} != ${l}`,
        `byte @ ${this.bytePtr}`
      );
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

    // this.queue.push({ type: 'bit', value: bit });

    this.bytePtr++;

    if (this.bytePtr === 8) {
      // move to the bytesBuffer
      this.bytesBuffer[this.bytesPtr] = this.byteBuffer[0];
      // console.log(this.byteBuffer[this.bytesPtr].toString(2).padStart(8, '0'));
      // this.queue.push({ type: 'byte', value: byte });
      this.bytesPtr++;
      this.bytePtr = 0;
    }
  }

  readData() {
    if (this.state.header && this.state.type === 3 && !this.state.complete) {
      this.state.data = this.bytesBuffer.slice(0, this.bytesPtr);
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
          console.log(
            'failed pilot (%s) was wrong length: %s < %s',
            state.pilot,
            length,
            pilotLength
          );
        }

        if (state.pilot !== false) {
          return;
        }
      }
      state.pilot++;

      if (state.type === 3) {
        if (state.pilot === PILOT_DATA_COUNT) {
          state.pilot = true;
          console.log('DATA PILOT: OK');
          this.queue.push({ type: 'pilot', value: true });
          state.synOn = true;
          state.synOff = true;
        }
      } else {
        if (state.pilot === PILOT_COUNT) {
          state.pilot = true;
          console.log('PILOT: OK');
          this.queue.push({ type: 'pilot', value: true });
        }
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
      throw new Error(`unknown event handler ${event}`);
    }

    console.log('binding %s', event);
    this.handlers[event] = handler;
  }
}
