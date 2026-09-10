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
 * Three things constrain the design:
 *
 * 1. **`showDirectoryPicker` needs transient user activation.** It has to be the
 *    FIRST await in a click handler; an IndexedDB read before it consumes the
 *    gesture and the call throws. Hence {@link loadRememberedDirectory}, which
 *    is meant to run on mount so the click path can be synchronous up to the
 *    picker.
 * 2. **Chromium only.** Firefox and Safari (and every mobile browser) have no
 *    `showDirectoryPicker`. This is an accelerator, never the only route — the
 *    caller must always keep a plain `<input type="file">` alive.
 * 3. **The QR is single-use.** Handing back a file downloaded during an EARLIER
 *    consent burns an API call and produces an error the user cannot act on, so
 *    every scan is bounded by a `since` timestamp and never guesses across it.
 */

// --------------------------------------------------------------------------- types

/** Only the slice of the API we use. The standard lib.dom types cover the
 * handles but not `showDirectoryPicker` or the permission methods, and pulling
 * `@types/wicg-file-system-access` in for six lines is not worth a dependency. */
interface FsPermissionDescriptor {
  mode?: "read" | "readwrite";
}

interface FsHandleWithPermission {
  queryPermission?: (d?: FsPermissionDescriptor) => Promise<PermissionState>;
  requestPermission?: (d?: FsPermissionDescriptor) => Promise<PermissionState>;
}

export type DirectoryHandle = FileSystemDirectoryHandle &
  FsHandleWithPermission & {
    values: () => AsyncIterableIterator<FileSystemHandle>;
  };

interface DirectoryPickerOptions {
  id?: string;
  mode?: "read" | "readwrite";
  startIn?: "downloads" | "desktop" | "documents" | "home";
}

type PickerWindow = Window & {
  showDirectoryPicker?: (o?: DirectoryPickerOptions) => Promise<DirectoryHandle>;
};

export interface ScanCandidate {
  file: File;
  name: string;
  lastModified: number;
  /** The name looks like a CAS QR rather than any other image that happened to
   * land in Downloads at the same moment. Drives auto-use vs. asking. */
  likely: boolean;
}

/** The user closed the directory picker. Not an error — the caller falls back
 * to the manual file input without showing anything red. */
export class ScanCancelled extends Error {
  constructor() {
    super("Directory selection was cancelled.");
    this.name = "ScanCancelled";
  }
}

/** The browser refused: an insecure context, a blocked directory, or a policy.
 * Distinct from cancellation because this one is worth explaining once. */
export class ScanUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScanUnavailable";
  }
}

// --------------------------------------------------------------------------- support

export function isDirectoryScanSupported(): boolean {
  if (typeof window === "undefined") return false;
  // Secure-context gated: on plain http the method is simply absent, except on
  // localhost, which is what makes local development work.
  return typeof (window as PickerWindow).showDirectoryPicker === "function";
}

// --------------------------------------------------------------------------- handle store

// A directory handle is structured-cloneable, so IndexedDB can hold it across
// reloads and Chrome will re-grant without a second prompt if the user chose
// "allow on every visit". localStorage cannot — it is strings only.
const DB_NAME = "prozpr-fs";
const STORE = "handles";
const KEY = "downloads-dir";

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    // Private-mode browsers and blocked storage land here. A remembered handle
    // is a convenience; losing it costs one extra prompt, so nothing throws.
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

function idbGet(db: IDBDatabase): Promise<DirectoryHandle | null> {
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as DirectoryHandle) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function idbPut(db: IDBDatabase, handle: DirectoryHandle | null): Promise<void> {
  return new Promise((resolve) => {
    try {
      const store = db.transaction(STORE, "readwrite").objectStore(STORE);
      const req = handle ? store.put(handle, KEY) : store.delete(KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export interface RememberedDirectory {
  handle: DirectoryHandle;
  /** True when a scan needs no dialog at all. False means Chrome downgraded the
   * grant to "ask every time"; {@link ensureReadPermission} re-asks with one
   * click, which still beats picking the folder again. */
  granted: boolean;
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
  const db = await openDb();
  if (!db) return null;
  const handle = await idbGet(db);
  db.close();
  if (!handle) return null;
  try {
    const state = await handle.queryPermission?.({ mode: "read" });
    return { handle, granted: state === "granted" };
  } catch {
    return null;
  }
}

async function remember(handle: DirectoryHandle | null): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await idbPut(db, handle);
  db.close();
}

/** Drop the remembered grant — the "stop scanning my Downloads" affordance. */
export async function forgetRememberedDirectory(): Promise<void> {
  await remember(null);
}

/**
 * Ask for the Downloads folder. MUST be the first await inside a click handler.
 *
 * `startIn: "downloads"` opens the picker there, so the grant is one click for
 * a user who does not change directory. We cannot preselect it outright — the
 * spec requires the choice to be the user's, which is exactly the property that
 * makes this safe to offer.
 */
export async function chooseDownloadsDirectory(): Promise<DirectoryHandle> {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) {
    throw new ScanUnavailable("This browser cannot read a folder directly.");
  }
  let handle: DirectoryHandle;
  try {
    handle = await picker({ id: "prozpr-downloads", mode: "read", startIn: "downloads" });
  } catch (err: unknown) {
    const name = (err as { name?: string })?.name;
    if (name === "AbortError") throw new ScanCancelled();
    if (name === "SecurityError") {
      throw new ScanUnavailable(
        "The browser blocked folder access here. Choose the file yourself instead.",
      );
    }
    throw new ScanUnavailable(
      err instanceof Error ? err.message : "Could not open the folder picker.",
    );
  }
  // Persist before the permission check: even a handle sitting at "prompt" is
  // worth keeping, because re-granting it is one dialog instead of a full pick.
  void remember(handle);
  return handle;
}

/**
 * Re-grant a remembered handle that has lapsed to "prompt". Also needs a
 * gesture, and is cheaper for the user than picking the folder again.
 */
export async function ensureReadPermission(handle: DirectoryHandle): Promise<boolean> {
  try {
    const state = await handle.queryPermission?.({ mode: "read" });
    if (state === "granted") return true;
    const asked = await handle.requestPermission?.({ mode: "read" });
    return asked === "granted";
  } catch {
    return false;
  }
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
