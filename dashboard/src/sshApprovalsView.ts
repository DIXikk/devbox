// Pure logic of the SshApprovals page. JSX stays in pages/ (same pattern as
// accountsView / sessionsView / ccUpkeepView).

import { ApiError, type SshApproval, type SshScope, type SshScopeGrant, type TreeProject } from "./api";

export const GRANT_MINUTE_PRESETS = [10, 60, 240, 480, 720, 960] as const;

/** Same limit as in devd: the grant end must be a valid JavaScript date. */
export function maxGrantMinutes(now = Date.now()): number {
  return Math.floor((8_640_000_000_000_000 - now) / 60_000);
}

/** Empty, decimal or invalid input must not accidentally approve a one-time grant. */
export function parseGrantMinutes(value: string, now = Date.now()): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const minutes = Number(trimmed);
  return Number.isSafeInteger(minutes) && minutes > 0 && minutes <= maxGrantMinutes(now) ? minutes : null;
}

export function grantDurationLabel(grant: Pick<SshApproval, "grant_permanent" | "grant_until">, now: number): string {
  return grant.grant_permanent === 1
    ? "Forever"
    : `${Math.max(0, Math.ceil(((grant.grant_until ?? 0) - now) / 60_000))} min left`;
}

/** Target row for a request or a live grant: a configured server + normalized
 *  target, a target with no config match, or no target at all. Mirrors resolveSshTarget
 *  in devd/src/sshServers.ts — that one has already decided, `server` and `target` arrive
 *  here ready-made (the dashboard infers nothing here). */
export function sshTargetLabel(row: Pick<SshApproval, "server" | "target">): string {
  if (row.server) return `${row.server} · ${row.target}`;
  if (row.target) return `unknown server: ${row.target}`;
  return "no target";
}

/** Decides what to do with an error from an action (approve/deny/revoke grant) — 409 means
 *  the mac dialog, the phone or another dashboard tab decided first (a normal
 *  lost race, not an error; `act()` in SshApprovals.tsx always reloads after an action
 *  anyway, so the next render shows who decided), so `null` suppresses it.
 *  Anything else (typically 423 from a locked vault) is returned as text for
 *  `actionErr` — SEPARATE from `err` from `load()`, see SshApprovals.tsx. Mirrors
 *  `SshApprovalsScreen.performAction` on iOS. */
export function actionErrorMessage(e: unknown): string | null {
  if (e instanceof ApiError && e.status === 409) return null;
  return e instanceof Error ? e.message : String(e);
}

export interface ScopeOption { value: string; label: string; scope: SshScope }

/** Who a scope grant can cover, from the repos tree: everyone, a folder, a project (only where a
 *  folder has projects of its own — in a flat folder project === folder), or one repo. */
export function scopeOptions(tree: TreeProject[]): ScopeOption[] {
  const opts: ScopeOption[] = [{ value: "all", label: "All sessions", scope: {} }];
  const folders = [...new Set(tree.map((p) => p.folder))].sort();
  for (const folder of folders) {
    opts.push({ value: `f:${folder}`, label: `${folder}/ (whole folder)`, scope: { folder } });
    for (const p of tree.filter((t) => t.folder === folder).sort((a, b) => a.project.localeCompare(b.project))) {
      const flat = p.project === folder;
      if (!flat) opts.push({ value: `p:${folder}/${p.project}`, label: `${folder}/${p.project}/ (whole project)`, scope: { folder, project: p.project } });
      for (const r of [...p.repos].sort((a, b) => a.name.localeCompare(b.name))) {
        opts.push({
          value: `r:${folder}/${p.project}/${r.name}`,
          label: flat ? `${folder}/${r.name}` : `${folder}/${p.project}/${r.name}`,
          scope: { folder, project: p.project, repo: r.name },
        });
      }
    }
  }
  return opts;
}

/** Same shape as the option labels above, for a grant already made. */
export function scopeGrantLabel(g: Pick<SshScopeGrant, "folder" | "project" | "repo">): string {
  if (g.folder === null) return "All sessions";
  if (g.project === null) return `${g.folder}/ (whole folder)`;
  const flat = g.project === g.folder;
  if (g.repo === null) return `${g.folder}/${g.project}/ (whole project)`;
  return flat ? `${g.folder}/${g.repo}` : `${g.folder}/${g.project}/${g.repo}`;
}
