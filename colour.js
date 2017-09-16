console.clear();

const $ = document.querySelector.bind(document);
const $$ = s => Array.from(document.querySelectorAll(s));

const ELEM = (type, props) => {
  const el = document.createElement(type);
  for (const prop in props) {
    el[prop] = props[prop];
  }
  return el
}


// https://en.m.wikipedia.org/wiki/ZX_Spectrum_graphic_modes#Color_palette
const raw = `0	000	#000000	#000000	black
1	001	#0000D7	#0000FF	blue
2	010	#D70000	#FF0000	red
3	011	#D700D7	#FF00FF	magenta
4	100	#00D700	#00FF00	green
5	101	#00D7D7	#00FFFF	cyan
6	110	#D7D700	#FFFF00	yellow
7	111	#D7D7D7	#FFFFFF	white`;

const settings = {
  ink: 0,
  paper: 7,
  bright: false,
  blink: false,
}

const picker = $('#picker');
const code = $('pre');
let ink = true;

$$('input[name="colourfor"]').forEach(e => {
  const isink = e.value === 'ink';
  e.onclick = () => {
    ink = isink;
  }
});

$$('input[type="checkbox"]').forEach(e => {
  e.onclick = () => {
    settings[e.name] = !settings[e.name];
    update();
  }
});

const map = raw.split('\n').map(line => {
  let [num, binary, hex, hexlight, name] = line.split('\t');
  num = parseInt(num, 10);

  const div = ELEM('div', { className: 'container', innerHTML: `<div class="name">${name}</div>` });

  const updateOnClick = bright => {
    settings[ink ? 'ink' : 'paper'] = num;
    settings.bright = bright;
    $('input[name="bright"]').checked = bright;
    update();
  }

  const a = ELEM('div', {
    className: 'dark',
    style: `background: ${hex}`,
    onclick: () => updateOnClick(false),
    innerHTML: hex,
  });

  const b = ELEM('div', {
    className: 'light',
    style: `background: ${hexlight}`,
    onclick: () => updateOnClick(true),
    innerHTML: hexlight,
  });

  div.appendChild(a);
  div.appendChild(b);

  picker.appendChild(div);


  return {
    num, binary, hex, hexlight, name
  }
});

function update() {
  const binary = [
    settings.blink ? 1 : 0,
    settings.bright ? 1 : 0,
    settings.paper.toString(2).padStart(3, 0),
    settings.ink.toString(2).padStart(3, 0),
  ];

  const hex = '0x' + parseInt(binary.join(''), 2).toString(16);
  const dec = parseInt(binary.join(''), 2).toString(10);

  code.innerHTML = [
    binary.join(' '),
    hex,
    dec,
  ].join('\n');

  const ink = map[settings.ink];
  const paper = map[settings.paper];

  const background = settings.bright ? paper.hexlight : paper.hex;
  const color = settings.bright ? ink.hexlight : ink.hex;

  const style = `background: ${background}; color: ${color}`;
  console.log(style)
  code.style = style;

  code.className = `ink-${map[settings.ink].name} paper-${map[settings.paper].name}`
}
