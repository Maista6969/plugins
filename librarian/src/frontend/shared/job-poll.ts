import { gql } from "@apollo/client";

const FIND_JOB_QUERY = gql`
  query LibrarianFindJob($id: ID!) {
    findJob(input: { id: $id }) {
      id
      status
      progress
      error
      description
    }
  }
`;

export const TERMINAL_STATUSES = ["FINISHED", "CANCELLED", "FAILED"];

export function isTerminalStatus(status: string | null | undefined): boolean {
  return !!status && TERMINAL_STATUSES.indexOf(status) !== -1;
}

export interface JobInfo {
  id: string;
  status: string;
  progress: number | null;
  error: string | null;
  description: string | null;
}

export function pollJob(
  client: any,
  jobId: string,
  onUpdate: (job: JobInfo) => void,
  intervalMs = 1000,
) {
  let stopped = false;

  async function tick() {
    if (stopped) return;
    try {
      const { data } = await client.query({
        query: FIND_JOB_QUERY,
        variables: { id: jobId },
        fetchPolicy: "network-only",
      });
      const job = data && data.findJob;
      if (job) {
        onUpdate(job);
        if (TERMINAL_STATUSES.indexOf(job.status) !== -1) {
          stopped = true;
          return;
        }
      }
    } catch (e) {
      // Transient poll errors are ignored and we keep trying until stop() is
      // called or the job actually terminates
    }
    if (!stopped) {
      setTimeout(tick, intervalMs);
    }
  }

  tick();
  return function stop() {
    stopped = true;
  };
}
