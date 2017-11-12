import { dither } from './retrofy.js';
import Audio from './audio.js';
import canvas from './canvas.js';

async function main(url) {
  // 1. capture image
  const pixels = await dither(url); //`https://twivatar.glitch.me/${username}`);
  console.log(pixels.length);

  const audio = (window.audio = new Audio());
  await audio.loadFromData(pixels);
  audio.volume = 100;
  canvas.connect(audio.node);

  document.documentElement.onkeydown = e => {
    if (e.which === 27) {
      audio.stop();
    }
  };
  setTimeout(() => audio.start(), 0);

  let running = true;
  document.documentElement.onclick = async () => {
    if (running) {
      audio.stop();
      canvas.stop();
      running = false;
    } else {
      window.location.reload();
    }
  };
}

const input = document.createElement('input');
input.setAttribute(
  'style',
  `font-size: 16px;
padding: 3px;
margin: 10px;
`.replace(/\n/g, ' ')
);
document.body.appendChild(input);
input.value = 'Capture photo';
input.type = 'file';
input.setAttribute('accept', 'image/*');
input.setAttribute('capture', 'camera');
input.onchange = () => {
  const fileReader = new FileReader();
  fileReader.onloadend = function(e) {
    var arrayBuffer = e.target.result;
    const blob = new Blob([arrayBuffer], {
      type: 'image/png',
    });
    const url = URL.createObjectURL(blob);
    main(url);
  };
  fileReader.readAsArrayBuffer(input.files[0]);
};
