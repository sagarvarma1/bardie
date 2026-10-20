// One agent turn at a time per user, so rapid-fire texts, reminders, and the
// morning brief never interleave in the same conversation.
const queues = new Map<number, Promise<unknown>>();

export function withUserLock<T>(userId: number, fn: () => Promise<T>): Promise<T> {
  const next = (queues.get(userId) ?? Promise.resolve()).then(fn, fn);
  queues.set(userId, next.catch(() => {}));
  return next;
}
