/**
 * Reading a downloaded file back out of the user's Downloads folder.
 *
 * This is the SECOND-best way to get the QR back, and it exists only because the
 * best one is not universal. When MFC's consent page posts `mfc-cas-download`
 * (their own documented message, carrying the image as base64) the file never
 * touches the disk and none of this runs. A browser that only gets a download
 * falls through to here: the user grants read access to a directory once, and
 * we find the file ourselves rather than asking them to hunt for it.
 *
 * Either way it replaces "now upload the file you just downloaded", which is
 * the single most confusing step in the flow.
 *
 * Since the consent page moved INSIDE the app (iframe), this is also the
 * happy path rather than a fallback: MFC's frame posts only "complete", and
 * the QR still lands in Downloads. {@link watchForNewQr} polls the granted
 * folder from the moment the consent step opens, so the download is picked up
 * and redeemed with no click at all. Keeping a copy of the QR is NOT this
 * module's job any more — that is `appData.ts`, the app's own folder on the
 * device, which the MF Central flow creates inside the same Downloads grant.
 *
 * The picker, permission and remembered-handle plumbing live in `deviceFs.ts`;
 * what is left here is the scan itself, and its one hard rule: **the QR is
 * single-use.** Handing back a file downloaded during an EARLIER consent burns
 * an API call and produces an error the user cannot act on, so every scan is
 * bounded by a `since` timestamp and never guesses across it.
 */

import {
  DeviceFsCancelled,
  DeviceFsUnavailable,
  ensurePermission,
  hasPermission,
  isDeviceFsSupported,
  loadHandle,
  pickDirectory,
  storeHandle,
  type DirectoryHandle,
  type FsPermissionMode,
} from "./deviceFs";

export type { DirectoryHandle } from "./deviceFs";
export { ensurePermission } from "./deviceFs";
// The same classes under the names this module has always thrown, so
// `instanceof ScanCancelled` keeps working for callers.
export { DeviceFsCancelled as ScanCancelled, DeviceFsUnavailable as ScanUnavailable };

export interface ScanCandidate {
  file: File;
  name: string;
  lastModified: number;
  /** The name looks like a CAS QR rather than any other image that happened to
   * land in Downloads at the same moment. Drives auto-use vs. asking. */
  likely: boolean;
}

// --------------------------------------------------------------------------- support

export function isDirectoryScanSupported(): boolean {
  return isDeviceFsSupported();
}

// --------------------------------------------------------------------------- remembered grant

const DOWNLOADS_KEY = "downloads-dir";

export interface RememberedDirectory {
  handle: DirectoryHandle;
  /** True when a scan needs no dialog at all. False means Chrome downgraded the
   * grant to "ask every time"; {@link ensureReadPermission} re-asks with one
   * click, which still beats picking the folder again. */
  granted: boolean;
  /** True when the app data folder can be created inside this grant without a
   * prompt. A read-only grant stays useful for pickup; {@link ensurePermission}
   * with "readwrite" upgrades it. */
  writable: boolean;
}

/**
 * The directory the user picked last time, if the browser still remembers it.
 *
 * Call this on mount. It never prompts — a user who never opted in is never
 * nagged — which also leaves the click handler that follows free to spend its
 * user activation on {@link chooseDownloadsDirectory}.
 */
export async function loadRememberedDirectory(): Promise<RememberedDirectory | null> {
  if (!isDirectoryScanSupported()) return null;
  const handle = await loadHandle(DOWNLOADS_KEY);
  if (!handle) return null;
  return {
    handle,
    granted: await hasPermission(handle, "read"),
    writable: await hasPermission(handle, "readwrite"),
  };
}

/** Drop the remembered grant — the "stop scanning my Downloads" affordance. */
export async function forgetRememberedDirectory(): Promise<void> {
  await storeHandle(DOWNLOADS_KEY, null);
}

/**
 * Ask for the Downloads folder. MUST be the first await inside a click handler.
 *
 * `startIn: "downloads"` opens the picker there, so the grant is one click for
 * a user who does not change directory.
 *
 * Asks for "readwrite", not "read": the same grant has to let the app create
 * its own folder in there (see `appData.ts`) and keep a copy of each QR.
 * Chrome shows one prompt either way; declining the edit half rejects the
 * whole pick, which the caller sees as a cancel and falls back to the file
 * input.
 */
export async function chooseDownloadsDirectory(
  mode: FsPermissionMode = "readwrite",
): Promise<DirectoryHandle> {
  const handle = await pickDirectory({ id: "prozpr-downloads", mode, startIn: "downloads" });
  // Persist before the permission check: even a handle sitting at "prompt" is
  // worth keeping, because re-granting it is one dialog instead of a full pick.
  void storeHandle(DOWNLOADS_KEY, handle);
  return handle;
}

/**
 * Re-grant a remembered handle that has lapsed to "prompt". Also needs a
 * gesture, and is cheaper for the user than picking the folder again.
 */
export async function ensureReadPermission(handle: DirectoryHandle): Promise<boolean> {
  return ensurePermission(handle, "read");
}

// --------------------------------------------------------------------------- scanning

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

// MFC names the download `cas-request-qr.png` (their WebView bridge documents
// that filename). Chrome dedupes repeats as `cas-request-qr (1).png`, and a
// user who renames it should still be found, so the test is deliberately loose
// — it decides "use this without asking" vs. "show a short list", not whether a
// file is eligible at all.
const LIKELY_NAME = /(qr|cas|mfc|mfcentral|statement)/i;

