import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lastOutcome, selfUpdateStatus, startSelfUpdate, type SelfUpdateDeps } from "../src/selfUpdate";
import { sh } from "./helpers/sh";

type Run = SelfUpdateDeps["run"];

/** Real git; systemctl and journalctl answer from the given stubs. */
function runner(stubs: { unit?: string; journal?: string; active?: boolean; start?: number }, calls: string[][] = []): Run {
  return async (cmd, opts) => {
    calls.push(cmd);
    if (cmd[0] === "git") {
      const p = Bun.spawn(cmd, { cwd: opts?.cwd, stdout: "pipe", stderr: "pipe" });
      const code = await p.exited;
      return { code, stdout: await new Response(p.stdout).text(), stderr: await new Response(p.stderr).text() };
    }
    if (cmd[0] === "sh") return { code: 0, stdout: stubs.unit ?? "##unit\nresult=success\nactive=inactive\nload=loaded\n", stderr: "" };
    if (cmd[0] === "journalctl") return { code: 0, stdout: stubs.journal ?? "", stderr: "" };
    if (cmd[1] === "is-active") return { code: stubs.active ? 0 : 3, stdout: "", stderr: "" };
    if (cmd[1] === "start") return { code: stubs.start ?? 0, stdout: "", stderr: stubs.start ? "Unit not found." : "" };
    throw new Error(`unexpected ${cmd.join(" ")}`);
  };
}

function commit(dir: string, file: string) {
  mkdirSync(join(dir, file, ".."), { recursive: true });
  writeFileSync(join(dir, file), `${Math.random()}\n`);
  sh(dir, "git", "add", "."); sh(dir, "git", "commit", "-qm", file);
}

/** origin with one commit, and the server checkout cloned from it. */
function setup() {
  const root = mkdtempSync(join(tmpdir(), "devd-selfupdate-"));
  const origin = join(root, "origin.git");
  sh(root, "git", "init", "-q", "--bare", "-b", "main", origin);
  const work = join(root, "work");
  sh(root, "git", "clone", "-q", origin, work);
  sh(work, "git", "config", "user.email", "t@t"); sh(work, "git", "config", "user.name", "t");
  sh(work, "git", "checkout", "-qb", "main");
  commit(work, "README.md");
  sh(work, "git", "push", "-q", "origin", "main");
  const server = join(root, "server");
  sh(root, "git", "clone", "-q", origin, server);
  return { work, server };
}

const head = (dir: string) => sh(dir, "git", "rev-parse", "HEAD").stdout.trim();

test("up to date: nothing behind, no restart", async () => {
  const { server } = setup();
  const s = await selfUpdateStatus({ run: runner({}), repoDir: server, runningCommit: head(server) });
  expect(s).toMatchObject({ deployed: head(server), latest: head(server), behind: 0, restart: false, infra: [], fetchError: null });
  expect(s.unit.state).toBe("ok");
});

test("new commits on origin/main: counts them and says whether devd restarts", async () => {
  const { work, server } = setup();
  commit(work, "dashboard/src/a.ts");
  sh(work, "git", "push", "-q", "origin", "main");
  let s = await selfUpdateStatus({ run: runner({}), repoDir: server, runningCommit: null });
  expect(s).toMatchObject({ behind: 1, latest: head(work), restart: false });

  commit(work, "devd/src/b.ts");
  commit(work, "infra/devd.service");
  sh(work, "git", "push", "-q", "origin", "main");
  s = await selfUpdateStatus({ run: runner({}), repoDir: server, runningCommit: null });
  expect(s).toMatchObject({ behind: 3, restart: true, infra: ["infra/devd.service"] });
  // The status only fetches — the checkout itself stays where it was.
  expect(s.deployed).toBe(head(server));
});

test("a failed fetch is reported and the status comes from what is already fetched", async () => {
  const { server } = setup();
  sh(server, "git", "remote", "set-url", "origin", "/nonexistent/repo.git");
  const s = await selfUpdateStatus({ run: runner({}), repoDir: server, runningCommit: null });
  expect(s.fetchError).toBeTruthy();
  expect(s.behind).toBe(0);
});

test("the last outcome is the last JSON line of the update journal", () => {
  const journal = [
    "deploying 0aef806 → f10ba37 (3 files)",
    '{"kind":"deployed","commit":"f10ba37"}',
    "CI on 713ce00 is pending; not deploying yet",
    '{"kind":"waiting-for-ci","commit":"713ce00","ci":"pending"}',
    "",
  ].join("\n");
  expect(lastOutcome(journal)).toEqual({ kind: "waiting-for-ci", commit: "713ce00", ci: "pending" });
  expect(lastOutcome("")).toBeNull();
  expect(lastOutcome('{"kind":"depl')).toBeNull();
});

test("start: refuses while the update runs, otherwise starts the unit without waiting", async () => {
  expect(await startSelfUpdate({ run: runner({ active: true }) })).toBeNull();
  const calls: string[][] = [];
  expect(await startSelfUpdate({ run: runner({}, calls) })).toEqual({ ok: true });
  expect(calls.at(-1)).toEqual(["systemctl", "start", "--no-block", "devbox-update.service"]);
  await expect(startSelfUpdate({ run: runner({ start: 5 }) })).rejects.toThrow("Unit not found");
});
