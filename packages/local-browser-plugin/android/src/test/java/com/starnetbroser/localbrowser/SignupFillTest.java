package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

// Fake values only.
public class SignupFillTest {

    @Test
    public void fillsMicrosoftsSignupWithWhatTheOperatorTyped() {
        String script = SignupFill.outlookScript("demo.new@outlook.com", "demo-pass-1", "أحمد", "ولد سالم");
        assertTrue(script.contains("\"demo.new@outlook.com\""));
        assertTrue(script.contains("\"demo-pass-1\""));
        assertTrue(script.contains("\"ولد سالم\""));
        // Never presses Microsoft's buttons (its human check is the operator's).
        assertFalse(script.contains(".click()"));
        assertNull(SignupFill.outlookScript(" ", "demo-pass-1", "a", "b"));
    }

    @Test
    public void fillsStarlinksActivationAndPressesOnlyContinue() {
        String script = SignupFill.starlinkScript("KIT00000DEMO1", "أحمد", "ولد سالم", "demo.new@outlook.com", "12345678");
        assertTrue(script.contains("\"KIT00000DEMO1\""));
        assertTrue(script.contains("متابعة"));
        assertTrue(script.contains("تفعيل خدمة"));
        assertTrue(script.contains("\"12345678\""));
        assertNull(SignupFill.starlinkScript("", "a", "b", "c", "d"));
    }

    @Test
    public void valuesCannotBreakOutOfTheScript() {
        String script = SignupFill.outlookScript("demo@outlook.com", "x\"</script><b>", "a", "b");
        assertFalse(script.contains("</script>"));
        assertTrue(script.contains("x\\\"\\u003c/script\\u003e"));
    }

    @Test
    public void knowsMicrosoftsSignupPages() {
        assertTrue(SignupFill.isSignupPage("https://signup.live.com/signup?lic=1"));
        assertFalse(SignupFill.isSignupPage("https://outlook.live.com/mail/0/"));
        assertFalse(SignupFill.isSignupPage("https://signup.example.com/"));
        assertFalse(SignupFill.isSignupPage(null));
    }
}
