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
 * Converts Float32Array audio stream to 16-bit little-endian PCM Base64 string.
 */
export function pcmToBase64(pcmData: Float32Array): string {
  const buffer = new ArrayBuffer(pcmData.length * 2);
  const view = new DataView(buffer);
  
  for (let i = 0; i < pcmData.length; i++) {
    const s = Math.max(-1, Math.min(1, pcmData[i]));
    const int16 = s < 0 ? s * 0x8000 : s * 0x7FFF;
    view.setInt16(i * 2, int16, true); // Little-endian
  }

  const bytes = new Uint8Array(buffer);
  const chars: string[] = [];
  const chunkSize = 0x8000; // 32KB chunks to prevent call stack overflow
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    chars.push(String.fromCharCode.apply(null, chunk as unknown as number[]));
  }
  return btoa(chars.join(''));
}

/**
 * Converts Base64 string from Gemini Live (24kHz 16-bit PCM) back to Float32Array.
 */
export function base64ToPcm(base64: string): Float32Array {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  
  const view = new DataView(buffer);
  const float32Array = new Float32Array(binary.length / 2);
  
  for (let i = 0; i < float32Array.length; i++) {
    const val = view.getInt16(i * 2, true); // Little-endian
    float32Array[i] = val < 0 ? val / 0x8000 : val / 0x7FFF;
  }
  
  return float32Array;
}
