/** Serialize file writes and allow switching/closing to wait for every queued write. */
export function createSaveQueue() {
  let tail = Promise.resolve(true);
  const pending = new Set<Promise<boolean>>();
  return {
    enqueue(save: () => Promise<boolean>): Promise<boolean> {
      const request = tail.then(save).catch((error) => {
        console.error('Unexpected save error:', error);
        return false;
      });
      tail = request;
      pending.add(request);
      void request.then(() => pending.delete(request));
      return request;
    },
    async wait(): Promise<boolean> {
      return (await Promise.all([...pending])).every(Boolean);
    },
    get pending(): number {
      return pending.size;
    },
  };
}
