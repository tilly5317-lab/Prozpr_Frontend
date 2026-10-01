/**
 * Primitives for touching the user's own device storage through the File
 * System Access API. Shared by the two features built on it:
 *
 *   - `downloadScan.ts`  — reading a just-downloaded file out of Downloads
 *   - `appData.ts`       — the app's own folder on the device, where user data
 *                           (statements, QR codes, exports) is kept
 *
 * Nothing here knows about either feature: it is the picker, the permission
 * handshake and the IndexedDB store that lets a granted handle survive a
 * reload. Both features have the same three constraints, which is why the
 * plumbing lives in one place:
 *
 * 1. **`showDirectoryPicker` needs transient user activation.** It has to be
 *    the FIRST await in a click handler; an IndexedDB read before it consumes
 *    the gesture and the call throws. Hence the split between "load what is
 *    remembered" (run on mount) and "ask" (run on click).
 * 2. **Chromium desktop only.** Firefox, Safari and every mobile browser have
 *    no `showDirectoryPicker`. Anything built on this is an accelerator; the
 *    feature must still work without it.
 * 3. **A remembered handle can lapse to "prompt".** Chrome may downgrade a
 *    grant between visits; {@link ensurePermission} re-asks with one click,
 *    which still beats picking the folder again.
 */

// --------------------------------------------------------------------------- types

/** Only the slice of the API we use. The standard lib.dom types cover the
 * handles but not `showDirectoryPicker` or the permission methods, and pulling
 * `@types/wicg-file-system-access` in for six lines is not worth a dependency. */
export interface FsPermissionDescriptor {
  mode?: "read" | "readwrite";
}

export type FsPermissionMode = NonNullable<FsPermissionDescriptor["mode"]>;

interface FsHandleWithPermission {
  queryPermission?: (d?: FsPermissionDescriptor) => Promise<PermissionState>;
  requestPermission?: (d?: FsPermissionDescriptor) => Promise<PermissionState>;
}

export type DirectoryHandle = FileSystemDirectoryHandle &
  FsHandleWithPermission & {
    values: () => AsyncIterableIterator<FileSystemHandle>;
  };

export interface DirectoryPickerOptions {
  /** Lets the browser remember a separate "last directory" per purpose. */
  id?: string;
  mode?: FsPermissionMode;
  startIn?: "downloads" | "desktop" | "documents" | "home";
}

type PickerWindow = Window & {
  showDirectoryPicker?: (o?: DirectoryPickerOptions) => Promise<DirectoryHandle>;
};

/** The user closed the directory picker. Not an error — callers fall back to
 * whatever they do without a folder, without showing anything red. */
export class DeviceFsCancelled extends Error {
  constructor() {
    super("Directory selection was cancelled.");
    this.name = "DeviceFsCancelled";
  }
}

/** The browser refused: an insecure context, a blocked directory, or a policy.
 * Distinct from cancellation because this one is worth explaining once. */
export class DeviceFsUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeviceFsUnavailable";
  }
}

// --------------------------------------------------------------------------- support

export function isDeviceFsSupported(): boolean {
  if (typeof window === "undefined") return false;
  // Secure-context gated: on plain http the method is simply absent, except on
  // localhost, which is what makes local development work.
  return typeof (window as PickerWindow).showDirectoryPicker === "function";
}

// --------------------------------------------------------------------------- picker

/**
 * Ask the user for a directory. MUST be the first await inside a click handler.
 *
 * We cannot preselect a folder outright — the spec requires the choice to be
 * the user's, which is exactly the property that makes this safe to offer.
 * `startIn` only opens the dialog in the right place.
 */
export async function pickDirectory(
  options: DirectoryPickerOptions,
): Promise<DirectoryHandle> {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) {
    throw new DeviceFsUnavailable("This browser cannot access a folder directly.");
  }
  try {
    return await picker(options);
  } catch (err: unknown) {
    const name = (err as { name?: string })?.name;
    if (name === "AbortError") throw new DeviceFsCancelled();
    if (name === "SecurityError") {
      throw new DeviceFsUnavailable(
        "The browser blocked folder access here. Choose the file yourself instead.",
      );
    }
    throw new DeviceFsUnavailable(
      err instanceof Error ? err.message : "Could not open the folder picker.",
    );
  }
}

// --------------------------------------------------------------------------- permissions

/** True when `mode` needs no prompt right now. Never asks — safe to call with
 * no user gesture in hand. */
export async function hasPermission(
  handle: DirectoryHandle,
  mode: FsPermissionMode,
): Promise<boolean> {
  try {
    return (await handle.queryPermission?.({ mode })) === "granted";
  } catch {
    return false;
  }
}

/**
 * Re-grant a remembered handle that has lapsed to "prompt". Needs a gesture.
 * A user who declines "readwrite" may still hold a working "read" grant, so
 * callers that only need to look should ask for that.
 */
export async function ensurePermission(
  handle: DirectoryHandle,
  mode: FsPermissionMode,
): Promise<boolean> {
  try {
    const state = await handle.queryPermission?.({ mode });
    if (state === "granted") return true;
    const asked = await handle.requestPermission?.({ mode });
    return asked === "granted";
  } catch {
    return false;
  }
}

// --------------------------------------------------------------------------- handle store

// A directory handle is structured-cloneable, so IndexedDB can hold it across
// reloads and Chrome will re-grant without a second prompt if the user chose
// "allow on every visit". localStorage cannot — it is strings only.
//
// One database, one object store, one key per purpose. A new feature that
// needs its own remembered folder adds a key here rather than a database.
const DB_NAME = "prozpr-fs";
const STORE = "handles";

export type HandleKey = "downloads-dir" | "app-data-root";

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

/** The handle remembered under `key`, or null. Never prompts. */
export async function loadHandle(key: HandleKey): Promise<DirectoryHandle | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    return await new Promise<DirectoryHandle | null>((resolve) => {
      try {
        const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
        req.onsuccess = () => resolve((req.result as DirectoryHandle) ?? null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } finally {
    db.close();
  }
}

/** Remember `handle` under `key`; `null` forgets it. Best-effort. */
export async function storeHandle(
  key: HandleKey,
  handle: DirectoryHandle | null,
): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      try {
        const store = db.transaction(STORE, "readwrite").objectStore(STORE);
        const req = handle ? store.put(handle, key) : store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  } finally {
    db.close();
  }
}

// --------------------------------------------------------------------------- files

/** `prefix-YYYYMMDD-HHMMSS.ext` in local time — sortable, unique enough for
 * files a person creates, and readable in a file manager. */
export function timestampedName(prefix: string, ext: string, when = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}-` +
    `${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`;
  const dot = ext.startsWith(".") ? ext : `.${ext}`;
  return `${prefix}-${stamp}${dot}`;
}

/** Write `data` as `name` inside `dir`, replacing any existing file. */
export async function writeFileInto(
  dir: DirectoryHandle,
  name: string,
  data: Blob | File | string,
): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(data);
  } finally {
    await writable.close();
  }
}
