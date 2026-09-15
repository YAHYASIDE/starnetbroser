import { execFile } from "child_process";
import { promisify } from "util";
import { config } from "../config";

const execFileAsync = promisify(execFile);

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/;

export function volumeNameFor(accountId: string): string {
  if (!SAFE_ID.test(accountId)) {
    throw new Error(`Refusing unsafe accountId for a Docker volume name: ${accountId}`);
  }
  return `${config.profileVolumePrefix}${accountId}`;
}

/**
 * Ensures a real, durable Docker named volume exists for this account and
 * returns its host filesystem Mountpoint - this is what Playwright's
 * persistent-context userDataDir points at, so profile data (cookies,
 * localStorage, IndexedDB) lives in Docker-managed storage, never inside
 * the app/phone, and survives independently of any running container or
 * worker process.
 */
export async function ensureProfileVolume(accountId: string): Promise<string> {
  const name = volumeNameFor(accountId);
  await execFileAsync("docker", ["volume", "create", name]);
  const { stdout } = await execFileAsync("docker", [
    "volume",
    "inspect",
    "--format",
    "{{.Mountpoint}}",
    name,
  ]);
  const mountpoint = stdout.trim();
  if (!mountpoint) {
    throw new Error(`docker volume inspect returned no Mountpoint for ${name}`);
  }
  return mountpoint;
}

export async function volumeExists(accountId: string): Promise<boolean> {
  try {
    await execFileAsync("docker", ["volume", "inspect", volumeNameFor(accountId)]);
    return true;
  } catch {
    return false;
  }
}

/** Test-only: permanently destroys an account's profile data. Never
 * called from production session-lifecycle code. */
export async function removeProfileVolumeForTests(accountId: string): Promise<void> {
  await execFileAsync("docker", ["volume", "rm", "-f", volumeNameFor(accountId)]).catch(() => undefined);
}
