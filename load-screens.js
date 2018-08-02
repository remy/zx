import {
  load,
  pixelsForSCR,
  loadBlinkAttributes,
  download,
} from './image-manip/scr.js';

const screens = [
  // 'ActionForce.scr',
  'Batman-TheCapedCrusader.scr',
  'Batman-TheMovie.scr',
  'Batman.scr',
  'ChaseH.Q..scr',
  'DANDARE1.SCR',
  'DEATHCHA.SCR',
  'FIST1.SCR',
  'HARRIER.SCR',
  'JOEBLAD1.SCR',
  'RENEGADE.SCR',
  'ROBOCOP1.SCR',
  'RoboCop2.scr',
  'Sherwood.scr',
  'Steg.scr',
  'Strider.scr',
  'TreasureIslandDizzy.scr',
  'Uridium.scr',
  // 'attribs.scr',
  // 'attributes.scr',
  'jetpac.scr',
  'midnight.scr',
  'manic-miner.scr',
  'tap-js.scr',
].sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1));

let blink = { stop: () => {} };
let filename = null;
let ctx;

document.body.onkeypress = async e => {
  if (e.key === 'd' && filename) {
    const data = await new Promise(resolve => ctx.canvas.toBlob(resolve));
    download(data, filename.replace(/\.scr/, '.png'), 'image/png');
  }
};

async function loadSCR(f, ctx) {
  blink.stop();
  filename = f;
  const buffer = await load(`./screens/${f}`);
  pixelsForSCR(buffer, ctx);
  blink = loadBlinkAttributes(buffer, ctx);
  blink.start();
}

async function render() {
  const c = document.createElement('div');
  document.body.appendChild(c);
  c.className = 'flex';
  c.style.alignItems = 'center';

  const list = document.createElement('ul');
  c.appendChild(list);
  list.style.fontSize = '1.4rem';
  list.style.flexGrow = '1';
  list.style.whiteSpace = 'nowrap';
  list.style.marginRight = '20px';
  list.style.listStyle = 'initial';
  list.style.paddingLeft = '2rem';
  list.style.lineHeight = '2rem';
  list.style.overflow = 'auto';

  list.innerHTML = screens
    .map(
      _ =>
        `<li><a href="/screens/${_}" data-name="${_}">${_.toLowerCase().replace(
          /\.scr/,
          ''
        )}</a></li>`
    )
    .join('\n');

  const canvas = document.createElement('canvas');
  c.appendChild(canvas);
  canvas.width = 256;
  canvas.height = 192;
  canvas.className = 'artwork';
  canvas.style.height = '100%';
  ctx = canvas.getContext('2d');

  list.onclick = e => {
    e.preventDefault();
    if (e.target.nodeName === 'A') loadSCR(e.target.dataset.name, ctx);
  };

  loadSCR(screens[0], ctx);
}

render('./screens/Batman-TheCapedCrusader.scr');
