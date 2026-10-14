package com.starnetbroser.localbrowser;

import androidx.core.content.FileProvider;

/**
 * 📷 Hands the camera app a place to save the proof photo taken from a device's browser
 * (AccountBrowserActivity's file chooser). Its own class so it never clashes with the app's
 * FileProvider; it only shares the cache folder DIR (res/xml/starnet_capture_paths.xml).
 */
public class CaptureFileProvider extends FileProvider {

    public static final String DIR = "starnet_capture";
    /** Appended to the app's package name (the manifest's ${applicationId}). */
    public static final String AUTHORITY_SUFFIX = ".starnet.capture";
}
