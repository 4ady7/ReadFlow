import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function formatSpeed(rate: number) {
  return Number.isInteger(rate) ? `${rate}×` : `${rate}×`;
}

export function formatPercent(progress: number) {
  return `${Math.round(clamp(progress, 0, 1) * 100)}%`;
}

export function formatOpened(timestamp: number) {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return "Opened just now";
  if (diff < 3_600_000) {
    const minutes = Math.max(1, Math.round(diff / 60_000));
    return `Opened ${minutes} min ago`;
  }
  if (diff < 86_400_000) {
    const hours = Math.max(1, Math.round(diff / 3_600_000));
    return `Opened ${hours} hr ago`;
  }
  if (diff < 7 * 86_400_000) {
    const days = Math.max(1, Math.round(diff / 86_400_000));
    return `Opened ${days} day${days === 1 ? "" : "s"} ago`;
  }
  return `Opened ${new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

export function estimateMinutesLeft(characters: number, rate: number) {
  const perSecond = 14 * Math.max(rate, 0.5);
  const minutes = characters / perSecond / 60;
  if (minutes < 1) return "Less than a minute left";
  const rounded = Math.round(minutes);
  return `About ${rounded} min left`;
}

export function isFormField(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    tag === "BUTTON" ||
    tag === "A" ||
    target.isContentEditable
  );
}

export function yieldToMain() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

export function hashKey(parts: string[]) {
  const value = parts.join("\u0001");
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${(hash >>> 0).toString(16)}:${value.length}:${value.slice(0, 48)}`;
}
