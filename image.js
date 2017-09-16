export default function main(image) {
  return imageToBlob(image).then(fileToBinary);
}

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

export function chrToBinary(chr) {
  return chr
    .charCodeAt(0) // R = 82
    .toString(2) // 82 = 1010010
    .padStart(8, '0'); // 1010010 = 01010010
}

export function fileToBinary(file) {
  return new Promise(resolve => {
    const reader = new window.FileReader();

    reader.onloadend = function() {
      const result = reader.result;
      // console.log('image.js: fileToBinary length: %s', result.length);
      return resolve(new Uint8Array(result));

      const binary = new Uint8Array(result.length);
      for (let i = 0; i < result.length; i++) {
        const chr = result[i];
        chrToBinary(chr);
        binary.push();
      }

      resolve(
        binary.reduce((acc, byte) => {
          return acc.concat(byte.split(''));
        }, [])
      );
    };

    reader.readAsArrayBuffer(file);
  });
}
