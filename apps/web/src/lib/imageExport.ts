"use client";

import { Directory, Filesystem } from "@capacitor/filesystem";
import { LocalBrowser } from "@starnet/local-browser-plugin";
import { normalizePhoneForWhatsApp } from "./whatsapp";
import { Share } from "@capacitor/share";
import { isRunningInAndroidApp } from "./localBrowser";
import { buildPrintableHtml, loadBusinessProfile, type PrintableDocument } from "./pdfDocument";
import type { PdfResult } from "./pdfExport";
import { buildStatementHtml, IMAGE_STATEMENT_ROWS, sharpenForImage, StatementData } from "./statementDocument";

/** Phone-shaped page width; drawn at 3x so the picture stays sharp when zoomed in WhatsApp. */
// 720 (was 600) - with the device list gone, a picture of normal proportions, not a long strip (his Oct 29 2026 ask).
const IMAGE_WIDTH_PX = 720;
const IMAGE_PIXEL_RATIO = 3;

/**
 * The statement as a shareable picture (invoice style, last operations only): rendered off-screen
 * with the WebView's own text engine (Arabic shaping exactly as the app shows it), then sent to
 * the Android share sheet (WhatsApp...) or downloaded on the web.
 */
/** `phone`: the customer's saved number - the picture opens straight in his WhatsApp chat (his Nov 3 2026 ask). */
export async function exportStatementImage(data: StatementData, phone?: string): Promise<PdfResult> {
  const host = document.createElement("div");
  try {
    const { toCanvas } = await import("html-to-image");
    const now = new Date();
    const generatedAt = `${now.toISOString().slice(0, 10)} ${now.toTimeString().slice(0, 5)}`;
    host.style.cssText = "position:fixed;left:-10000px;top:0;z-index:-1;background:#fff";
    host.innerHTML = sharpenForImage(
      buildStatementHtml(data, loadBusinessProfile(), generatedAt, {
        width: IMAGE_WIDTH_PX,
        maxRows: IMAGE_STATEMENT_ROWS,
        hideDevices: true,
      }),
    );
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
    // 💬 his customer's own chat when his number is saved (WhatsAppShare.java), else the share list as before
    if (phone && normalizePhoneForWhatsApp(phone)) {
      try {
        await LocalBrowser.shareImageToWhatsApp({ base64: dataUrl.split(",")[1] ?? "", fileName, phone });
        return { ok: true };
      } catch {
        // an older app without it, or WhatsApp refused: the share list below
      }
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

