const fs = require('fs');
const { TextDecoder, TextEncoder } = require('util');

const png = fs.readFileSync('./example.png', { encoding: 'latin1' });
const index = fs.readFileSync('./start.html');

const asHex = length => length.toString(16).padStart(4, '0');
const prefix = `<script hidden type="binary" data-filename="example.png" data-length="0x${asHex(
  png.length
)}" data-offset="0x`;
const leader = Buffer.from(
  `${prefix}${asHex(prefix.length + 6 + index.length)}">`
);

const tail = '</script><pre>' + png.slice(0, 10);

const totalLength = index.length + leader.length + png.length + tail.length;

// Prints: 42
console.log(png.slice(0, 10));
// console.log(encoder.encode(decoder.decode(png)).slice(0, 10));

const buffer = [index, leader, png, tail].join('');

fs.writeFileSync('./index.html', buffer, 'utf8');
