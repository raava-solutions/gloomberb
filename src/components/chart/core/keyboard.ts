export function resolveChartKeyboardKey(event: {
  name?: string;
  sequence?: string;
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
  super?: boolean;
}): string {
  if (event.ctrl || event.meta || event.alt || event.super) return "";

  const name = event.name ?? "";
  const sequence = event.sequence ?? "";
  const candidates = [name, sequence];

  if (candidates.some((key) => key === "=" || key === "+" || key === "plus")) {
    return "zoom-in";
  }
  if (candidates.some((key) => key === "-" || key === "_" || key === "minus")) {
    return "zoom-out";
  }

  const key = name || sequence;
  return key.length === 1 ? key.toLowerCase() : key;
}
