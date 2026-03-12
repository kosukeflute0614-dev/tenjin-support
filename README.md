# Tenjin-Support — 演劇制作サポートアプリ

演劇公演の制作業務（予約管理・当日受付・チェックイン・精算・物販・アンケート）を統合するWebアプリケーションです。
公演当日のオペレーションをデジタル化し、制作スタッフの負担を軽減します。

---

## 技術スタック

| 項目 | 技術 | バージョン |
|---|---|---|
| フレームワーク | Next.js (App Router / Server Actions) | 16.1.6 |
| UI | React + TypeScript | 19.2.3 / TS 5 |
| データベース | Firebase Firestore (リアルタイム同期) | 12.9.0 |
| 認証 | Firebase Auth (Google OAuth / 匿名認証) | — |
| セッション | JWT (jose / HS256 / httpOnly Cookie) | jose 6.1.3 |
| パスワード | bcrypt (SALT_ROUNDS=10) | bcryptjs 3.0.3 |
| メール | Resend API | 6.9.3 |
| スタイリング | Vanilla CSS (CSS Variables + CSS Modules) | — |
| デプロイ | Firebase App Hosting (asia-northeast1) | — |

その他: `recharts`（売上グラフ）, `qrcode.react`（QRコード生成）, `framer-motion`（アニメーション）, `react-day-picker` + `date-fns`（日付処理）, `lucide-react`（アイコン）

---

## 主な機能

### 予約管理
- 公開予約フォーム（認証不要・一般客向け）
- 事前予約 / 当日券の登録
- 重複予約の自動検知・警告
- 支払いステータス追跡（未払い → 一部支払い → 支払済み）
- カスタムフォームフィールド対応

### 当日受付・チェックイン
- 1枚単位のチェックイン処理（全枚一括ではなく部分入場可）
- チェックインと同時に精算処理
- リアルタイム来場状況（Firestore onSnapshot）
- チェックイン取消・一部取消に対応

### 精算・レジ締め
- 金種別現金カウント（1円〜10,000円の9金種）
- 釣銭準備金の管理
- 予想売上と実売上の差異検出
- 券種別・公演回別の売上レポート

### 物販管理
- 2つの運用モード: **SIMPLE**（受付と統合）/ **INDEPENDENT**（物販専用レジ）
- 商品 → バリエーション（サイズ・色など）の階層管理
- セット割引 / まとめ買い割引
- 一部キャンセル・返金対応
- 在庫管理（オプション）

### メール配信
- 予約確認メール（テンプレート変数対応）
- 一斉送信（レート制限付き）
- 返信先は公演主催者のメールアドレスを自動設定

### アンケート
- テンプレートの作成（Active / Draft 管理）
- QRコードによる配布
- 匿名回答の収集・集計

### スタッフ管理
- UUID トークンベースの招待URL発行
- 3つのロール: **受付スタッフ** / **物販スタッフ** / **モニター**（閲覧のみ）
- パスコードの発行・確認・変更

---

## セキュリティアーキテクチャ

### 認証フロー

| ユーザー種別 | 認証方式 | アクセス範囲 |
|---|---|---|
| 主催者 | Google OAuth (Firebase Auth) | 全機能 |
| スタッフ | 匿名認証 + 4桁パスコード + JWT Cookie | ロールに応じた限定操作 |
| 一般客 | 認証なし | 公開予約フォーム・アンケート回答のみ |

### Firestore セキュリティルール

全データアクセスは Firestore Security Rules で制御されています。

- **主催者データ**: `isOwner(resource.data.userId)` — 本人のみ読み書き可能
- **予約データ**: 作成は公開、読み取りは主催者・スタッフ・予約者本人に限定
- **スタッフ操作**: `isAuthorizedStaff()` でセッション検証 + ロール別のフィールドレベル制御
- **監査ログ**: チェックインログ・レジ締め記録は追記のみ（更新・削除不可）
- **アンケート回答**: 匿名作成可、閲覧は主催者のみ、改竄・削除は一切禁止

### セッション管理

```
スタッフログイン → パスコード検証(bcrypt) → JWT生成(HS256)
→ httpOnly / Secure / SameSite=Strict Cookie に保存（24時間有効）
```

- ブラウザの JavaScript からCookieにアクセス不可（httpOnly）
- HTTPS 通信でのみ送信（Secure）
- クロスサイトリクエストを拒否（SameSite=Strict）

### データ整合性

重要な操作はすべて **Firestore トランザクション** で原子的に実行されます。

| 操作 | 保証内容 |
|---|---|
| 予約作成 | 残席チェック + bookedCount更新を同一トランザクション内で実行 |
| チェックイン + 精算 | チケット数・支払状況・ログを同時更新 |
| 当日券発行 | 予約作成 + 座席数更新を原子的に実行 |
| 予約キャンセル | ステータス変更 + 座席数戻しを原子的に実行 |

