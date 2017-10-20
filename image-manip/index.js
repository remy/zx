function getAssets() {
  return Array.from(
    document.querySelectorAll('script[hidden][type="binary"]')
  ).map(node => ({
    filename: node.dataset.filename,
    length: parseInt(node.dataset.length, 16),
    offset: parseInt(node.dataset.offset, 16),
    node,
  }));
}

function asHex(s) {
  return s.toString(16).padStart(2, '0');
}

function putImage(buffer, node) {
  const blob = new Blob([buffer], {
    type: 'image/png',
  });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  node.parentElement.replaceChild(img, node);
  Promise.resolve(() => URL.revokeObjectURL(url));
}

(async () => {
  const assets = getAssets()[0]; // for now there's just one

  const _buffer = new TextEncoder('utf-16be').encode(assets.node.innerHTML);

  console.log(_buffer[0]);
  console.log(Array.from(_buffer.slice(0, 10)).map(_ => asHex(_)));

  // const arrayBuffer = await (await fetch(
  //   window.location.toString()
  // )).arrayBuffer();

  const buffer = _buffer;
  // new Uint8Array(arrayBuffer).slice(
  //   assets.offset,
  //   assets.offset + assets.length
  // );

  // console.log(buffer.slice(0, 10));

  putImage(buffer, assets.node);
})();
