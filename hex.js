const source = '13 00 00 03 63 6F 6E 6E 65 63 74 34 20 20 72 00 00 00 00 80 BB 74 00 FF 21 BA C3 22 7B 5C 3E 02 CD 01 16 11 6E C3 01 0C 00 CD 3C 20 11 7A C3 01 40 00 CD 3C 20 C9 16 06 0C 43 4F 4E 4E 45 43 54 20 34 10 07 11 01 16 0A 0C 90 90 90 90 90 90 90 16 0B 0C 90 90 90 90 90 90 90 16 0C 0C 90 90 90 90 90 90 90 16 0D 0C 90 90 90 90 90 90 90 16 0E 0C 90 90 90 90 90 90 90 16 0F 0C 90 90 90 90 90 90 90 00 18 3C 7E 7E 3C 18 00 85'.split(
  ' '
);
const hex = source
  .map(_ =>
    parseInt(_)
      .toString(2)
      .padStart(8, '0')
  )
  .reduce(
    (acc, curr) => acc.concat(curr.split('').map(n => parseInt(n, 10))),
    []
  );

export default hex;
