import toAudio from './binary-to-audio.js';

function imageToBlob(img) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);

  return new Promise(resolve => {
    canvas.toBlob(file => resolve(file));
  });
}

function chrToBinary(chr) {
  return chr
    .charCodeAt(0) // R = 82
    .toString(2) // 82 = 1010010
    .padStart(8, '0'); // 1010010 = 01010010
}

function fileToBinary(file) {
  return new Promise(resolve => {
    const reader = new window.FileReader();

    reader.onloadend = function() {
      const binary = [];
      const result = reader.result;
      for (let i = 0; i < result.length; i++) {
        const chr = result[i];
        binary.push(chrToBinary(chr));
      }

      resolve(
        binary.reduce((acc, byte) => {
          return acc.concat(byte.split(''));
        }, [])
      );
    };

    reader.readAsBinaryString(file);
  });
}

document.body.appendChild(document.createElement('ul'));

const elm = document.querySelector('#heart');
const out = document.querySelector('ul');
const log = t => (out.innerHTML += `<li>${t}</li>`);

elm.style =
  'display: block; transform: scale(10); right: 0; position: absolute; transform-origin: 0 0;';

imageToBlob(elm)
  .then(blob => {
    log(`${blob.size} bytes loaded`);
    return fileToBinary(blob);
  })
  .then(binary => {
    log(`${binary.length} bits loaded`);
    return toAudio(binary);
  })
  .then(audio => {
    log(`${audio.length} samples`);
  });
