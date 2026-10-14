package com.starnetbroser.localbrowser;

import java.util.Locale;

/**
 * 📷 Starlink's identity check («التقاط صورة» / uploading a proof) inside a device's browser:
 * decides what the page may get. Only the camera - never the microphone - and only while the
 * visible page is Starlink's own (its verification step may sit in a frame of another HTTPS site,
 * so the frame's origin only has to be HTTPS). Pure Java so it is tested without Android.
 */
public final class CameraAccess {

    /** PermissionRequest.RESOURCE_VIDEO_CAPTURE (the same string, kept here so this stays pure). */
    public static final String VIDEO_CAPTURE = "android.webkit.resource.VIDEO_CAPTURE";

    private static final String[] NONE = new String[0];

    private CameraAccess() {
    }

    /** What to grant a page's camera/microphone request: the camera alone, or nothing. */
    public static String[] grantFor(String pageUrl, String origin, String[] resources) {
        if (!AllowedUrl.isAllowed(pageUrl) || origin == null || !origin.toLowerCase(Locale.ROOT).startsWith("https://")) {
            return NONE;
        }
        if (resources == null) {
            return NONE;
        }
        for (String resource : resources) {
            if (VIDEO_CAPTURE.equals(resource)) {
                return new String[] { VIDEO_CAPTURE };
            }
        }
        return NONE;
    }

    /** Whether a file input takes photos, so «الكاميرا» is offered beside the gallery/files. */
    public static boolean acceptsImages(String[] acceptTypes) {
        if (acceptTypes == null || acceptTypes.length == 0) {
            return true;
        }
        for (String raw : acceptTypes) {
            if (raw == null) continue;
            for (String part : raw.split(",")) {
                String type = part.trim().toLowerCase(Locale.ROOT);
                if (type.isEmpty() || type.equals("*/*") || type.equals("*") || type.startsWith("image/")) {
                    return true;
                }
                if (type.equals(".jpg") || type.equals(".jpeg") || type.equals(".png") || type.equals(".heic") || type.equals(".webp")) {
                    return true;
                }
            }
        }
        return false;
    }
}
