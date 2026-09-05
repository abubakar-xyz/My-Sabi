// Utility functions for audio conversion, resampling, and DSP analysis

/**
 * Downsamples / resamples audio from sourceSampleRate to targetSampleRate (e.g. 16000Hz).
 * Uses linear interpolation for clean, lightweight downsampling without heavy dependencies.
 */
export function resampleAudio(
  inputData: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number = 16000
): Float32Array {
  if (sourceSampleRate === targetSampleRate) {
    return inputData;
  }
  const ratio = sourceSampleRate / targetSampleRate;
  const newLength = Math.round(inputData.length / ratio);
  const result = new Float32Array(newLength);
  
  for (let i = 0; i < newLength; i++) {
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;
    const nextIndex = Math.min(index + 1, inputData.length - 1);
    result[i] = inputData[index] * (1 - fraction) + inputData[nextIndex] * fraction;
  }
  return result;
}

/**
 * Computes Root Mean Square (RMS) volume level normalized between 0 and 1.
 */
export function calculateRMS(data: Float32Array): number {
  if (!data || data.length === 0) return 0;
  let sum = 0;
  const step = Math.max(1, Math.floor(data.length / 256));
  let count = 0;
  
  for (let i = 0; i < data.length; i += step) {
    sum += data[i] * data[i];
    count++;
  }
  return Math.min(1, Math.sqrt(sum / count) * 3.5);
}

/**
 * Converts Float32Array audio stream directly to 16-bit little-endian PCM ArrayBuffer.
 */
export function float32ToInt16Buffer(pcmData: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(pcmData.length * 2);
  const view = new DataView(buffer);
  
  for (let i = 0; i < pcmData.length; i++) {
    const s = Math.max(-1, Math.min(1, pcmData[i]));
    const int16 = s < 0 ? s * 0x8000 : s * 0x7FFF;
    view.setInt16(i * 2, int16, true); // Little-endian
  }
  return buffer;
}

/**
 * Converts ArrayBuffer (16-bit little-endian PCM) from Gemini Live back to Float32Array.
 */
export function bufferToPcm(buffer: ArrayBuffer): Float32Array {
  const view = new DataView(buffer);
  const float32Array = new Float32Array(buffer.byteLength / 2);
  
  for (let i = 0; i < float32Array.length; i++) {
    const val = view.getInt16(i * 2, true); // Little-endian
    float32Array[i] = val < 0 ? val / 0x8000 : val / 0x7FFF;
  }
  return float32Array;
}
