import Analyser from './analyser.js';
const analyser = (window.analyser = new Analyser());

export default {
  connect: node => {
    analyser.connect({ node });
    analyser.start(draw);
  },
};

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
canvas.style.position = 'absolute';
canvas.style.top = window.innerHeight * 0.1;
canvas.style.left = 0;
const ctx = canvas.getContext('2d');
const w = (canvas.width = window.innerWidth);
const h = (canvas.height = window.innerHeight * 0.8);

export function draw(data) {
  const length = data.length;
  ctx.clearRect(0, 0, w, h);

  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgb(0, 0, 0)';

  ctx.beginPath();

  var sliceWidth = w * 1.0 / length;
  var x = 0;

  for (var i = 0; i < length; i++) {
    var v = data[i] / 128.0;
    var y = v * canvas.height / 2;

    if (i === 0) {
      ctx.moveTo(x, y + 0.5);
    } else {
      ctx.lineTo(x, y + 0.5);
    }

    x += sliceWidth;
  }

  ctx.lineTo(w, canvas.height / 2);
  ctx.stroke();
}
