import Audio from './audio.js';
import Analyser from './analyser.js';
import canvas from './canvas.js';

const audio = (window.audio = new Audio());
audio.volume = 100;
const analyser = (window.analyser = new Analyser());
audio.start();
analyser.connect(audio);

canvas.connect(audio.node);
