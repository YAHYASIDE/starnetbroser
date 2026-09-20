package com.starnetbroser.localbrowser;

import androidx.annotation.NonNull;
import java.util.regex.Pattern;

/**
 * Maps a STAR NET account.id to the WebView profile name that stores that
 * account's isolated cookies/localStorage/login state. The mapping must be
 * a pure, deterministic function of accountId alone: the same account
 * always resolves to the same on-disk profile (so a login survives the
 * account browser closing, the app closing, and a phone reboot - see
 * AccountBrowserActivity), and it must never collide with
 * androidx.webkit.Profile.DEFAULT_PROFILE_NAME, which would silently put
 * an account back into the shared/default session.
 */
public final class ProfileNaming {

    /** Mirrors androidx.webkit.Profile.DEFAULT_PROFILE_NAME without requiring that class at test time. */
    public static final String DEFAULT_PROFILE_NAME = "Default";

    private static final String PROFILE_PREFIX = "starnet_account_";
    private static final Pattern UNSAFE_CHARS = Pattern.compile("[^A-Za-z0-9_-]");

    private ProfileNaming() {
    }

    /**
     * @throws IllegalArgumentException if accountId is null/blank.
     * @throws IllegalStateException if the computed name would collide with the shared default
     *         profile (defensive - PROFILE_PREFIX makes this unreachable today, but a shared
     *         session must never happen silently even if that prefix changes carelessly later).
     */
    @NonNull
    public static String profileNameFor(@NonNull String accountId) {
        if (accountId == null || accountId.trim().isEmpty()) {
            throw new IllegalArgumentException("accountId must not be blank");
        }
        String sanitized = UNSAFE_CHARS.matcher(accountId.trim()).replaceAll("_");
        String profileName = PROFILE_PREFIX + sanitized;
        if (profileName.equals(DEFAULT_PROFILE_NAME)) {
            throw new IllegalStateException("Computed profile name must never equal the shared default profile");
        }
        return profileName;
    }
}
