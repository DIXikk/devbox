import { expect, test } from "bun:test";
import type { SelfUpdateStatus } from "./api";
import { selfUpdateView } from "./selfUpdateView";

const A = "a".repeat(40), B = "b".repeat(40);
const status = (over: Partial<SelfUpdateStatus> = {}): SelfUpdateStatus => ({
  running: A, deployed: A, latest: A, behind: 0, restart: false, infra: [],
  unit: { state: "ok", startedAt: null, finishedAt: null, nextAt: null, message: null },
  lastOutcome: null, fetchError: null, ...over,
});

test("up to date: says so with the commit, nothing to run", () => {
  const v = selfUpdateView(status());
  expect(v.headline).toBe("Up to date · aaaaaaa");
  expect(v.action).toBe("none");
});

test("behind without a devd restart: a plain one-click update", () => {
  const v = selfUpdateView(status({ latest: B, behind: 1 }));
  expect(v.headline).toBe("1 new commit on main · aaaaaaa → bbbbbbb");
  expect(v.action).toBe("update");
  expect(v.warning).toBeNull();
});

test("behind with a devd restart: needs a confirmation and warns about the vault", () => {
  const v = selfUpdateView(status({ latest: B, behind: 3, restart: true }));
  expect(v.headline).toBe("3 new commits on main · aaaaaaa → bbbbbbb");
  expect(v.action).toBe("confirm");
  expect(v.warning).toContain("vault");
});

test("infra changes are listed — the update does not apply them", () => {
  const v = selfUpdateView(status({ latest: B, behind: 1, infra: ["infra/devd.service"] }));
  expect(v.notes.join(" ")).toContain("infra/devd.service");
});

test("a running update blocks the button", () => {
  const v = selfUpdateView(status({ latest: B, behind: 1, unit: { state: "running", startedAt: 1, finishedAt: null, nextAt: null, message: null } }));
  expect(v.action).toBe("running");
  expect(v.headline).toBe("Updating…");
});

test("the last outcome explains why nothing was deployed", () => {
  expect(selfUpdateView(status({ latest: B, behind: 1, lastOutcome: { kind: "waiting-for-ci", commit: B, ci: "pending" } })).notes)
    .toContain("Last run: waiting for CI on bbbbbbb (pending).");
  expect(selfUpdateView(status({ lastOutcome: { kind: "blocked", reason: "the server checkout has local changes" } })).notes)
    .toContain("Last run: blocked — the server checkout has local changes.");
  expect(selfUpdateView(status({ lastOutcome: { kind: "rolled-back", commit: B, reason: "devd did not report healthy" } })).notes)
    .toContain("Last run: rolled back from bbbbbbb — devd did not report healthy.");
  expect(selfUpdateView(status({ lastOutcome: { kind: "up-to-date" } })).notes).toEqual([]);
});

test("a failed fetch is shown, and the update can still be started", () => {
  const v = selfUpdateView(status({ fetchError: "Could not resolve host: github.com" }));
  expect(v.notes).toContain("Could not check GitHub: Could not resolve host: github.com");
  expect(v.action).toBe("update");
});
