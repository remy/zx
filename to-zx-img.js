// via http://blog.ivank.net/floyd-steinberg-dithering-in-javascript.html
function floydSteinberg(
  sb,
  w,
  h // source buffer, width, height
) {
  for (var i = 0; i < h; i++)
    for (var j = 0; j < w; j++) {
      var ci = i * w + j; // current buffer index
      var cc = sb[ci]; // current color
      var rc = cc < 128 ? 0 : 255; // real (rounded) color
      var err = cc - rc; // error amount
      sb[ci] = rc; // saving real color
      if (j + 1 < w) sb[ci + 1] += (err * 7) >> 4; // if right neighbour exists
      if (i + 1 == h) continue; // if we are in the last line
      if (j > 0) sb[ci + w - 1] += (err * 3) >> 4; // bottom left neighbour
      sb[ci + w] += (err * 5) >> 4; // bottom neighbour
      if (j + 1 < w) sb[ci + w + 1] += (err * 1) >> 4; // bottom right neighbour
    }
}
