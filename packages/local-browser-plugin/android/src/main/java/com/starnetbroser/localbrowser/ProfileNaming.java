package com.starnetbroser.localbrowser;

import androidx.annotation.NonNull;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * Maps a STAR NET account.id to the WebView profile name that stores that
 * account's isolated cookies/localStorage/login state. The mapping must be
 * a pure, deterministic, collision-free function of accountId alone: the
 * same account always resolves to the same on-disk profile (so a login
 * survives the account browser closing, the app closing, and a phone
 * reboot - see AccountBrowserActivity), two different accounts must never
 * resolve to the same profile (that would silently merge their sessions),
 * and it must never collide with androidx.webkit.Profile.DEFAULT_PROFILE_NAME,
 * which would silently put an account back into the shared/default session.
 *
 * An earlier version built the name by replacing characters outside
 * [A-Za-z0-9_-] with "_", which is not collision-free: e.g. "acc/a" and
 * "acc?a" both sanitize to "acc_a", and non-Latin ids like "أحمد" and
 * "محمد" sanitize to the same run of underscores. Hashing the full,
 * UTF-8-encoded accountId with SHA-256 instead makes two distinct ids
 * resolving to the same profile name computationally infeasible, with no
 * dependency on what characters the id happens to contain.
 *
 * The hash input is accountId exactly as given - not a trimmed copy.
 * trim() is used only to decide whether accountId is blank; two ids that
 * differ solely in leading/trailing whitespace (e.g. "client" vs.
 * "client ") are, per spec, different ids and must map to different
 * profiles, not be silently treated as the same account.
 */
public final class ProfileNaming {

    /** Mirrors androidx.webkit.Profile.DEFAULT_PROFILE_NAME without requiring that class at test time. */
    public static final String DEFAULT_PROFILE_NAME = "Default";

    private static final String PROFILE_PREFIX = "starnet_account_";

    private ProfileNaming() {
    }

    /**
     * @throws IllegalArgumentException if accountId is null/blank.
     * @throws IllegalStateException if the computed name would collide with the shared default
     *         profile (defensive - a 64-hex-char SHA-256 suffix makes this unreachable today,
     *         but a shared session must never happen silently even if this changes later).
     */
    @NonNull
    public static String profileNameFor(@NonNull String accountId) {
        if (accountId == null || accountId.trim().isEmpty()) {
            throw new IllegalArgumentException("accountId must not be blank");
        }
        String profileName = PROFILE_PREFIX + sha256Hex(accountId);
        if (profileName.equals(DEFAULT_PROFILE_NAME)) {
            throw new IllegalStateException("Computed profile name must never equal the shared default profile");
        }
        return profileName;
    }

    private static String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is a mandatory algorithm on every Android/JVM implementation - this is
            // unreachable in practice, but MessageDigest#getInstance forces a checked exception.
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }
}
