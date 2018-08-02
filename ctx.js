const ctx = new window.AudioContext();

export default ctx;

document.documentElement.addEventListener(
  'click',
  () => {
    ctx.resume();
  },
  true
);
