const ZERO = '#0000ff';
const ONE = '#ffff00';

export default class Bars {
  constructor({ height = 192, width = 256 } = {}) {
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    this.padTop = height / 8;
    this.padLeft = width / 8;
    this.height = canvas.height = height + this.padTop * 2;
    this.width = canvas.width = width + this.padLeft * 2;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.bg = '#00ffff'; // pilot cyan
    this.fg = '#ff0000';
  }

  canvas() {
    return this.canvas;
  }

  stretch() {
    const canvas = this.canvas;
    canvas.style.position = 'absolute';
    canvas.style.top = 0;
    canvas.style.left = 0;
    canvas.style.zIndex = -1;
    this.width = canvas.width = window.innerWidth;
    this.width = canvas.height = window.innerHeight;
  }

  pilotDone() {
    this.fg = ZERO;
    this.bg = ONE;
  }

  pilot() {
    const ctx = this.ctx;
    ctx.fillStyle = '#00ffff';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.clearRect(
      this.padLeft,
      this.padTop + 0.5,
      this.width - this.padLeft * 2,
      this.height - this.padTop * 2 - 1.5
    );
  }

  draw(bytes) {
    const { ctx, height, width, bg, fg } = this;

    const data = new Uint8Array(bytes.length * 8);
    for (let i = 0; i < bytes.length; i++) {
      const binary = bytes[i] // FIXME decide whether it's faster to shift
        .toString(2)
        .padStart(8, '0')
        .split('');
      for (let j = 0; j < binary.length; j++) {
        data[i * 8 + j] = binary[j] === '1' ? 1 : 0;
      }
    }

    const length = data.length;

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = fg;

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgb(0, 0, 0)';

    ctx.beginPath();
    const slice = (height / length + 0.5) | 0;
    let y = 0;

    for (let i = 0; i < length; i++) {
      if (data[i] === 1) {
        ctx.rect(-1, y, width + 2, slice);
      }

      y += slice;
    }

    ctx.fill();
    ctx.clearRect(
      this.padLeft,
      this.padTop + 0.5,
      this.width - this.padLeft * 2,
      this.height - this.padTop * 2 - 1.5
    );
  }
}
