"use client";

import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { isRunningInAndroidApp } from "./localBrowser";
import { buildPrintableHtml, loadBusinessProfile, type PrintableDocument } from "./pdfDocument";
import type { PdfResult } from "./pdfExport";
import { buildStatementHtml, IMAGE_STATEMENT_ROWS, StatementData } from "./statementDocument";

/** Phone-shaped page width; drawn at 3x so the picture stays sharp when zoomed in WhatsApp. */
const IMAGE_WIDTH_PX = 600;
const IMAGE_PIXEL_RATIO = 3;

/**
 * The statement as a shareable picture (invoice style, last operations only): rendered off-screen
 * with the WebView's own text engine (Arabic shaping exactly as the app shows it), then sent to
 * the Android share sheet (WhatsApp...) or downloaded on the web.
 */
export async function exportStatementImage(data: StatementData): Promise<PdfResult> {
  const host = document.createElement("div");
  try {
    const { toCanvas } = await import("html-to-image");
    const now = new Date();
    const generatedAt = `${now.toISOString().slice(0, 10)} ${now.toTimeString().slice(0, 5)}`;
    host.style.cssText = "position:fixed;left:-10000px;top:0;z-index:-1;background:#fff";
    host.innerHTML = buildStatementHtml(data, loadBusinessProfile(), generatedAt, {
      width: IMAGE_WIDTH_PX,
      maxRows: IMAGE_STATEMENT_ROWS,
    });
    document.body.appendChild(host);
    const canvas = await toCanvas(host.firstElementChild as HTMLElement, { pixelRatio: IMAGE_PIXEL_RATIO, backgroundColor: "#ffffff" });
    const dataUrl = canvas.toDataURL("image/png");
    const fileName = `starnet-statement-${now.toISOString().slice(0, 10)}-${now.toTimeString().slice(0, 5).replace(":", "")}.png`;
    if (!isRunningInAndroidApp()) {
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = fileName;
      link.click();
      return { ok: true };
    }
    const written = await Filesystem.writeFile({ path: fileName, data: dataUrl.split(",")[1] ?? "", directory: Directory.Cache });
    await Share.share({ title: data.isClient ? "كشف حساب زبون" : "كشف حساب مورد", files: [written.uri] });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "تعذر إنشاء الصورة" };
  } finally {
    host.remove();
  }
}

/** Any printable document (a transfer receipt…) as one picture, to the share sheet. */
export async function exportPrintableImage(doc: PrintableDocument, fileKind = "receipt"): Promise<PdfResult> {
  const host = document.createElement("div");
  try {
    const { toCanvas } = await import("html-to-image");
    const now = new Date();
    const generatedAt = `${now.toISOString().slice(0, 10)} ${now.toTimeString().slice(0, 5)}`;
    host.style.cssText = "position:fixed;left:-10000px;top:0;z-index:-1;background:#fff";
    host.innerHTML = buildPrintableHtml(doc, loadBusinessProfile(), generatedAt);
    document.body.appendChild(host);
    const canvas = await toCanvas(host.firstElementChild as HTMLElement, { pixelRatio: 2, backgroundColor: "#ffffff" });
    const dataUrl = canvas.toDataURL("image/png");
    const fileName = `starnet-${fileKind}-${now.toISOString().slice(0, 10)}-${now.toTimeString().slice(0, 5).replace(":", "")}.png`;
    if (!isRunningInAndroidApp()) {
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = fileName;
      link.click();
      return { ok: true };
    }
    const written = await Filesystem.writeFile({ path: fileName, data: dataUrl.split(",")[1] ?? "", directory: Directory.Cache });
    await Share.share({ title: doc.title, files: [written.uri] });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "تعذر إنشاء الصورة" };
  } finally {
    host.remove();
  }
}

