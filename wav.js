import { encode, toLittle } from './audio-consts.js';

function toUInt8(n, size) {
  if (size === 32) {
    return new Uint8Array(new Uint32Array([n]).buffer);
  }

  if (size === 16) {
    return new Uint8Array(new Uint16Array([n]).buffer);
  }
}

export function wavHeader({ length }) {
  const bitsPerSample = 16;
  const channels = 1;
  const sampleRate = 44100;

  return new Uint8Array([
    ...encode('RIFF'),
    '?', // int{4} wav_size
    ...encode('WAVE'),
    ...encode('fmt '),
    ...toLittle(toUInt8(16, 32)), // fmt_chunk_size; 16 for PCM
    ...toLittle(toUInt8(1)), // audio_format; 1 for PCM
    ...toLittle(new Uint8Array([0, 1])), // channels
    ...toLittle(new Uint8Array([0, 0, 0xac, 0x44])), // 44100hz as 32bit hex
    ...toLittle(new Uint8Array([0, 0, 0, 0])), // SampleRate * NumChannels * BitsPerSample/8
  ]);

  // 44100 * 1 *

  //     // RIFF Header
  //     char riff_header[4]; // Contains "RIFF"
  //     int wav_size; // Size of the wav portion of the file, which follows the first 8 bytes. File size - 8
  //     char wave_header[4]; // Contains "WAVE"

  //     // Format Header
  //     char fmt_header[4]; // Contains "fmt " (includes trailing space)
  //     int fmt_chunk_size; // Should be 16 for PCM
  //     short audio_format; // Should be 1 for PCM. 3 for IEEE Float
  //     short num_channels;
  //     int sample_rate;
  //     int byte_rate; // Number of bytes per second. sample_rate * num_channels * Bytes Per Sample
  //     short sample_alignment; // num_channels * Bytes Per Sample
  //     short bit_depth; // Number of bits per sample

  //     // Data
  //     char data_header[4]; // Contains "data"
  //     int data_bytes; // Number of bytes in data. Number of samples * num_channels * sample byte size

  // } wav_header;
}
export function bufferToWave({ buffer }) {}
