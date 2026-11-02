import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { parseDialogAnswer, sshDialogMessage, sshDialogScript, SSH_DURATION_PRESETS } from "../src/sshPrompt";

const REQ = {
  id: "abc", title: "shop", why: "restart hermes", target: "root@1.2.3.4",
  cwd: "/workspace", project: "web", repo: "app",
};

/** Evaluates only the data line of the script — the part that carries the request. */
function promptData(script: string): { title: string; message: string; presets: number[] } {
  const context: { promptData?: { title: string; message: string; presets: number[] } } = {};
  runInNewContext(script.split("\n")[0]!, context);
  return context.promptData!;
}

test("dialog separates the verified key and session from what the agent claims", () => {
  expect(sshDialogMessage(REQ)).toBe(
    "Key: shop\nSession: web/app\n\nThe agent claims:\nrestart hermes\nTarget: root@1.2.3.4\n(from /workspace)",
  );
  expect(sshDialogMessage({ ...REQ, target: null })).not.toContain("Target:");
});

// A newline inside an agent-supplied value must not become another dialog line — otherwise the agent
// could pass its own text off as another "verified" line.
test("request data cannot inject script or forge verified lines", () => {
  const why = 'first"\n\r\u2028\u2029"; throw Error("injected"); //';
  const data = promptData(sshDialogScript({ ...REQ, why }));
  expect(data.message).toContain('first"    "; throw Error("injected"); //');
  expect(data.message.split("\n")).toHaveLength(7);
  expect(data.presets).toEqual([10, 60, 240, 480, 720, 960]);
  expect(SSH_DURATION_PRESETS).toEqual([10, 60, 240, 480, 720, 960]);
});

test("one-time, timed, permanent and deny answers stay distinct", () => {
  for (const minutes of [0, ...SSH_DURATION_PRESETS, 37, 1440]) {
    const answer = { decision: "approve", grantMinutes: minutes } as const;
    expect(parseDialogAnswer(JSON.stringify(answer))).toEqual(answer);
  }
  const forever = { decision: "approve", grantMinutes: 0, grantPermanent: true } as const;
  expect(parseDialogAnswer(JSON.stringify(forever))).toEqual(forever);
  expect(parseDialogAnswer('{"decision":"deny","grantMinutes":0}')).toEqual({ decision: "deny", grantMinutes: 0 });
});

test("a closed, invalid or conflicting answer never becomes an approval", () => {
  for (const raw of ["", "null", "gibberish", "{}", '["approve"]']) {
    expect(parseDialogAnswer(raw)).toBeNull();
  }
  for (const patch of [
    { decision: "maybe" }, { grantMinutes: "60" }, { grantMinutes: -1 },
    { grantMinutes: 1.5 }, { grantMinutes: null }, { grantMinutes: Number.MAX_SAFE_INTEGER },
    { grantPermanent: "true" }, { grantPermanent: true }, { decision: "deny" },
    { decision: "deny", grantMinutes: 0, grantPermanent: true },
  ]) {
    expect(parseDialogAnswer(JSON.stringify({ decision: "approve", grantMinutes: 60, ...patch }))).toBeNull();
  }
});

test("a request from a shared session says so in the title and body (final review I4)", () => {
  const data = promptData(sshDialogScript({ ...REQ, shared: true }));
  expect(data.title).toBe("Devbox: SSH key request from a shared session");
  expect(data.message).toContain("web/app (from a shared session)");
  expect(data.message).toContain("may come from a terminal guest");
  expect(promptData(sshDialogScript(REQ)).title).toBe("Devbox: agent wants an SSH key");
  expect(sshDialogMessage(REQ)).not.toContain("shared");
});
