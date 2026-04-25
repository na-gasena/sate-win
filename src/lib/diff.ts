/**
 * 行単位の単純な diff（LCS ベース）。
 *
 * Rewind モードで「あるスナップショットと一つ前のスナップショット」の差分を
 * 視覚化するために使う。両バージョンの行をマージして、`same` / `added` /
 * `removed` のタグ付きで返す。
 *
 * 大きすぎる文書では計算量が爆発するので、上限を超えたら diff を諦めて
 * すべて `same` として返す（光る演出は出ないがクラッシュはしない）。
 */

export type DiffTag = 'same' | 'added' | 'removed';

export interface DiffLine {
  text: string;
  tag: DiffTag;
}

const MAX_LINES = 2000;

export function diffLines(prev: string, curr: string): DiffLine[] {
  const a = prev.split('\n');
  const b = curr.split('\n');
  const m = a.length;
  const n = b.length;

  if (m > MAX_LINES || n > MAX_LINES) {
    return b.map((text) => ({ text, tag: 'same' }));
  }

  // dp[i][j] = LCS length of a[i..] and b[j..]
  const dp: Uint32Array[] = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      result.push({ text: b[j], tag: 'same' });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ text: a[i], tag: 'removed' });
      i++;
    } else {
      result.push({ text: b[j], tag: 'added' });
      j++;
    }
  }
  while (i < m) result.push({ text: a[i++], tag: 'removed' });
  while (j < n) result.push({ text: b[j++], tag: 'added' });
  return result;
}
