package com.starnetbroser.localbrowser;

/** Something that fetches a Starlink two-step code in the background (Outlook page or Gmail). */
interface CodeSource {
    interface Listener {
        void onCode(String code);
        void onSignedOut();
        void onGiveUp();
    }

    void start();

    void stop();
}
