package com.starnetbroser.localbrowser;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Properties;
import javax.mail.AuthenticationFailedException;
import javax.mail.BodyPart;
import javax.mail.Folder;
import javax.mail.Message;
import javax.mail.Multipart;
import javax.mail.Part;
import javax.mail.Session;
import javax.mail.Store;
import javax.mail.internet.InternetAddress;

/**
 * Reads a Gmail inbox over IMAP (imap.gmail.com, SSL) with the account's «كلمة مرور التطبيق» -
 * the way Google allows mail apps to read Gmail (its sign-in page refuses in-app browsers).
 * Read-only: messages are only fetched, never changed. Blocking - call off the main thread.
 * Nothing here is logged.
 */
final class GmailImap {

    /** Google refused the email / app password. */
    static final class BadPassword extends Exception {
        BadPassword(Throwable cause) {
            super(cause);
        }
    }

    private GmailImap() {}

    /** The newest `limit` messages of the inbox, newest first. */
    static List<MailMessage> fetchRecent(String email, String appPassword, int limit) throws Exception {
        Properties props = new Properties();
        props.put("mail.store.protocol", "imaps");
        props.put("mail.imaps.host", "imap.gmail.com");
        props.put("mail.imaps.port", "993");
        props.put("mail.imaps.ssl.enable", "true");
        props.put("mail.imaps.ssl.checkserveridentity", "true");
        props.put("mail.imaps.connectiontimeout", "15000");
        props.put("mail.imaps.timeout", "20000");
        Session session = Session.getInstance(props);
        Store store = session.getStore("imaps");
        try {
            store.connect("imap.gmail.com", email.trim(), appPassword.replace(" ", ""));
        } catch (AuthenticationFailedException e) {
            throw new BadPassword(e);
        }
        try {
            Folder inbox = store.getFolder("INBOX");
            inbox.open(Folder.READ_ONLY);
            try {
                int count = inbox.getMessageCount();
                List<MailMessage> out = new ArrayList<>();
                if (count == 0) return out;
                Message[] messages = inbox.getMessages(Math.max(1, count - limit + 1), count);
                for (int i = messages.length - 1; i >= 0; i--) out.add(read(messages[i]));
                return out;
            } finally {
                inbox.close(false);
            }
        } finally {
            store.close();
        }
    }

    private static MailMessage read(Message m) throws Exception {
        String from = "";
        if (m.getFrom() != null && m.getFrom().length > 0) {
            if (m.getFrom()[0] instanceof InternetAddress) {
                InternetAddress a = (InternetAddress) m.getFrom()[0];
                from = a.getPersonal() != null && !a.getPersonal().isEmpty() ? a.getPersonal() : a.getAddress();
            } else {
                from = m.getFrom()[0].toString();
            }
        }
        Date when = m.getReceivedDate() != null ? m.getReceivedDate() : m.getSentDate();
        String text;
        try {
            text = textOf(m);
        } catch (Exception e) {
            text = "";
        }
        return new MailMessage(from, m.getSubject(), text, when != null ? when.getTime() : 0);
    }

    /** The body as text: text/plain when there is one, else the HTML part stripped. */
    private static String textOf(Part part) throws Exception {
        if (part.isMimeType("text/plain")) return MailMessages.tidy(String.valueOf(part.getContent()));
        if (part.isMimeType("text/html")) return MailMessages.htmlToText(String.valueOf(part.getContent()));
        if (part.isMimeType("multipart/*")) {
            Multipart multi = (Multipart) part.getContent();
            String html = null;
            for (int i = 0; i < multi.getCount(); i++) {
                BodyPart child = multi.getBodyPart(i);
                if (child.isMimeType("text/plain")) return MailMessages.tidy(String.valueOf(child.getContent()));
                if (html == null) {
                    String nested = textOf(child);
                    if (!nested.isEmpty()) html = nested;
                }
            }
            return html == null ? "" : html;
        }
        return "";
    }
}
