export default function main(image) {
  return imageToBlob(image).then(fileToBinary);
}

function crop(
  source = { width: 0, height: 0 },
  destination = { width: 0, height: 0 }
) {
  // result:
  let x = 0;
  let y = 0;

  // which is longest side
  let longest = 'width';
  let shortest = 'height';
  if (destination.width < destination.height) {
    [longest, shortest] = [shortest, longest];
  }

  // get divisor
  const d = source[longest] / destination[longest]; // FIXME does this work for scaling up?

  const width = (destination.width * d) | 0;
  const height = (destination.height * d) | 0;

  if (longest === 'height') {
    x = (source[longest] - width) / 2;
  } else {
    y = (source[longest] - height) / 2;
  }

  return { x, y, width, height };
}

export function imageToCanvas(
  img,
  scale = { width: img.width, height: img.height }
) {
  const canvas = document.createElement('canvas');
  canvas.style.imageRendering = 'pixelated';
  const ctx = canvas.getContext('2d');
  canvas.width = scale.width;
  canvas.height = scale.height;

  const { x, y, height, width } = crop(img, canvas);

  ctx.drawImage(img, x, y, width, height, 0, 0, canvas.width, canvas.height);

  return ctx;
}

export function imageToPixels(img, scale) {
  const ctx = imageToCanvas(img, scale);
  return ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
}

export async function imageToBlob(img, ctx = imageToCanvas(img)) {
  return new Promise(resolve => {
    const canvas = ctx.canvas;
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
