import assert from 'node:assert/strict';
import test from 'node:test';
import YAML from 'yaml';
import { buildFrontMatter, parseFrontMatter, prepareFrontMatter } from '../src/lib/frontmatter.ts';

const metadata = {
  uuid: 'shared-document',
  createdAt: '2026-10-20T00:00:00Z',
  updatedAt: '2026-10-20T01:00:00Z',
  title: '日本語と絵文字 📝',
  private: true,
  memos: [{ id: 'memo-1', side: 'right' as const, relativePos: 0.5, content: '非公開のメモ\n二行目' }],
};
const dates = { createdAt: '2026-10-19T00:00:00Z', updatedAt: '2026-10-19T01:00:00Z' };

for (const newline of ['\n', '\r\n']) {
  for (const bom of ['', '\uFEFF']) {
    test(`metadata and body survive ${JSON.stringify(newline)}, BOM=${!!bom}`, () => {
      const body = `本文 📝${newline}${newline}二段落${newline}`;
      const document = bom + buildFrontMatter(metadata).replace(/\n/g, newline) + body;
      assert.deepEqual(parseFrontMatter(document), { metadata, body });
      const prepared = prepareFrontMatter(document, dates);
      assert.equal(prepared.injected, false);
      assert.equal(prepared.content, document, 'reconcile must not rewrite an existing document');
      assert.deepEqual(prepared.metadata, metadata);
      assert.deepEqual(parseFrontMatter(buildFrontMatter(prepared.metadata) + body), { metadata, body });
    });
  }
}

test('repair an incomplete CRLF header without losing Private, memos or custom fields', () => {
  const data = { uuid: metadata.uuid, private: true, title: metadata.title, memos: metadata.memos, tags: ['日記'] };
  const body = '改行を保持\r\n二行目\r\n';
  const original = '\uFEFF---\r\n' + YAML.stringify(data).replace(/\n/g, '\r\n') + '---\r\n\r\n' + body;
  const prepared = prepareFrontMatter(original, dates);
  assert.equal(prepared.injected, true);
  assert.deepEqual(prepared.metadata, { ...metadata, ...dates });
  assert.equal(prepared.body, body);
  assert.match(prepared.content, /tags:\n  - 日記/);
  const second = prepareFrontMatter(prepared.content, dates);
  assert.equal(second.injected, false);
  assert.equal(second.content, prepared.content, 'reconcile must be idempotent');
});

test('a new document gets one stable UUID and retains its exact body', () => {
  const body = '新規\r\n---\r\n本文\r\n';
  const first = prepareFrontMatter(body, dates);
  assert.equal(first.body, body);
  assert.ok(first.metadata.uuid);
  assert.equal(first.metadata.private, false);
  assert.deepEqual(prepareFrontMatter(first.content, dates).metadata, first.metadata);
});

test('recognize a closing delimiter at EOF, and preserve extra leading blank lines in body', () => {
  const header = buildFrontMatter(metadata).trimEnd();
  assert.deepEqual(parseFrontMatter(header), { metadata, body: '' });
  assert.equal(parseFrontMatter(buildFrontMatter(metadata) + '\n\n本文').body, '\n\n本文');
});

for (const document of ['本文\r\n', '---\ninvalid: [\n---\n\n本文', '---\nuuid: incomplete\n---\n本文', '---\n- list\n---\n本文']) {
  test(`invalid or absent metadata leaves the input intact: ${JSON.stringify(document)}`, () => {
    assert.deepEqual(parseFrontMatter(document), { metadata: null, body: document });
  });
}
