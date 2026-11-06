/**
 * In-process keyed mutex. Unstuck runs as one Node process (SQLite, single instance), so this is enough to make
 * per-invoice work sequential across concurrent requests (agent run, "Diagnose all", "Diagnose again", approvals).
 * Kept on globalThis so dev reloads or duplicated module instances share the same locks.
 *
 * Waiters run in arrival order; a failure in one holder never blocks the next. Different keys never wait for each
 * other, so nesting two *different* keys (e.g. "diagnose:x" then "act:x") cannot deadlock; never nest the same key.
 */
const locks = ((globalThis as unknown as { __unstuckLocks?: Map<string, Promise<void>> }).__unstuckLocks ??= new Map<string, Promise<void>>());

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  const tail = previous.then(() => mine);
  locks.set(key, tail);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === tail) locks.delete(key);
  }
}

/** Test/diagnostic hook: how many keys currently have a holder or waiters. */
export function activeLocks(): number {
  return locks.size;
}
