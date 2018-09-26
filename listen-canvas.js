import ctx from './ctx.js';
import canvas from './canvas.js';
import Audio from './audio.js';

function stop() {
  try {
    console.log('stop');
    window.stream.stop();
    canvas.stop();
  } catch (e) {}
}

window.onkeydown = e => {
  if (e.which === 27) {
    stop();
  }
};

function init() {
  const c = document.createElement('div');
  document.body.appendChild(c);

  c.innerHTML = `
  <style>
  .button-wrapper {
    max-width: 800px;
    margin: 20px auto;
  }
  button {
    font-size: 2rem;
    margin: 20px;
    background: white;
    border-radius: 5px;
    padding: 5px 10px;
    cursor: pointer;
    user-select: none;
  }</style>
  <div class="button-wrapper">
    <button id="default">default options</button>
    <button data-toggle="true" hidden>echoCancellation: false</button>
    <button id="stop">stop</button>
    <button id="reload">reset</button>
  </div>
`;

  Array.from(document.querySelectorAll('button')).forEach(b => {
    b.onclick = () => {
      if (b.id === 'reload') {
        return window.location.reload();
      }

      if (b.id === 'stop') {
        return stop();
      }
      start(b.id === 'default');
    };
  });
}

async function start(echoCancellation = true) {
  stop();
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
    _ => _.kind === 'audioinput'
  );
  console.log(devices);
  const usb = devices.filter(
    _ => _.label.includes('USB') || _.deviceId.toLowerCase().includes('default')
  );
  console.log('test', usb);
  let audioSource = null;
  if (usb.length) {
    audioSource = usb[0].deviceId;
    console.log('using usb audio', audioSource);
  }

  console.log('echoCancellation', echoCancellation);
  navigator.getUserMedia(
    {
      audio: {
        deviceId: audioSource ? audioSource : undefined,
        echoCancellation,
      },
    },
    stream => {
      const audio = (window.stream = new Audio());
      audio.loadFromStream(stream);
      audio.volume = 100;
      audio.connectStream();
      canvas.connect(audio);
    },
    err => console.error(err)
  );
}

init();
