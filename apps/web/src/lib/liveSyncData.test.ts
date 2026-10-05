import { describe, expect, it } from "vitest";
import { BASELINE, buildSide, EMPTY_TRACK, mergeIncoming, sameSide, trackLocal, type LocalView, type TrackState } from "./liveSyncData";

const T0 = "2026-10-05T09:00:00.000Z";
const T1 = "2026-10-05T10:00:00.000Z";
const T2 = "2026-10-05T10:05:00.000Z";
const T3 = "2026-10-05T10:10:00.000Z";

/** A phone whose link was switched on at T0 with `start`, and has been ticking since. */
const started = (start: LocalView): TrackState => trackLocal(EMPTY_TRACK, start, T0);

describe("☁️ live sync of a rep's customers", () => {
  it("a customer the rep adds and links (after the link is on) reaches the operator", () => {
    const repState0 = started({ clients: {}, links: { d1: null } });
    const rep: LocalView = { clients: { c1: { name: "زبون جديد", phone: "000" } }, links: { d1: "c1" } };
    const side = buildSide(trackLocal(repState0, rep, T1), rep, T1);
    expect(side.clients.c1).toEqual({ name: "زبون جديد", phone: "000", at: T1 });
    expect(side.links.d1).toEqual({ clientId: "c1", at: T1 });

    const owner: LocalView = { clients: {}, links: { d1: null } };
    const merged = mergeIncoming(started(owner), owner, side, true);
    expect(merged.clients).toEqual({ c1: { name: "زبون جديد", phone: "000" } });
    expect(merged.links).toEqual({ d1: "c1" });
  });

  it("switching the link on: what the rep had linked offline reaches the operator, and an empty value never wipes a real one", () => {
    // The rep linked d1 to his customer before the link existed; the operator linked d2 himself.
    const rep: LocalView = { clients: { c1: { name: "زبون المندوب" } }, links: { d1: "c1", d2: null } };
    const owner: LocalView = { clients: { c9: { name: "زبون المسؤول" } }, links: { d1: null, d2: "c9" } };
    const repState = started(rep);
    const ownerState = started(owner);
    expect(repState.links.d1!.at).toBe(BASELINE);

    const atOwner = mergeIncoming(ownerState, owner, buildSide(repState, rep, T0), true);
    expect(atOwner.links).toEqual({ d1: "c1" });
    expect(atOwner.clients).toEqual({ c1: { name: "زبون المندوب" } });
    const atRep = mergeIncoming(repState, rep, buildSide(ownerState, owner, T0), false);
    expect(atRep.links).toEqual({ d2: "c9" });
  });

  it("switching the link on with two different real customers on one device: the rep's wins", () => {
    const rep: LocalView = { clients: {}, links: { d1: "rep-c" } };
    const owner: LocalView = { clients: {}, links: { d1: "owner-c" } };
    expect(mergeIncoming(started(owner), owner, buildSide(started(rep), rep, T0), true).links).toEqual({ d1: "rep-c" });
    expect(mergeIncoming(started(rep), rep, buildSide(started(owner), owner, T0), false).links).toEqual({});
  });

  it("what was taken in is not news again and is not echoed back as a change", () => {
    const rep: LocalView = { clients: { c1: { name: "أ" } }, links: { d1: "c1" } };
    const side = buildSide(trackLocal(started({ clients: {}, links: { d1: null } }), rep, T1), rep, T1);
    const owner: LocalView = { clients: {}, links: { d1: null } };
    const first = mergeIncoming(started(owner), owner, side, true);
    const ownerAfter: LocalView = { clients: { c1: { name: "أ" } }, links: { d1: "c1" } };
    const tracked = trackLocal(first.state, ownerAfter, T2);
    expect(tracked.links.d1!.at).toBe(T1);
    const again = mergeIncoming(tracked, ownerAfter, side, true);
    expect(again.clients).toEqual({});
    expect(again.links).toEqual({});
  });

  it("the operator renames a rep's customer: the rep's phone takes it", () => {
    const repLocal: LocalView = { clients: { c1: { name: "أ" } }, links: {} };
    const repState = mergeIncoming(started(repLocal), repLocal, { v: 1, clients: { c1: { name: "أ", at: BASELINE } }, links: {}, at: T0 }, false).state;
    const fromOwner = { v: 1 as const, clients: { c1: { name: "أ ب", at: T2 } }, links: {}, at: T2 };
    expect(mergeIncoming(repState, repLocal, fromOwner, false).clients).toEqual({ c1: { name: "أ ب" } });
  });

  it("both change the same device later: the rep wins on both phones, even against a newer change", () => {
    const base: LocalView = { clients: {}, links: { d1: "c1" } };
    const agreed = buildSide(started(base), base, T0);
    const repState0 = mergeIncoming(started(base), base, agreed, false).state;
    const ownerState0 = mergeIncoming(started(base), base, agreed, true).state;

    const repLocal: LocalView = { clients: {}, links: { d1: "c2" } };
    const repState = trackLocal(repState0, repLocal, T2);
    const ownerLocal: LocalView = { clients: {}, links: { d1: "c3" } };
    const ownerState = trackLocal(ownerState0, ownerLocal, T3);

    expect(mergeIncoming(repState, repLocal, buildSide(ownerState, ownerLocal, T3), false).links).toEqual({});
    expect(mergeIncoming(ownerState, ownerLocal, buildSide(repState, repLocal, T2), true).links).toEqual({ d1: "c2" });
  });

  it("only devices this phone has are linked; same content is not uploaded twice", () => {
    const incoming = { v: 1 as const, clients: {}, links: { other: { clientId: "c1", at: T1 } }, at: T1 };
    expect(mergeIncoming(EMPTY_TRACK, { clients: {}, links: {} }, incoming, true).links).toEqual({});
    const local: LocalView = { clients: { c1: { name: "أ" } }, links: { d1: "c1" } };
    const state = started(local);
    expect(sameSide(buildSide(state, local, T1), buildSide(state, local, T2))).toBe(true);
    expect(sameSide(null, buildSide(state, local, T1))).toBe(false);
  });
});
