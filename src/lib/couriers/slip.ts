import bwipjs from "bwip-js/node";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { formatMillimesForChat } from "@/lib/domain/pricing";

export interface SlipLine {
  name: string;
  quantity: number;
}

export interface SlipFields {
  orderId: string;
  shopName: string;
  customerName: string;
  phone: string;
  items: SlipLine[];
  totalMillimes: number;
  landmark: string | null;
  floor: string | null;
  driverNote: string | null;
  governorate: string | null;
  delegation: string | null;
  lat: number;
  lng: number;
}

/** Opens the buyer's confirmed pin in Google Maps when a driver scans the slip. */
export function deliverySlipQrPayload(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

export function slipPinError(lat: number | null | undefined, lng: number | null | undefined): string | null {
  if (typeof lat !== "number" || typeof lng !== "number" || Number.isNaN(lat) || Number.isNaN(lng)) {
    return "Confirm the buyer pin before printing a courier slip.";
  }
  return null;
}

function pdfSafe(text: string): string {
  return text.replace(/[^\u0009\u000A\u000D\u0020-\u007E\u00A0-\u00FF]/g, "?");
}

/** A6 courier slip. The QR is a Maps link to the pin the buyer dropped. */
export async function renderDeliverySlip(fields: SlipFields): Promise<Buffer> {
  const pinError = slipPinError(fields.lat, fields.lng);
  if (pinError) throw new Error(pinError);
  const payload = deliverySlipQrPayload(fields.lat, fields.lng);
  const pdf = await PDFDocument.create();
  pdf.setSubject(payload);
  pdf.setTitle(`Delivery ${fields.orderId}`);
  const page = pdf.addPage([298, 420]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const height = 420;
  const code = fields.orderId.replace(/-/g, "").slice(0, 12).toUpperCase();

  const barcodePng = await bwipjs.toBuffer({
    bcid: "code128",
    text: code,
    scale: 2,
    height: 12,
    includetext: false,
    backgroundcolor: "FFFFFF",
  });
  const bar = await pdf.embedPng(barcodePng);
  const barWidth = 180;
  const barHeight = (bar.height / bar.width) * barWidth;
  const qrPng = await QRCode.toBuffer(payload, { type: "png", margin: 0, width: 180 });
  const qr = await pdf.embedPng(qrPng);

  page.drawRectangle({ x: 0, y: height - 52, width: 298, height: 52, color: rgb(0.5, 0.34, 0.85) });
  page.drawText(pdfSafe(fields.shopName).slice(0, 28), {
    x: 16,
    y: height - 22,
    size: 9,
    font,
    color: rgb(0.93, 0.9, 1),
  });
  page.drawText("COURIER SLIP", { x: 16, y: height - 42, size: 16, font: bold, color: rgb(1, 1, 1) });

  page.drawImage(bar, { x: 16, y: height - 52 - 14 - barHeight, width: barWidth, height: barHeight });
  page.drawText(code, { x: 16, y: height - 52 - 28 - barHeight, size: 11, font: bold, color: rgb(0.1, 0.1, 0.1) });

  const itemLines = fields.items.slice(0, 4).map((item) => `Item: ${pdfSafe(item.name)} x${item.quantity}`);
  const lines = [
    ...itemLines,
    `Client: ${pdfSafe(fields.customerName || "Buyer")}`,
    fields.phone ? `Tel: ${pdfSafe(fields.phone)}` : null,
    fields.landmark ? `Landmark: ${pdfSafe(fields.landmark)}` : null,
    fields.floor ? `Floor: ${pdfSafe(fields.floor)}` : null,
    fields.driverNote ? `Note: ${pdfSafe(fields.driverNote)}` : null,
    `Lieu: ${pdfSafe(fields.governorate ?? "Tunisia")}${fields.delegation ? ` / ${pdfSafe(fields.delegation)}` : ""}`,
    `COD: ${formatMillimesForChat(fields.totalMillimes)}`,
    `GPS: ${fields.lat.toFixed(5)}, ${fields.lng.toFixed(5)}`,
  ].filter((line): line is string => Boolean(line));

  let y = height - 52 - 46 - barHeight;
  for (const line of lines) {
    page.drawText(line.slice(0, 42), { x: 16, y, size: 9, font, color: rgb(0.12, 0.12, 0.12) });
    y -= 13;
  }

  page.drawImage(qr, { x: 298 - 16 - 96, y: 28, width: 96, height: 96 });
  page.drawText("Scan to open the pin", { x: 16, y: 58, size: 8, font: bold, color: rgb(0.2, 0.16, 0.3) });
  page.drawText("Buyer location", { x: 16, y: 44, size: 8, font, color: rgb(0.35, 0.35, 0.35) });

  return Buffer.from(await pdf.save());
}

export async function mergeSlipPdfs(buffers: Buffer[]): Promise<Buffer> {
  const merged = await PDFDocument.create();
  for (const buffer of buffers) {
    const doc = await PDFDocument.load(buffer);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }
  return Buffer.from(await merged.save());
}
