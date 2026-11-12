import { NextResponse } from "next/server";

/**
 * Serves a deterministic, valid 2-second 8kHz mono PCM WAV audio note for sample
 * listings so <audio controls> plays cleanly without external network assets.
 */
function buildSampleWavBuffer(): Buffer {
  const sampleRate = 8000;
  const durationSeconds = 2;
  const numSamples = sampleRate * durationSeconds;
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(1, 22); // Mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34); // Bits per sample
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Subtle calm sine tone fading out cleanly
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.max(0, 1 - t / durationSeconds);
    const sample = Math.round(Math.sin(2 * Math.PI * 330 * t) * 1800 * envelope);
    buffer.writeInt16LE(sample, 44 + i * 2);
  }

  return buffer;
}

export async function GET() {
  const wav = buildSampleWavBuffer();
  return new NextResponse(new Uint8Array(wav), {
    status: 200,
    headers: {
      "Content-Type": "audio/wav",
      "Content-Length": String(wav.length),
      "Cache-Control": "public, max-age=86400",
    },
  });
}
