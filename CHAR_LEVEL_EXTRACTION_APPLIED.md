# Char-Level Extraction Fallback - 適用完了

## 概要

日本語 CID フォント・合字・Type3 等で PyMuPDF の `get_text("rawdict")` が空になる問題に対処するため、**char レベル抽出フォールバック**を実装しました。

## 問題の原因

`/docs/rects` エンドポイントで、日本語ページの文字が取得できず（items=null／rects=0）、UI 側で縦筋やズレが発生していました。

## 適用した修正

### 1. RAGgpt プロジェクト (`/Users/saiteku/workspace/RAGgpt`)

**ファイル**: `api/app/routers/docs.py`

#### 追加した関数

1. **`_extract_chars_fallback(page: "fitz.Page")`** (行 49-72)
   - char レベルでの抽出（`get_textpage().extractDICT()` の chars 配列を使用）
   - 日本語 CID フォント等でも必ず文字とその bbox を返す
   - フラグ: `TEXT_PRESERVE_LIGATURES | TEXT_PRESERVE_WHITESPACE`

2. **`_build_char_index_from_chars(chars, page_height)`** (行 75-105)
   - char レベル抽出結果から正規化テキストと矩形リストを構築
   - pdf.js 互換の下原点座標に変換（y 軸反転）

#### 変更した関数

3. **`_load_rect_payload()`** (行 659-677)
   - span ベース抽出で結果が空の場合、自動的に char レベルフォールバックを実行
   - ログ出力: `"Falling back to char-level extraction for page {page}"`

```python
# 既存の span ベース抽出
spans = _extract_spans(pdf_page)
char_stream, char_rects = _build_char_index(spans)

# フォールバック: 結果が空なら char レベル抽出
if not char_stream or not char_rects:
    logger.debug("Falling back to char-level extraction for page %s", page)
    chars = _extract_chars_fallback(pdf_page)
    char_stream, char_rects = _build_char_index_from_chars(chars, page_height)
```

### 2. mcp-rag-server プロジェクト (`/Users/saiteku/workspace/mcp-rag-server`)

**ファイル**: `src/http_server.py`

#### 追加した関数

1. **`_extract_chars_fallback(page: Any)`** (行 274-298)
   - RAGgpt と同じロジック
   - char レベルでの抽出

2. **`_build_char_index_from_chars(chars, page_height)`** (行 301-331)
   - RAGgpt と同じロジック
   - 正規化と座標変換

#### 変更した関数

3. **`_build_rawdict_index(page: Any)`** (行 452-468)
   - span ベース抽出で結果が空の場合、自動的に char レベルフォールバックを実行

```python
# 既存の span ベース抽出
spans = _extract_raw_spans(page)
text_stream, char_rects = _build_char_index_from_spans(spans, page_height)

# フォールバック: 結果が空なら char レベル抽出
if not text_stream or not char_rects:
    chars = _extract_chars_fallback(page)
    text_stream, char_rects = _build_char_index_from_chars(chars, page_height)
```

## 期待される効果

1. **日本語ページでも必ず items と rects が返る**
   - `items[0]` にページ全文（未正規化）が含まれる（debug=1 の場合）
   - `rects` 配列に矩形座標が返る

2. **UI 側の表示が改善**
   - サーバ矩形が正しく返るため、UI が正確な位置にハイライトを描画
   - 縦筋やズレが解消される

3. **既存の英語・他言語ページへの影響なし**
   - span ベース抽出が成功する場合はそのまま使用
   - フォールバックは必要な場合のみ実行

## 動作確認手順

### 1. UI からページ情報を取得

DevTools コンソールで以下を実行：

\`\`\`javascript
copy({
  DOCID: __pdfrectdbg()?.payload?.doc_id,
  NB: location.pathname.split('/')[2],
  PAGE: __pdfdbg()?.page
})
\`\`\`

### 2. サーバーに直接リクエスト（RAGgpt の場合）

\`\`\`bash
DOCID='...' ; NB='...' ; PAGE=...
ENC=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],''))" "$DOCID")

# ページテキストが取れているか（先頭 200 文字）
curl -Gs "http://127.0.0.1:3000/docs/$ENC/rects" \\
  --data-urlencode tenant=demo --data-urlencode user_id=local \\
  --data-urlencode notebook_id="$NB" --data-urlencode page="$PAGE" \\
  --data-urlencode debug=1 \\
| jq '.items[0]|tostring|.[:200]'

# 短語 + 固有語でヒットするか
curl -Gs "http://127.0.0.1:3000/docs/$ENC/rects" \\
  --data-urlencode tenant=demo --data-urlencode user_id=local \\
  --data-urlencode notebook_id="$NB" --data-urlencode page="$PAGE" \\
  --data-urlencode terms='完全に' \\
  --data-urlencode terms='ファイル' \\
  --data-urlencode terms='draft_filename' \\
| jq '{n:(.rects|length), sample:.rects[0]}'
\`\`\`

### 3. サーバーに直接リクエスト（mcp-rag-server の場合）

\`\`\`bash
DOCID='demo:notebook_xxx:sample.pdf'  # 形式: tenant:notebook_id:filename
PAGE=1

# ページテキストが取れているか
curl -Gs "http://127.0.0.1:3002/docs/rects" \\
  --data-urlencode doc_id="$DOCID" \\
  --data-urlencode page="$PAGE" \\
  --data-urlencode debug=1 \\
| jq '.items[0]|tostring|.[:200]'

# 検索語でヒットするか
curl -Gs "http://127.0.0.1:3002/docs/rects" \\
  --data-urlencode doc_id="$DOCID" \\
  --data-urlencode page="$PAGE" \\
  --data-urlencode terms='完全に' \\
  --data-urlencode terms='ファイル' \\
| jq '{n:(.rects|length), sample:.rects[0]}'
\`\`\`

### 4. 確認ポイント

- ✅ `items[0]` が文字列（空でない）
- ✅ `rects` の件数 `n` が 1 以上
- ✅ UI の `__pdfrectdbg()` で：
  - `serverRectsCount` が 1 以上
  - `pickedPage` が正しいページ番号
- ✅ UI の `__pdfdbg()` で：
  - `hlCount` がサーバ矩形件数に一致

## トラブルシューティング

### Q: まだ `rects` が空（n=0）の場合

A: 以下を確認：
1. `terms` が長すぎないか（日本語 8〜20 文字推奨）
2. UI コンソールの `__pdfrectdbg().url` から実際の phrase を確認
3. そのページが画像のみのページでないか（`len(chars)==0` で検出可能）

### Q: ページ番号がズレている

A: UI コンソールから取得した `PAGE` 値を使用してください（1-based）

### Q: 英語ページで動作が遅くなった

A: フォールバックは結果が空の場合のみ実行されるため、通常は影響ありません。
   ログで "Falling back to char-level extraction" が頻繁に出る場合は調査が必要です。

## 技術詳細

### 座標系の変換

- **PyMuPDF rawdict**: 上原点（y 軸が下向き）
- **pdf.js**: 下原点（y 軸が上向き）
- **変換式**: `y_new = page_height - y_old`

### 正規化処理

両プロジェクトで統一：
- NFKC 正規化
- 全角/半角スペース除去
- ダッシュ類の統一（`-`）
- 小文字化

### フラグの意味

- `TEXT_PRESERVE_LIGATURES`: 合字を保持
- `TEXT_PRESERVE_WHITESPACE`: 空白文字を保持

## まとめ

この修正により、日本語 PDF ページでも `/docs/rects` エンドポイントが必ず有効なテキストと矩形を返すようになり、UI 側のハイライト表示が正確になります。
