import type { StarlinkAccountSummary } from "@starnet/shared";

type Mark = Pick<StarlinkAccountSummary, "addedByRepId" | "addedByRepAt" | "addedAt">;

/**
 * «✕» on the card's «📱 أضافه …» chip (his Oct 2026 ask): the device stops showing who added it and
 * leaves the «📱 من المندوبين» filter. Only the mark goes - the device keeps its rep
 * (`representativeId`), and the day it was added stays as `addedAt` (the «أضفناها اليوم» sync list
 * and the duplicate proof read it).
 */
export function clearRepAddedPatch(account: Mark): Mark {
  return {
    addedByRepId: undefined,
    addedByRepAt: undefined,
    ...(!account.addedAt && account.addedByRepAt ? { addedAt: account.addedByRepAt } : {}),
  };
}
