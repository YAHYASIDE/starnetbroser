package com.starnetbroser.localbrowser;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * 🏦 Which phone notifications are the operator's bank / wallet apps (بنكيلي، سداد، نيتا، بينانس…),
 * kept for «حسابي» to suggest (never recorded by themselves). Every other app's notification is
 * dropped at once and never stored. The app is known by its package name, or - when the package
 * isn't one we know - by a title only these apps use. Reading the amounts is the web app's job
 * (bankNotices.ts); here we only keep the raw title / text. Pure Java (no android.*), JUnit-tested.
 */
final class BankNotice {

    private BankNotice() {}

    /** Package name fragments → the app. */
    private static final String[][] PACKAGES = {
        {"bankily", "bankily"},
        {"sedad", "sedad"},
        {"masrvi", "masrvi"},
        {"amanty", "amanty"},
        {"binance", "binance"},
        {"mynita", "nita"},
        {".nita", "nita"},
        {"nita.", "nita"},
        {"orangemoney", "orange"},
        {"orange.money", "orange"},
        {"orange.om", "orange"},
    };

    /** Titles seen only in these apps (real, from the operator's screenshots). */
    private static final String[][] TITLES = {
        {"gimtel envoie de l'argent", "bankily"},
        {"transfert d'argent", "bankily"},
        {"merpasscde", "bankily"},
        {"versement espèces", "bankily"},
        {"envoi", "sedad"},
        {"paiement_credit", "sedad"},
        {"compte à compte", "nita"},
        {"usdt deposit", "binance"},
    };

    private static final Pattern DIGIT = Pattern.compile("\\d");

    /** Invisible direction marks phones put around Arabic text and numbers («\u200eENVOI») - a title
     * carrying one matched nothing (Sedad, Oct 10 2026). */
    private static final Pattern BIDI = Pattern.compile("[\u200B-\u200F\u202A-\u202E\u2066-\u2069\u061C\uFEFF]");

    /** An amount of money in a wallet's words: «3600.0 أوقية», «500 MRU», «5000.0 F CFA». */
    private static final Pattern MONEY = Pattern.compile("\\d[\\d.,\\s]*\\s*(أوقية|MRU\\b|F\\s?CFA|FCFA)", Pattern.CASE_INSENSITIVE);

    /** Chat / social apps: a message that mentions money is never a bank notice. */
    private static final String[] CHAT = {
        "whatsapp", "telegram", "facebook", "messenger", "instagram", "snapchat", "tiktok", "musically",
        "viber", "imo", "signal", "android.mms", "messaging", "gm", "mail", "email", "outlook", "twitter",
    };

    static String clean(String s) {
        return s == null ? "" : BIDI.matcher(s).replaceAll("");
    }

    /** "bankily" / "sedad" / "nita" / "binance" / "masrvi" / "amanty" / "orange", or null. */
    static String appKey(String packageName, String title) {
        String pkg = packageName == null ? "" : packageName.toLowerCase(Locale.ROOT);
        if (pkg.startsWith("com.starnetbroser")) return null;
        for (String[] p : PACKAGES) if (pkg.contains(p[0])) return p[1];
        // Phones write the apostrophe several ways («Transfert d’argent»).
        String t = clean(title).trim().toLowerCase(Locale.ROOT).replaceAll("[\u2019\u2018\u02bc`\u00b4]", "'");
        for (String[] p : TITLES) if (t.equals(p[0]) || t.startsWith(p[0] + " ")) return p[1];
        return null;
    }

    /** Kept when it's one of these apps and carries a figure (an amount); ads / reminders without
     * any number are dropped. An app we don't know (a wallet installed under another package name)
     * whose notice names an amount of money - «3600.0 أوقية» - is kept too as "other:<package>":
     * the web app reads Sedad's wording from it, or shows it as «لم يُفهم» with the package, so
     * nothing of his money is silently lost. Chat apps never. */
    static String keep(String packageName, String title, String text) {
        String all = clean(title) + " " + clean(text);
        String app = appKey(packageName, title);
        if (app != null) return DIGIT.matcher(all).find() ? app : null;
        String pkg = packageName == null ? "" : packageName.toLowerCase(Locale.ROOT);
        if (pkg.isEmpty() || pkg.startsWith("com.starnetbroser") || isChat(pkg)) return null;
        return MONEY.matcher(all).find() ? "other:" + packageName : null;
    }

    private static boolean isChat(String pkg) {
        for (String part : pkg.split("\\.")) for (String c : CHAT) if (part.equals(c)) return true;
        for (String c : CHAT) if (c.length() > 4 && pkg.contains(c)) return true;
        return false;
    }

    /** One id per posted notification: the same one seen again (re-posted, or found again among the
     * active ones) is stored once; the same text posted later is a new one. */
    static String id(String packageName, long postTime, String title, String text) {
        String content = (title == null ? "" : title) + "\n" + (text == null ? "" : text);
        return (packageName == null ? "" : packageName) + "|" + postTime + "|" + Integer.toHexString(content.hashCode());
    }
}
