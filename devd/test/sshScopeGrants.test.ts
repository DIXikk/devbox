import { expect, test } from "bun:test";
import { insertSession, openDb, type SessionRow } from "../src/db";
import { createApproval, decideApproval } from "../src/sshApprovals";
import {
  createScopeGrant, keyCovered, listScopeGrants, liveScopeGrant, reapExpiredScopeGrants, revokeScopeGrant, scopeIssue, scopeLabel,
} from "../src/sshScopeGrants";

const KEY = "SSH Key - build host";
const NOW = 1_800_000_000_000;

let port = 40100;
function session(id: string, folder: string, project: string, repo: string): SessionRow {
  return { id, folder, project, repo, container: id, port_base: (port += 10), status: "running", solo: 0, created_at: 0, last_active_at: 0, important: 0 };
}

function setup() {
  const db = openDb(":memory:");
  const shop = session("dev-apps-shop", "apps", "apps", "shop");
  const shop2 = session("dev-apps-shop-2", "apps", "apps", "shop");
  const blog = session("dev-apps-blog", "apps", "apps", "blog");
  const arena = session("dev-games-arena", "games", "games", "arena");
  for (const s of [shop, shop2, blog, arena]) insertSession(db, s);
  return { db, shop, shop2, blog, arena };
}

const permanent = { by: "dashboard", grantPermanent: true } as const;

test("all sessions / a folder / a repo each cover exactly their sessions", () => {
  const { db, shop, shop2, blog, arena } = setup();
  createScopeGrant(db, { title: KEY, folder: "apps", project: "apps", repo: "shop", ...permanent }, NOW);
  expect(liveScopeGrant(db, shop, KEY, NOW)).toBeDefined();
  expect(liveScopeGrant(db, shop2, KEY, NOW)).toBeDefined();
  expect(liveScopeGrant(db, blog, KEY, NOW)).toBeUndefined();
  expect(liveScopeGrant(db, shop, "SSH Key - Mac mini", NOW)).toBeUndefined();

  createScopeGrant(db, { title: KEY, folder: "apps", ...permanent }, NOW);
  expect(liveScopeGrant(db, blog, KEY, NOW)).toBeDefined();
  expect(liveScopeGrant(db, arena, KEY, NOW)).toBeUndefined();

  createScopeGrant(db, { title: KEY, ...permanent }, NOW);
  expect(liveScopeGrant(db, arena, KEY, NOW)).toBeDefined();
});

test("a timed grant ends at its deadline", () => {
  const { db, shop } = setup();
  createScopeGrant(db, { title: KEY, by: "dashboard", grantUntil: NOW + 60_000 }, NOW);
  expect(liveScopeGrant(db, shop, KEY, NOW + 59_999)).toBeDefined();
  expect(liveScopeGrant(db, shop, KEY, NOW + 60_000)).toBeUndefined();
});

test("invalid scopes and durations are refused", () => {
  const { db } = setup();
  expect(scopeIssue({ project: "apps" })).toBe("a project needs its folder");
  expect(scopeIssue({ folder: "apps", repo: "shop" })).toBe("a repo needs its project");
  expect(scopeIssue({ folder: " " })).toBe("folder must be a non-empty string");
  expect(() => createScopeGrant(db, { title: KEY, by: "dashboard" }, NOW)).toThrow("duration");
  expect(() => createScopeGrant(db, { title: KEY, by: "dashboard", grantUntil: NOW - 1 }, NOW)).toThrow("duration");
  expect(() => createScopeGrant(db, { title: KEY, by: "dashboard", grantUntil: NOW + 1, grantPermanent: true }, NOW)).toThrow("either");
});

test("revoking kills the agents in scope, but not one still covered by the session's own grant", async () => {
  const { db, shop, shop2, arena } = setup();
  const id = createScopeGrant(db, { title: KEY, folder: "apps", ...permanent }, NOW);
  // shop-2 has its own permanent grant for the key — it keeps its agent.
  const own = createApproval(db, { session: shop2.id, title: KEY, why: "x", target: "builder@203.0.113.5:22" }, NOW);
  decideApproval(db, own, { status: "approved", by: "dashboard", grantPermanent: true }, NOW);

  const killed: string[] = [];
  const row = await revokeScopeGrant(db, id, { kill: async (s, t) => { killed.push(`${s}|${t}`); } }, NOW + 1);
  expect(row?.revoked_at).toBe(NOW + 1);
  expect(killed).toContain(`${shop.id}|${KEY}`);
  expect(killed).not.toContain(`${shop2.id}|${KEY}`);
  expect(killed).not.toContain(`${arena.id}|${KEY}`);   // out of scope
  expect(listScopeGrants(db, NOW + 1)).toEqual([]);
  // A second revoke has nothing live to end.
  expect(await revokeScopeGrant(db, id, undefined, NOW + 2)).toBeNull();
});

test("keyCovered: a session's own grant or a scope grant keeps the agent", () => {
  const { db, shop, blog } = setup();
  expect(keyCovered(db, shop.id, KEY, NOW)).toBe(false);
  createScopeGrant(db, { title: KEY, folder: "apps", project: "apps", repo: "blog", ...permanent }, NOW);
  expect(keyCovered(db, blog.id, KEY, NOW)).toBe(true);
  expect(keyCovered(db, shop.id, KEY, NOW)).toBe(false);
  expect(keyCovered(db, "dev-unknown", KEY, NOW)).toBe(false);
});

test("the reaper ends expired grants once, kills their agents, and leaves a wider live grant's sessions alone", async () => {
  const { db, shop, blog } = setup();
  createScopeGrant(db, { title: KEY, folder: "apps", by: "dashboard", grantUntil: NOW + 1000 }, NOW);
  createScopeGrant(db, { title: KEY, folder: "apps", project: "apps", repo: "blog", ...permanent }, NOW);
  const killed: string[] = [];
  const agents = { kill: async (s: string) => { killed.push(s); } };
  await reapExpiredScopeGrants(db, agents, NOW + 1000);
  expect(killed).toContain(shop.id);
  expect(killed).not.toContain(blog.id);
  killed.length = 0;
  await reapExpiredScopeGrants(db, agents, NOW + 2000);
  expect(killed).toEqual([]);
});

test("scopeLabel", () => {
  expect(scopeLabel({ folder: null, project: null, repo: null })).toBe("all sessions");
  expect(scopeLabel({ folder: "apps", project: null, repo: null })).toBe("apps");
  expect(scopeLabel({ folder: "apps", project: "apps", repo: "shop" })).toBe("apps/apps/shop");
});
