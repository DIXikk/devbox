import type { Database } from "bun:sqlite";
import { getSession, listSessions, type SessionRow } from "./db";
import { liveKeyGrant, MAX_GRANT_TIMESTAMP } from "./sshApprovals";
import type { SshAgents } from "./sshAgent";

// A key granted to many sessions at once, from the dashboard: every session, one folder, one
// project in a folder, or one repo (all its sessions). A request covered by a live scope grant
// gets the key without asking — except from a shared session, which always asks (see api.ts).
//
// Unlike a per-session grant (sshApprovals.ts) it is not bound to a target: it is decided up
// front, before any agent said where it wants to go, so it covers the key, not a server.

export interface ScopeGrantRow {
  id: string; title: string;
  folder: string | null; project: string | null; repo: string | null;
  created_at: number; created_by: string;
  grant_until: number | null; grant_permanent: 0 | 1;
  revoked_at: number | null;
}

export interface NewScopeGrant {
  title: string;
  folder?: string | null; project?: string | null; repo?: string | null;
  by: string;
  grantUntil?: number; grantPermanent?: boolean;
}

/** null = valid. A narrower level needs the wider one: a project lives in a folder, a repo in a project. */
export function scopeIssue(g: Pick<NewScopeGrant, "folder" | "project" | "repo">): string | null {
  for (const k of ["folder", "project", "repo"] as const) {
    const v = g[k];
    if (v !== undefined && v !== null && (typeof v !== "string" || v.trim() === "" || v.length > 200)) return `${k} must be a non-empty string`;
  }
  if (g.project && !g.folder) return "a project needs its folder";
  if (g.repo && !g.project) return "a repo needs its project";
  return null;
}

export function createScopeGrant(db: Database, g: NewScopeGrant, now = Date.now()): string {
  const issue = scopeIssue(g);
  if (issue) throw new Error(issue);
  if (g.grantPermanent === true && g.grantUntil !== undefined) throw new Error("a grant is either permanent or timed");
  if (g.grantPermanent !== true && (g.grantUntil === undefined || !Number.isSafeInteger(g.grantUntil) || g.grantUntil <= now || g.grantUntil > MAX_GRANT_TIMESTAMP)) {
    throw new Error("a scope grant needs a duration or must be permanent");
  }
  const id = crypto.randomUUID();
  db.query(`INSERT INTO ssh_scope_grants (id, title, folder, project, repo, created_at, created_by, grant_until, grant_permanent)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, g.title, g.folder ?? null, g.project ?? null, g.repo ?? null, now, g.by,
      g.grantPermanent === true ? null : g.grantUntil!, g.grantPermanent === true ? 1 : 0);
  return id;
}

const LIVE = "revoked_at IS NULL AND (grant_permanent = 1 OR grant_until > ?)";

export function getScopeGrant(db: Database, id: string): ScopeGrantRow | undefined {
  return (db.query("SELECT * FROM ssh_scope_grants WHERE id = ?").get(id) as ScopeGrantRow | null) ?? undefined;
}

export function listScopeGrants(db: Database, now = Date.now()): ScopeGrantRow[] {
  return db.query(`SELECT * FROM ssh_scope_grants WHERE ${LIVE} ORDER BY created_at DESC`).all(now) as ScopeGrantRow[];
}

/** The live scope grant of `title` that covers this session, if any. */
export function liveScopeGrant(
  db: Database, s: Pick<SessionRow, "folder" | "project" | "repo">, title: string, now = Date.now(),
): ScopeGrantRow | undefined {
  return (db.query(`SELECT * FROM ssh_scope_grants
    WHERE title = ? AND ${LIVE}
      AND (folder IS NULL OR folder = ?) AND (project IS NULL OR project = ?) AND (repo IS NULL OR repo = ?)
    ORDER BY grant_permanent DESC, grant_until DESC LIMIT 1`)
    .get(title, now, s.folder, s.project, s.repo) as ScopeGrantRow | null) ?? undefined;
}

/** Is the session still allowed to hold `title` — by its own grant (any target) or by a scope
 *  grant? Every path that kills a session's ssh-agent must ask this, not just liveKeyGrant:
 *  otherwise revoking a session's own grant would kill an agent a scope grant still covers. */
export function keyCovered(db: Database, session: string | null, title: string, now = Date.now()): boolean {
  if (liveKeyGrant(db, session, title, now)) return true;
  const row = session ? getSession(db, session) : null;
  return !!row && !!liveScopeGrant(db, row, title, now);
}

function inScope(g: ScopeGrantRow, s: SessionRow): boolean {
  return (g.folder === null || g.folder === s.folder) && (g.project === null || g.project === s.project) && (g.repo === null || g.repo === s.repo);
}

/** Kills the agents a now-dead scope grant no longer justifies. `kill(session, title)` only
 *  touches an agent that serves exactly this key, and a session still covered (own grant or
 *  another scope grant) keeps its agent. */
async function dropAgents(db: Database, g: ScopeGrantRow, sshAgents: Pick<SshAgents, "kill">, now: number): Promise<void> {
  for (const s of listSessions(db)) {
    if (inScope(g, s) && !keyCovered(db, s.id, g.title, now)) await sshAgents.kill(s.id, g.title);
  }
}

/** Ends a live scope grant; returns the row, or null when there was nothing live to revoke. */
export async function revokeScopeGrant(
  db: Database, id: string, sshAgents: Pick<SshAgents, "kill"> | undefined, now = Date.now(),
): Promise<ScopeGrantRow | null> {
  const res = db.query(`UPDATE ssh_scope_grants SET revoked_at = ? WHERE id = ? AND ${LIVE}`).run(now, id, now);
  if (res.changes === 0) return null;
  const row = getScopeGrant(db, id)!;
  if (sshAgents) await dropAgents(db, row, sshAgents, now);
  return row;
}

/** One reaper tick: timed scope grants past their deadline end, and their agents go. Each row
 *  has its own catch, like reapExpiredGrants — one failing kill must not stop the rest. */
export async function reapExpiredScopeGrants(
  db: Database, sshAgents: Pick<SshAgents, "kill">, now = Date.now(),
  onError: (id: string, e: unknown) => void = () => {},
): Promise<void> {
  const expired = db.query(`SELECT * FROM ssh_scope_grants
    WHERE revoked_at IS NULL AND grant_permanent = 0 AND grant_until <= ?`).all(now) as ScopeGrantRow[];
  for (const g of expired) {
    try {
      // Mark first: the grant is over whatever the kill does, and the next tick must not pick it again.
      db.query("UPDATE ssh_scope_grants SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").run(now, g.id);
      await dropAgents(db, g, sshAgents, now);
    } catch (e) { onError(g.id, e); }
  }
}

/** "all sessions" / "acme" / "acme/portal" / "acme/portal/web" — for logs and notifications. */
export function scopeLabel(g: Pick<ScopeGrantRow, "folder" | "project" | "repo">): string {
  return g.folder === null ? "all sessions" : [g.folder, g.project, g.repo].filter((x) => x !== null).join("/");
}
