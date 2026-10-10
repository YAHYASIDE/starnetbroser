import { describe, expect, it } from "vitest";
import { addClientNote, deleteClientNote, sortedClientNotes, togglePinClientNote } from "./clientNotes";

describe("client notes", () => {
  it("adds trimmed notes, pins, sorts and deletes", () => {
    let store = addClientNote({}, "c1", "  يتصل مساءً ", new Date("2026-09-01T10:00:00Z"));
    store = addClientNote(store, "c1", "يريد Mini", new Date("2026-09-02T10:00:00Z"));
    store = addClientNote(store, "c1", "   ");
    expect(store.c1!.map((n) => n.text)).toEqual(["يتصل مساءً", "يريد Mini"]);
    expect(sortedClientNotes(store.c1).map((n) => n.text)).toEqual(["يريد Mini", "يتصل مساءً"]);
    store = togglePinClientNote(store, "c1", store.c1![0]!.id);
    expect(sortedClientNotes(store.c1)[0]!.text).toBe("يتصل مساءً");
    store = deleteClientNote(store, "c1", store.c1![0]!.id);
    store = deleteClientNote(store, "c1", store.c1![0]!.id);
    expect(store.c1).toBeUndefined();
    expect(sortedClientNotes(undefined)).toEqual([]);
  });
});
