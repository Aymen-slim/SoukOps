"use client";

export interface PreparedUploadImage {
  base64: string;
  mediaExt: "jpg" | "png" | "webp";
  previewUrl: string;
}

function readRawBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function rawExtOf(file: File): "jpg" | "png" | "webp" {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "png" || ext === "webp") return ext;
  return "jpg";
}

/**
 * Downscales large camera photos on the client (<= 1280px JPEG) before base64
 * encoding so /preview and /confirm receive ~150KB instead of 5–10MB, while
 * returning an instant local blob URL for 0ms UI feedback.
 */
export async function prepareImageForUpload(file: File, maxEdge = 1280): Promise<PreparedUploadImage> {
  const previewUrl = URL.createObjectURL(file);

  // Small files (including synthetic test fixtures) pass straight through untouched.
  if (typeof document === "undefined" || file.size <= 320_000) {
    return {
      base64: await readRawBase64(file),
      mediaExt: rawExtOf(file),
      previewUrl,
    };
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return { base64: await readRawBase64(file), mediaExt: rawExtOf(file), previewUrl };
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const dataUrl = canvas.toDataURL("image/jpeg", 0.86);
    const comma = dataUrl.indexOf(",");
    const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
    return {
      base64,
      mediaExt: "jpg",
      previewUrl,
    };
  } catch {
    return {
      base64: await readRawBase64(file),
      mediaExt: rawExtOf(file),
      previewUrl,
    };
  }
}

