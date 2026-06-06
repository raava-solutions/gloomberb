type DesktopTitleBarStyle = "default" | "hidden" | "hiddenInset";

export function desktopTitleBarStyle(): DesktopTitleBarStyle {
  return process.platform === "darwin" ? "hiddenInset" : "hidden";
}
