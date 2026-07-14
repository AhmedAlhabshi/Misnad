import { createCanvas, loadImage } from "@napi-rs/canvas";

/**
 * Optional, deterministic image cleanup applied to a rendered page PNG before
 * OCR — grayscale, a linear contrast stretch, then a binary threshold. Uses
 * only `@napi-rs/canvas` (already a dependency for PDF rendering); no
 * separate image library, no Python/OpenCV. Pure pixel-buffer math, so it
 * never touches disk and adds no new dependency.
 */

export interface PreprocessOptions {
  /** 0-255 midpoint used by the binary threshold step. */
  thresholdLevel?: number;
}

const DEFAULT_THRESHOLD_LEVEL = 150;

/**
 * Converts RGBA pixel data to grayscale in place (luminance-weighted, per
 * ITU-R BT.601, the standard formula for perceived brightness), leaving
 * alpha untouched.
 */
function applyGrayscale(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = luminance;
    data[i + 1] = luminance;
    data[i + 2] = luminance;
  }
}

/**
 * Stretches the current min-max grayscale range out to the full 0-255 range —
 * a faint/low-contrast scan (common with phone-photographed or poorly-lit
 * scanned pages) gets its actual text-vs-background gap widened before
 * thresholding, without needing per-document tuning.
 */
function applyContrastStretch(data: Uint8ClampedArray): void {
  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const value = data[i];
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const range = max - min;
  if (range <= 0) return;
  for (let i = 0; i < data.length; i += 4) {
    const stretched = ((data[i] - min) / range) * 255;
    data[i] = stretched;
    data[i + 1] = stretched;
    data[i + 2] = stretched;
  }
}

/** Pushes every pixel to pure black or pure white — sharpens faint/anti-aliased text edges that a grayscale scan otherwise leaves as OCR-confusing mid-gray. */
function applyThreshold(data: Uint8ClampedArray, level: number): void {
  for (let i = 0; i < data.length; i += 4) {
    const value = data[i] >= level ? 255 : 0;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }
}

/**
 * Runs grayscale -> contrast stretch -> threshold on a rendered page PNG and
 * returns a new PNG buffer. The input buffer is never mutated; on any
 * decode/encode failure the caller's original image should be used instead
 * (this function is only ever an optional enhancement, never the sole path).
 */
export async function preprocessPageImage(png: Buffer, options: PreprocessOptions = {}): Promise<Buffer> {
  const thresholdLevel = options.thresholdLevel ?? DEFAULT_THRESHOLD_LEVEL;
  const image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);

  const imageData = context.getImageData(0, 0, image.width, image.height);
  applyGrayscale(imageData.data);
  applyContrastStretch(imageData.data);
  applyThreshold(imageData.data, thresholdLevel);
  context.putImageData(imageData, 0, 0);

  return canvas.encode("png");
}
