function BufferLoader(context, urlList, callback) {
  this.context = context;
  this.urlList = urlList;
  this.onload = callback;
  this.bufferList = new Array();
  this.loadCount = 0;
  this.load();
}

BufferLoader.prototype.loadBuffer = async function(url, index) {
  const loader = this;
  const res = await fetch(url);

  const buffer = await res.arrayBuffer();
  loader.context.decodeAudioData(
    buffer,
    buffer => {
      if (!buffer) {
        alert('error decoding file data: ' + url);
        return;
      }
      loader.bufferList[index] = buffer;
      if (++loader.loadCount === loader.urlList.length) {
        loader.onload(loader.bufferList);
      }
    },
    error => {
      console.error('decodeAudioData error', error);
    }
  );
};

BufferLoader.prototype.load = function() {
  for (let i = 0; i < this.urlList.length; ++i) {
    this.loadBuffer(this.urlList[i], i);
  }
};

export default BufferLoader;
