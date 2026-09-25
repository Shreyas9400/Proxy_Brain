/**
 * Minimal background job seam. Phase 1 deliberately avoids Redis/BullMQ —
 * jobs run in-process via queueMicrotask so the chat route can return a
 * response to the user before memory formation runs. Swapping in a real
 * queue later only means writing a new JobQueue implementation; call sites
 * (formation.ts, chat route) only depend on this interface.
 */
export interface JobQueue {
  enqueue(name: string, job: () => Promise<void>): void;
}

class InMemoryJobQueue implements JobQueue {
  enqueue(name: string, job: () => Promise<void>): void {
    queueMicrotask(() => {
      job().catch((err) => {
        // Intentionally not re-thrown: a background job failure must never
        // surface as a broken chat response. It is still logged loudly so
        // failures are visible in server logs / audit_log (jobs record
        // their own audit entries on success and failure).
        console.error(`[jobs] "${name}" failed:`, err);
      });
    });
  }
}

let queueSingleton: JobQueue | undefined;

export function getJobQueue(): JobQueue {
  if (!queueSingleton) queueSingleton = new InMemoryJobQueue();
  return queueSingleton;
}
