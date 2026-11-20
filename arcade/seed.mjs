export const validFlightSeed = (seed) => typeof seed === 'string' && /^[a-f0-9]{32}$/.test(seed);

export function flightRandom(seed) {
  const words = validFlightSeed(seed) ? seed.match(/.{8}/g).map((word) => Number.parseInt(word, 16)) : [0, 0, 0, 1];
  let [a, b, c, d] = words;
  // Small Fast Counter preserves all four seed words. Only the simulation uses it.
  return () => {
    const value = (a + b + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (((c << 21) | (c >>> 11)) + value) | 0;
    return (value >>> 0) / 4294967296;
  };
}
