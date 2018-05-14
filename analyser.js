import ctx from './ctx.js';
const noop = () => {};
const _rafTimer = Symbol('rafTimer');

export default class Analyser {
  constructor({ draw = noop } = {}) {
    const analyser = (this.analyser = ctx.createAnalyser());
    analyser.fftSize = Math.pow(2, 13); // 4096
    const length = (this.length = analyser.frequencyBinCount);

    this.data = new Float32Array(length);
    this.callback = draw;
    this[_rafTimer] = null;
  }

  connect(target) {
    target.node.connect(this.analyser);
    this.disconnect = () => {
      target.node.disconnect();
    };
  }

  stop() {
    cancelAnimationFrame(this[_rafTimer]);
    this[_rafTimer] = null;
    this.disconnect();
  }

  start(callback = this.callback) {
    const loop = now => {
      if (this[_rafTimer] === null) {
        return;
      }

      this.analyser.getFloatTimeDomainData(this.data);
      if (callback(this.data, now) !== false) {
        this[_rafTimer] = requestAnimationFrame(loop);
      }
    };

    this[_rafTimer] = true;
    loop();
  }

  get node() {
    return this.analyser;
  }
}
