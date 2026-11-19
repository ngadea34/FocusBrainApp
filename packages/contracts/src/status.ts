import type { EpisodeStatus } from "./enums.js";

/** Miroir de public.is_valid_transition (SQL). Un test vérifie l'égalité. */
export const TRANSITIONS: ReadonlyArray<readonly [EpisodeStatus, EpisodeStatus]> = [
  ["draft", "queued"],
  ["failed", "queued"],
  ["queued", "researching"],
  ["researching", "outlining"],
  ["outlining", "awaiting_approval"],
  ["outlining", "writing"],
  ["awaiting_approval", "writing"],
  ["writing", "verifying"],
  ["verifying", "writing"],
  ["verifying", "synthesizing"],
  ["synthesizing", "assembling"],
  ["assembling", "synthesizing"],
  ["assembling", "ready"],
];

const TERMINAL: ReadonlySet<EpisodeStatus> = new Set(["ready", "failed", "cancelled"]);

export function isTerminalStatus(s: EpisodeStatus): boolean {
  return TERMINAL.has(s);
}

export function isValidTransition(from: EpisodeStatus, to: EpisodeStatus): boolean {
  if (to === "failed" || to === "cancelled") return !isTerminalStatus(from) && from !== "draft";
  return TRANSITIONS.some(([f, t]) => f === from && t === to);
}
