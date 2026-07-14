import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import { preprocessPageImage } from "../imagePreprocessor";

/** A synthetic low-contrast, mid-gray page image (simulating a faint scan) with a darker "text" rectangle on it. */
async function buildFaintScanPng(): Promise<Buffer> {
  const canvas = createCanvas(40, 40);
  const context = canvas.getContext("2d");
  context.fillStyle = "rgb(180,180,180)";
  context.fillRect(0, 0, 40, 40);
  context.fillStyle = "rgb(120,120,120)";
  context.fillRect(10, 10, 20, 20);
  return canvas.encode("png");
}

export async function run(): Promise<void> {
  const inputPng = await buildFaintScanPng();
  const outputPng = await preprocessPageImage(inputPng);

  assert.ok(Buffer.isBuffer(outputPng));
  assert.ok(outputPng.length > 0);
  assert.notEqual(outputPng.equals(inputPng), true, "preprocessing must actually transform the image");
  console.log("PASS preprocessPageImage returns a transformed PNG buffer");

  {
    const decoded = await import("@napi-rs/canvas").then((mod) => mod.loadImage(outputPng));
    const canvas = createCanvas(decoded.width, decoded.height);
    const context = canvas.getContext("2d");
    context.drawImage(decoded, 0, 0);
    const { data } = context.getImageData(0, 0, decoded.width, decoded.height);
    const distinctValues = new Set<number>();
    for (let i = 0; i < data.length; i += 4) {
      distinctValues.add(data[i]);
    }
    assert.deepEqual([...distinctValues].sort((a, b) => a - b), [0, 255], "thresholding must produce a strictly binary (black/white) image");
  }
  console.log("PASS thresholding produces a binary black/white image");

  {
    const original = await buildFaintScanPng();
    const preprocessed = await preprocessPageImage(original);
    assert.ok(original.equals(await buildFaintScanPng()), "sanity: the fixture builder is deterministic");
    assert.notEqual(preprocessed.equals(original), true, "the input buffer's own bytes must be left untouched, a new buffer is returned");
  }
  console.log("PASS the original input buffer is never mutated");

  console.log("PASS imagePreprocessor.test.ts");
}

run();
