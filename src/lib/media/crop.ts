import sharp from "sharp";
import type { SamObject } from "@/lib/ai/sam";

/**
 * Turns a SAM mask into a white-background crop (Day 1 version for catalog
 * seeding; the disambiguation ladder and alpha refinements land Day 3).
 * The mask raster is box-sized per the SAM docs; if its size disagrees with
 * the box, it is resized to the box before use.
 */
export async function cropWithMask(image: Buffer, object: SamObject): Promise<Buffer> {
  const width = Math.max(1, object.box.right - object.box.left);
  const height = Math.max(1, object.box.bottom - object.box.top);
  const raster = Buffer.from(object.rasterBase64, "base64");

  const expected = object.mask.width * object.mask.height;
  let maskRaw: Buffer;
  if (raster.length === width * height && object.mask.width === width && object.mask.height === height) {
    maskRaw = raster;
  } else if (raster.length === expected) {
    maskRaw = await sharp(raster, { raw: { width: object.mask.width, height: object.mask.height, channels: 1 } })
      .resize(width, height)
      .raw()
      .toBuffer();
  } else {
    throw new Error(`SAM mask raster size mismatch: got ${raster.length}, box ${width}x${height}, mask ${object.mask.width}x${object.mask.height}`);
  }

  const boxImage = await sharp(image)
    .extract({ left: object.box.left, top: object.box.top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Apply the mask as the alpha channel, then flatten onto white.
  const rgba = Buffer.from(boxImage.data);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4 + 3] = maskRaw[i] > 0 ? 255 : 0;
  }
  return sharp(rgba, { raw: { width, height, channels: 4 } })
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer();
}

/** Simple box crop without a mask (smoke-test PNG, debugging). */
export async function cropToBox(image: Buffer, box: SamObject["box"]): Promise<Buffer> {
  const width = Math.max(1, box.right - box.left);
  const height = Math.max(1, box.bottom - box.top);
  return sharp(image).extract({ left: box.left, top: box.top, width, height }).png().toBuffer();
}
