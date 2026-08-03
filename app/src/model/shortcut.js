/// Mirrors `app/src-tauri/src/shortcut.rs`; the backend stays authoritative for
/// validation, this module only captures and renders combinations.
export const DEFAULT_SHORTCUT = "CommandOrControl+Shift+Space";

/// In-panel accelerator that toggles the main pin. Kept distinct from the global
/// show/hide shortcut, search (⌘/Ctrl+F), and section jumps (⌘/Ctrl+1/2).
export const DEFAULT_PIN_SHORTCUT = "CommandOrControl+Shift+P";

const MODIFIER_KEYS = new Set([
  "Meta",
  "Control",
  "Alt",
  "Shift",
  "OS",
  "AltGraph",
  "CapsLock",
  "Fn",
  "FnLock",
  "Hyper",
  "Super",
]);

const NAMED_KEYS = new Map([
  [" ", "Space"],
  ["spacebar", "Space"],
  ["arrowup", "Up"],
  ["arrowdown", "Down"],
  ["arrowleft", "Left"],
  ["arrowright", "Right"],
  ["enter", "Enter"],
  ["return", "Enter"],
  ["tab", "Tab"],
  ["backspace", "Backspace"],
  ["delete", "Delete"],
  ["home", "Home"],
  ["end", "End"],
  ["pageup", "PageUp"],
  ["pagedown", "PageDown"],
  ["insert", "Insert"],
  ["+", "Plus"],
  ["-", "Minus"],
  ["=", "Equal"],
  [",", "Comma"],
  [".", "Period"],
  ["/", "Slash"],
  ["\\", "Backslash"],
  [";", "Semicolon"],
  ["'", "Quote"],
  ["`", "Backquote"],
  ["[", "BracketLeft"],
  ["]", "BracketRight"],
]);

function keyNameFrom(key) {
  if (typeof key !== "string" || !key) return null;

  const functionKey = /^F([1-9]|1[0-9]|2[0-4])$/.exec(key);
  if (functionKey) return `F${functionKey[1]}`;

  if (key.length === 1) {
    if (/[a-z]/i.test(key)) return key.toUpperCase();
    if (/[0-9]/.test(key)) return key;
  }

  return NAMED_KEYS.get(key.toLowerCase()) || null;
}

/// Returns the canonical accelerator for a keydown, or `null` while the user is
/// still only holding modifiers or has pressed a key we cannot name.
export function acceleratorFromEvent(event) {
  if (MODIFIER_KEYS.has(event.key)) return null;

  const key = keyNameFrom(event.key);
  if (!key) return null;

  const parts = [];
  if (event.metaKey || event.ctrlKey) parts.push("CommandOrControl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  parts.push(key);

  return parts.join("+");
}

const MAC_SYMBOLS = new Map([
  ["CommandOrControl", "⌘"],
  ["Alt", "⌥"],
  ["Shift", "⇧"],
  ["Control", "⌃"],
]);

const WINDOWS_NAMES = new Map([
  ["CommandOrControl", "Ctrl"],
  ["Alt", "Alt"],
  ["Shift", "Shift"],
  ["Control", "Ctrl"],
]);

export function isMacPlatform(platform) {
  return String(platform || "").toLowerCase().startsWith("darwin");
}

/// Renders an accelerator the way its platform writes it: `⌘⇧Space` on macOS and
/// `Ctrl+Shift+Space` elsewhere.
export function formatAccelerator(accelerator, platform) {
  if (!accelerator) return "未设置";

  const parts = String(accelerator).split("+");
  const mac = isMacPlatform(platform);
  const names = mac ? MAC_SYMBOLS : WINDOWS_NAMES;
  const rendered = parts.map((part) => names.get(part) || part);

  return mac ? rendered.join("") : rendered.join("+");
}

/// Resolves the platform for display, preferring the modern UA hint.
export function currentPlatform() {
  if (typeof navigator === "undefined") return "win32";
  const hint = navigator.userAgentData?.platform || navigator.platform || "";
  return /mac/i.test(hint) ? "darwin" : "win32";
}
