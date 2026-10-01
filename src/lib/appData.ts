/**
 * The app's own folder on the user's device.
 *
 * A `Prozpr` directory the user grants once, with one sub-folder per kind of
 * data ({@link APP_DATA_AREAS}). Today the only thing kept there is the MF
 * Central QR codes; the point of the module is that the NEXT thing — CAS
 * statements, exported plans, offline copies of the ledger — needs only a new
 * entry in the registry, not a second grant or a second folder convention.
 *
 * Why on the device at all: the user asked for their files to be somewhere
 * they own and can see, rather than loose in Downloads or only on our servers.
 * Everything here is best-effort — the app never DEPENDS on a device write
 * succeeding, and every function returns null/false rather than throwing.
 *
 * Two ways the root comes to exist:
 *
 *   - {@link chooseAppDataRoot}: the user picks where it lives. Needs a click.
 *   - {@link adoptAppDataRootInside}: a folder we already hold write access to
 *     (the Downloads grant the QR pickup asks for) gets a `Prozpr` created in
 *     it. No extra prompt — the reason the MF Central flow uses it.
 *
 * Chromium desktop only, like everything on the File System Access API. On
 * other browsers {@link isAppDataSupported} is false and callers simply skip
 * the feature.
 */

import {
  ensurePermission,
  hasPermission,
  isDeviceFsSupported,
  loadHandle,
  pickDirectory,
  storeHandle,
  timestampedName,
  writeFileInto,
  type DirectoryHandle,
} from "./deviceFs";

// --------------------------------------------------------------------------- registry

/** The folder created for the app, inside wherever the user pointed us. */
export const APP_DATA_FOLDER = "Prozpr";

/**
 * Every kind of data the app keeps on the device, each in its own sub-folder.
 * Add an entry to start storing something new; nothing else needs to change.
 */
export const APP_DATA_AREAS = {
  mfCentralQr: {
    dir: "MF Central QRs",
    label: "MF Central QR codes",
    filePrefix: "mf-central-qr",
  },
} as const;

export type AppDataArea = keyof typeof APP_DATA_AREAS;

/** `Prozpr/<area dir>` — for telling the user where something went. */
export function appDataPath(area: AppDataArea, name?: string): string {
  const base = `${APP_DATA_FOLDER}/${APP_DATA_AREAS[area].dir}`;
  return name ? `${base}/${name}` : base;
}

// --------------------------------------------------------------------------- root

const ROOT_KEY = "app-data-root";

export interface AppDataRoot {
  handle: DirectoryHandle;
  /** True when files can be written with no prompt right now. False means the
   * grant lapsed; {@link ensureAppDataWritable} re-asks with one click. */
  writable: boolean;
}

export function isAppDataSupported(): boolean {
  return isDeviceFsSupported();
}

/**
 * The root remembered from a previous visit, if the browser still has it.
 * Call on mount; never prompts.
 */
export async function loadAppDataRoot(): Promise<AppDataRoot | null> {
  if (!isAppDataSupported()) return null;
  const handle = await loadHandle(ROOT_KEY);
  if (!handle) return null;
  return { handle, writable: await hasPermission(handle, "readwrite") };
}

/**
 * Let the user choose where the `Prozpr` folder lives. MUST be the first await
 * in a click handler. The folder is created inside their choice right away, so
 * they can see it exists before anything is written to it.
 */
export async function chooseAppDataRoot(): Promise<AppDataRoot> {
  const parent = await pickDirectory({
    id: "prozpr-app-data",
    mode: "readwrite",
    startIn: "documents",
  });
  return adoptAppDataRootInside(parent);
}

/**
 * Make `parent/Prozpr` the app data root. `parent` must already be writable
 * (a grant the caller obtained for its own reasons); no prompt is shown.
 * Returns null, never throws, when the folder cannot be created.
 */
export async function adoptAppDataRootInside(
  parent: DirectoryHandle,
): Promise<AppDataRoot | null> {
  if (!(await hasPermission(parent, "readwrite"))) return null;
  try {
    const handle = (await parent.getDirectoryHandle(APP_DATA_FOLDER, {
      create: true,
    })) as DirectoryHandle;
    await storeHandle(ROOT_KEY, handle);
    return { handle, writable: true };
  } catch {
    return null;
  }
}

