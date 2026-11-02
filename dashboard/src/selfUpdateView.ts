import type { SelfUpdateStatus } from "./api";

export interface SelfUpdateView {
  headline: string;
  /** none = up to date; update = one click; confirm = two clicks (devd restarts); running = disabled. */
  action: "none" | "update" | "confirm" | "running";
  warning: string | null;
  notes: string[];
}

const short = (sha: string | null | undefined) => (sha ?? "").slice(0, 7);

function outcomeNote(o: SelfUpdateStatus["lastOutcome"]): string | null {
  if (!o) return null;
  switch (o.kind) {
    case "waiting-for-ci": return `Last run: waiting for CI on ${short(o.commit)} (${o.ci ?? "pending"}).`;
    case "blocked": return `Last run: blocked — ${o.reason}.`;
    case "rolled-back": return `Last run: rolled back from ${short(o.commit)} — ${o.reason}.`;
    case "failed": return `Last run failed — ${o.reason}.`;
    default: return null; // deployed / up-to-date need no explanation
  }
}

export function selfUpdateView(s: SelfUpdateStatus): SelfUpdateView {
  const notes: string[] = [];
  if (s.fetchError) notes.push(`Could not check GitHub: ${s.fetchError}`);
  const outcome = outcomeNote(s.lastOutcome);
  if (outcome) notes.push(outcome);
  if (s.infra.length) notes.push(`Infra changes are not applied automatically: ${s.infra.join(", ")}. Run infra/setup.sh after reviewing them.`);

  if (s.unit.state === "running") return { headline: "Updating…", action: "running", warning: null, notes };
  if (s.behind === 0) {
    // Without a successful fetch "up to date" is not known — let the update itself check.
    return { headline: `Up to date · ${short(s.deployed)}`, action: s.fetchError ? "update" : "none", warning: null, notes };
  }
  const headline = `${s.behind} new commit${s.behind === 1 ? "" : "s"} on main · ${short(s.deployed)} → ${short(s.latest)}`;
  if (!s.restart) return { headline, action: "update", warning: null, notes };
  return {
    headline, action: "confirm",
    warning: "This update restarts devd: running sessions keep going, but the vault locks and has to be unlocked again.",
    notes,
  };
}
