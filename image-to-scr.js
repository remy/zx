import { pixelsToBytes, stream } from './image-manip/scr.js';

async function main() {
  const filename = 'me-int.gif';

  const img = new Image();
  img.onload = async () => {
    const canvas = document.createElement('canvas');
    const width = 256;
    const height = 192;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // const data = new Uint8ClampedArray(3 * 2048 + 768);

    const data = new Uint8Array(256 * 192 / 8 + 768);

    await pixelsToBytes(0, data, imageData.data);
    await pixelsToBytes(1, data, imageData.data);
    await pixelsToBytes(2, data, imageData.data);

    for (let i = 0; i < 768; i++) {
      data[2048 * 3 + i] = 0b00111000;
    }

    const scrBlob = new Blob([data], { 'content-type': 'application/binary' });
    const scrURL = URL.createObjectURL(scrBlob);
    const link = document.createElement('a');
    link.download = filename.split('.').shift() + '.scr';
    link.href = scrURL;
    link.innerHTML = 'Download .SCR file';
    link.style.padding = '20px';
    link.style.display = 'block';
    document.body.appendChild(link);

    for (let i = 0; i < data.length; i++) {
      stream(ctx, data[i], i);
    }

    document.body.appendChild(canvas);
  };
  img.src = filename;
}

main();
