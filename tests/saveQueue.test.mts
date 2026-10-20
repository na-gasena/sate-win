import assert from 'node:assert/strict';
import test from 'node:test';
import { createSaveQueue } from '../src/lib/saveQueue.ts';

test('a slow earlier save cannot finish after a newer write, and closing waits for both', async () => {
  const queue = createSaveQueue();
  const gate = Promise.withResolvers<void>();
  const events: string[] = [];
  const first = queue.enqueue(async () => {
    events.push('first-start');
    await gate.promise;
    events.push('first-end');
    return true;
  });
  const second = queue.enqueue(async () => {
    events.push('second');
    return true;
  });
  const closing = queue.wait();
  await Promise.resolve();
  assert.deepEqual(events, ['first-start']);
  assert.equal(queue.pending, 2);
  gate.resolve();
  assert.equal(await closing, true);
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.deepEqual(events, ['first-start', 'first-end', 'second']);
  assert.equal(queue.pending, 0);
});

test('failed writes stop closing but do not prevent a subsequent save retry', async () => {
  const queue = createSaveQueue();
  const failed = queue.enqueue(async () => false);
  const closing = queue.wait();
  assert.equal(await failed, false);
  assert.equal(await closing, false);
  assert.equal(await queue.enqueue(async () => true), true);
  assert.equal(await queue.wait(), true);
});
