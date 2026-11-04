import sharp from "sharp";
import type { SamBox, SamObject } from "@/lib/ai/sam";

/**
 * Clamps a SAM box to the image bounds (CODE_MAP gap: SAM bounds are treated
 * as original-image pixels; an out-of-range box makes sharp.extract throw).
 * Returns null when nothing of the box lies inside the image.
 */
export function clampBox(box: SamBox, imageWidth: number, imageHeight: number): SamBox | null {
  const left = Math.max(0, Math.min(Math.floor(box.left), imageWidth - 1));
  const top = Math.max(0, Math.min(Math.floor(box.top), imageHeight - 1));
  const right = Math.max(left + 1, Math.min(Math.ceil(box.right), imageWidth));
  const bottom = Math.max(top + 1, Math.min(Math.ceil(box.bottom), imageHeight));
  if (right <= left || bottom <= top) return null;
  return { left, top, right, bottom };
}

export async function imageSize(image: Buffer): Promise<{ width: number; height: number }> {
  const meta = await sharp(image).metadata();
  if (!meta.width || !meta.height) throw new Error("could not read image dimensions");
  return { width: meta.width, height: meta.height };
}

/**
 * Turns a SAM mask into a white-background crop. The mask raster is box-sized
 * per the SAM docs; if its size disagrees with the box, it is resized to the
 * box before use. The box is clamped to the image first (Day 3).
 */
export async function cropWithMask(image: Buffer, object: SamObject): Promise<Buffer> {
  const { width: imgW, height: imgH } = await imageSize(image);
  const clamped = clampBox(object.box, imgW, imgH);
  if (!clamped) throw new Error(`SAM box lies outside the image: ${JSON.stringify(object.box)}`);
  const width = Math.max(1, clamped.right - clamped.left);
  const height = Math.max(1, clamped.bottom - clamped.top);
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
    .extract({ left: clamped.left, top: clamped.top, width, height })
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

/** Grows a SAM box by `ratio` on each side (clamped to the image) so the box crop keeps the wearer/context instead of a tight cut-out. */
export function expandBox(box: SamBox, imageWidth: number, imageHeight: number, ratio = 0.08): SamBox {
  const padX = (box.right - box.left) * ratio;
  const padY = (box.bottom - box.top) * ratio;
  return (
    clampBox(
      { left: box.left - padX, top: box.top - padY, right: box.right + padX, bottom: box.bottom + padY },
      imageWidth,
      imageHeight,
    ) ?? box
  );
}

/** Simple box crop without a mask (smoke-test PNG, debugging). */
export async function cropToBox(image: Buffer, box: SamObject["box"]): Promise<Buffer> {
  const { width: imgW, height: imgH } = await imageSize(image);
  const clamped = clampBox(box, imgW, imgH);
  if (!clamped) throw new Error(`box lies outside the image: ${JSON.stringify(box)}`);
  const width = Math.max(1, clamped.right - clamped.left);
  const height = Math.max(1, clamped.bottom - clamped.top);
  return sharp(image).extract({ left: clamped.left, top: clamped.top, width, height }).png().toBuffer();
}

const OVERLAY_COLORS = ["#e11d48", "#2563eb", "#059669", "#d97706", "#7c3aed", "#0891b2"];

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Disambiguation ladder step (b): the buyer's screenshot with numbered boxes
 * drawn over each candidate garment, so a reply button "1/2/3" is unambiguous.
 */
export async function drawNumberedBoxes(image: Buffer, boxes: SamBox[]): Promise<Buffer> {
  const { width, height } = await imageSize(image);
  const stroke = Math.max(3, Math.round(width / 160));
  const badge = Math.max(28, Math.round(width / 22));
  const fontSize = Math.round(badge * 0.62);
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  ];
  boxes.forEach((raw, i) => {
    const box = clampBox(raw, width, height);
    if (!box) return;
    const color = OVERLAY_COLORS[i % OVERLAY_COLORS.length];
    const cx = Math.min(box.left + badge / 2, width - badge / 2);
    const cy = Math.min(box.top + badge / 2, height - badge / 2);
    parts.push(
      `<rect x="${box.left}" y="${box.top}" width="${box.right - box.left}" height="${box.bottom - box.top}" fill="none" stroke="${color}" stroke-width="${stroke}"/>`,
      `<circle cx="${cx}" cy="${cy}" r="${badge / 2}" fill="${color}"/>`,
      `<text x="${cx}" y="${cy}" font-family="sans-serif" font-size="${fontSize}" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${escapeXml(String(i + 1))}</text>`,
    );
  });
  parts.push("</svg>");
  return sharp(image)
    .composite([{ input: Buffer.from(parts.join("")), top: 0, left: 0 }])
    .png()
    .toBuffer();
}
