# RAG UI テスト実行ガイド

## 前提条件

システムが起動していること：

```bash
cd /Users/saiteku/workspace/RAGgpt
npm run dev:autoport
```

## Storybookの実行

Storybookを使用してコンポーネントを単独で表示・テストできます。

```bash
# UIディレクトリに移動
cd /Users/saiteku/workspace/RAGgpt/ui

# Storybookを起動
npm run storybook
```

ブラウザで http://localhost:6006 を開いてください。

### 利用可能なストーリー

- **RAG/ServiceStatusBar** - サービス健全性モニター
- **RAG/ParamPanel** - RAGパラメータコントロール
- **RAG/ProgressTrack** - パイプライン進捗表示
- **RAG/RagDebugDrawer** - デバッグドロワー

## E2Eテストの実行

### 1. Playwrightブラウザのインストール（初回のみ）

```bash
cd /Users/saiteku/workspace/RAGgpt/ui
npm run playwright:install
```

### 2. すべてのE2Eテストを実行

```bash
npm run test:e2e
```

### 3. UIモードで実行（インタラクティブ）

```bash
npm run test:e2e:ui
```

このモードでは、テストの実行を視覚的に確認でき、デバッグが容易です。

### 4. ビジュアルリグレッションテストのみ実行

```bash
npm run test:visual
```

## テストスイート

### E2E Tests (`tests/e2e/`)

- **chat.spec.ts** - チャットフローのテスト
  - 進捗トラックと回答生成
  - 引用の表示とクリック
  - RAG Debugドロワーの機能
  - サービスステータスバー

- **accessibility.spec.ts** - アクセシビリティテスト
  - WCAG準拠チェック（axe-core）
  - キーボードナビゲーション
  - ARIA属性の検証
  - カラーコントラスト

### Visual Regression Tests (`tests/visual/`)

- **components.spec.ts** - ビジュアルリグレッション
  - 各コンポーネントのスクリーンショット比較
  - ダークモード対応
  - レスポンシブデザイン（モバイル、タブレット）

## トラブルシューティング

### エラー: "Missing script: storybook"

現在のディレクトリを確認してください：

```bash
pwd
# /Users/saiteku/workspace/RAGgpt/ui にいることを確認

# もしルートディレクトリにいる場合
cd ui
npm run storybook
```

### テストがタイムアウトする

バックエンドサービスが起動していることを確認：

```bash
# 別のターミナルで
cd /Users/saiteku/workspace/RAGgpt
npm run dev:autoport
```

### ビジュアルテストで差分が出る

初回実行時はベースラインが作成されます。意図的な変更の場合：

```bash
npm run test:visual -- --update-snapshots
```

## 詳細情報

詳細なテストガイドは `TESTING.md` を参照してください。
