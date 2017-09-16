import ctx from './ctx.js';
import imageToBinary from './image.js';

import Analyser from './analyser.js';

const FACTOR = 0; // 0 = 265 (smallest sample rate), 6 = 16384 (largest sample rate)
const analyser = (window.analyser = new Analyser());

function makeCanvas() {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  canvas.style.position = 'absolute';
  canvas.style.top = window.innerHeight * 0.1;
  canvas.style.left = 0;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight * 0.8;
  return canvas.getContext('2d');
}

async function main() {
  const image = document.querySelector('img');
  const data = await imageToBinary(image);

  const src = ctx.createScriptProcessor(4096, 1, 1);

  src.onaudioprocess = audioProcessingEvent => {
    // The output buffer contains the samples that will be modified and played
    const outputBuffer = audioProcessingEvent.outputBuffer;
    const outputData = outputBuffer.getChannelData(0);

    // Loop through the samples rate
    for (let i = 0; i < outputBuffer.length; i++) {
      outputData[i] = getCorrectPointForTime(data, i);
    }
  };

  src.connect(ctx.destination);
}

main();
