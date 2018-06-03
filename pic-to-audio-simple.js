import ctx from './ctx.js';
import { dither } from './retrofy.js';
import Audio from './audio.js';
// import canvas from './canvas.js';
import { pixelsForSCR, download } from './image-manip/scr.js';

let running = false;
let url = null;
let audio;

document.documentElement.onclick = async () => {
  if (running) {
    audio.stop();
    // canvas.stop();
    running = false;
  } else if (url) {
    main(url);
  } else {
    console.log('no url');
  }
};

async function main(_url) {
  if (running) return;

  // 1. capture image
  const pixels = await dither(_url); //`https://twivatar.glitch.me/${username}`);

  if (url !== _url) {
    url = _url;
    // first run, so render
    const scrCtx = document.createElement('canvas').getContext('2d');
    scrCtx.canvas.width = 256;
    scrCtx.canvas.height = 192;
    document.body.appendChild(scrCtx.canvas);

    const button = document.createElement('button');
    button.innerHTML = 'Download';
    document.body.appendChild(button);
    button.onclick = async () => {
      const blob = await new Promise(resolve => scrCtx.canvas.toBlob(resolve));
      download(blob);

      return;
    };

    // validate our pixels by translating the SCR binary back into a canvas
    pixelsForSCR(pixels, scrCtx);
  }

  audio = window.audio = new Audio();
  await audio.loadFromData(pixels, 'image.scr', true);

  audio.volume = 100;

  document.documentElement.onkeydown = e => {
    if (e.which === 27) {
      audio.stop();
    }
  };
  setTimeout(() => audio.start(), 0);

  running = true;
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
