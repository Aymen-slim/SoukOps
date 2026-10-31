import sharp from "sharp";

/**
 * Near-uniform frames (a finger over the lens, a blank wall) have almost no
 * luminance variance. Real garments, even slightly soft, sit well above this.
 */
export const BLUR_VARIANCE_MIN = 12;

export async function luminanceVariance(image: Buffer): Promise<number> {
  const { data } = await sharp(image).greyscale().resize(64, 64, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const n = data.length || 1;
  let sum = 0;
  for (const v of data) sum += v;
  const mean = sum / n;
  let varSum = 0;
  for (const v of data) {
    const d = v - mean;
    varSum += d * d;
  }
  return varSum / n;
}

export async function isBlurry(image: Buffer): Promise<boolean> {
  return (await luminanceVariance(image)) < BLUR_VARIANCE_MIN;
}
