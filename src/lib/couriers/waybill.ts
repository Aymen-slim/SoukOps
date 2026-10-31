import bwipjs from "bwip-js/node";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { firewallChecked, formatMillimesForChat } from "@/lib/domain/pricing";
import { getServerEnv } from "@/lib/env";
import type { ParcelFields } from "./types";

/** Buyer chat line. The total, when present, is the stored order total and passes the firewall. */
export function buyerWaybillText(barcode: string, totalMillimes: number): string {
  const priced = `El envoi m3add. Code ${barcode}. Total: ${formatMillimesForChat(totalMillimes)}.`;
  return firewallChecked(priced, [totalMillimes]) ?? `El envoi m3add. Code ${barcode}.`;
}

export function waybillPrintUrl(barcode: string): string {
  const base = getServerEnv().APP_BASE_URL.replace(/\/$/, "");
  return `${base}/api/fd-mock/v2/waybill/${barcode}`;
}

function pdfSafe(text: string): string {
  return text.replace(/[^\u0009\u000A\u000D\u0020-\u007E\u00A0-\u00FF]/g, "?");
}

/** A6 label shared by the mock API and the browser agent: Code 128 + GPS QR. */
export async function renderWaybillPdf(parcel: ParcelFields, barcode: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([298, 420]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const height = 420;

  const barcodePng = await bwipjs.toBuffer({
    bcid: "code128",
    text: barcode,
    scale: 2,
    height: 12,
    includetext: false,
    backgroundcolor: "FFFFFF",
  });
  const bar = await pdf.embedPng(barcodePng);
  const barWidth = 220;
  const barHeight = (bar.height / bar.width) * barWidth;

  const geo = `geo:${parcel.lat.toFixed(6)},${parcel.lng.toFixed(6)}`;
  const qrPng = await QRCode.toBuffer(geo, { type: "png", margin: 0, width: 180 });
  const qr = await pdf.embedPng(qrPng);

  page.drawRectangle({ x: 0, y: height - 48, width: 298, height: 48, color: rgb(0.05, 0.28, 0.55) });
  page.drawText("FIRST DELIVERY", { x: 16, y: height - 22, size: 9, font, color: rgb(0.75, 0.86, 0.98) });
  page.drawText("BORDEREAU", { x: 16, y: height - 40, size: 16, font: bold, color: rgb(1, 1, 1) });

  page.drawImage(bar, { x: 16, y: height - 48 - 16 - barHeight, width: barWidth, height: barHeight });
  page.drawText(barcode, { x: 16, y: height - 48 - 32 - barHeight, size: 12, font: bold, color: rgb(0.1, 0.1, 0.1) });

  const lines = [
    `Désignation : ${pdfSafe(parcel.designation)}`,
    `Client : ${pdfSafe(parcel.clientName)}`,
    `Tél : ${parcel.phone}`,
    `Repère : ${pdfSafe(parcel.landmark)}`,
    parcel.floor ? `Étage : ${pdfSafe(parcel.floor)}` : null,
    parcel.driverNote ? `Note : ${pdfSafe(parcel.driverNote)}` : null,
    `Lieu : ${pdfSafe(parcel.governorate)}${parcel.delegation ? ` / ${pdfSafe(parcel.delegation)}` : ""}`,
    `locality_id : ${parcel.localityId}`,
    `Prix : ${formatMillimesForChat(parcel.prixMillimes)}`,
    `GPS : ${parcel.lat.toFixed(5)}, ${parcel.lng.toFixed(5)}`,
  ].filter((line): line is string => Boolean(line));

  let y = height - 48 - 52 - barHeight;
  for (const line of lines) {
    page.drawText(line.slice(0, 64), { x: 16, y, size: 9, font, color: rgb(0.12, 0.12, 0.12) });
    y -= 14;
  }

  page.drawImage(qr, { x: 298 - 16 - 96, y: 24, width: 96, height: 96 });
  page.drawText("QR GPS", { x: 16, y: 36, size: 8, font, color: rgb(0.35, 0.35, 0.35) });

  return Buffer.from(await pdf.save());
}
