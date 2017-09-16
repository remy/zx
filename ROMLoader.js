export class ROMLoader {
  constructor(buffer) {
    this.buffer = buffer;
    this.pulseBuffer = new Float32Array(buffer.length);
    this.edgePtr = 0;
  }

  loadBytes(length) {
    const { edgePtr, buffer } = this;
    console.log(
      'loading %s bytes from %s samples (offset @ %s)',
      length,
      buffer.length - edgePtr,
      edgePtr
    );

    const bytes = new Uint8Array(length);

    for (let i = 0; i < length * 8; i++) {
      const [high, low] = [this.loadEdge(buffer), this.loadEdge(buffer)];

      if (!high || !low) {
        console.log('bad byte - missing pair of pulses @ %s', i, high, low);
        return;
      }

      // we're collecting the bits for an array of 8 bit bytes,
      // first left shifting by 1 bit, then adding the new bit
      // until we have a full byte
      const waveLength = round(1 / SAMPLE_RATE * (high.length + low.length));
      const p = (i / 8) | 0;
      bytes[p] <<= 1; // left shift
      bytes[p] += waveLength === oneLength ? 0b1 : 0b0;
    }

    return bytes;
  }

  loadEdge(buffer) {
    const length = buffer.length;

    if (!length) {
      return null;
    }

    let last = null;
    let i = 0;

    for (; this.edgePtr < length; this.edgePtr++) {
      let point = buffer[this.edgePtr];

      // search for when the buffer point crosses the zero threshold
      if (last !== null) {
        // important: when we hit an edge, the data doesn't include the edge itself
        if (edge(point, last)) {
          // collect the pulse into a result
          const res = this.pulseBuffer.subarray(0, i);
          return res;
        }
      }

      this.pulseBuffer[this.edgePtr] = point;
      last = point;
      i++;
    }

    console.error('found no edge');
    return null; // no edge found
  }
}