/** Re-grant a lapsed root. Needs a click. */
export async function ensureAppDataWritable(root: AppDataRoot): Promise<boolean> {
  const ok = await ensurePermission(root.handle, "readwrite");
  root.writable = ok;
  return ok;
}

/** Stop using the device folder. The files already there are left alone. */
export async function forgetAppDataRoot(): Promise<void> {
  await storeHandle(ROOT_KEY, null);
}

// --------------------------------------------------------------------------- areas

async function openArea(
  root: AppDataRoot,
  area: AppDataArea,
  create: boolean,
): Promise<DirectoryHandle | null> {
  try {
    return (await root.handle.getDirectoryHandle(APP_DATA_AREAS[area].dir, {
      create,
    })) as DirectoryHandle;
  } catch {
    return null;
  }
}

/** Create the area's sub-folder if it is missing. False when not writable. */
export async function ensureArea(root: AppDataRoot, area: AppDataArea): Promise<boolean> {
  if (!(await hasPermission(root.handle, "readwrite"))) return false;
  return (await openArea(root, area, true)) !== null;
}

/**
 * Save `data` into an area. Returns the path relative to the user's chosen
 * location (for the UI), or null when nothing was written — a lapsed grant,
 * a disk error. Callers must never let the import they were doing depend on
 * this succeeding.
 */
export async function saveToArea(
  root: AppDataRoot,
  area: AppDataArea,
  name: string,
  data: Blob | File | string,
): Promise<string | null> {
  if (!(await hasPermission(root.handle, "readwrite"))) return null;
  const dir = await openArea(root, area, true);
  if (!dir) return null;
  try {
    await writeFileInto(dir, name, data);
    return appDataPath(area, name);
  } catch {
    return null;
  }
}

/**
 * Keep a copy of a file the user just received, under a timestamped name
 * built from the area's prefix. A COPY: the original stays where the browser
 * put it, and the File System Access API has no cross-directory move anyway.
 */
export async function archiveToArea(
  root: AppDataRoot,
  area: AppDataArea,
  file: File,
  when: Date = new Date(),
): Promise<string | null> {
  const ext = (file.name.match(/[.][a-z0-9]{1,5}$/i)?.[0] ?? ".bin").toLowerCase();
  const name = timestampedName(APP_DATA_AREAS[area].filePrefix, ext, when);
  return saveToArea(root, area, name, file);
}

export interface AppDataFile {
  name: string;
  size: number;
  lastModified: number;
  file: File;
}

/** Everything in an area, newest first. Empty when the area does not exist. */
export async function listArea(root: AppDataRoot, area: AppDataArea): Promise<AppDataFile[]> {
  const dir = await openArea(root, area, false);
  if (!dir) return [];
  const out: AppDataFile[] = [];
  try {
    for await (const entry of dir.values()) {
      if (entry.kind !== "file") continue;
      try {
        const file = await (entry as FileSystemFileHandle).getFile();
        out.push({ name: file.name, size: file.size, lastModified: file.lastModified, file });
      } catch {
        // Removed between listing and reading.
      }
    }
  } catch {
    return [];
  }
  return out.sort((a, b) => b.lastModified - a.lastModified);
}

/** One file from an area, or null. */
export async function readFromArea(
  root: AppDataRoot,
  area: AppDataArea,
  name: string,
): Promise<File | null> {
  const dir = await openArea(root, area, false);
  if (!dir) return null;
  try {
    return await (await dir.getFileHandle(name)).getFile();
  } catch {
    return null;
  }
}

/** Delete one file from an area. False when it was not there or not allowed. */
export async function deleteFromArea(
  root: AppDataRoot,
  area: AppDataArea,
  name: string,
): Promise<boolean> {
  if (!(await hasPermission(root.handle, "readwrite"))) return false;
  const dir = await openArea(root, area, false);
  if (!dir) return false;
  try {
    await dir.removeEntry(name);
    return true;
  } catch {
    return false;
  }
}
