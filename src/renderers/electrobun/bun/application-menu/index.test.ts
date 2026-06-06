import { describe, expect, test } from "bun:test";
import { buildApplicationMenu, buildDesktopApplicationMenu } from "./index";

describe("desktop application menu", () => {
  test("hides the application menu on Windows to preserve vertical space", () => {
    expect(buildDesktopApplicationMenu("win32")).toEqual([]);
  });

  test("keeps the native application menu on macOS", () => {
    expect(buildDesktopApplicationMenu("darwin")).toEqual(buildApplicationMenu());
  });
});
