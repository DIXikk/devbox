import { Download, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type SelfUpdateStatus } from "../api";
import { ActionButton, ConfirmButton, Section } from "./primitives";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { selfUpdateView } from "../selfUpdateView";

/** "Update now": starts the nightly devbox-update right away. It deploys origin/main only after CI
 *  passed, so the button cannot ship anything the night would not. */
export function SelfUpdate() {
  const [status, setStatus] = useState<SelfUpdateStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try { setStatus(await api.selfUpdate()); setErr(null); }
    catch (e) { setErr((e as Error).message); }
  }
  const running = status?.unit.state === "running";
  // Faster while an update runs, so the result (and the devd restart) shows up soon.
  useEffect(() => {
    load();
    const t = setInterval(load, running ? 5_000 : 30_000);
    return () => clearInterval(t);
  }, [running]);

  async function start() {
    await api.runSelfUpdate();
    await load();
  }

  const v = status ? selfUpdateView(status) : null;
  return (
    <Section label="devbox update">
      <Card><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1 text-sm">
          {v ? <div className="font-medium">{v.headline}</div> : <Skeleton className="h-5 w-56" />}
          {v?.warning && <div className="text-amber-600 dark:text-amber-400">{v.warning}</div>}
          {v?.notes.map((n) => <div key={n} className="text-muted-foreground">{n}</div>)}
          {err && <div role="alert" className="text-destructive">{err}</div>}
          <div className="text-xs text-muted-foreground">
            Deploys origin/main after CI passed — the same run as the nightly update.
          </div>
        </div>
        <div className="flex-none">
          {v?.action === "running" && (
            <ActionButton variant="outline" disabled onAction={() => {}} icon={<Loader2 className="h-4 w-4 animate-spin" />}>Updating…</ActionButton>
          )}
          {v?.action === "update" && (
            <ActionButton variant="outline" onAction={start} onError={setErr} icon={<Download className="h-4 w-4" />}>Update now</ActionButton>
          )}
          {v?.action === "confirm" && (
            <ConfirmButton variant="outline" size="default" confirmLabel="Update and restart devd?" onConfirm={start} onError={setErr}>
              <Download className="h-4 w-4" />
              Update now
            </ConfirmButton>
          )}
        </div>
      </CardContent></Card>
    </Section>
  );
}
