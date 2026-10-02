package com.starnetbroser.localbrowser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import org.junit.Test;

// Fake addresses and passwords only.
public class MsSignInTest {

    private static final String SHOP = "shop.codes@gmail.com";

    private static MsSignIn.State page(String heading, String[] options, String masked, boolean pw, boolean pwTyped, int fields, String value, boolean wrong) {
        return new MsSignIn.State(heading, Arrays.asList(options), masked, pw, pwTyped, fields, value, fields > 0 && !value.isEmpty(), wrong);
    }

    @Test
    public void readsThePagesStateFromTheScriptsJson() {
        String json = "\"{\\\"h\\\":[\\\"Sign in another way\\\"],\\\"o\\\":[\\\"Use your password\\\",\\\"Send a code to sh*****@gmail.com\\\"],"
            + "\\\"m\\\":\\\"sh*****@gmail.com\\\",\\\"pw\\\":0,\\\"pwv\\\":0,\\\"tn\\\":0,\\\"tv\\\":\\\"\\\",\\\"af\\\":0,\\\"w\\\":0}\"";
        MsSignIn.State s = MsSignIn.parse(json);
        assertNotNull(s);
        assertEquals(MsSignIn.Kind.WAYS, MsSignIn.kindOf(s));
        assertEquals(2, s.options.size());
        assertNull(MsSignIn.parse("null"));
        assertNull(MsSignIn.parse("\"not json\""));
    }

    @Test
    public void emailStepPressesNextOnceTheEmailIsTyped() {
        MsSignIn.State empty = page("Sign in", new String[] {"Next"}, "", false, false, 1, "", false);
        assertEquals(MsSignIn.Kind.EMAIL, MsSignIn.kindOf(empty));
        assertNull(MsSignIn.decide(empty, true, false, SHOP).click);
        MsSignIn.State typed = page("Sign in", new String[] {"Next"}, "", false, false, 1, "demo@outlook.com", false);
        assertEquals(MsSignIn.NEXT, MsSignIn.decide(typed, true, false, SHOP).click);
    }

    @Test
    public void theSignInRequestPageGoesToOtherWays() {
        MsSignIn.State s = page("Get a sign-in request", new String[] {"Other ways to sign in"}, "", false, false, 0, "", false);
        assertEquals(MsSignIn.Kind.REQUEST, MsSignIn.kindOf(s));
        assertEquals(MsSignIn.OTHER_WAYS, MsSignIn.decide(s, true, false, SHOP).click);
    }

    @Test
    public void anotherWayAlwaysTakesTheSavedPasswordFirst() {
        MsSignIn.State s = page("Sign in another way", new String[] {"Use your password", "Send a code to sh*****@gmail.com"}, "sh*****@gmail.com", false, false, 0, "", false);
        assertEquals(MsSignIn.USE_PASSWORD, MsSignIn.decide(s, true, false, SHOP).click);
    }

    @Test
    public void withoutAUsablePasswordTheCodeGoesToTheShopsGmailOnly() {
        MsSignIn.State shop = page("Sign in another way", new String[] {"Use your password", "Send a code to sh*****@gmail.com"}, "sh*****@gmail.com", false, false, 0, "", false);
        // The password was refused: the code option, since the masked address is the shop's Gmail.
        assertEquals("^Send a code to sh\\*\\*\\*\\*\\*@gmail\\.com$", MsSignIn.decide(shop, true, true, SHOP).click);
        // No password saved at all: the same.
        assertEquals("^Send a code to sh\\*\\*\\*\\*\\*@gmail\\.com$", MsSignIn.decide(shop, false, false, SHOP).click);
        // Another person's recovery address: nothing is pressed, the operator is told why.
        MsSignIn.State other = page("Sign in another way", new String[] {"Use your password", "Send a code to ab*****@gmail.com"}, "ab*****@gmail.com", false, false, 0, "", false);
        MsSignIn.Step step = MsSignIn.decide(other, true, true, SHOP);
        assertNull(step.click);
        assertTrue(step.stop.contains("غير صحيحة"));
        assertTrue(MsSignIn.decide(other, false, false, SHOP).stop.contains("لا «كود بريد»"));
    }

