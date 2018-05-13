import ctx from './ctx.js';
import main from './main.js';
let started = false;

start();

window.onkeydown = e => {
  if (e.which === 27) {
    window.stream.stop();
  }
};

async function start() {
  if (started) return;

  const devices = await navigator.mediaDevices.enumerateDevices();

  const usb = devices.filter(_ => _.label.includes('USB Audio Device'));
  let audioSource = null;
  if (usb.length) {
    audioSource = usb[0].deviceId;
    console.log('using usb audio', audioSource);
  }

  started = true;
  navigator.getUserMedia(
    {
      audio: {
        deviceId: audioSource ? audioSource : undefined,
        echoCancellation: false,
      },
    },
    stream => {
      window.stream = stream;
      const audio = ctx.createMediaStreamSource(stream);
      audio.connect(ctx.destination);
      main(audio);
    },
    err => console.error(err)
  );
}
