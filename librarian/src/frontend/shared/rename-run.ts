import { useCallback, useEffect, useRef, useState } from "react";
import { useApolloClient } from "@apollo/client";
import { pollJob, isTerminalStatus, JobInfo } from "./job-poll.js";
import { runRenameTask, fetchRunResult, RunResult } from "./stash-api.js";
import { useReloadOpenFailures } from "./OpenFailuresContext.js";

async function resultOf(client: any, runId: string, job: JobInfo) {
  // a cancelled run is killed before it can record anything
  if (job.status !== "FINISHED") {
    return null;
  }
  try {
    return await fetchRunResult(client, runId);
  } catch (e) {
    return null;
  }
}

export function useRenameJob(onFinished?: (result: RunResult | null) => void) {
  const client = useApolloClient();
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobInfo | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const stopRef = useRef<null | (() => void)>(null);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;
  const reloadOpenFailures = useReloadOpenFailures();

  const reset = useCallback(() => {
    if (stopRef.current) {
      stopRef.current();
      stopRef.current = null;
    }
    setJobId(null);
    setJob(null);
    setResult(null);
  }, []);

  useEffect(() => reset, [reset]);

  const start = useCallback(
    async (args: Record<string, unknown>) => {
      reset();
      const run = await runRenameTask(client, args);
      setJobId(run.jobId);
      stopRef.current = pollJob(client, run.jobId, async (info) => {
        setJob(info);
        if (isTerminalStatus(info.status)) {
          const found = await resultOf(client, run.runId, info);
          setResult(found);
          reloadOpenFailures();
          if (onFinishedRef.current) {
            onFinishedRef.current(found);
          }
        }
      });
    },
    [client, reset, reloadOpenFailures],
  );

  const running = !!jobId && (!job || !isTerminalStatus(job.status));
  return { jobId, job, result, running, start, reset };
}

export async function runRenameAndWait(
  client: any,
  args: Record<string, unknown>,
): Promise<RunResult | null> {
  const run = await runRenameTask(client, args);
  const job = await new Promise<JobInfo>((resolve) => {
    pollJob(client, run.jobId, (info) => {
      if (isTerminalStatus(info.status)) {
        resolve(info);
      }
    });
  });
  return resultOf(client, run.runId, job);
}
