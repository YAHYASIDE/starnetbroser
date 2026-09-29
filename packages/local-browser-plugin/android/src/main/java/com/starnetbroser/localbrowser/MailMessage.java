package com.starnetbroser.localbrowser;

/** One message read from a Gmail inbox (GmailImap) - plain data, never logged. */
final class MailMessage {
    final String from;
    final String subject;
    /** Plain text of the body (HTML stripped), trimmed to a few thousand characters. */
    final String text;
    final long receivedAt;

    MailMessage(String from, String subject, String text, long receivedAt) {
        this.from = from == null ? "" : from;
        this.subject = subject == null ? "" : subject;
        this.text = text == null ? "" : text;
        this.receivedAt = receivedAt;
    }
}
