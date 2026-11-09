"use client";

/**
 * 🤖 What «المساعد» may read (lib/claudeClient.ts `askAssistant`): devices, customers, a rep's statement and an overview -
 * read only, never a password or a session. Each tool answers in short plain lines the model reads.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { AssistantTool } from "./claudeClient";
import { loadClientStore } from "./clientStore";
import { listRepresentatives, loadRepresentativeStore } from "./repStore";
import { repChatStatement } from "./repBotStatement";
import { foldSearch } from "./chatList";
import { suggestSearch } from "./searchSuggest";
import { loadAccounts, repBotAccountsNow } from "./telegramCommands";

type Device = StarlinkAccountSummary;

function deviceLine(d: Device, clientName: (id?: string) => string, repName: (id?: string) => string): string {
  const parts = [
    d.name,
    d.expectedEmail || d.starlinkAccountEmail ? `email ${d.expectedEmail || d.starlinkAccountEmail}` : "",
    d.kitNumber ? `KIT ${d.kitNumber}` : "",
    d.serviceStatus ? `status ${d.serviceStatus}` : "",
    d.rechargeDate ? `renewal ${d.rechargeDate}` : "",
    d.balanceDue ? `due ${d.balanceDue} ${d.currency ?? ""}`.trim() : "",
    d.planName ? `plan ${d.planName}` : "",
    d.clientId ? `customer ${clientName(d.clientId)}` : "",
    d.representativeId ? `rep ${repName(d.representativeId)}` : "",
    d.alertReason ? `alert ${d.alertReason}` : "",
    d.lastUpdated ? `read ${d.lastUpdated.slice(0, 10)}` : "",
  ];
  return parts.filter(Boolean).join(" | ");
}

async function context() {
  const devices = (await loadAccounts()).filter((a) => !a.deletedAt && !a.archivedAt);
  const clients = loadClientStore();
  const reps = loadRepresentativeStore();
  return {
    devices,
    clientName: (id?: string) => (id ? clients[id]?.name ?? "?" : ""),
    repName: (id?: string) => (id ? reps[id]?.name ?? "?" : ""),
    clients,
  };
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function assistantTools(): AssistantTool[] {
  return [
    {
      name: "search_devices",
      description: "Find devices (Starlink accounts) by device name, customer name, email or KIT - up to 15 matches, each with its email, KIT, status, renewal date, balance due, plan, customer and rep.",
      schema: { type: "object", properties: { query: { type: "string", description: "Words to look for" } }, required: ["query"], additionalProperties: false },
      run: async (input) => {
        const { devices, clientName, repName } = await context();
        const q = str(input.query);
        const found = suggestSearch(
          q,
          devices.map((d) => ({ kind: "device" as const, id: d.id, title: d.name, fields: [d.expectedEmail, d.starlinkAccountEmail, d.kitNumber, clientName(d.clientId)] })),
          15,
        );
        const byId = new Map(devices.map((d) => [d.id, d]));
        return found.length ? found.map((f) => deviceLine(byId.get(f.id)!, clientName, repName)).join("\n") : "لا جهاز بهذا البحث.";
      },
    },
    {
      name: "devices_overview",
      description: "Counts of all devices: total, per service status, how many have an alert or a balance due, how many renew in the next 7 days.",
      schema: { type: "object", properties: {}, additionalProperties: false },
      run: async () => {
        const { devices } = await context();
        const byStatus = new Map<string, number>();
        for (const d of devices) byStatus.set(d.serviceStatus || "unknown", (byStatus.get(d.serviceStatus || "unknown") ?? 0) + 1);
        const today = new Date().toISOString().slice(0, 10);
        const week = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
        const soon = devices.filter((d) => d.rechargeDate && d.rechargeDate >= today && d.rechargeDate <= week).length;
        return [
          `total ${devices.length}`,
          ...[...byStatus].map(([s, n]) => `status ${s}: ${n}`),
          `with an alert: ${devices.filter((d) => d.alertReason).length}`,
          `with a balance due: ${devices.filter((d) => d.balanceDue && Number.parseFloat(d.balanceDue) > 0).length}`,
          `renewing in the next 7 days: ${soon}`,
        ].join("\n");
      },
    },
    {
      name: "find_customer",
      description: "A customer by name or phone: their phone and their devices.",
      schema: { type: "object", properties: { query: { type: "string", description: "Customer name or phone" } }, required: ["query"], additionalProperties: false },
      run: async (input) => {
        const { devices, clients, clientName, repName } = await context();
        const q = foldSearch(str(input.query));
        const found = Object.values(clients)
          .filter((c) => foldSearch(c.name).includes(q) || (c.phone ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, "") || "§"))
          .slice(0, 5);
        if (!found.length) return "لا زبون بهذا الاسم.";
        return found
          .map((c) => [`${c.name}${c.phone ? ` | phone ${c.phone}` : ""}`, ...devices.filter((d) => d.clientId === c.id).map((d) => `  - ${deviceLine(d, clientName, repName)}`)].join("\n"))
          .join("\n");
      },
    },
    {
      name: "rep_statement",
      description: "A representative's money statement: each of his accounts and what is left after his profit / after everything, per currency.",
      schema: { type: "object", properties: { rep_name: { type: "string", description: "The rep's name" } }, required: ["rep_name"], additionalProperties: false },
      run: async (input) => {
        const q = foldSearch(str(input.rep_name));
        const rep = listRepresentatives(loadRepresentativeStore()).find((r) => foldSearch(r.name).includes(q));
        if (!rep) return `لا مندوب بهذا الاسم. المندوبون: ${listRepresentatives(loadRepresentativeStore()).map((r) => r.name).join("، ")}`;
        const found = await repBotAccountsNow(rep.id);
        return found ? repChatStatement(rep.name, found.accounts, found.since).text : "تعذّر حساب كشفه.";
      },
    },
  ];
}
