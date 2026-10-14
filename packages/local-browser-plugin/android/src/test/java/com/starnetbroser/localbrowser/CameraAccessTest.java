package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class CameraAccessTest {

    private static final String AUDIO = "android.webkit.resource.AUDIO_CAPTURE";
    private static final String[] CAMERA = { CameraAccess.VIDEO_CAPTURE };
    private static final String[] NONE = {};

    @Test
    public void grantsTheCameraOnStarlink() {
        assertArrayEquals(CAMERA, CameraAccess.grantFor("https://www.starlink.com/account/verify", "https://www.starlink.com/", CAMERA));
    }

    @Test
    public void grantsAVerificationFrameInsideStarlink() {
        assertArrayEquals(CAMERA, CameraAccess.grantFor("https://www.starlink.com/account", "https://verify.example.com/", CAMERA));
    }

    @Test
    public void neverGrantsTheMicrophone() {
        assertArrayEquals(CAMERA, CameraAccess.grantFor("https://www.starlink.com/", "https://www.starlink.com/", new String[] { AUDIO, CameraAccess.VIDEO_CAPTURE }));
        assertArrayEquals(NONE, CameraAccess.grantFor("https://www.starlink.com/", "https://www.starlink.com/", new String[] { AUDIO }));
    }

    @Test
    public void refusesOutsideStarlinkOrOverPlainHttp() {
        assertArrayEquals(NONE, CameraAccess.grantFor("https://evil.example.com/", "https://evil.example.com/", CAMERA));
        assertArrayEquals(NONE, CameraAccess.grantFor("https://www.starlink.com.evil.com/", "https://www.starlink.com.evil.com/", CAMERA));
        assertArrayEquals(NONE, CameraAccess.grantFor("https://www.starlink.com/", "http://www.starlink.com/", CAMERA));
        assertArrayEquals(NONE, CameraAccess.grantFor(null, "https://www.starlink.com/", CAMERA));
        assertArrayEquals(NONE, CameraAccess.grantFor("https://www.starlink.com/", null, CAMERA));
        assertArrayEquals(NONE, CameraAccess.grantFor("https://www.starlink.com/", "https://www.starlink.com/", null));
    }

    @Test
    public void offersTheCameraForImageInputs() {
        assertTrue(CameraAccess.acceptsImages(null));
        assertTrue(CameraAccess.acceptsImages(new String[] {}));
        assertTrue(CameraAccess.acceptsImages(new String[] { "" }));
        assertTrue(CameraAccess.acceptsImages(new String[] { "image/*" }));
        assertTrue(CameraAccess.acceptsImages(new String[] { "application/pdf,image/jpeg" }));
        assertTrue(CameraAccess.acceptsImages(new String[] { ".PDF", ".JPG" }));
        assertTrue(CameraAccess.acceptsImages(new String[] { "*/*" }));
    }

    @Test
    public void noCameraForNonImageInputs() {
        assertFalse(CameraAccess.acceptsImages(new String[] { "application/pdf" }));
        assertFalse(CameraAccess.acceptsImages(new String[] { ".csv", "text/plain" }));
    }
}
