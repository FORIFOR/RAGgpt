# RAGgpt クイックスタート

## 🚀 最も簡単な起動方法

### 1. Docker Desktop を起動

まず、Docker Desktop が起動していることを確認してください：

- macOS: メニューバーに🐳アイコンが表示されるまで待つ
- Windows: タスクトレイに🐳アイコンが表示されるまで待つ

### 2. すべてを一度に起動

ターミナルで以下のコマンドを実行：

```bash
npm run dev:autoport
```

このコマンドは以下をすべて自動で行います：

- ✅ Dockerデーモンの確認
- ✅ ポートの自動割り当て
- ✅ 環境変数ファイルの生成（`.env.runtime`）
- ✅ Dockerコンテナの起動（API、Qdrant、Meilisearch、Reranker）
- ✅ Next.js UIサーバーの起動
- ✅ ヘルスチェック＆ブラウザ自動起動

### 3. 確認

ブラウザが自動で開き、以下のURLが利用可能になります：

- **UI**: http://localhost:3000
- **API**: http://localhost:8001/health
- **Meilisearch**: http://localhost:7701
- **Qdrant**: http://localhost:6334

---

## 📦 含まれる機能

### UIコンポーネント

1. **ServiceStatusBar**（フッター）
   - 全サービスのヘルス状態を表示
   - レイテンシ計測
   - 緑（正常）/黄（遅延）/赤（ダウン）

2. **ParamPanel**（会話ページ上部）
   - 検索件数調整（TopK: 10-50）
   - 再ランク有効/無効
   - Retriever選択（Local Hybrid / MCP）
   - プロファイル選択（Quiet / Balanced / Max）

3. **ProgressTrack**（生成中）
   - 検索 → 再ランク → 生成 → 完了
   - リアルタイム進捗表示

### バックエンド最適化

1. **埋め込みプレフィックス**（BGE-M3/E5対応）
   - \`query: \` / \`passage: \` 自動付与
   - 日本語検索精度向上

2. **チャンキング改善**
   - 見出し＋本文の結合
   - コンテキスト保持強化

3. **Rerankerリソース制限**
   - CPU使用率削減（700% → 200%）
   - ファン音の大幅削減
   - メモリ上限2GB

---

## 🛑 停止方法

**Ctrl+C** を押すと、すべてのサービスが自動で停止します。

または、手動で停止：

```bash
npm run down:autoport
```

---

## 🧹 完全クリーンアップ

すべてのデータを削除して最初からやり直す場合：

```bash
npm run clean:autoport
```

---

## ⚙️ プロファイル設定

### Quiet モード（静音・省電力）
```bash
# .env.runtime を編集
RANKER_THREADS=1
RANKER_CONCURRENCY=1
RANKER_CPU_LIMIT=1.0
```

### Balanced モード（標準）※デフォルト
```bash
RANKER_THREADS=2
RANKER_CONCURRENCY=2
RANKER_CPU_LIMIT=2.0
```

### Max モード（高精度・高負荷）
```bash
RANKER_THREADS=4
RANKER_CONCURRENCY=4
RANKER_CPU_LIMIT=4.0
```

---

## 🔧 トラブルシューティング

### Docker が起動しない

```
❌ Docker daemon is not running!
```

**解決策**:
1. Docker Desktop を起動
2. メニューバー/タスクトレイの🐳アイコンを確認
3. \`docker info\` コマンドが成功することを確認

### ポートが使用中

デフォルトポートが使用されている場合、自動で +1 ～ +100 の範囲で空きポートを探します。

手動でポートを指定する場合：

```bash
PORT_UI=3001 PORT_API=8002 npm run dev:autoport
```

### UI が起動しない

```bash
# UIだけを再起動
cd ui
npm run dev
```

### APIが応答しない

```bash
# ログを確認
docker compose -f infrastructure/docker-compose.yml logs -f rag-api
```

---

## 📚 その他のコマンド

### ヘルスチェック
```bash
npm run health:full
```

### テスト実行
```bash
npm run test:smoke    # 煙テスト
npm run test:all      # 全テスト
```

### ログ表示
```bash
npm run logs
```

---

## 🎯 推奨ワークフロー

1. **起動**: \`npm run dev:autoport\`
2. **ブラウザで確認**: http://localhost:3000
3. **資料をアップロード**: 右上「資料を追加」
4. **質問**: チャット画面で質問を入力
5. **進捗確認**: ProgressTrack でフェーズ確認
6. **ステータス確認**: フッターの ServiceStatusBar で健全性確認
7. **パラメータ調整**: ParamPanel でTopK/再ランク/プロファイルを変更

---

**詳細なテスト結果**: \`UI_TEST_REPORT.md\` を参照