    @Test
    public void passwordStepTypesThenPressesNextAndNeverRetypesAWrongOne() {
        MsSignIn.State empty = page("Enter your password", new String[] {"Next", "Other ways to sign in"}, "", true, false, 0, "", false);
        assertEquals(MsSignIn.Kind.PASSWORD, MsSignIn.kindOf(empty));
        MsSignIn.Step fill = MsSignIn.decide(empty, true, false, SHOP);
        assertTrue(fill.fillPassword);
        assertNull(fill.click);
        MsSignIn.State typed = page("Enter your password", new String[] {"Next"}, "", true, true, 0, "", false);
        assertEquals(MsSignIn.NEXT, MsSignIn.decide(typed, true, false, SHOP).click);
        MsSignIn.State wrong = page("Enter your password", new String[] {"Next", "Other ways to sign in"}, "", true, false, 0, "", true);
        MsSignIn.Step step = MsSignIn.decide(wrong, true, false, SHOP);
        assertTrue(step.passwordFailed);
        assertFalse(step.fillPassword);
        assertEquals(MsSignIn.OTHER_WAYS, step.click);
        MsSignIn.State wrongNoWay = page("Enter your password", new String[] {"Next"}, "", true, false, 0, "", true);
        assertNotNull(MsSignIn.decide(wrongNoWay, true, false, SHOP).stop);
        assertNotNull(MsSignIn.decide(empty, false, false, SHOP).stop);
    }

    @Test
    public void recoveryEmailPagesSendTheCodeOnceTheShopsGmailIsTyped() {
        MsSignIn.State verify = page("Verify your email", new String[] {"Send code"}, "sh*****@gmail.com", false, false, 1, "", false);
        assertEquals(MsSignIn.Kind.VERIFY, MsSignIn.kindOf(verify));
        assertNull(MsSignIn.decide(verify, true, false, SHOP).click);
        MsSignIn.State filled = page("Verify your email", new String[] {"Send code"}, "sh*****@gmail.com", false, false, 1, SHOP, false);
        assertTrue(MsSignIn.decide(filled, true, false, SHOP).click.startsWith(MsSignIn.SEND_CODE));
        // The device's own email there is wrong - wait for the recovery script to replace it.
        MsSignIn.State wrongValue = page("Verify your email", new String[] {"Send code"}, "", false, false, 1, "demo@outlook.com", false);
        assertNull(MsSignIn.decide(wrongValue, true, false, SHOP).click);
        MsSignIn.State add = page("Add an email address", new String[] {"Next"}, "", false, false, 1, SHOP, false);
        assertEquals(MsSignIn.Kind.ADD_EMAIL, MsSignIn.kindOf(add));
        assertEquals(MsSignIn.NEXT, MsSignIn.decide(add, true, false, SHOP).click);
    }

    @Test
    public void codeTermsAndStaySignedInPages() {
        MsSignIn.State code = page("Enter your code", new String[] {"Next"}, "", false, false, 1, "", false);
        assertEquals(MsSignIn.Kind.CODE, MsSignIn.kindOf(code));
        assertNull(MsSignIn.decide(code, true, false, SHOP).click);
        MsSignIn.State codeTyped = page("Enter your code", new String[] {"Next"}, "", false, false, 1, "123456", false);
        assertEquals(MsSignIn.CODE_NEXT, MsSignIn.decide(codeTyped, true, false, SHOP).click);
        MsSignIn.State terms = page("We're updating our terms", new String[] {"Next"}, "", false, false, 0, "", false);
        assertEquals(MsSignIn.TERMS_NEXT, MsSignIn.decide(terms, true, false, SHOP).click);
        MsSignIn.State stay = page("Stay signed in?", new String[] {"No", "Yes"}, "", false, false, 0, "", false);
        assertEquals(MsSignIn.YES, MsSignIn.decide(stay, true, false, SHOP).click);
    }

