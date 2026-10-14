package com.starnetbroser.localbrowser;

import android.content.Context;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * 💳 The operator's payment cards for filling Starlink's card form, as the app last sent them
 * (setFillCards): what the picker shows ("label") and what goes to the page ("payload", the card's
 * JSON). Kept on this phone only, never logged; the app is the source (its own store is backed up).
 */
final class CardFillStore {

    private CardFillStore() {}

    private static final String PREFS = "starnet_card_fill";
    private static final String KEY = "cards";

    static final class Card {
        final String label;
        final String payload;

        Card(String label, String payload) {
            this.label = label;
            this.payload = payload;
        }
    }

    static void save(Context context, JSONArray cards) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, cards == null ? "[]" : cards.toString()).commit();
    }

    static List<Card> cards(Context context) {
        List<Card> out = new ArrayList<>();
        try {
            JSONArray all = new JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]"));
            for (int i = 0; i < all.length(); i++) {
                JSONObject c = all.optJSONObject(i);
                if (c == null) continue;
                String label = c.optString("label", "");
                String payload = c.optString("payload", "");
                if (!label.isEmpty() && !payload.isEmpty()) out.add(new Card(label, payload));
            }
        } catch (JSONException ignored) {
            // nothing usable - no cards
        }
        return out;
    }
}
