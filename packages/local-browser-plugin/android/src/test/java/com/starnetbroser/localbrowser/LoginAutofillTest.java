package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class LoginAutofillTest {

    @Test
    public void nothingToFillMeansNoScript() {
        assertNull(LoginAutofill.script(null, null));
        assertNull(LoginAutofill.script("  ", ""));
    }

    @Test
    public void embedsTheValuesAsEscapedLiterals() {
        String script = LoginAutofill.script(" a@b.com ", "Pa\"ss</script>");
        assertTrue(script.endsWith("})(\"a@b.com\",\"Pa\\\"ss\\u003c/script\\u003e\");"));
        assertEquals("\"line\\nbreak\\u2028\"", LoginAutofill.literal("line\nbreak "));
    }

    @Test
    public void emailOnlyStillFills() {
        assertTrue(LoginAutofill.script("a@b.com", null).endsWith("(\"a@b.com\",\"\");"));
    }
}
