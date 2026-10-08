/**
 * 文書内検索プラグイン（Cmd+F）
 *
 * - Plugin state にクエリ・ヒット範囲・現在位置を持ち、Decoration でハイライトする
 * - 検索はテキストブロック（段落・見出し等）単位。ブロックをまたぐヒットは扱わない
 * - 文書が編集されたら再検索し、現在位置はなるべく同じ箇所に留める
 * - UI（FindBar）へはモジュールレベルのリスナーで件数・現在位置を通知する
 */
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import type { EditorState, Transaction } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import type { EditorView } from '@milkdown/prose/view';
import type { Node as ProseMirrorNode } from '@milkdown/prose/model';
import { $prose } from '@milkdown/utils';

interface Match {
  from: number;
  to: number;
}

interface SearchState {
  query: string;
  matches: Match[];
  current: number; // matches のインデックス。ヒットなしなら -1
  decorations: DecorationSet;
}

type SearchMeta =
  | { type: 'setQuery'; query: string; anchor: number }
  | { type: 'step'; delta: number };

export interface SearchStatus {
  current: number; // 1 始まり。ヒットなしなら 0
  total: number;
}

export const searchPluginKey = new PluginKey<SearchState>('sate-search');

const EMPTY: SearchState = { query: '', matches: [], current: -1, decorations: DecorationSet.empty };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * テキストブロックごとに文字列を組み立てて検索する。
 * テキスト以外のインライン要素（改行・画像等）は nodeSize 1 なので、
 * 1文字のプレースホルダに置き換えれば文字列上の index と doc の pos が 1:1 で対応する。
 */
function findMatches(doc: ProseMirrorNode, query: string): Match[] {
  if (!query) return [];
  const re = new RegExp(escapeRegExp(query), 'gi');
  const matches: Match[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = '';
    node.forEach((child) => {
      text += child.isText ? child.text! : '￼';
    });
    const start = pos + 1;
    for (const m of text.matchAll(re)) {
      matches.push({ from: start + m.index, to: start + m.index + m[0].length });
    }
    return false;
  });
  return matches;
}

/** anchor 以降で最初のヒット。無ければ先頭に回り込む */
function indexAtOrAfter(matches: Match[], anchor: number): number {
  if (matches.length === 0) return -1;
  const i = matches.findIndex((m) => m.from >= anchor);
  return i === -1 ? 0 : i;
}

function build(doc: ProseMirrorNode, query: string, matches: Match[], current: number): SearchState {
  const decorations = DecorationSet.create(
    doc,
    matches.map((m, i) =>
      Decoration.inline(m.from, m.to, {
        class: i === current ? 'sate-search-match sate-search-current' : 'sate-search-match',
      }),
    ),
  );
  return { query, matches, current, decorations };
}

function applyTr(tr: Transaction, old: SearchState): SearchState {
  const meta = tr.getMeta(searchPluginKey) as SearchMeta | undefined;
  if (meta?.type === 'setQuery') {
    const matches = findMatches(tr.doc, meta.query);
    return build(tr.doc, meta.query, matches, indexAtOrAfter(matches, meta.anchor));
  }
  if (meta?.type === 'step') {
    const n = old.matches.length;
    if (n === 0) return old;
    const next = (((old.current + meta.delta) % n) + n) % n;
    return build(tr.doc, old.query, old.matches, next);
  }
  if (tr.docChanged && old.query) {
    const prev = old.matches[old.current];
    const anchor = prev ? tr.mapping.map(prev.from) : 0;
    const matches = findMatches(tr.doc, old.query);
    return build(tr.doc, old.query, matches, indexAtOrAfter(matches, anchor));
  }
  return old;
}

// ---- UI への通知 ----

type Listener = (status: SearchStatus) => void;
const listeners = new Set<Listener>();

export function subscribeSearchStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function toStatus(s: SearchState): SearchStatus {
  return { current: s.current + 1, total: s.matches.length };
}

export function createSearchPlugin() {
  return new Plugin<SearchState>({
    key: searchPluginKey,
    state: {
      init: () => EMPTY,
      apply: (tr, old) => applyTr(tr, old),
    },
    props: {
      decorations(state) {
        return searchPluginKey.getState(state)?.decorations;
      },
    },
    view() {
      return {
        update(view, prevState) {
          const next = searchPluginKey.getState(view.state);
          const prev = searchPluginKey.getState(prevState);
          if (!next || next === prev) return;
          const status = toStatus(next);
          for (const l of listeners) l(status);
        },
      };
    },
  });
}

export const searchPlugin = $prose(() => createSearchPlugin());

// ---- 操作 ----

function usable(view: EditorView | null): view is EditorView {
  return !!view && !view.isDestroyed;
}

/** 現在のヒットが画面外にあれば画面中央までスクロールする */
function revealCurrent(view: EditorView) {
  const el = view.dom.querySelector('.sate-search-current');
  if (!(el instanceof HTMLElement)) return;
  const rect = el.getBoundingClientRect();
  // 上端は検索バー、下端は文字数カウンターに隠れないように余白を見る
  const margin = 80;
  if (rect.top < margin || rect.bottom > window.innerHeight - margin) {
    el.scrollIntoView({ block: 'center' });
  }
}

/**
 * クエリを設定する。現在のヒットがあればその位置から、
 * 無ければカーソル位置から最初のヒットを現在位置にする（インクリメンタル検索）。
 */
export function setSearchQuery(view: EditorView | null, query: string) {
  if (!usable(view)) return;
  const st = searchPluginKey.getState(view.state);
  const anchor = st?.matches[st.current]?.from ?? view.state.selection.from;
  const meta: SearchMeta = { type: 'setQuery', query, anchor };
  view.dispatch(view.state.tr.setMeta(searchPluginKey, meta));
  revealCurrent(view);
}

/** 次（delta=1）/ 前（delta=-1）のヒットへ移動。端では回り込む */
export function stepSearch(view: EditorView | null, delta: number) {
  if (!usable(view)) return;
  const meta: SearchMeta = { type: 'step', delta };
  view.dispatch(view.state.tr.setMeta(searchPluginKey, meta));
  revealCurrent(view);
}

/** 検索を解除してハイライトを消す */
export function clearSearch(view: EditorView | null) {
  if (!usable(view)) return;
  if (!searchPluginKey.getState(view.state)?.query) return;
  const meta: SearchMeta = { type: 'setQuery', query: '', anchor: 0 };
  view.dispatch(view.state.tr.setMeta(searchPluginKey, meta));
}

/** 現在のヒットを選択した状態でエディタにフォーカスを戻す */
export function focusCurrentMatch(view: EditorView | null) {
  if (!usable(view)) return;
  const st = searchPluginKey.getState(view.state);
  const m = st?.matches[st.current];
  if (m) {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, m.from, m.to)));
  }
  view.focus();
}

/** 検索欄の初期値に使える選択テキスト（1行に収まるものだけ）を返す */
export function selectionAsQuery(state: EditorState): string {
  const { from, to } = state.selection;
  if (from === to) return '';
  const text = state.doc.textBetween(from, to, '\n');
  return text.includes('\n') ? '' : text;
}
