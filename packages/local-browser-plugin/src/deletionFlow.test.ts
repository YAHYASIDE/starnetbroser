import { describe, expect, it, vi } from "vitest";
import { resolveAccountDeletion } from "./deletionFlow";

describe("resolveAccountDeletion", () => {
  it("deletes the account without touching the session when the user declines", async () => {
    const deleteSession = vi.fn().mockResolvedValue(true);
    const outcome = await resolveAccountDeletion({
      confirmSessionDelete: () => false,
      deleteSession,
    });

    expect(outcome).toEqual({ action: "deleteAccount", sessionDeleted: false });
    expect(deleteSession).not.toHaveBeenCalled();
  });

  it("deletes the account only after the session delete succeeds", async () => {
    const calls: string[] = [];
    const deleteSession = vi.fn().mockImplementation(async () => {
      calls.push("deleteSession");
      return true;
    });

    const outcome = await resolveAccountDeletion({
      confirmSessionDelete: () => {
        calls.push("confirm");
        return true;
      },
      deleteSession,
    });

    expect(outcome).toEqual({ action: "deleteAccount", sessionDeleted: true });
    // The session delete must run - and this function must see it succeed - before it ever
    // reports the account as safe to remove.
    expect(calls).toEqual(["confirm", "deleteSession"]);
  });

  it("keeps the account when the session delete fails - never claims success without confirmation", async () => {
    const deleteSession = vi.fn().mockResolvedValue(false);
    const outcome = await resolveAccountDeletion({
      confirmSessionDelete: () => true,
      deleteSession,
    });

    expect(outcome).toEqual({ action: "keepAccount", reason: "session-delete-failed" });
    expect(deleteSession).toHaveBeenCalledTimes(1);
  });
});
