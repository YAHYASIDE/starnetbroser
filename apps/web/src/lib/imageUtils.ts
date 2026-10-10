/**
 * Client-side image resizing for store item photos - this app has no image-upload backend, so a
 * picked photo is downscaled and re-encoded as a small JPEG data URL and stored directly on the
 * item record (storeStore.ts's imageDataUrl). Browser-only (Image/canvas), so it isn't unit-tested
 * like the rest of the lib modules - same pattern as backupFile.ts's file-save helpers.
 */
export function resizeImageToDataUrl(file: File, maxDimension = 240, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("تعذرت قراءة ملف الصورة"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("تعذر تحميل الصورة"));
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("تعذر معالجة الصورة"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
