# 演劇制作サポートアプリ (Tenjin-Support)

演劇公演の制作業務（予約・当日受付・チェックイン・売上管理・アンケート）を統合するWebアプリケーション。

## 技術スタック

| 項目 | 内容 |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Database | Firebase Firestore |
| Auth | Firebase Auth (Google ログイン / 匿名認証) |
| Styling | Vanilla CSS (CSS Variables + CSS Modules) |
| Deploy | Firebase App Hosting |

主要ライブラリ: `lucide-react`, `recharts`, `framer-motion`, `qrcode.react`, `react-day-picker`, `date-fns`

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
   `.env.example` を `.env.local` にコピーし、Firebase コンソールの値を入力してください。
   ```bash
   cp .env.example .env.local
   ```
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=""
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=""
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=""
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=""
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=""
   NEXT_PUBLIC_FIREBASE_APP_ID=""
   NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=""
   ```

3. 開発サーバー起動:
   ```bash
   npm run dev
   ```
   `http://localhost:3000` でアクセスできます。

## 主な機能

- **ダッシュボード** (`/dashboard`): 公演スケジュール・予約状況（定員/残席）・重複予約検知の統合表示
- **公演管理** (`/productions`): 公演の作成・設定、券種管理、公演回スケジュール管理、スタッフ管理
- **予約管理** (`/reservations`): 全予約の検索・新規登録・編集・キャンセル対応
- **当日受付** (`/productions/[id]/checkin/[performanceId]`): チェックイン処理、当日券発行、精算管理
- **売上レポート** (`/productions/[id]/report`): 券種別・公演回別の売上集計
- **アンケート** (`/productions/[id]/survey`): アンケートテンプレートの作成・QRコード配布・回答集計
- **公開予約フォーム** (`/book/[productionId]`): 認証不要の一般向け予約受付ページ
- **重複予約検知**: 同一公演回・同一氏名による重複予約の自動警告

## 認証フロー

| ユーザー種別 | 認証方式 |
|---|---|
| 主催者（制作者） | Google ログイン (Firebase Auth) |
| スタッフ（受付・当日担当） | 匿名認証 + 4桁パスコード + Cookie セッション |
| 一般客 | 認証なし（公開フォームのみ）|

## プロジェクト構成

```
src/
├── app/
│   ├── actions/           # Next.js Server Actions
│   │   ├── checkin.ts     # チェックイン・精算処理
│   │   ├── dashboard.ts   # 統計・売上レポート生成
│   │   ├── production.ts  # 公演 CRUD
│   │   ├── reservation.ts # 予約 CRUD
│   │   ├── staff-auth.ts  # スタッフ認証
│   │   └── ...
│   ├── book/[productionId]/     # 公開予約フォーム
│   ├── dashboard/               # ダッシュボード
│   ├── productions/             # 公演管理
│   ├── reservations/            # 予約管理
│   └── ...
├── components/            # 再利用コンポーネント
├── lib/
│   ├── firebase.ts        # Firebase 初期化 (auth, db)
│   ├── client-firestore.ts # クライアント側 Firestore アクセス
│   ├── firestore-utils.ts # serializeDoc / serializeDocs
│   ├── format.ts          # 日時・金額フォーマット
│   └── constants.ts       # ステータスラベル定数
└── types/
    └── index.ts           # 全型定義
```

## 開発ガイド

- **Firestore セキュリティルール**: `firestore.rules` を参照。変更後は Firebase コンソールまたは CLI でデプロイしてください。
- **型定義**: `src/types/index.ts` に集約されています。新しいデータ型はここに追加してください。
- **Timestamp のシリアライズ**: Server Actions から Client Components にデータを渡す際は、必ず `serializeDoc<T>()` / `serializeDocs<T>()` を通してください。Firestore Timestamp が ISO 文字列に変換されます。
- **CSS**: `src/app/globals.css` にデザイントークン（CSS Variables）とユーティリティクラスが定義されています。新しいスタイルはまず既存のクラスを活用し、ページ固有のものは `.module.css` を使用してください。
- **Git 管理**: `.env.local` は `.gitignore` で除外されています。

## デプロイ

Firebase App Hosting を使用しています。`main` ブランチへの push でデプロイがトリガーされます。
環境変数は `apphosting.yaml` で管理されています。

```bash
# Firebase CLI でのデプロイ（手動）
firebase deploy
```

## トラブルシューティング

- **Firebase 接続エラー**: `.env.local` の `NEXT_PUBLIC_FIREBASE_*` の値が正しいか確認してください。
- **認証エラー（主催者）**: Firebase コンソールで Google プロバイダが有効になっているか確認してください。
- **Firestore 権限エラー**: `firestore.rules` のルールとログイン状態を確認してください。
