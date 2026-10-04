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

    /** "bankily" / "sedad" / "nita" / "binance" / "masrvi" / "amanty" / "orange", or null. */
    static String appKey(String packageName, String title) {
        String pkg = packageName == null ? "" : packageName.toLowerCase(Locale.ROOT);
        if (pkg.startsWith("com.starnetbroser")) return null;
        for (String[] p : PACKAGES) if (pkg.contains(p[0])) return p[1];
        // Phones write the apostrophe several ways («Transfert d’argent»).
        String t = title == null ? "" : title.trim().toLowerCase(Locale.ROOT).replaceAll("[\u2019\u2018\u02bc`\u00b4]", "'");
        for (String[] p : TITLES) if (t.equals(p[0]) || t.startsWith(p[0] + " ")) return p[1];
        return null;
    }

    /** Kept when it's one of these apps and carries a figure (an amount); ads / reminders without
     * any number are dropped. */
    static String keep(String packageName, String title, String text) {
        String app = appKey(packageName, title);
        if (app == null) return null;
        String all = (title == null ? "" : title) + " " + (text == null ? "" : text);
        return DIGIT.matcher(all).find() ? app : null;
    }

    /** One id per posted notification: the same one seen again (re-posted, or found again among the
     * active ones) is stored once; the same text posted later is a new one. */
    static String id(String packageName, long postTime, String title, String text) {
        String content = (title == null ? "" : title) + "\n" + (text == null ? "" : text);
        return (packageName == null ? "" : packageName) + "|" + postTime + "|" + Integer.toHexString(content.hashCode());
    }
}