### 入力バリデーション

- チケット枚数: 1種類あたり最大50枚、合計最大100枚、負数・小数の拒否
- パスコード: 数字4桁の正規表現チェック
- 支払金額: 数値型チェック + 負数の拒否
- キャンセル済み予約への操作: 全チェックイン・精算関数（10箇所）でブロック

### セキュリティ監査

15項目のセキュリティ監査を実施し、OWASP Top 10 に対応しています（[詳細](docs/security-audit-report.md)）。

| 対応状況 | 件数 | 内容 |
|---|---|---|
| 対応済み | 13件 | bcryptハッシュ化、JWT署名、IDOR対策、入力検証、XSS対策など |
| 未対応 | 2件 | レート制限（SEC-09）、監査ログ拡充（SEC-13）— 今後対応予定 |

`npm audit`: 既知の脆弱性 **0件**

---

## プロジェクト構成

```
src/
├── app/
│   ├── actions/                # Server Actions（サーバーサイド処理）
│   │   ├── checkin.ts          #   チェックイン・精算
│   │   ├── reservation.ts      #   予約 CRUD
│   │   ├── payment.ts          #   支払い処理
│   │   ├── staff-auth.ts       #   スタッフ認証（JWT/bcrypt）
│   │   ├── sameDayTicket.ts    #   当日券発行
│   │   └── ...
│   ├── book/[productionId]/    # 公開予約フォーム
│   ├── dashboard/              # ダッシュボード
│   ├── productions/[id]/       # 公演管理（チェックイン・レポート・物販等）
│   ├── reservations/           # 予約管理
│   ├── staff/[id]/             # スタッフポータル
│   └── error.tsx               # グローバルエラーハンドリング
├── components/                 # UIコンポーネント（48ファイル）
├── lib/
│   ├── firebase.ts             # Firebase 初期化
│   ├── client-firestore/       # クライアント側 Firestore ライブラリ（17ファイル）
│   ├── firestore-utils.ts      # Timestamp シリアライズ
│   ├── capacity-utils.ts       # 定員・バリデーション
│   ├── email.ts                # メール送信（Resend）
│   └── ...
├── hooks/                      # カスタムフック
└── types/
    └── index.ts                # 全型定義（34+ インターフェース）
```

---

## ローカル開発

### 前提条件
- Node.js v18 以上
- npm

### セットアップ

```bash
# 依存関係のインストール
npm install

# 環境変数の設定
cp .env.example .env.local
# .env.local に Firebase の設定値を記入

# 開発サーバー起動
npm run dev
```

http://localhost:3000 でアクセスできます。

### 主要コマンド

| コマンド | 説明 |
|---|---|
| `npm run dev` | 開発サーバー起動 |
| `npm run build` | プロダクションビルド |
| `npm run start` | プロダクションサーバー起動 |
| `npm run lint` | ESLint チェック |

---

## デプロイ

Firebase App Hosting を使用しています。`main` ブランチへの push で自動デプロイされます。

### 環境変数（apphosting.yaml）

| 変数 | 種類 | 説明 |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_*` | 公開値 | Firebase クライアント設定 |
| `SESSION_SECRET` | シークレット | JWT 署名鍵 |
| `RESEND_API_KEY` | シークレット | メール送信 API キー |
| `INVITATION_CODE` | 公開値 | 招待コード |

### Firestore ルールのデプロイ

```bash
firebase deploy --only firestore:rules
```

---

## ドキュメント

| ファイル | 内容 |
|---|---|
| [docs/security-audit-report.md](docs/security-audit-report.md) | セキュリティ監査レポート（OWASP対応） |
| [docs/release-readiness-report.md](docs/release-readiness-report.md) | リリース準備チェックリスト |
| [docs/ui-ux-checklist.md](docs/ui-ux-checklist.md) | UI/UX 改善チェックリスト |
| [docs/merchandise-plan.md](docs/merchandise-plan.md) | 物販モジュール設計書 |
| [docs/cash-close-report-spec.md](docs/cash-close-report-spec.md) | レジ締め・在庫確認設計書 |

---

## 設計上の主な判断

| 判断 | 理由 |
|---|---|
| **Firebase Client SDK のみ使用**（Admin SDK なし） | Firestore Security Rules による一貫したアクセス制御。サーバーサイドでのルールバイパスを防止 |
| **パスコード平文は別コレクションに分離** | `productions` ドキュメントは公開読み取り可のため、主催者のみアクセス可能な `staffPasscodes` に保存 |
| **Vanilla CSS（フレームワークなし）** | バンドルサイズ最小化。CSS Variables によるテーマ管理で一貫性を確保 |
| **公演ごとのスタッフトークン** | 公演単位でアクセス権を管理。公演終了後はトークン無効化で即座にアクセス遮断可能 |
| **トランザクションによる残席管理** | 同時予約による二重売りを防止。楽観的ロックで整合性を担保 |
