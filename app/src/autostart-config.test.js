import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import packageJson from "../package.json";
import desktopCapability from "../src-tauri/capabilities/desktop.json";
import tauriConfig from "../src-tauri/tauri.conf.json";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("official autostart plugin wiring", () => {
  it("pins exact compatible JS and exact Rust plugin versions", () => {
    expect(packageJson.dependencies["@tauri-apps/plugin-autostart"]).toBe(
      "2.5.1",
    );

    const cargoToml = read("src-tauri/Cargo.toml");
    expect(cargoToml).toMatch(/tauri-plugin-autostart\s*=\s*"=2\.5\.1"/);
    const caretLine = cargoToml
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line === 'tauri-plugin-autostart = "2.5.1"');
    expect(caretLine).toBeUndefined();
  });

  it("registers LaunchAgent init with the --autostart argument", () => {
    const libRs = read("src-tauri/src/lib.rs");
    expect(libRs).toMatch(/MacosLauncher::LaunchAgent/);
    expect(libRs).toMatch(/AUTOSTART_FLAG|Some\(vec!\[AUTOSTART_FLAG\]\)/);
    expect(libRs).toMatch(/should_show_initial_panel/);
  });

  it("grants only least-privilege autostart capabilities", () => {
    const autostartPermissions = desktopCapability.permissions
      .filter((permission) => permission.startsWith("autostart:"))
      .sort();

    expect(autostartPermissions).toEqual([
      "autostart:allow-disable",
      "autostart:allow-enable",
      "autostart:allow-is-enabled",
    ]);
  });

  it("keeps silent background launch window invariants", () => {
    const windowConfig = tauriConfig.app.windows.find(
      (candidate) => candidate.label === "main",
    );
    const infoPlist = read("src-tauri/Info.plist");

    expect(windowConfig.visible).toBe(false);
    expect(windowConfig.skipTaskbar).toBe(true);
    expect(infoPlist).toMatch(/<key>LSUIElement<\/key>\s*<true\/>/);
  });
});
