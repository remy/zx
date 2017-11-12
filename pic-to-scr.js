import { dither } from './retrofy.js';
import { pixelsForSCR } from './image-manip/scr.js';

async function main(url, filename = 'image') {
  // 1. capture image
  const pixels = await dither(url); //`https://twivatar.glitch.me/${username}`);
  const scrCtx = document.createElement('canvas').getContext('2d');
  scrCtx.canvas.width = 256;
  scrCtx.canvas.height = 192;
  document.body.appendChild(scrCtx.canvas);
  // validate our pixels by translating the SCR binary back into a canvas
  pixelsForSCR(pixels, scrCtx);

  scrCtx.canvas.onclick = () => {
    const scrBlob = new Blob([pixels], {
      'content-type': 'application/binary',
    });
    const url = URL.createObjectURL(scrBlob);

    const a = document.createElement('a');
    a.download = filename + '.scr';
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
  };
}

const input = document.createElement('input');
input.setAttribute(
  'style',
  `font-size: 16px;
padding: 3px;
margin: 10px;
display: block;
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
    main(url, input.files[0].name.replace(/\.(jpg|jpeg|gif|png)$/i, ''));
  };
  fileReader.readAsArrayBuffer(input.files[0]);
};
