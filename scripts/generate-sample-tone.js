const fs = require('fs');
const path = require('path');

// Generate a short silent WAV (16-bit PCM, 44.1kHz, mono) ~0.5s
const outDir = path.join(__dirname, '..', 'public', 'sounds');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'sample-tone.wav');

const sampleRate = 44100;
const durationSeconds = 0.5;
const numSamples = Math.floor(sampleRate * durationSeconds);
const byteRate = sampleRate * 2; // 16-bit mono
const blockAlign = 2;
const dataSize = numSamples * 2;
const fileSize = 44 + dataSize - 8;

const buf = Buffer.alloc(44 + dataSize);
// RIFF header
buf.write('RIFF', 0);
buf.writeUInt32LE(fileSize, 4);
buf.write('WAVE', 8);
// fmt chunk
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16); // fmt chunk size
buf.writeUInt16LE(1, 20); // PCM
buf.writeUInt16LE(1, 22); // channels
buf.writeUInt32LE(sampleRate, 24);
buf.writeUInt32LE(byteRate, 28);
buf.writeUInt16LE(blockAlign, 32);
buf.writeUInt16LE(16, 34); // bits per sample
// data chunk
buf.write('data', 36);
buf.writeUInt32LE(dataSize, 40);
// silence (already zeroed)

fs.writeFileSync(outPath, buf);
console.log('Generated sample tone at', outPath);
