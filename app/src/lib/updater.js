import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

function isTauriRuntime() {
  return (
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
  );
}

/**
 * Auto-update is wired for Windows clients only. macOS builds stay manual
 * (the user installs the dmg by hand), so the updater UI is hidden there.
 */
export function isUpdaterSupported() {
  if (!isTauriRuntime()) return false;
  return /windows/i.test(navigator.userAgent || "");
}

export async function checkForUpdates() {
  if (!isUpdaterSupported()) return null;
  const update = await check();
  return update?.available ? update : null;
}

export async function downloadAndInstallUpdate(update, { onEvent } = {}) {
  await update.downloadAndInstall((event) => onEvent?.(event));
  await relaunch();
}
