import { readFileSync } from "node:fs";

export interface SshApprovalReq {
  id: string; title: string; why: string;
  target?: string | null; cwd?: string | null; project?: string | null; repo?: string | null;
  /** The request came from a shared (or previously shared) session — the terminal guest may have sent it. */
  shared?: boolean;
}

export interface SshApprovalAnswer {
  decision: "approve" | "deny";
  grantMinutes: number;
  grantPermanent?: boolean;
}

/** Duration presets in minutes — the same choices as the web `<select>` and the iOS app. */
export const SSH_DURATION_PRESETS = [10, 60, 240, 480, 720, 960] as const;

/** JavaScript Date limit; a grant beyond it would be silently shortened (see devd parseGrantDuration). */
const MAX_TIMESTAMP = 8_640_000_000_000_000;

// Agent-supplied values stay on one line, so the agent cannot fake a line structure through its own
// `why`/`target`/`cwd` and pass text off as another "verified" dialog line.
const singleLine = (value: string) => value.replace(/[\r\n\u0085\u2028\u2029]/g, " ");

/** Facts held by devd — the key (verified against 1Password) and the project/repo from the session —
 *  are at the top; the target, like `why` and `cwd`, is chosen by the container/agent, so it is
 *  under its own heading in the dialog, not among the verified facts. */
export function sshDialogMessage(r: SshApprovalReq): string {
  const where = r.project && r.repo ? `${singleLine(r.project)}/${singleLine(r.repo)}` : "unknown session";
  return [
    `Key: ${singleLine(r.title)}`,
    `Session: ${where}${r.shared === true ? " (from a shared session)" : ""}`,
    ...(r.shared === true ? ["This session is or was shared — the request may come from a terminal guest, not your agent."] : []),
    "",
    "The agent claims:",
    singleLine(r.why),
    ...(r.target ? [`Target: ${singleLine(r.target)}`] : []),
    ...(r.cwd ? [`(from ${singleLine(r.cwd)})`] : []),
  ].join("\n");
}

/** AppKit through the macOS JXA runtime: one native dialog with a duration picker, no extra installed
 *  helper. The request text goes in as JSON data, never interpolated as executable script. */
export function sshDialogScript(r: SshApprovalReq): string {
  const data = {
    title: r.shared === true ? "Devbox: SSH key request from a shared session" : "Devbox: agent wants an SSH key",
    message: sshDialogMessage(r),
    presets: SSH_DURATION_PRESETS,
  };
  return `var promptData = ${JSON.stringify(data)};\n${readFileSync(new URL("./sshPrompt.jxa", import.meta.url), "utf8")}`;
}

export function parseDialogAnswer(stdout: string): SshApprovalAnswer | null {
  try {
    const answer = JSON.parse(stdout);
    if (!answer || (answer.decision !== "approve" && answer.decision !== "deny")) return null;
    if (!Number.isSafeInteger(answer.grantMinutes) || answer.grantMinutes < 0 ||
        Date.now() + answer.grantMinutes * 60_000 > MAX_TIMESTAMP) return null;
    if (answer.grantPermanent !== undefined && typeof answer.grantPermanent !== "boolean") return null;
    if (answer.decision === "deny") {
      return answer.grantMinutes === 0 && !answer.grantPermanent ? { decision: "deny", grantMinutes: 0 } : null;
    }
    if (answer.grantPermanent === true) {
      return answer.grantMinutes === 0 ? { decision: "approve", grantMinutes: 0, grantPermanent: true } : null;
    }
    return { decision: "approve", grantMinutes: answer.grantMinutes };
  } catch { return null; } // closed / timeout / malformed output → nothing (fail-closed)
}
