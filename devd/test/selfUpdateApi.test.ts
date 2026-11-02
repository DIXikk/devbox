import { expect, test } from "bun:test";
import { createApp } from "../src/api";
import { listEvents, openDb } from "../src/db";
import type { SelfUpdateStatus } from "../src/selfUpdate";

const STATUS: SelfUpdateStatus = {
  running: "a".repeat(40), deployed: "a".repeat(40), latest: "b".repeat(40), behind: 2, restart: true, infra: [],
  unit: { state: "ok", startedAt: null, finishedAt: null, nextAt: null, message: null },
  lastOutcome: { kind: "up-to-date" }, fetchError: null,
};

function app(run: () => Promise<{ ok: true } | null>, withSelfUpdate = true) {
  const db = openDb(":memory:");
  const a = createApp({
    db, mgr: {} as never, cfg: { version: 1, settings: { autoStopHours: 4, portRangeStart: 40100, portsPerSession: 10, diskWarnPercent: 80 }, folders: {} },
    root: "/tmp", tree: async () => [], listener: {} as never, notify: () => {}, stats: () => ({ sessions: [], disk: {} }),
    cloneQueue: {} as never, configRepo: {} as never, dashboardDir: "/tmp",
    ...(withSelfUpdate ? { selfUpdate: { status: async () => STATUS, run } } : {}),
  } as never);
  return { a, db };
}

test("GET /api/self-update returns the status", async () => {
  const res = await app(async () => ({ ok: true })).a.request("/api/self-update");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual(STATUS);
});

test("POST /api/self-update/run starts the update → 202 and an event", async () => {
  const { a, db } = app(async () => ({ ok: true }));
  const res = await a.request("/api/self-update/run", { method: "POST" });
  expect(res.status).toBe(202);
  expect(listEvents(db, { limit: 10 }).some((e: { type: string }) => e.type === "self_update_started")).toBe(true);
});

test("POST /api/self-update/run while an update runs → 409", async () => {
  const res = await app(async () => null).a.request("/api/self-update/run", { method: "POST" });
  expect(res.status).toBe(409);
});

test("a failed start → 500 with the reason", async () => {
  const res = await app(async () => { throw new Error("Unit devbox-update.service not found."); }).a.request("/api/self-update/run", { method: "POST" });
  expect(res.status).toBe(500);
  expect(((await res.json()) as { error: string }).error).toContain("not found");
});

test("without wiring both routes answer 404", async () => {
  const { a } = app(async () => ({ ok: true }), false);
  expect((await a.request("/api/self-update")).status).toBe(404);
  expect((await a.request("/api/self-update/run", { method: "POST" })).status).toBe(404);
});
