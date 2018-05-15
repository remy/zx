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
} from './audio.js';

// excellent source of understanding: http://problemkaputt.de/zxdocs.htm
const decode = a => new TextDecoder().decode(a);
const bufferSize = 2 ** 11;
const round = (n, i = 4) => n.toFixed(i);
const pilotLength = round(1 / asHz(PILOT));
const oneLength = round(1 / asHz(ONE * 2), 3);
const SAMPLE_RATE = 44100;

const pulseCountToLength = count => round(1 / asHz(count), 10);
const SILENCE = null;
const __HACK_BIT = -1;

const BLOCK_TYPE = new Map([[0, 'HEADER'], [255, 'DATA']]);

const PULSE_LENGTH = new Map([
  [pulseCountToLength(PILOT), PILOT],
  [pulseCountToLength(ONE), ONE],
  [pulseCountToLength(ZERO), ZERO],
  [pulseCountToLength(SYN_OFF), SYN_OFF],
  [pulseCountToLength(SYN_ON), SYN_ON],
]);

export const isEdge = (a, b) => !((a >= 0) ^ (b < 0));

export default class TAPLoader {
  constructor() {
    this.strict = true;
    this.pulseBuffer = new Float32Array(bufferSize * 2);
    this.edgePtr = 0;
    this.pulseBufferPtr = 0;
    this.byteBuffer = new Uint8Array(1);
    this.bytePtr = 0;
    this.bitPair = [];
    this.bytesBuffer = new Uint8Array(0xffff); // this is the largest a program can be IIRC
    this.bytesPtr = 0;

    this.blockType = null;

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
      header: () => {},
      bytes: () => {},
      bit: () => {},
      end: () => {},
      reset: () => {},
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
      blockType: null,
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

  // main routine
  read(data, callTime) {
    this.readCount++;

    this._data = data;

    this.pulseType = null;

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
      // console.log(window.PULSE_TYPES.get(tap.pulseType));
    }

    if (this.pulseType === SILENCE) {
      if (this.state.pilot) {
        console.log(
          'reset',
          this.blockType === 0 ? 'header' : 'data',
          this.bytesBuffer.slice(0, this.bytesPtr)
        );
      }
      this.state.pilot = 0;
      this.bytesPtr = 0;
      this.blockType = null;
    }
    this.update();
  }

