function sleep(µ) {
  const start = performance.now();

  while (true) {
    const tock = performance.now();
    const res = tock - start;
    if (res >= µ / 1000) {
      return res;
    }
  }
}

async function test() {
  const time = await sleep(20);
  console.log(time);
}

test();
test();
test();
test();
test();
test();
test();