// Downloads folders get large. Reading a directory entry is cheap; `getFile()`
// is a disk stat per file, so name-matching candidates are always read and
// everything else is capped. A user with 400+ unrelated images downloaded after
// starting the consent has bigger problems than this scan.
const OTHER_IMAGE_LIMIT = 400;

export interface ScanOptions {
  /** Ignore anything not modified at or after this epoch-ms. An older file is a
   * QR from a previous consent, and redeeming it is a dead end. Pass 0 to look
   * at everything — only ever with a chooser in front of the result. */
  since: number;
  /** Cap on returned candidates. */
  limit?: number;
}

export interface ScanReport {
  candidates: ScanCandidate[];
  /** Image files examined. Zero means the folder holds no images at all, which
   * usually means the wrong folder was picked. */
  imagesSeen: number;
  /** The newest image regardless of the `since` cutoff. When nothing passes the
   * filter this is what makes "nothing found" explainable instead of a wall. */
  newestSeen: { name: string; lastModified: number } | null;
  /** False when the directory could not be read at all. */
  readable: boolean;
}

/**
 * Every image in `dir` that could be the QR just downloaded, newest first and
 * name-matches ahead of the rest.
 *
 * Returns an empty array rather than throwing when the folder is unreadable —
 * the caller's answer to "nothing found" and "could not look" is the same
 * screen either way.
 */
export async function scanForDownloadedImages(
  dir: DirectoryHandle,
  { since, limit = 6 }: ScanOptions,
): Promise<ScanReport> {
  const named: FileSystemFileHandle[] = [];
  const others: FileSystemFileHandle[] = [];

  try {
    for await (const entry of dir.values()) {
      if (entry.kind !== "file" || !IMAGE_EXT.test(entry.name)) continue;
      const handle = entry as FileSystemFileHandle;
      if (LIKELY_NAME.test(entry.name)) named.push(handle);
      else if (others.length < OTHER_IMAGE_LIMIT) others.push(handle);
    }
  } catch {
    return { candidates: [], imagesSeen: 0, newestSeen: null, readable: false };
  }

  const out: ScanCandidate[] = [];
  let imagesSeen = 0;
  let newestSeen: { name: string; lastModified: number } | null = null;

  for (const [handles, likely] of [
    [named, true],
    [others, false],
  ] as const) {
    for (const handle of handles) {
      let file: File;
      try {
        file = await handle.getFile();
      } catch {
        // Removed between listing and reading, or locked mid-download.
        continue;
      }
      imagesSeen += 1;
      if (!newestSeen || file.lastModified > newestSeen.lastModified) {
        newestSeen = { name: file.name, lastModified: file.lastModified };
      }
      if (file.lastModified < since) continue;
      out.push({ file, name: file.name, lastModified: file.lastModified, likely });
    }
  }

  out.sort((a, b) =>
    a.likely === b.likely ? b.lastModified - a.lastModified : a.likely ? -1 : 1,
  );
  return {
    candidates: out.slice(0, limit),
    imagesSeen,
    newestSeen,
    readable: true,
  };
}

/**
 * One scan, retried once after a short pause.
 *
 * The user presses "I've downloaded it" the instant they click download, and
 * the browser's write can trail that by a beat. One quiet retry turns the
 * common near-miss into a hit; more than one would just be a spinner.
 */
export async function scanWithRetry(
  dir: DirectoryHandle,
  options: ScanOptions,
): Promise<ScanReport> {
  const first = await scanForDownloadedImages(dir, options);
  if (first.candidates.length || !first.readable) return first;
  await new Promise((r) => setTimeout(r, 800));
  return scanForDownloadedImages(dir, options);
}

// --------------------------------------------------------------------------- watching

export interface WatchOptions extends ScanOptions {
  /** How often to look. The download is a 2 KB PNG; a second and a half is
   * invisible to the user and cheap on a folder with a few hundred files. */
  intervalMs?: number;
  /** Stops the loop. Resolves `null` once aborted. */
  signal: AbortSignal;
  /** Files already handed over — a QR that failed must not be redeemed twice,
   * and the watcher should keep looking for a NEWER one instead. */
  ignore?: (candidate: ScanCandidate) => boolean;
}

/**
 * Wait for the QR to land in `dir`, then hand it back.
 *
 * Runs from the moment MFC's page opens, so by the time their download button
 * is pressed we are already looking. Only a name-matching (`likely`) file is
 * ever returned — the loop starts BEFORE the download, so the newest such
 * file inside the `since` window can only be this request's QR, and "a second
 * copy because the user clicked Download twice" is the same image again.
 * Anything not name-matching is left for the chooser on the QR step.
 */
export async function watchForNewQr(
  dir: DirectoryHandle,
  { since, intervalMs = 1500, signal, ignore }: WatchOptions,
): Promise<ScanCandidate | null> {
  while (!signal.aborted) {
    const report = await scanForDownloadedImages(dir, { since, limit: 6 });
    if (signal.aborted) return null;
    // Unreadable means the grant lapsed mid-flow; polling would only spin.
    if (!report.readable) return null;
    const hit = report.candidates.find((c) => c.likely && !ignore?.(c));
    if (hit) return hit;
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, intervalMs);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          resolve();
        },
        { once: true },
      );
    });
  }
  return null;
}
