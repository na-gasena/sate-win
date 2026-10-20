import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveSlug, projectForPublish } from '../src/lib/publish.ts';

test('published Markdown includes only public metadata, preserving Japanese and body newlines', () => {
  const input = {
    title: '公開タイトル', slug: '2026-10-20-001', body: '本文\r\n二行目\r\n',
    uuid: 'internal-id', private: true, memos: [{ content: '秘密のメモ' }],
  };
  const projected = projectForPublish(input);
  assert.match(projected, /title: 公開タイトル/);
  assert.match(projected, /2026-10-20/);
  assert.ok(projected.endsWith('本文\r\n二行目\n'));
  assert.doesNotMatch(projected, /uuid:|updated:|memos:|private:/);
  assert.doesNotMatch(projected, /internal-id|秘密のメモ/);
  assert.equal(deriveSlug('2026-10-20-001.md'), '2026-10-20-001');
});

test('untitled publication without a date does not add an empty header', () => {
  assert.equal(projectForPublish({ title: null, slug: 'draft', body: '本文' }), '本文\n');
});
