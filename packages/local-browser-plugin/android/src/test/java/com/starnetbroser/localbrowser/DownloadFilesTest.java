package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class DownloadFilesTest {

    @Test
    public void recognisesBlobAndDataLinks() {
        assertTrue(DownloadFiles.isBlob("blob:https://starlink.com/1234-abcd"));
        assertFalse(DownloadFiles.isBlob("https://starlink.com/invoice.pdf"));
        assertTrue(DownloadFiles.isDataUrl("data:application/pdf;base64,AAA"));
    }

    @Test
    public void splitsABase64DataUrl() {
        assertArrayEquals(new String[] {"application/pdf", "JVBERi0x"}, DownloadFiles.splitDataUrl("data:application/pdf;base64,JVBERi0x"));
        assertArrayEquals(new String[] {"application/octet-stream", "AA=="}, DownloadFiles.splitDataUrl("data:;base64,AA=="));
        assertArrayEquals(new String[] {"text/csv", "YQ=="}, DownloadFiles.splitDataUrl("data:text/csv;charset=utf-8;base64,YQ=="));
        assertNull(DownloadFiles.splitDataUrl("data:text/plain,hello"));
        assertNull(DownloadFiles.splitDataUrl("blob:x"));
    }

    @Test
    public void readsTheNameFromContentDisposition() {
        assertEquals("INV-1.pdf", DownloadFiles.nameFromDisposition("attachment; filename=\"INV-1.pdf\""));
        assertEquals("فاتورة 1.pdf", DownloadFiles.nameFromDisposition("attachment; filename*=UTF-8''%D9%81%D8%A7%D8%AA%D9%88%D8%B1%D8%A9%201.pdf"));
        assertNull(DownloadFiles.nameFromDisposition("inline"));
        assertNull(DownloadFiles.nameFromDisposition(null));
    }

    @Test
    public void makesASafeFileNameWithTheRightExtension() {
        assertEquals("INV-1.pdf", DownloadFiles.fileName("INV-1", "application/pdf", 5));
        assertEquals("INV-1.PDF", DownloadFiles.fileName("INV-1.PDF", "application/pdf", 5));
        assertEquals("evil.pdf", DownloadFiles.fileName("../../evil.pdf", "application/pdf", 5));
        assertEquals("a_b.pdf", DownloadFiles.fileName("a:b", "application/pdf", 5));
        assertEquals("starlink-5.pdf", DownloadFiles.fileName("  ", "application/pdf", 5));
        assertEquals("starlink-5", DownloadFiles.fileName(null, "application/zip", 5));
    }

    @Test
    public void escapesTheLinkInsideTheScript() {
        assertEquals("'a\\'b\\\\c\\n\\x3c/script>'", DownloadFiles.jsString("a'b\\c\n</script>"));
        String script = DownloadFiles.readBlobScript("blob:https://starlink.com/x'y", "f.pdf", "application/pdf");
        assertTrue(script.contains("'blob:https://starlink.com/x\\'y'"));
        assertTrue(script.contains("StarnetDownload.save"));
        assertTrue(script.contains("window.__starnetBlob"));
    }
}
