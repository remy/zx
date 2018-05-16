export const SAMPLE_RATE = 44100;
export const T = 1 / 3500000; // pulse width (half a wave cycle) in ms @ 3.5Mhz

/**
 * notes
 * 440Hz = 1 tick every 2.2727ms
 * 855 * 2 * T = 1710 * T = ZERO bit sound = 0.489ms
 * 1.19047619ms ~ the 840Hz which should be equal to 2168 T (.619428571ms)
 * Pilot is 2168 T for a length of 8063, therefore: (8063 * 2168) * (1/3500000) = ~5 (5 seconds)
 */

export const asHz = pulse => 1 / (T * pulse);
export const toAngularFrequency = hz => hz * 2 * Math.PI;

// these are how high and low the pulse value goes in the audio buffer
// 1 and -1 being the extreme max
export const HIGH = 0.15;
export const LOW = -0.15;

// pulse lengths defined by ZX ROM documentation
export const PILOT = 2168;
export const PILOT_COUNT = 8063;
export const PILOT_DATA_COUNT = 3223;
export const ZERO = 855;
export const ONE = 2 * ZERO;
export const SYN_ON = 667;
export const SYN_OFF = 735;

/**
 * Returns XOR checksum for array
 * @param {Uint8Array} array
 */
export const calculateXORChecksum = array =>
  array.reduce((checksum, item) => checksum ^ item, 0);
