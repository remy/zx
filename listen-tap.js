import ctx from './ctx.js';
import main from './main.js';
import Audio from './audio.js';

window.onkeydown = e => {
  if (e.which === 27) {
    window.stream.stop();
  }
};

async function start() {
  const devices = await navigator.mediaDevices.enumerateDevices();

  const usb = devices.filter(_ => _.label.includes('USB Audio Device'));
  let audioSource = null;
  if (usb.length) {
    audioSource = usb[0].deviceId;
    console.log('using usb audio', audioSource);
  }

  navigator.getUserMedia(
    {
      audio: {
        deviceId: audioSource ? audioSource : undefined,
        echoCancellation: false,
        channelCount: 1,
        sampleRate: 44100,
      },
    },
    stream => {
      const audio = (window.stream = new Audio());
      audio.loadFromStream(stream);
      audio.volume = 100;
      audio.connectStream();
      main(audio);
    },
    err => console.error(err)
  );
}

start();