  checkFinished() {
    // if (this.bytesPtr === this.state.header.length - 1) {
    //   this.state.complete = true;
    //   this.stop();
    //   this.queue.push({ type: 'end' });
    // }
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
    const firstRun = last === null;

    const limit = 0.0006; // used when reading from mic

    // for each item in the buffer; do:
    for (; this.edgePtr < length; this.edgePtr++) {
      let point = buffer[this.edgePtr];

      if (point > -0.01 && point < 0.01) {
        continue; // skip this point
      }

      // search for when the buffer point crosses the zero threshold
      if (last !== null) {
        if (point === 0) {
          // bad data
          continue;
        }

        // this ignores small noise from a mic input
        if (point > limit * -1 && point < limit) {
          continue;
        }

        // an edge is where the audio crosses the zero line in a wave
        if (isEdge(point, last)) {
          // console.log(point);
          // pulse is the length of the half pulse wave
          const pulse = this.pulseBufferPtr;

          this.pulseBufferPtr = 0;

          // important: when we hit an edge, the data doesn't include the edge
          // itself as determined by the use of `i` rather than edgePtr

          this.edgeCounter++;

          this.pulseType = this.pulseIs(pulse);

          if (this.pulseType === __HACK_BIT) {
            this.pulseType = ONE;
            return 22;
          }

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

  pulseIs(pulse) {
    if (pulse === 27 || pulse === 26 || pulse === 28) {
      return PILOT;
    }

    if (pulse === 22 || pulse === 21) {
      // console.log('ONE');
      return ONE;
    }

    if (pulse === 11 || pulse === 10) {
      // console.log('ZERO');
      return ZERO;
    }

    // this is poor error handling due to questionable audio quality over the mic
    if (this.state.pilot > 1000) {
      if (!this.state.synOff) {
        // !this.state.synOn ||
        if (pulse === 8) {
          // console.log('SYN_ON');
          return SYN_ON;
        }

        if (pulse >= 9 || pulse <= 12) {
          // console.log('SYN_OFF');
          return SYN_OFF;
        }
      } else {
        if (pulse < 15) {
          return ZERO;
        }

        if (pulse > 15 && pulse < 30) {
          return ONE;
        }
      }
    }

    if (this.pulseType === SILENCE && pulse > 100) {
      // probably a PILOT
      this.state.pilot++;
      return PILOT;
    }

    if (pulse === 44) {
      // somehow ONEs sometimes get missed
      // this.bitPair = [];
      // this.bitPair.push(pulse / 2);

      return __HACK_BIT;
    }

    // console.log(`unknown pulse length: %s`, pulse);
    return null;
    // return res;
  }

  readHeader() {
    const state = this.state;

    if ((state.synOn === true || state.synOff) && this.blockType === null) {
      // then we're ready for the header

      const headerLength = 19; // aka 0x13 0x00 LSb Msb… => 0x0013

      // zero index, length = 19
      if (this.bytesPtr < headerLength) {
        return;
      }

      const bytes = this.bytesBuffer.slice(0, headerLength);

      function get(bytes, n) {
        const res = bytes.slice(get.ptr, get.ptr + n);
        get.ptr += n;
        return res;
      }

      get.ptr = 0;

      const header = {};

      header.blockType = this.blockType = get(bytes, 1)[0]; // 1

      // this is a data block type - exit and let the read bytes do it's work
      if (header.blockType === 0xff) {
        return;
      }

      header.fileType = get(bytes, 1)[0]; // 2
      header.filename = decode(get(bytes, 10)); // 12
      // get(bytes, 1);
      header.length = get(bytes, 2); // 14
      header.param1 = get(bytes, 2); // 16
      header.param2 = get(bytes, 2); // 17
      const parityCheck = get(bytes, 1)[0]; // n:18 = flag

      const parity = calculateXORChecksum(bytes.slice(0, -1));

      if (parity !== bytes[bytes.length - 1]) {
        this.handlers.error(
          'R Tape Loading Error',
          'parity: ' + parity,
          'checksum: ' + bytes[bytes.length - 1],
          bytes.length,
          bytes
        );
        this.bytesPtr = 0;
        return null;
      }

      header.parity = true;

      // convert these `word` values to INT from LSb, i.e. 0x001b = 6912 (length of screen)
      ['length', 'param1', 'param2'].forEach(key => {
        header[key] = (header[key][1] << 8) + header[key][0];
      });

      state.header = header;

      console.log('HEADER: OK', this.state.header, bytes);
      this.queue.push({ type: 'header', value: header });
    }
  }

  readByte(pulse) {
    if (this.pulseType !== ONE && this.pulseType !== ZERO) {
      return;
    }

    const bitPair = this.bitPair;
    // bitPair.push(pulse);
    bitPair.push(this.pulseType);

    if (bitPair.length < 2) {
      return;
    }

    let [high, low] = bitPair;

    // let h = (high / 10) | 0;
    // let l = (low / 10) | 0;

    // // tiny bit of hand massaging. there would be an error on the size of the
    // // pulse, but that would then have a massive knock on effect, so I correct
    // // it here manually if it's an expected margin of error.
    // if (h !== l) {
    //   if (low === 11) {
    //     l = 1;
    //   }

    //   if (high === 22) {
    //     h = 1;
    //   }

    //   if (low === 9) {
    //     l = 1;
    //   } else if (high === 9 && low === 10) {
    //     h = 1;
    //   } else if (high === 9 && low === 11) {
    //     h = 1;
    //   }
    // }

    if (high !== low) {
      this.handlers.error(
        'bad pair',
        high,
        low,
        `${high} != ${low}`,
        `byte @ ${this.bytePtr}`
      );
      bitPair.pop();
      this.readPulse(bitPair[0]);
      // return;
      high = pulse;
    }
    this.bitPair = [];

    // we're collecting the bits for an array of 8 bit bytes,
    // first left shifting by 1 bit, then adding the new bit
    // until we have a full byte
    const waveLength = round(1 / SAMPLE_RATE * (high + low), 3);
    // const bit = waveLength === oneLength ? 0b1 : 0b0;

    const bit = high === ONE ? 0b1 : 0b0;

    this.byteBuffer[0] <<= 1; // left shift
    this.byteBuffer[0] += bit;

    // this.queue.push({ type: 'bit', value: bit });

    this.bytePtr++;

    if (this.bytePtr === 8) {
      // move to the bytesBuffer
      this.bytesBuffer[this.bytesPtr] = this.byteBuffer[0];
      // console.log(this.byteBuffer[this.bytesPtr].toString(2).padStart(8, '0'));
      // this.queue.push({ type: 'byte', value: byte });
      // console.log('byte', this.byteBuffer[0]);
      this.bytesPtr++;
      this.bytePtr = 0;
    }
  }

  readData() {
    const strict = this.strict
      ? this.state.header.fileType === 3 &&
        // this.state.header.param1 === 0x4000 &&
        this.state.header.length === 6912
      : true;

    if (this.blockType === 0xff && strict && !this.state.complete) {
      this.state.data = this.bytesBuffer.slice(1, this.bytesPtr);
    }
  }

  readPilot(pulse) {
    const state = this.state;
    if (this.pulseType === PILOT) {
      if (this.state.synOff) {
        // console.log('resetting syn');
      }
      this.state.synOff = false;
      this.state.synOn = false;

      state.pilot++;

      if (state.type === 3) {
        if (state.pilot === PILOT_DATA_COUNT) {
          console.log('DATA PILOT: OK');
        }
      } else {
        if (state.pilot === PILOT_COUNT) {
          // state.pilot = true;
          console.log('PILOT: OK');
        }
      }
    }
  }

  readSyn(pulse) {
    if (!this.state.pilot) {
      return; // waiting for pilot
    }

    if (this.pulseType === SYN_ON) {
      console.log('SYN_ON: OK (pilot length: %s)', this.state.pilot);
      this.state.synOn = true;
    }

    if (this.pulseType === SYN_OFF) {
      console.log('SYN_OFF: OK');
      this.queue.push({ type: 'pilot', value: true });
      this.state.synOff = true;
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
