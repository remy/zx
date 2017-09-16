export default function drawBars(analyser) {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  canvas.style.position = 'absolute';
  canvas.style.top = 0;
  canvas.style.left = 0;
  canvas.style.zIndex = -1;
  const ctx = canvas.getContext('2d');
  const w = (canvas.width = window.innerWidth);
  const h = (canvas.height = window.innerHeight);

  analyser.start(data => {
    const length = data.length;

    let min = null;
    let max = null;
    data.forEach(_ => {
      if (min === null || _ < min) {
        min = _;
      }
      if (max === null || _ > max) {
        max = _;
      }
    });

    // console.log(min / 128);

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, w, h);

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgb(0, 0, 0)';

    ctx.beginPath();
    var sliceWidth = w * 1.0 / length;
    var x = 0;

    for (var i = 0; i < length; i++) {
      var v = data[i] / 128.0;
      var y = v * canvas.height / 2; // ampiltude

      if (i === 0) {
        ctx.moveTo(x, y + 0.5);
      } else {
        ctx.lineTo(x, y + 0.5);
      }

      x += sliceWidth;
    }

    ctx.lineTo(w, canvas.height / 2);
    ctx.stroke();
  });
}
