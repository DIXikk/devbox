// POST /api/sessions/:id/upload — browser upload (dashboard paste / drag & drop / "Upload file")
// into a session's .inbox. The browser-only counterpart of ⌘⇧V on the mac.
import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../src/config";
import type { ConfigRepo } from "../src/configrepo";
import { insertSession, openDb, type SessionRow } from "../src/db";
import { createApp, type ApiDeps } from "../src/api";
import { CloneQueue } from "../src/clone";
import { SessionManager } from "../src/sessions";
import { MAX_INBOX_BYTES } from "../src/inbox";

const OPERATOR = "100.64.0.7";      // tailnet
const CONTAINER = "172.18.0.5";     // docker bridge — a session container

function setup(opts: { addr?: string; host?: SessionRow["host"]; noWorkspace?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "devd-upload-"));
  if (!opts.noWorkspace) mkdirSync(join(root, "shop", "cms", ".git", "info"), { recursive: true });
  const db = openDb(":memory:");
  insertSession(db, {
    id: "dev-shop-cms", folder: "shop", project: "shop", repo: "cms", container: "c",
    port_base: 4400, status: "running", solo: 0, created_at: 0, last_active_at: 0, important: 0,
    ...(opts.host ? { host: opts.host } : {}),
  });
  const listener: ApiDeps["listener"] = {
    open: async () => {}, notify: () => {}, openUrl: async () => {}, proxyBridge: async () => {}, dbRequest: async () => {}, sshApproval: async () => {},
    clipboard: async () => ({ status: 204, contentType: null, body: new Uint8Array() }),
  };
  const mgr = new SessionManager({ db, cfg: DEFAULT_CONFIG, root, image: "alpine:3", extraMounts: [], cmd: ["sleep", "infinity"] });
  const configRepo: ConfigRepo = { read: () => DEFAULT_CONFIG, write: async () => {} };
  const a = createApp({
    mgr, db, cfg: DEFAULT_CONFIG, root, tree: async () => [], listener,
    notify: () => {}, stats: () => ({ sessions: [], disk: { usedBytes: 0, totalBytes: 100 } }),
    cloneQueue: new CloneQueue({ db, root, tree: async () => [] }), configRepo,
    backup: { build: async () => "/tmp/x", restore: async () => {} },
    remoteAddr: () => opts.addr ?? OPERATOR,
  });
  return { a, db, root };
}

const upload = (a: ReturnType<typeof setup>["a"], body: Uint8Array, name: string, session = "dev-shop-cms") =>
  a.request(`/api/sessions/${session}/upload`, {
    method: "POST",
    headers: { "x-devbox-filename": encodeURIComponent(name), "content-type": "application/octet-stream" },
    body,
  });

test("operator upload stages the file in the session .inbox and returns the container path", async () => {
  const { a, db, root } = setup();
  const r = await upload(a, new Uint8Array([1, 2, 3]), "screen shot.png");
  expect(r.status).toBe(200);
  const { path } = (await r.json()) as { path: string };
  expect(path).toBe("/workspace/.inbox/screen_shot.png");
  expect(readFileSync(join(root, "shop", "cms", ".inbox", "screen_shot.png"))).toEqual(Buffer.from([1, 2, 3]));
  // the inbox stays out of git status
  expect(readFileSync(join(root, "shop", "cms", ".git", "info", "exclude"), "utf8")).toContain(".inbox/");
  const ev = db.query("SELECT session_id, data FROM events WHERE type = 'file_inbox'").all() as { session_id: string; data: string }[];
  expect(ev).toHaveLength(1);
  expect(ev[0].session_id).toBe("dev-shop-cms");
  expect(JSON.parse(ev[0].data)).toMatchObject({ name: "screen_shot.png", size: 3, source: "upload" });
});

test("a second upload with the same name does not overwrite the first", async () => {
  const { a } = setup();
  const p1 = ((await (await upload(a, new Uint8Array([1]), "a.txt")).json()) as { path: string }).path;
  const p2 = ((await (await upload(a, new Uint8Array([2]), "a.txt")).json()) as { path: string }).path;
  expect(p1).toBe("/workspace/.inbox/a.txt");
  expect(p2).toBe("/workspace/.inbox/a-1.txt");
});

test("a session container (non-operator address) cannot upload into a workspace", async () => {
  const { a, root } = setup({ addr: CONTAINER });
  const r = await upload(a, new Uint8Array([1]), "x.txt");
  expect(r.status).toBe(403);
  expect(existsSync(join(root, "shop", "cms", ".inbox"))).toBe(false);
});

test("unknown address fails closed", async () => {
  const { a } = setup({ addr: "" });
  expect((await upload(a, new Uint8Array([1]), "x.txt")).status).toBe(403);
});

test("unknown session 404, InstaBox session 409, missing workspace 409", async () => {
  expect((await upload(setup().a, new Uint8Array([1]), "x.txt", "dev-nope")).status).toBe(404);
  expect((await upload(setup({ host: "instabox" }).a, new Uint8Array([1]), "x.txt")).status).toBe(409);
  expect((await upload(setup({ noWorkspace: true }).a, new Uint8Array([1]), "x.txt")).status).toBe(409);
});

test("invalid names, empty and oversized bodies are refused", async () => {
  const { a, root } = setup();
  expect((await upload(a, new Uint8Array([1]), "..")).status).toBe(400);
  expect((await upload(a, new Uint8Array([1]), "")).status).toBe(400);
  const badUri = await a.request("/api/sessions/dev-shop-cms/upload", { method: "POST", headers: { "x-devbox-filename": "%E0%A4%A" }, body: new Uint8Array([1]) });
  expect(badUri.status).toBe(400);
  expect((await upload(a, new Uint8Array(), "empty.txt")).status).toBe(400);
  const big = await upload(a, new Uint8Array(MAX_INBOX_BYTES + 1), "big.bin");
  expect(big.status).toBe(413);
  expect(existsSync(join(root, "shop", "cms", ".inbox", "big.bin"))).toBe(false);
});

test("path traversal in the file name stays inside .inbox", async () => {
  const { a, root } = setup();
  const r = await upload(a, new Uint8Array([9]), "../../etc/passwd");
  expect(r.status).toBe(200);
  expect(((await r.json()) as { path: string }).path).toBe("/workspace/.inbox/passwd");
  expect(existsSync(join(root, "shop", "cms", ".inbox", "passwd"))).toBe(true);
});
