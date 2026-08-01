import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";

import tauriConfig from "../src-tauri/tauri.conf.json";

const styleElement = document.createElement("style");
styleElement.textContent = readFileSync("src/styles.css", "utf8");
document.head.append(styleElement);

describe("frameless window appearance", () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
    document.body.innerHTML = "";
  });

  it("leaves the native window corners transparent for the rounded panel", () => {
    document.body.innerHTML = '<main class="app-shell"></main>';

    const windowConfig = tauriConfig.app.windows.find(
      (candidate) => candidate.label === "main",
    );

    expect(windowConfig.transparent).toBe(true);
    expect(tauriConfig.app.macOSPrivateApi).toBe(true);
    expect(getComputedStyle(document.body).backgroundColor).toBe(
      "rgba(0, 0, 0, 0)",
    );
    expect(getComputedStyle(document.querySelector(".app-shell")).overflow).toBe(
      "hidden",
    );
  });

  it("disables the rectangular native window shadow that leaks at CSS-rounded corners", () => {
    document.body.innerHTML = '<main class="app-shell"></main>';

    const windowConfig = tauriConfig.app.windows.find(
      (candidate) => candidate.label === "main",
    );
    const shell = getComputedStyle(document.querySelector(".app-shell"));

    // Discriminating native check: default shadow is true and paints a
    // rectangular OS frame/shadow independent of the CSS border-radius.
    expect(windowConfig.shadow).toBe(false);
    expect(windowConfig.decorations).toBe(false);
    expect(windowConfig.transparent).toBe(true);

    // Canvas layers stay transparent so only the rounded shell is opaque.
    expect(getComputedStyle(document.documentElement).backgroundColor).toBe(
      "rgba(0, 0, 0, 0)",
    );
    expect(getComputedStyle(document.body).backgroundColor).toBe(
      "rgba(0, 0, 0, 0)",
    );
    expect(getComputedStyle(document.getElementById("root") || document.body).backgroundColor).toMatch(
      /rgba\(0, 0, 0, 0\)|transparent/,
    );

    // Panel rounding and separation come from CSS, not a native rectangular
    // backplate. Full-bleed external box-shadow is avoided so WebView layers
    // do not composite a square edge into the transparent corners.
    expect(shell.borderRadius).toBe("14px");
    expect(shell.overflow).toBe("hidden");
    expect(shell.boxShadow).toBe("none");
    expect(Number.parseFloat(shell.borderTopWidth)).toBeGreaterThan(0);
  });

  it("uses a neutral macOS dark surface instead of a purple-tinted one", () => {
    document.documentElement.dataset.theme = "dark";

    const styles = getComputedStyle(document.documentElement);
    expect(styles.getPropertyValue("--color-bg").trim()).toBe("#1c1c1e");
    expect(styles.getPropertyValue("--color-surface").trim()).toBe("#2c2c2e");
    expect(styles.getPropertyValue("--color-accent").trim()).toBe("#0a84ff");
  });
});