    @Test
    public void anUnknownPagePressesNothing() {
        MsSignIn.State s = page("Something new from Microsoft", new String[] {"Next", "Cancel"}, "", false, false, 0, "", false);
        assertEquals(MsSignIn.Kind.OTHER, MsSignIn.kindOf(s));
        MsSignIn.Step step = MsSignIn.decide(s, true, false, SHOP);
        assertNull(step.click);
        assertNull(step.stop);
    }

    @Test
    public void maskedAddressesAreComparedByTheirShownLettersAndDomain() {
        assertTrue(MsSignIn.maskedMatches("sh*****@gmail.com", SHOP));
        assertTrue(MsSignIn.maskedMatches("sh*****@g*****.com", SHOP));
        assertFalse(MsSignIn.maskedMatches("st*****@gmail.com", SHOP));
        assertFalse(MsSignIn.maskedMatches("sh*****@outlook.com", SHOP));
        assertFalse(MsSignIn.maskedMatches("sh*****@gmail.com", null));
        assertFalse(MsSignIn.maskedMatches(null, SHOP));
    }

    @Test
    public void theClickScriptEmbedsTheRegexAsAStringLiteral() {
        String script = MsSignIn.clickScript(MsSignIn.exact("Send a code to sh*****@gmail.com"));
        assertTrue(script.contains("new RegExp(src,'i')"));
        assertTrue(script.endsWith("(\"^Send a code to sh\\\\*\\\\*\\\\*\\\\*\\\\*@gmail\\\\.com$\")"));
        assertEquals("^a\\.b\\(c\\)\\|d$", MsSignIn.exact("a.b(c)|d"));
    }

    @Test
    public void theInboxCountsOnlyWhenRenderedNeverByItsUrlAlone() {
        // Real, confirmed: "/mail/" shows a moment before Microsoft's sign-in - the script, not the URL, decides.
        assertTrue(MsSignIn.INBOX_SCRIPT.contains("input[type=password],input[name=loginfmt]"));
        assertTrue(MsSignIn.INBOX_SCRIPT.contains("new mail"));
        assertEquals(MailUrl.SessionState.SIGNED_IN, MailUrl.sessionState("https://outlook.live.com/mail/0/?login_hint=demo%40outlook.com"));
    }

    @Test
    public void starlinksOwnStepsAfterwards() {
        assertEquals(StarlinkLoginWatch.NEXT, StarlinkLoginWatch.autoStep(new StarlinkLoginWatch.State("", false, false, "demo@outlook.com", true), "https://www.starlink.com/auth/login"));
        assertNull(StarlinkLoginWatch.autoStep(new StarlinkLoginWatch.State("", false, false, "", true), "https://www.starlink.com/auth/login"));
        assertEquals(StarlinkLoginWatch.SIGN_IN, StarlinkLoginWatch.autoStep(new StarlinkLoginWatch.State("secret-demo", true, false, "", false), "https://www.starlink.com/auth/login"));
        assertNull(StarlinkLoginWatch.autoStep(new StarlinkLoginWatch.State("secret-demo", true, true, "", false), "https://www.starlink.com/auth/login"));
        assertNull(StarlinkLoginWatch.autoStep(new StarlinkLoginWatch.State("", true, false, "", false), "https://www.starlink.com/auth/login"));
        assertNull(StarlinkLoginWatch.autoStep(new StarlinkLoginWatch.State("secret-demo", true, false, "", false), "https://www.starlink.com/account/home"));
        assertNull(StarlinkLoginWatch.autoStep(null, "https://www.starlink.com/auth/login"));
    }
}
