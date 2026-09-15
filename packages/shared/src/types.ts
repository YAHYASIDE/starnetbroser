/**
 * Domain types shared between services/api, apps/web, and
 * services/browser-worker. Nothing in this file has any business logic or
 * any dependency on a specific database/HTTP library - it exists so all
 * three can agree on shapes without importing each other directly.
 */

export enum DeviceStatus {
  UNKNOWN = "UNKNOWN",
  GREEN = "GREEN",
  YELLOW = "YELLOW",
  RED = "RED",
  GRAY = "GRAY",
}

export enum BrowserSessionStatus {
  STOPPED = "STOPPED",
  STARTING = "STARTING",
  RUNNING = "RUNNING",
  STOPPING = "STOPPING",
}

/** A STAR NET operator's own management-account login - NOT a Starlink account. */
export interface User {
  id: string;
  email: string;
  totpEnabled: boolean;
  createdAt: string;
}

export interface Device {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  lastSeenAt: string;
  isCurrent: boolean;
}

/**
 * A billing-capable entity that can own more than one StarlinkAccount.
 * Deliberately separate from StarlinkAccount from day one - see
 * docs/ARCHITECTURE.md "Domain model, built for accounting later".
 */
export interface Customer {
  id: string;
  ownerUserId: string;
  name: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/** List-view shape - never includes decrypted secrets. */
export interface StarlinkAccountSummary {
  id: string;
  customerId: string;
  name: string;
  deviceName: string;
  kitNumber: string;
  serialNumber: string;
  standbyDate: string;
  rechargeDate: string;
  balanceDue: string;
  currency: string;
  dishStatus: DeviceStatus;
  wifiStatus: DeviceStatus;
  alertReason: string;
  lastUpdated: string;
  lastSuccessfulScanAt: string | null;
  planName: string;
}

/** Detail-view shape - includes decrypted secrets, only ever returned to
 * the account's own owner over HTTPS. */
export interface StarlinkAccountDetail extends StarlinkAccountSummary {
  email: string;
  emailSecret: string;
  wifiCode: string;
  notes: string;
  accountNumber: string;
  subscriptionId: string;
  starlinkId: string;
  serviceStatus: string;
  serviceLocation: string;
  billingPeriod: string;
  paymentDueDate: string;
  softwareVersion: string;
  uptime: string;
}

export interface BrowserStatus {
  status: BrowserSessionStatus;
  lastStartedAt: string | null;
  lastStoppedAt: string | null;
  lastActivityAt: string | null;
}

/**
 * What the browser-worker returns from one read-only scan. Every field is
 * either an empty string / UNKNOWN or an actually-observed value - never
 * fabricated. See packages/shared/src/reader-fields.ts for the exact
 * semantics of "never overwrite a known value with a blank one".
 */
export interface ReadResult {
  balanceDue: string;
  currency: string;
  standbyDate: string;
  kitNumber: string;
  serialNumber: string;
  subscriptionId: string;
  accountNumber: string;
  starlinkId: string;
  deviceName: string;
  dishStatus: DeviceStatus;
  wifiStatus: DeviceStatus;
  alertReason: string;
  lastUpdated: string;
  planName: string;
  serviceStatus: string;
  serviceLocation: string;
  billingPeriod: string;
  paymentDueDate: string;
  softwareVersion: string;
  uptime: string;
  fieldsFound: string[];
}

export function emptyReadResult(): ReadResult {
  return {
    balanceDue: "",
    currency: "",
    standbyDate: "",
    kitNumber: "",
    serialNumber: "",
    subscriptionId: "",
    accountNumber: "",
    starlinkId: "",
    deviceName: "",
    dishStatus: DeviceStatus.UNKNOWN,
    wifiStatus: DeviceStatus.UNKNOWN,
    alertReason: "",
    lastUpdated: "",
    planName: "",
    serviceStatus: "",
    serviceLocation: "",
    billingPeriod: "",
    paymentDueDate: "",
    softwareVersion: "",
    uptime: "",
    fieldsFound: [],
  };
}
