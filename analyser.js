import ctx from './ctx.js';
const noop = () => {};
const _rafTimer = Symbol('rafTimer');

export default class Audio {
  constructor({ draw = noop } = {}) {
    const analyser = (this.analyser = ctx.createAnalyser());
    analyser.fftSize = 2048;
    const length = (this.length = analyser.frequencyBinCount);

    this.data = new Uint8Array(length);
    this.callback = draw;
    this[_rafTimer] = null;
  }

  connect(target) {
    target.node.connect(this.analyser);
  }

  stop() {
    cancelAnimationFrame(this[_rafTimer]);
    this[_rafTimer] = null;
  }

  start(callback = this.callback) {
    const loop = () => {
      if (this[_rafTimer] === null) {
        return;
      }

      this.analyser.getByteTimeDomainData(this.data);
      if (callback(this.data) !== false) {
        this[_rafTimer] = requestAnimationFrame(() => loop());
      }
    };

    this[_rafTimer] = true;
    loop();
  }

  get node() {
    return this.analyser;
  }
}
