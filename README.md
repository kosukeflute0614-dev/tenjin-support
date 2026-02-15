# 演劇制作サポートアプリ (Theater Production Support)

演劇公演の制作業務（予約・当日受付・会計・決算・進行管理）を統合するWebアプリケーション。

## 技術スタック
- Framework: Next.js 15 (App Router)
- Language: TypeScript
- Database: SQLite (Development) / PostgreSQL (Production)
- ORM: Prisma (v5.22.0)
- Styling: Vanilla CSS (CSS Modules)

## ローカル起動手順

### 前提条件
- Node.js (v18+)
- npm

### セットアップ
1. 依存関係のインストール:
   ```bash
   npm install
   ```
2. 環境変数の設定:
   `.env` ファイルがルートディレクトリにあることを確認してください。
   ```env
   DATABASE_URL="file:./dev.db" # または絶対パス
   ```
3. データベースの準備 (Prisma):
   SQLiteデータベースを作成し、クライアントを生成します。
   ```bash
   npx prisma generate
   npx prisma db push
   ```

### 開発サーバー起動
```bash
npm run dev
```
これで `http://localhost:3000` にアクセスできます。

## 主な機能
- **ダッシュボード**: 今後の公演スケジュール、予約状況（定員・残席）、重複予約検知通知の統合表示
- **公演管理 (`/productions`)**: 公演の作成、基本情報設定、チケット券種（前売・当日）管理、公演回スケジュール管理
- **予約管理 (`/reservations`)**: 全予約の検索、新規登録、編集、キャンセル対応
- **当日受付 (`/reception`)**: QRコード（予定）やリストによる来場処理、一部入場対応、当日券発行、精算管理
- **重複予約検知**: 名前やメールアドレス、公演回の一致による重複予約の自動警告と管理
- **設定**: 公演情報の詳細設定、タブ切り替えによる整理されたUI

## 開発ガイド
- **環境変数**: `.env` で `DATABASE_URL` を定義してください。
- **Git管理**: `.gitignore` により `dev.db` などの環境依存ファイルは除外されています。
- **Prisma**: スキーマ変更後は `npx prisma migrate dev` または `db push` を実行してください。

## トラブルシューティング
- **Prisma Client Error**:
  もし実行時にエラーが出る場合は、以下を試してください：
  ```bash
  rm -rf node_modules/.prisma
  npx prisma generate
  ```
