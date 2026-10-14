package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

// Fake values only.
public class StarlinkLoginWatchTest {

    @Test
    public void readsTheTypedPasswordAndTheWrongPasswordMessage() {
        StarlinkLoginWatch.State state = StarlinkLoginWatch.parse("\"{\\\"p\\\":\\\"demo-new-pass\\\",\\\"f\\\":1,\\\"w\\\":1}\"");
        assertEquals("demo-new-pass", state.password);
        assertTrue(state.hasPasswordField);
        assertTrue(state.wrongPassword);
        assertNull(StarlinkLoginWatch.parse("null"));
        assertNull(StarlinkLoginWatch.parse("not json"));
    }

    @Test
    public void onlyAnAccountPageCountsAsSignedIn() {
        assertTrue(StarlinkLoginWatch.isSignedInUrl("https://starlink.com/account/home"));
        assertFalse(StarlinkLoginWatch.isSignedInUrl("https://starlink.com/auth/login"));
        assertFalse(StarlinkLoginWatch.isSignedInUrl("https://starlink.com/account/login"));
        assertFalse(StarlinkLoginWatch.isSignedInUrl(null));
    }

    @Test
    public void keepsOnlyAPasswordThatIsNewForTheDevice() {
        assertTrue(StarlinkLoginWatch.isNewPassword("demo-new-pass", "demo-old-pass"));
        assertTrue(StarlinkLoginWatch.isNewPassword("demo-new-pass", null));
        assertFalse(StarlinkLoginWatch.isNewPassword("demo-old-pass", "demo-old-pass"));
        assertFalse(StarlinkLoginWatch.isNewPassword("", "demo-old-pass"));
        assertTrue(StarlinkLoginWatch.SCRIPT.contains("كلمة المرور غير صحيحة"));
    }
}
