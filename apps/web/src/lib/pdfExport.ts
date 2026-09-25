"use client";

import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { isRunningInAndroidApp } from "./localBrowser";
import { buildPrintableHtml, loadBusinessProfile, pdfFileName, PrintableDocument } from "./pdfDocument";

export type PdfResult = { ok: true } | { ok: false; message: string };

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

/**
 * Renders a PrintableDocument off-screen, rasterises it with the browser's own text engine (so
 * Arabic shaping and RTL are exactly what the WebView shows - no PDF font embedding needed), and
 * slices it into A4 pages. On Android the PDF goes through the native share sheet (WhatsApp,
 * Drive, print...); on web it's a normal download.
 */
export async function exportPrintablePdf(doc: PrintableDocument): Promise<PdfResult> {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  const now = new Date();
  const generatedAt = `${now.toISOString().slice(0, 10)} ${now.toTimeString().slice(0, 5)}`;
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;z-index:-1;background:#fff";
  host.innerHTML = buildPrintableHtml(doc, loadBusinessProfile(), generatedAt);
  document.body.appendChild(host);
  try {
    const page = host.firstElementChild as HTMLElement;
    const canvas = await toCanvas(page, { pixelRatio: 2, backgroundColor: "#ffffff" });
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pxPerMm = canvas.width / A4_WIDTH_MM;
    const pageHeightPx = Math.floor(A4_HEIGHT_MM * pxPerMm);
    for (let offset = 0, index = 0; offset < canvas.height; offset += pageHeightPx, index += 1) {
      const sliceHeight = Math.min(pageHeightPx, canvas.height - offset);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = sliceHeight;
      slice.getContext("2d")!.drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
      if (index > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, A4_WIDTH_MM, sliceHeight / pxPerMm);
    }
    const fileName = pdfFileName(doc.title, `${now.toISOString().slice(0, 10)}-${now.toTimeString().slice(0, 5).replace(":", "")}`);
    if (!isRunningInAndroidApp()) {
      const url = URL.createObjectURL(pdf.output("blob"));
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return { ok: true };
    }
    const base64 = pdf.output("datauristring").split(",")[1] ?? "";
    const written = await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
    await Share.share({ title: doc.title, files: [written.uri] });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "تعذر إنشاء ملف PDF" };
  } finally {
    host.remove();
  }
}
