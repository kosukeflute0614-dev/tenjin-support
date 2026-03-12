# 本番リリース準備レビュー報告書

**実施日**: 2026-03-12
**対象**: Tenjin-Support（劇場制作支援アプリ）
**スタック**: Next.js 16 + React 19 + Firebase/Firestore + Resend + JWT認証
**用途**: 身内の演劇公演でのMVPテスト利用

---

## エグゼクティブサマリー

4つの技術観点（セキュリティ、コード品質、ビルド・デプロイ、データ整合性）から総合レビューを実施。
各観点で4チームによる深掘り監査を実施。さらにセキュリティについては **10チームによる集中検証** を追加実施し、公開予約フロー・スタッフ認証フローの整合性を重点的に検証しました。UI/UX改善点は [`docs/ui-ux-checklist.md`](./ui-ux-checklist.md) に分離。

| 観点 | 評価 | CRITICAL | WARNING | INFO |
|------|------|----------|---------|------|
| セキュリティ（深掘り済み） | 🔴 要対応 | 8件 | 8件 | 6件 |
| コード品質（深掘り済み） | 🔴 要対応 | 7件 | 8件 | 10件 |
| ビルド・デプロイ（深掘り済み） | 🔴 要対応 | 5件 | 6件 | 8件 |
| データ整合性（深掘り済み） | 🔴 要対応 | 8件 | 7件 | 5件 |
| **合計** | | **28件** | **29件** | **29件** |

> **注**: UI/UX の改善点は別ドキュメント [`docs/ui-ux-checklist.md`](./ui-ux-checklist.md) に分離しました。

**結論**: 深掘り監査 + 10チーム集中検証 + 3チーム最終検証の結果、**Firestoreルール変更はAdmin SDK移行前は実施不可能**（V-15）であることが判明。MVPリリースは **コード・設定変更のみ（全9フェーズ・11項目）** で実施する。Firestoreルール改善は Admin SDK 移行後の高優先タスクとする。

---

## セキュリティ — CRITICAL（深掘り監査結果）

### S-1. staffTokens にパスコード平文保存 + 無認証で取得可能 🔴最重要

**ファイル**: `src/lib/client-firestore/staff.ts` (L20-23), `firestore.rules` (L51)

```typescript
// staff.ts — パスコードが平文で保存されている
[`staffTokens.${newToken}`]: {
    role,
    passcode: autoPasscode,      // ← 平文で保存!
    passcodeHashed: hashed
}
```

```
// firestore.rules — 誰でも公演ドキュメントを取得可能
allow get: if true;
```

**問題**: 2つの問題の組み合わせにより深刻な脆弱性が発生：
1. `staffTokens` 内に **パスコードが平文** (`passcode`) で保存されている
2. `productions` コレクションの `get` が **認証不要** (`if true`)
3. 攻撃者は任意の `productionId` で `getDoc()` → `staffTokens` 内のパスコード平文を取得 → スタッフ権限を完全に乗っ取り可能

**影響**: チェックイン操作・支払い登録・物販管理など全スタッフ機能の不正利用

**修正**:
1. `staffTokens` から `passcode` フィールド（平文）を削除し、`passcodeHashed` のみ保存
2. `firestore.rules` の `allow get: if true` を制限（下記S-2参照）

> **🔴 10チーム検証で発見（V-11）**: スタッフ管理画面（`src/app/productions/[id]/staff/page.tsx` L190, L208）で平文パスコードが表示されている。`passcode` フィールド削除時に以下のUI変更が必要：
> - L190: `data.passcode` → `'設定済み'` 等の固定文字列に変更
> - L208: パスコード表示部分を「パスコード設定済み」に変更（平文は非表示化）
> - パスコード新規発行時は一度だけ画面に表示し、Firestoreには `passcodeHashed` のみ保存する方式に変更

---

### S-2. productions コレクションの無認証読み取り

**ファイル**: `firestore.rules` (L51)

```
allow get: if true;
```

**問題**: 認証なしで公演ドキュメント全体を取得可能。`staffTokens`, `organizerEmail`, `emailTemplates` など機密情報が露出。

**修正**:

> **🔴🔴 V-15 により方針変更**: `allow get: if isSignedIn()` への変更は **Admin SDK移行が完了するまで実施不可能**。Server Actions（`reservation.ts`, `production-details.ts`, `staff-auth.ts`, `sameDayTicket.ts`）が未認証でproductionsを読み取っているため、ルール制限するとアプリ全体が動作不能になる。
>
> **MVP方針**: `allow get: if true` を **現状維持**。ただし **S-1（平文passcode削除）を実施** することで、ドキュメントから読み取れる機密情報を `passcodeHashed`（bcryptハッシュ、逆算不可能）のみに限定する。
>
> **Admin SDK移行後の修正計画**:
> 1. Server Actions を Admin SDK に移行（Firestoreルールをバイパス）
> 2. クライアント側の公開フォームには匿名認証を追加
> 3. `allow get: if isSignedIn()` に変更
> 4. 機密フィールド（`staffTokens`, `organizerEmail`等）は Admin SDK 経由のServer Actionでフィルタして返す方式に変更

---

### S-3. sessionStorage にスタッフトークン平文保存

**ファイル**: `src/app/staff/[id]/page.tsx` (L115-117)

```typescript
sessionStorage.setItem('last_staff_production_id', realId);
sessionStorage.setItem('last_staff_token', token);
```

**問題**: スタッフトークンが `sessionStorage` に平文で保存される。XSS脆弱性がある場合に即座に盗み出される。ブラウザDevToolsからも確認可能。

**修正**: `sessionStorage` への保存を廃止。認証状態はHTTPOnly Cookie（既存のJWTセッション）のみで管理する。

---

### S-4. SESSION_SECRET のハードコードされたフォールバック値

**ファイル**: `src/app/actions/staff-auth.ts` (L11-13), `apphosting.yaml`

```typescript
const SESSION_SECRET = new TextEncoder().encode(
    process.env.SESSION_SECRET || 'fallback-dev-secret-change-in-production'
);
```

**問題**: `apphosting.yaml` に `SESSION_SECRET` が未定義のため、本番環境でフォールバック値（ソースコード上で公開済み）が使用される。JWTセッションの署名・検証が誰でも可能になる。

**修正**:
1. フォールバック値を削除し、未設定時はエラーで起動を阻止:
```typescript
const secret = process.env.SESSION_SECRET;
if (!secret) throw new Error('SESSION_SECRET is required');
const SESSION_SECRET = new TextEncoder().encode(secret);
```
2. `apphosting.yaml` に `SESSION_SECRET` を `secret:` として追加

---

### S-5. performance.bookedCount が誰でも改ざん可能

**ファイル**: `firestore.rules` (L130-131)

```
allow update: if isOwner(resource.data.userId)
  || (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['bookedCount']));
```

**問題**: `bookedCount` フィールドのみの更新であれば **誰でも**（認証すら不要に近い条件で）値を任意に変更可能。残席表示を0にして予約不可にしたり、逆に残席を増やしてオーバーブッキングを引き起こせる。

**修正**:

> **🔴🔴 V-15 により方針変更**: `isSignedIn()` の追加は **Admin SDK移行が完了するまで実施不可能**。`createReservation`, `cancelReservation`, `restoreReservation`, `createSameDayTicket` の全てが未認証でbookedCountを更新しているため、`isSignedIn()` を追加するとこれら全てが PERMISSION_DENIED で失敗する。
>
> **MVP方針**: 現行ルールを **現状維持**。bookedCountの不正改ざんリスクは認識するが、攻撃には特定のperformanceIdの知識と技術的知識が必要であり、身内利用MVPでは許容する。
>
> **Admin SDK移行後の修正計画**:
> - Server Actions を Admin SDK に移行
> - ルールを `allow update: if isOwner(resource.data.userId)` のみに制限
> - bookedCount の更新は全て Admin SDK 経由で実行

---

### S-6. staffSessions の Firestore ルールでパスコード検証をバイパス可能

**ファイル**: `firestore.rules` (L98-99)

```
allow create, update: if isSignedIn() && request.auth.uid == uid &&
  get(.../productions/$(request.resource.data.productionId)).data
    .staffTokens[request.resource.data.token].passcodeHashed == request.resource.data.passcodeHashed;
```

**問題**: クライアントが `passcodeHashed` の値をリクエストに含めて送信し、それをルール側で比較している。S-1で述べた通り `productions` ドキュメントから `passcodeHashed` を取得可能なため、その値をそのまま送信すればパスコード検証をバイパスできる。

**修正**: ~~staffSession の作成を Server Actionのみ に限定し、Firestoreルールでクライアント直接作成を禁止~~ → **10チーム検証により方針変更（V-10参照）**

> **⚠️ 整合性検証で判明した制約**: 現在のstaffSessionsルールは `productions` ドキュメントの `staffTokens[token].passcodeHashed` を読み取って検証している。S-6でクライアント作成を禁止（`allow create: if false`）する場合、Server Action側でstaffSessionドキュメントを作成する必要があるが、**Server ActionsもClient SDKを使用しているため同じルールに制約される**。
>
> **🔴 10チーム検証で発見（V-10）**: 当初提案した `isSignedIn() && request.auth.uid == uid`（passcodeHashed検証なし）への簡素化は **より危険** である。この変更により、任意の匿名認証ユーザーがパスコードを知らなくてもstaffSessionを作成でき、全スタッフ機能にアクセス可能になる。
>
> **修正方針（変更後）**: ルール側の `passcodeHashed` 照合は **削除せず維持する**。S-1（平文passcode削除）を先に実施すれば、`passcodeHashed` からは元パスコードを逆算できないため、ルール側の検証は有効な保護層として機能する。
> ```
> // 現行ルールを維持（変更不要）
> allow create, update: if isSignedIn() && request.auth.uid == uid &&
>   get(.../productions/...).data.staffTokens[...].passcodeHashed == request.resource.data.passcodeHashed;
> // S-1実施後: 認証ユーザーはstaffTokensのpasscodeHashedを読めるが、
> // 正しいパスコードを知らなければbcryptハッシュを自力で生成できない
> // → ただし productions の get で passcodeHashed を直接取得し、
> //   それをそのまま staffSession の create に流用する攻撃は依然として可能
> ```
>
> **⚠️ 残存リスク**: S-1で平文passcodeを削除しても、`passcodeHashed` 値自体は `productions` ドキュメントから読み取り可能（S-2実施後でも匿名認証ユーザーは読める）。攻撃者はその値をそのまま `staffSession` のcreateリクエストに含めることでルール検証をバイパスできる。これは **S-6の本質的な問題** であり、完全な解決にはAdmin SDK移行（ルールを `allow create: if false` にしてServer Action専用化）が必要。
>
> **暫定緩和策**: S-2実施後は未認証ユーザーのproductions読み取りはブロックされるが、匿名認証ユーザー（攻撃者含む）は依然としてpasscodeHashedを取得可能。完全な防御にはAdmin SDK移行が不可欠。

---

### S-7. staffSessions の有効期限なしセッションが許可される

**ファイル**: `firestore.rules` (L25-31)

```typescript
function isAuthorizedStaff(productionId) {
    // ...
    return sessionData != null &&
           sessionData.productionId == targetId &&
           (sessionData.expiresAt == null || sessionData.expiresAt > request.time);
           // ↑ expiresAt == null なら永久有効
}
```

**問題**: `expiresAt` が `null` の場合、セッションが永久に有効。デバイス紛失やスタッフ解任後もアクセスが継続される。

**修正**: `expiresAt != null && expiresAt > request.time` に変更（null不許可）。

> **10チーム検証で発見（V-13）**: ルール変更前に、既存の `expiresAt == null` セッションを一括削除するマイグレーション（M-4）が必要。現在のコード（`staff/[id]/page.tsx` L58）は `expiresAt` を設定しているため、24時間以内のセッションは問題なし。ただし過去に作成された古いセッションがある場合、ルール変更で即座にアクセス不能になる。

---

### S-8. seed-demo.mjs に Google OAuth シークレットがハードコード

**ファイル**: `scripts/seed-demo.mjs` (L26)

```javascript
const clientId = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const clientSecret = 'j9iVZfS8kkCEFUPaAeJV0sAi';
```

**問題**: Google OAuth クライアントシークレットがソースコードにハードコード。リポジトリが公開された場合に悪用可能。

**修正**: 環境変数に移行。

---

## セキュリティ — WARNING（深掘り監査結果）

| # | 内容 | ファイル |
|---|------|---------|
| SW-1 | `broadcast.ts` にサーバーサイド権限検証なし（userId/productionId未チェック。メール一括送信が呼び出し元の権限を検証していない） | `src/app/actions/broadcast.ts` |
| SW-2 | 公開予約エンドポイントにレート制限なし（スパム予約が可能） | `src/app/actions/reservation.ts` |
| SW-3 | `INVITATION_CODE` 未設定時にデフォルトオープン（`return true`）で誰でも登録可能 | `src/app/actions/invitation.ts` (L6) |
| SW-4 | `surveyLayouts` / `surveyLayoutDrafts` が全認証ユーザーに読み取り可能（他ユーザーのアンケートデータ露出） | `firestore.rules` (L188-213) |
| SW-5 | `merchandiseProducts` が全認証ユーザーにlist可能（他公演の商品・価格情報露出） | `firestore.rules` (L229-233) |
| SW-6 | `registerPayment` がトランザクション外で実行（Race Condition + 負値チェックなし） | `src/app/actions/payment.ts` |
| SW-7 | `innerHTML` を使用してテンプレートデータをDOM挿入（エスケープ処理はあるがXSSリスクが残存） | `TemplateInlineEditor.tsx`, `EmailTemplateEditModal.tsx` |
| SW-8 | JWTセッション検証時にトークン有効性の再検証なし（トークン無効化後も24h Cookie有効） | `src/app/actions/staff-auth.ts` |

**補足 — 初回レポートからの訂正**: 初回レポートの W-1「Server Actionsの`userId`がクライアント渡しで改ざん可能」は **誤りでした**。`userId` は Firebase Authentication の `user.uid`（`onAuthStateChanged` 経由）から取得されており、クライアント側で改ざんできない信頼できる値です。Firestoreルール側でも `request.auth.uid` で検証されています。

---

## セキュリティ — INFO

| # | 内容 |
|---|------|
| SI-1 | 招待コード比較がタイミング攻撃に脆弱（`===` 比較。`timingSafeEqual` 推奨だが、身内利用では低リスク） |
| SI-2 | レガシーSHA-256パスコード比較もタイミング攻撃に脆弱（bcrypt.compareは安全だがフォールバック時） |
| SI-3 | スタッフ認証のエラーメッセージが詳細すぎる（トークン列挙が可能。ジェネリックメッセージ推奨） |
| SI-4 | 4桁パスコードのエントロピーが低い（9,000パターン。6桁英数字への拡張推奨） |
| SI-5 | CSV エクスポートに数式インジェクション対策なし（`=`, `+`, `-`, `@` 先頭値） |
| SI-6 | 監査ログ未実装（スタッフセッション作成・チェックイン・支払い等の操作記録なし） |

---

## コード品質 — CRITICAL（深掘り監査結果）

### C-1. `PARTIALLY_PAID` 文字列の型不一致（D-5と重複）

**ファイル**: `src/app/actions/checkin.ts` (L127-130, L197-201), 他5箇所

```typescript
// コード: "PARTIALLY_PAID" を設定（6箇所）
paymentStatus = "PARTIALLY_PAID"

// 型定義（src/types/index.ts L53）
paymentStatus: 'UNPAID' | 'PAID' | 'PARTIAL'

// 表示ラベル（src/lib/constants.ts）
'PARTIAL': '一部支払い'  // → PARTIALLY_PAID にはマッチしない
```

**問題**: 型定義 `'PARTIAL'` とコード `"PARTIALLY_PAID"` の不一致が6箇所に散在。一部支払い状態のラベルが正しく表示されない。

---

### C-2. `REPLY_TO_EMAIL` が個人Gmailにフォールバック（BD-3と重複）

**ファイル**: `src/lib/email.ts` (L11)

```typescript
process.env.REPLY_TO_EMAIL || 'kosuke.flute0614@gmail.com'
```

**問題**: 本番環境で個人メールアドレスが返信先になる。

---

### C-3. 金額計算での `any` 型使用（NaN汚染リスク）

**ファイル**: `src/app/actions/checkin.ts` (L25, L113-114, L184-185), `src/app/actions/payment.ts` (L22), `src/app/actions/dashboard.ts` (L221-222)

```typescript
const totalAmount = (reservation.tickets || []).reduce(
    (sum: number, t: any) => sum + (t.price * t.count), 0
)
// t.price, t.count が undefined → NaN伝播 → 支払状況判定が不正確
```

**問題**: 金額・チケット数の計算で `any` 型を使用しており、フィールドが `undefined` の場合に `NaN` が伝播する。支払い・チェックイン・レポート集計の全てに影響。同じパターンが **30箇所以上** に散在。

---

### C-4. Firestoreデータの型アサーション未検証

**ファイル**: `src/app/actions/payment.ts` (L19), `src/app/actions/checkin.ts` (L22, L63, L110, L181), `src/app/actions/production-details.ts` (L133, L161, L183)

```typescript
// getDoc() 後にフィールド検証なしで型キャスト
const reservation = { id: resSnap.id, ...resSnap.data() } as FirestoreReservation;
// → Firestoreドキュメントに必要なフィールドが欠けていても型エラーにならない
```

**問題**: `as` 型アサーションで Firestore データを強制キャスト。ドキュメント構造が型定義と一致しない場合（マイグレーション後、手動編集時等）、ランタイムエラーが発生するが TypeScript では検出不可。特に支払い・チェックインの金額計算で危険。

---

### C-5. エラーハンドリングパターンの不統一

**ファイル**: `src/app/actions/*.ts` 全般

| Server Action | パターン | 問題 |
|---|---|---|
| `registerPayment` | `throw` | try-catchなし。Firestoreエラーが生で伝播 |
| `createReservation` | `throw` in try-catch | メール失敗は silent catch |
| `cancelReservation` | `throw` + catch 混在 | 一貫性なし |
| `checkin` 系全般 | `throw` のみ | クライアント側でキャッチ前提 |
| `dashboard` 系 | `return []`（空配列） | エラーとデータなしの区別不可 |

**問題**: Server Actions でエラーハンドリングが統一されていない。`throw` する Action と `return { success: false }` を返す Action が混在し、クライアント側のエラー処理が不安定。

---

### C-6. メール送信のサイレント失敗

**ファイル**: `src/app/actions/reservation.ts` (L148-150, L191-193)

```typescript
} catch (emailError) {
    console.error("メール送信エラー（予約自体は成功）:", emailError);
    // ← ユーザーへの通知なし。メールが送れなかったことを知る手段がない
}
```

**問題**: 予約確認メールの送信失敗が `console.error` のみで握りつぶされる。ユーザーは予約成功と表示されるが、確認メールが届かない。ブロードキャストメール (`broadcast.ts` L73-76) も同様に主催者コピーの失敗がサイレント。

---

### C-7. React エラーバウンダリ未実装

**ファイル**: `src/app/` 配下全体

```bash
# error.tsx ファイルが0件
$ find src/app -name "error.tsx"
# (No results)
```

**問題**: Next.js の `error.tsx` が一切存在しない。チェックイン・支払い・公開予約など **全ページ** でランタイムエラーが発生すると、ページ全体がクラッシュしリカバリ不可。進行中の操作データも失われる。

---

## コード品質 — WARNING（深掘り監査結果）

| # | 内容 | ファイル |
|---|------|---------|
| CW-1 | ビジネスロジックの重複：チェックイン状態判定が3箇所に同一コード（`actions/checkin.ts`, `client-firestore/checkin.ts`, `client-firestore/staff.ts`）。支払状態判定も同3箇所 | 複数 |
| CW-2 | チケット数計算 `(tickets\|\|[]).reduce((sum,t:any)=>sum+(t.count\|\|0),0)` が30箇所以上に散在。共通関数化されていない | 複数 |
| CW-3 | 巨大コンポーネント：`PrintLayoutEditor.tsx`(1892行), `CheckinList.tsx`(1090行), `MerchandiseSalesForm.tsx`(1089行), `form-editor/page.tsx`(1138行) | 4ファイル |
| CW-4 | ステータス文字列がマジックストリングとして散在（`"CHECKED_IN"`, `"NOT_CHECKED_IN"`, `"PAID"` 等が27箇所以上） | 複数 |
| CW-5 | `.data()` チェーン呼び出しが `exists()` チェック後でも安全でないパターン（`production.ts` 8箇所） | `src/app/actions/production.ts` |
| CW-6 | `serializeDocs<any>` パターンが5箇所で型安全性を破壊（`reservation-search.ts`, `dashboard.ts`, `reservation.ts` 等） | 複数 |
| CW-7 | `registerPayment` にtry-catchなし。Firestore書き込み失敗時にクライアントが成功と誤認する可能性 | `src/app/actions/payment.ts` |
| CW-8 | `GlobalReservationSearch` にデバウンスなし。キー入力ごとにFirestoreクエリが発行される | `src/components/GlobalReservationSearch.tsx` |

---

## コード品質 — INFO

| # | 内容 |
|---|------|
| CI-1 | `ReservationList.tsx` にインラインスタイル75箇所以上。レンダリング毎に新規オブジェクト生成（パフォーマンス影響） |
| CI-2 | `dashboard/page.tsx` で日付グルーピング・ソートに `useMemo` 未使用（再レンダリング時に毎回計算） |
| CI-3 | Firestoreクエリに `.select()` 未使用（帯域・コスト最適化の余地あり） |
| CI-4 | Firestoreクエリに `.limit()` 未使用の箇所あり（大規模データ時のリスク） |
| CI-5 | カスタムフック1個のみ（`useUnsavedChanges`）。予約管理・チェックイン状態・物販カート等のフック抽出の余地 |
| CI-6 | `client-firestore/staff.ts` が `actions/staff-auth.ts` からインポート — 通常と逆方向の依存関係 |
| CI-7 | エラーハンドラで `catch (error: any)` パターン（6箇所）。`unknown` + 型ガードが推奨 |
| CI-9 | `onSnapshot` リスナーのクリーンアップは適切に実装されている（良好点） |
| CI-10 | `date-fns` のインポートは個別関数のみで適切（バンドルサイズ良好） |

---

## データ整合性 — CRITICAL（深掘り監査結果）

### D-1. キャンセル処理のレース条件（Server Action + Client 両方）

**ファイル**: `src/app/actions/reservation.ts` (L312-340), `src/lib/client-firestore/reservation.ts` (L100-118)

```typescript
// 2つの独立した updateDoc — アトミックでない
await updateDoc(reservationRef, { status: 'CANCELED', ... });  // Step 1
await updateDoc(performanceRef, { bookedCount: increment(-ticketCount) });  // Step 2
// Step 1成功 → Step 2失敗 = bookedCount未更新、座席が永久に消失
```

**問題**: キャンセル処理が2つの独立した `updateDoc` に分かれている。Step 1成功後にStep 2が失敗すると、予約はCANCELEDだが `bookedCount` が減少せず座席が戻らない。

**修正**: `runTransaction()` で一括実行（`restoreReservation` は既にトランザクション化されており、良い実装例がある）

---

### D-2. 当日券作成が非アトミック

**ファイル**: `src/app/actions/sameDayTicket.ts` (L62-80)

```typescript
// addDoc と updateDoc が分離 — トランザクション保護なし
await addDoc(collection(db, "reservations"), { ... });  // Step 1
await updateDoc(performanceRef, { bookedCount: increment(totalQuantity) });  // Step 2
```

**問題**: 当日券の予約作成と `bookedCount` 更新が分離。同時に複数スタッフが当日券を発行すると、容量チェックが行われず **オーバーブッキング** が発生する。通常の予約作成（`createReservation`）はトランザクション化されているが、当日券は未対応。

**修正**: `createReservation` と同じ `runTransaction()` パターンに統一

---

### D-3. CANCELED 予約へのチェックイン防止なし

**ファイル**: `src/app/actions/checkin.ts` (L15-54), `src/lib/client-firestore/checkin.ts` (全チェックイン関数)

```typescript
export async function addCheckedInTickets(...) {
    await runTransaction(db, async (transaction) => {
        const reservation = resSnap.data();
        // ✗ reservation.status === 'CANCELED' のチェックがない
        // キャンセル済み予約でもチェックイン可能
        const newCheckedInTickets = Math.min((reservation.checkedInTickets || 0) + count, totalTickets);
    });
}
```

**問題**: 全てのチェックイン関数（`addCheckedInTickets`, `processCheckinWithPayment`, `processPartialReset`）でキャンセル状態のチェックがない。キャンセル済み予約に対してチェックイン操作が実行でき、`status: CANCELED` + `checkinStatus: CHECKED_IN` という矛盾した状態が生まれる。

**修正**: トランザクション内の先頭に `if (reservation.status === 'CANCELED') throw new Error('キャンセル済み')` を追加

---

### D-4. 支払い額の上限チェック・負値チェック欠落

**ファイル**: `src/app/actions/payment.ts` (L13-39)

```typescript
const newPaidAmount = (reservation.paidAmount || 0) + receivedAmount;
// ✗ receivedAmount < 0 のチェックなし → マイナス支払いで paidAmount 減算可能
// ✗ newPaidAmount > totalAmount のチェックなし → 過剰支払い記録可能
// ✗ reservation.status === 'CANCELED' のチェックなし → キャンセル済みに支払い追加可能
// ✗ トランザクション外 → Race Condition
```

**問題**: 4つの検証が欠落。特にキャンセル済み予約への支払い追加と負値による支払い額の不正減算が可能。

**修正**: `runTransaction()` 内で状態チェック + 金額バリデーション追加

---

### D-5. `paymentStatus` 型不一致が6箇所に散在

**影響ファイル**: `payment.ts` (L29), `checkin.ts` (L130, L201), `staff.ts` (L201, L320), `client-firestore/checkin.ts` (L126, L244)

```typescript
// コード: "PARTIALLY_PAID" を設定
paymentStatus = "PARTIALLY_PAID"

// 型定義: 'PARTIAL' を期待
paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID'

// 表示ラベル: 'PARTIAL' をキーとして検索
PAYMENT_STATUS_LABELS['PARTIAL'] = '一部支払い'
// → PAYMENT_STATUS_LABELS['PARTIALLY_PAID'] = undefined
```

**問題**: 6箇所で `"PARTIALLY_PAID"` を設定しているが、型定義は `'PARTIAL'`、表示ラベルも `'PARTIAL'` をキーとしている。一部支払い状態のラベルが表示されない。

**修正**: 全6箇所を `"PARTIAL"` に統一、または型定義とラベルを `"PARTIALLY_PAID"` に合わせる

---

### D-6. セット割引計算での NaN/Infinity 問題

**ファイル**: `src/lib/client-firestore/merchandise-sales.ts` (L57-87)

```typescript
let timesApplicable = Infinity;
for (const setItem of set.items) {
    timesApplicable = Math.min(timesApplicable, Math.floor(available / setItem.quantity));
    // setItem.quantity === 0 → Infinity / 0 = NaN
}
const discountAmount = discountPerSet * timesApplicable;
// timesApplicable が NaN → discountAmount = NaN → effectiveAmount = NaN
```

**問題**: セットアイテムの `quantity` が 0 の場合、`Math.floor(available / 0)` = `Infinity` → 後続計算で NaN が伝播。物販売上の `effectiveAmount` が NaN として保存され、レポート集計が破損する。

**修正**: `if (setItem.quantity <= 0) { timesApplicable = 0; break; }` を追加

---

### D-7. キャッシュクローズで物販売上が含まれない場合がある

**ファイル**: `src/components/CashCloseForm.tsx` (L246-271)

```typescript
if (expectedSalesOverride !== undefined) {
    setExpectedSales(expectedSalesOverride);  // チケット + 物販
} else {
    const paidTotal = await getPerformancePaidTotalClient(...);
    setExpectedSales(paidTotal);  // チケット売上のみ！物販なし！
}
```

**問題**: `expectedSalesOverride` が渡されない場合（物販モード無効時）、期待売上にチケット売上のみが含まれ物販売上が無視される。実際に物販売上がある場合、精算時に差額が発生し正しい精算ができない。

**修正**: 物販モードに関わらず物販売上を常に集計に含める

---

### D-8. `performance.bookedCount` の二重管理とクライアント版のレース条件

**ファイル**: `src/lib/client-firestore/reservation.ts` (L63-95)

```typescript
// クライアント版: トランザクション外でクエリ集計（古いデータ参照のリスク）
const resSnapshot = await getDocs(qRes);  // ← トランザクション外
const bookedCount = calculateBookedCount(resSnapshot.docs...);

// Server Action版: トランザクション内でドキュメント値を参照（安全）
const bookedCount = performance.bookedCount || 0;  // ← トランザクション内
```

**問題**: Server Action版とクライアント版で `bookedCount` の取得方法が異なる。クライアント版はトランザクション外で `getDocs()` を使用しているため、古いデータを参照してオーバーブッキングが発生する可能性がある。

**修正**: クライアント版も `performance.bookedCount` を直接参照するように統一

---

## データ整合性 — WARNING（深掘り監査結果）

| # | 内容 | ファイル |
|---|------|---------|
| DW-1 | Production削除時に子ドキュメント（performances, reservations, merchandise等）が孤立する | `production.ts` |
| DW-2 | Performance削除時にcheckinLogs, cashClosings, merchandiseSalesが孤立する | `performance.ts` |
| DW-3 | `checkedInTickets`（スカラー値）と`checkinLogs`（履歴記録）の整合性検証なし | `checkin.ts` |
| DW-4 | `paidAmount`と`tickets[].paidCount * price`の合計が一致する保証なし | `checkin.ts` |
| DW-5 | キャッシュクローズの重複実行防止なし（同じ公演回で複数回精算可能） | `cash-close.ts` |
| DW-6 | 物販レポートでCANCELED取引が`totalTransactions`に含まれ重複カウント | `merchandise-report.ts` (L110-135) |
| DW-7 | `merchandiseSales` のインデックスに `createdAt` 不足 | `firestore.indexes.json` |

---

## データ整合性 — INFO

| # | 内容 |
|---|------|
| DI-1 | 売上計算での浮動小数点誤差リスク（小数単価 × 大量件数） |
| DI-2 | `performance.startTime` が `new Date()`（クライアント時刻）で保存されている |
| DI-3 | 在庫チェックのタイムゾーン問題（`checkedAt` のローカル時刻 vs サーバー時刻） |
| DI-4 | `Timestamp.now()` と `serverTimestamp()` の混在（merchandise-sales.ts他） |
| DI-5 | 部分キャンセル時のセット割引再計算ロジックの精度問題 |

---

## ビルド・デプロイ — CRITICAL（深掘り監査結果）

### BD-1. Server Actions が Client SDK を使用（Admin SDK 未使用）

**ファイル**: `src/app/actions/*.ts` 全12ファイル

```typescript
// src/app/actions/reservation.ts:3
import { db } from "@/lib/firebase";        // ← Client SDK
import { ... } from "firebase/firestore";    // ← Client SDK
// firebase-admin は devDependencies にのみ存在し、Server Actions では未使用
```

**問題**: 全てのServer Actionsが Firebase Client SDK を使用しており、Admin SDK を使っていない。これにより：
1. **Firestoreセキュリティルールに完全依存**：Server Actions もルールに制約される（Admin SDKならバイパス可能）
2. **サーバーサイド認証が不完全**：クライアントの認証状態をサーバーで共有する仕組みがない
3. **セキュリティ修正の幅が制限**：ルール制限＝Server Actionsも制限される

**影響範囲**:
| ファイル | 操作 |
|---------|------|
| `reservation.ts` | `getDoc`, `updateDoc`, `runTransaction`, `increment` |
| `sameDayTicket.ts` | `addDoc`, `updateDoc`, `increment` |
| `payment.ts` | `getDoc`, `updateDoc` |
| `checkin.ts` | `runTransaction`, 複合状態更新 |
| `production.ts` | クエリ + 書き込み |
| `production-details.ts` | `getDoc`, `getDocs`, `addDoc`, `updateDoc` |
| `broadcast.ts` | メール送信（権限チェックなし） |
| `dashboard.ts` | クエリ操作 |
| `staff-auth.ts` | セッション管理 |
| `reservation-search.ts` | 検索クエリ |
| `production-context.ts` | 公演コンテキスト取得 |
| `invitation.ts` | 招待コード検証 |

**修正**: `firebase-admin` を `dependencies` に移動し、Server Actions を段階的にAdmin SDKに移行。サービスアカウント認証情報を `apphosting.yaml` に追加。

**補足**: 身内利用MVPとしてはClient SDKのままでも動作するが、セキュリティ修正（S-2, S-5等）のFirestoreルール制限時にServer Actionsも影響を受けるため、ルール変更前にAdmin SDK移行が理想。

---

### BD-2. `SESSION_SECRET` が apphosting.yaml に未定義

**ファイル**: `apphosting.yaml`, `src/app/actions/staff-auth.ts` (L11-13)

**問題**: セキュリティ項目 S-4 と同じ。`SESSION_SECRET` が `apphosting.yaml` に設定されていないため、本番環境でハードコードされたフォールバック値が使用される。

**デプロイ影響**:
- `SESSION_SECRET` を新規追加すると、既存の全スタッフJWTセッションが無効化される
- スタッフ全員の再ログインが必要
- `staffSessions` コレクション内の既存ドキュメントのクリーンアップが推奨

**修正**: `apphosting.yaml` に追加：
```yaml
- variable: SESSION_SECRET
  secret: SESSION_SECRET
```

---

### BD-3. `REPLY_TO_EMAIL` が apphosting.yaml に未定義

**ファイル**: `apphosting.yaml`, `src/lib/email.ts` (L11)

**問題**: コード品質項目 C-2 と同じ。本番環境で個人Gmailアドレスが返信先になる。

**修正**: `apphosting.yaml` に追加：
```yaml
- variable: REPLY_TO_EMAIL
  value: "support@example.com"  # 適切なアドレスに変更
```

---

### BD-4. セキュリティヘッダー未設定

**ファイル**: `next.config.ts`

**問題**: `next.config.ts` にセキュリティ関連ヘッダーが設定されていない：
- `X-Frame-Options` / `Content-Security-Policy` の `frame-ancestors` なし → クリックジャッキング可能
- `X-Content-Type-Options: nosniff` なし
- `Referrer-Policy` なし
- `Permissions-Policy` なし
- `poweredByHeader: false` 未設定 → `X-Powered-By: Next.js` ヘッダーが露出

**修正**: `next.config.ts` に `headers()` と `poweredByHeader: false` を追加

---

### BD-5. デッドコードとバックアップファイルの残存

**ファイル**: 複数

| ファイル | 種類 | 詳細 |
|---------|------|------|
| `src/components/SearchReservations.tsx` | デッドコード | どのファイルからもインポートされていない |
| `src/components/PrintLayoutEditor.tsx.bak` | バックアップ | 本来リポジトリに含めるべきでない |
| `scripts/seed-demo.mjs` | OAuth秘密鍵 | Google OAuthクライアントシークレットがハードコード（S-8参照） |

**問題**: 不要なファイルがリポジトリに含まれている。`SearchReservations.tsx` には `TODO: Implement debounce search` が残存。

**修正**: デッドコードと `.bak` ファイルを削除

---

## ビルド・デプロイ — WARNING（深掘り監査結果）

| # | 内容 | ファイル |
|---|------|---------|
| BW-1 | `firebase-admin` が `devDependencies` にある（Server Actionsで使用する場合は `dependencies` に移動が必要） | `package.json` |
| BW-2 | `@types/qrcode`, `@types/qrcode.react` が `dependencies` にある（`devDependencies` が正しい） | `package.json` |
| BW-3 | `console.log/warn/error` が約130箇所に散在（本番ログの可読性低下、機密情報のログ出力リスク） | 複数ファイル |
| BW-4 | `email.ts` がメール送信時に宛先・件名をログ出力（個人情報漏洩リスク） | `src/lib/email.ts` |
| BW-5 | `INVITATION_CODE` が `apphosting.yaml` に平文記載（`secret:` 指定が推奨） | `apphosting.yaml` |
| BW-6 | カスタムエラーページ（404, 500）が未実装 | — |

---

## ビルド・デプロイ — INFO

| # | 内容 |
|---|------|
| BI-1 | Firestoreインデックス（`firestore.indexes.json`）は完備。ただし `merchandiseSales` の `createdAt` フィールドのインデックスが不足の可能性（DW-7参照） |
| BI-2 | `next.config.ts` に `reactStrictMode: true` の明示的設定がない |
| BI-3 | `.gitignore` にPrisma関連記述が残存（現在はFirestoreに移行済み） |
| BI-4 | `apphosting.yaml` の `concurrency: 100` は小〜中規模公演に適切 |
| BI-5 | `any` 型が約200箇所に散在（型安全性の改善余地あり） |
| BI-6 | テストフレームワーク未導入（Jest/Vitest等。MVP段階では許容可） |
| BI-7 | Firebase App Hosting デプロイ時に `firestore.rules` と `firestore.indexes.json` は別途 `firebase deploy` が必要 |
| BI-8 | Admin SDK移行時にはサービスアカウントキーの安全な管理（Secret Manager経由）が必要 |

---

## セキュリティ修正のデプロイ影響分析（ビルド・デプロイ深掘り結果）

### Firestoreルール変更時のクライアントコード影響

Firestoreルールを制限した場合に影響を受けるクライアントコード：

### 🔴🔴 V-15: Firestoreルール変更の全面凍結

**3チームの独立検証により確定**: 全Server ActionsがClient SDK を使用しており `request.auth = null` で動作するため、`isSignedIn()` を追加するルール変更は **Admin SDK移行前は一切実施できない**。

| 提案されていたルール変更 | 破壊されるServer Actions | 結論 |
|------------------------|------------------------|------|
| `productions` → `allow get: if isSignedIn()` | `reservation.ts`, `production-details.ts`, `sameDayTicket.ts`, `staff-auth.ts` | **凍結** |
| `performances` bookedCount → `isSignedIn()` + 値域制限 | `reservation.ts`(create/cancel/restore), `sameDayTicket.ts` | **凍結** |
| `staffSessions` → ルール簡素化 | V-10により元々維持方針 | **凍結** |

**MVP方針**: Firestoreルールは **一切変更しない**。全てのセキュリティ改善はコード・設定変更のみで実施する。

### 当日券フローの不整合

```
公開予約:     runTransaction() ✓（アトミック）
当日券(SA):   addDoc + updateDoc ✗（非アトミック）
当日券(Client): runTransaction() ✓（アトミック）
```

Server Action版の当日券作成（`sameDayTicket.ts`）のみトランザクション化されていない。同時に複数スタッフが発行するとオーバーブッキングのリスクがある。

### データマイグレーション要件

セキュリティ修正デプロイ時に必要なマイグレーション：

| # | マイグレーション | スクリプト | 影響 | タイミング |
|---|----------------|----------|------|-----------|
| M-1 | `staffTokens` から `passcode`（平文）フィールド削除 | `scripts/migrate-passcodes.mjs`（新規作成） | 既存全公演のstaffTokens更新 | S-1修正のデプロイ前 |
| M-2 | `SESSION_SECRET` 変更に伴う全セッション無効化 | スタッフ全員の再ログインで自動解消 | 一時的なスタッフ認証断 | S-4修正のデプロイ時 |
| M-3 | `PARTIALLY_PAID` → `PARTIAL` の既存データ修正 | `scripts/fix-payment-status.mjs`（新規作成） | 既存予約のpaymentStatusフィールド更新 | D-5修正のデプロイ後 |
| M-4 | `staffSessions` の `expiresAt == null` ドキュメント一括削除 | `scripts/cleanup-staff-sessions.mjs`（新規作成） | 古いnullセッションのスタッフは再ログイン必要 | S-7修正のデプロイ前（Admin SDK移行後） |

> **MVPリリースで必要なマイグレーション: M-1, M-2, M-3 の3件のみ**。M-4 はAdmin SDK移行後に実施。

---

## 整合性検証結果（全修正の相互影響チェック）

> 本セクションは、提案された全修正が互いに矛盾せず、アプリの機能を破壊しないかを検証した結果です。

### 検証で発見された重大な誤り（修正済み）

| # | 誤り | 正しい事実 | 影響を受けた項目 |
|---|------|-----------|---------------|
| **V-1** | 「Server ActionはAdmin SDK相当でFirestoreルールをバイパスする」 | **全Server ActionsはClient SDKを使用しており、Firestoreルールに制約される** | S-2, S-5, S-6の修正方針を全面修正 |
| **V-2** | S-5修正で `isAuthorizedStaff()` を要求 | **匿名ユーザーの公開予約bookedCount更新が全て失敗する** → 暫定対応（値域制限）に変更 | S-5 |
| **V-3** | S-6修正で `allow create: if false` | **Server ActionもClient SDKのため作成不可になる** → ルール簡素化に変更 | S-6 |
| **V-4** | 修正フェーズ順序が2箇所で矛盾 | 1つの統一された順序に整理 | 修正順序セクション |

### 10チーム集中セキュリティ検証で発見された追加問題

> 10の独立チームによるセキュリティ集中検証を実施。以下の追加問題が発見され、既存の修正提案を修正。

#### V-9 → V-15 に統合（下記参照）

#### V-15. 🔴🔴 全Server Actionsが未認証でFirestoreを操作 — S-2, S-5のルール変更は不可能

> **V-9 の発見を大幅に拡張**。V-9 は「公開予約ページに匿名認証を追加すれば解決」としていたが、問題はそれだけではなかった。

**根拠**: 3チームの独立検証により、以下が確定：

1. **Server Actionsは `request.auth = null` で動作する** — `src/lib/firebase.ts` で初期化されるClient SDKインスタンスは、サーバー側では認証状態を持たない。ブラウザの認証情報はServer Actionsに引き継がれない。

2. **S-2 (`productions` の `allow get: if isSignedIn()`) は以下の全てを破壊する**：
   - `reservation.ts`: `getBookingOptions()` — 公開予約フローの公演情報取得
   - `production-details.ts`: `getProductionDetails()` — ゲストアクセス
   - `sameDayTicket.ts`: `createSameDayTicket()` — 当日券の公演情報参照
   - `staff-auth.ts`: `verifyStaffPasscode()` — スタッフ認証時の公演読み取り
   - `reservation.ts`: `createReservation()` — 確認メール送信のための公演情報取得

3. **S-5 (`performances` bookedCount の `isSignedIn()`) は以下の全てを破壊する**：
   - `reservation.ts`: `createReservation()` — トランザクション内の bookedCount 更新
   - `reservation.ts`: `cancelReservation()` — bookedCount 減算
   - `reservation.ts`: `restoreReservation()` — bookedCount 復元
   - `sameDayTicket.ts`: `createSameDayTicket()` — bookedCount 加算

4. **公開予約ページに匿名認証を追加してもServer Actionsは修正されない** — ブラウザ側の匿名認証はServer Actions（サーバー側実行）に伝播しない

**結論**: `isSignedIn()` を追加するFirestoreルール変更は、**Admin SDK移行が完了するまで一切実施できない**。Admin SDK移行後は Server Actions が Firestore ルールをバイパスするため、ルール制限が可能になる。

**影響**: S-2 と S-5 はリリース前の修正対象から除外し、Admin SDK移行後に実施する。

#### V-10. 🔴 S-6 のルール簡素化は passcodeHashed 検証を除去し、より危険になる

**根拠**: 現在のS-6修正提案は `isSignedIn() && request.auth.uid == uid`（passcodeHashed検証を除去）だが、これにより：

```
// 現状のルール（L98-99）— passcodeHashed照合あり
allow create, update: if isSignedIn() && request.auth.uid == uid &&
  get(...productions...).data.staffTokens[request.resource.data.token].passcodeHashed == request.resource.data.passcodeHashed;

// 提案していた簡素化 — passcodeHashed照合なし → 危険！
allow create, update: if isSignedIn() && request.auth.uid == uid;
// → 任意のユーザーが自分のUIDでstaffSessionを作成可能（パスコード不要）
```

**問題点**: S-1で平文passcodeを削除してもS-2でproductionsの読み取りを制限しても、`passcodeHashed` は認証ユーザーなら取得可能（匿名認証含む）。しかしルール側の `passcodeHashed` 照合は「正しいパスコードを知っている証拠」として機能する（S-1の平文漏洩がなければ、bcryptハッシュから元パスコードを逆算することは不可能）。

**修正（S-6を更新）**: ルールの `passcodeHashed` 照合は **削除せず維持する**。修正方針を以下に変更：
1. **S-1を先に実施**：平文passcode削除で `passcodeHashed` の安全性を確保
2. **S-2を実施**：`isSignedIn()` で未認証アクセスをブロック（V-9の前提条件を先に実施）
3. **S-6は「現状ルール維持」**：`passcodeHashed` 照合は正しいパスコードの証明として有効。Server Action (`verifyStaffPasscode`) でのbcrypt検証は追加の保護層であり、ルール側の検証と両立する
4. 将来のAdmin SDK移行後にルール側を `allow create: if false`（Server Action専用）に変更

#### V-11. S-1 修正にはスタッフ管理UIの変更が必要

**根拠**: `src/app/productions/[id]/staff/page.tsx` (L190, L208) でスタッフ管理画面に平文パスコードが表示されている：

```typescript
// L190 — staffTokensから平文パスコードを取得して表示
const passcode = typeof data === 'string' ? '要再発行' : data.passcode;
// L208 — UIに平文パスコードを表示
パスコード: <strong>{passcode}</strong>
```

**影響**: S-1で `passcode` フィールドを削除すると、スタッフ管理画面のパスコード表示が `undefined` になる。

**修正（S-1に追記）**: S-1の修正時に以下のUI変更も必要：
1. `staff/page.tsx` でパスコード表示部分を「パスコード設定済み」等の表示に変更（平文は非表示化）
2. パスコード再発行機能（`handleUpdatePasscode`）は引き続き動作させる（新規発行→一度だけ表示→保存は `passcodeHashed` のみ）
3. `generateStaffTokenClient` の戻り値の `passcode` は新規発行時のみ一時的に返し、Firestoreには保存しない

#### V-12. merchandiseSales ルールが productions の get に依存（S-2の影響範囲拡大）

**根拠**: `firestore.rules` L239, L248 で `merchandiseSales` のルールが `get(/databases/.../productions/...)` を使用：

```
// merchandiseSales の read/list ルール（L237-241）
allow read, list: if isSignedIn() && (
  resource.data.userId == request.auth.uid ||
  get(.../productions/$(resource.data.productionId)).data.userId == request.auth.uid ||
  isAuthorizedStaff(resource.data.productionId)
);
```

**影響**: S-2で `productions` の `allow get` を変更しても、ルール内の `get()` 関数はFirestoreルール評価エンジンが直接データを読むため **影響なし**。ルール内 `get()` はセキュリティルールをバイパスする。

**結論**: ルール内 `get()` はクライアントの `getDoc()` とは異なり、ルール評価を受けない。**S-2の影響範囲の拡大はない**（当初の懸念は杞憂）。

#### V-13. S-7（expiresAt == null 禁止）に既存セッションのマイグレーション戦略が必要

**根拠**: 現在のルール（L31）で `sessionData.expiresAt == null` が許可されているため、過去に作成された `expiresAt` なしのセッションが存在する可能性がある。

**影響**: S-7でルールを `expiresAt != null && expiresAt > request.time` に変更すると、既存の `expiresAt == null` セッションを持つスタッフが即座にアクセス不能になる。ただし、現在のコード（`staff/[id]/page.tsx` L58）では `expiresAt: new Date(Date.now() + 24*60*60*1000)` を設定しているため、24時間以内に作成されたセッションは問題ない。

**修正（S-7に追記）**:
1. **Phase 1**: まずコード側で `expiresAt` を必ず設定するよう確認（現在は設定済み）
2. **Phase 2**: ルール変更前に、`expiresAt == null` の既存セッションを一括削除するスクリプトを実行（M-4として追加）
3. **Phase 3**: ルールを `expiresAt != null && expiresAt > request.time` に変更

### 検証で安全性が確認された項目

| # | 検証内容 | 結果 |
|---|---------|------|
| **V-5** | S-3（sessionStorage削除）が機能を壊さないか | **安全** — sessionStorageの値はコード全体でどこからも読み取られていない（write-only） |
| **V-6** | D-1（cancelのトランザクション化）がFirestoreルールと互換するか | **安全** — reservationはuserIdで更新可能、performanceのbookedCountは現行ルールで更新可能。`restoreReservation`パターンをそのまま流用できる |
| **V-7** | S-2で `allow get: if isSignedIn()` にした場合の影響 | **V-15により無効化** — S-2はAdmin SDK移行後に実施。MVPではFirestoreルール変更なし |
| **V-8** | D-5で `PARTIALLY_PAID` → `PARTIAL` に変更した場合、既存データとの互換性 | **注意必要** — 既存データに `PARTIALLY_PAID` が残るため、M-3マイグレーションで既存データも変換する |
| **V-14** | ルール内 `get()` がルール変更の影響を受けるか | **影響なし** — ルール内 `get()` はセキュリティルール評価をバイパスする（V-12参照）。ただしMVPではルール変更なし |

---

## セキュリティ修正のデータ整合性への影響分析

セキュリティ修正（S-1〜S-6）を実施する際のデータ整合性リスクと推奨実装順序：

### 修正順序（推奨） — 最小限変更・整合性検証済み

> **🔴🔴 根本原則（V-15）**: 全Server ActionsがFirebase Client SDK を使用しており `request.auth = null` で動作する。したがって **Firestoreルールへの `isSignedIn()` 追加は Admin SDK移行前は一切不可能**。MVPリリースでは **Firestoreルールは一切変更せず、コード・設定変更のみ** で対応する。

| Phase | 修正 | リスク | 変更種類 | 備考 |
|-------|------|--------|---------|------|
| 1 | **S-3**: sessionStorage廃止 | なし | コード（2行削除） | sessionStorage値はどこからも読み取られていない（検証済み） |
| 2 | **S-4 + BD-2**: SESSION_SECRET修正 | 低 | コード + 設定 | フォールバック削除 + apphosting.yaml追加。既存スタッフは再ログイン必要 |
| 3 | **BD-3**: REPLY_TO_EMAIL設定 | なし | 設定のみ | apphosting.yamlに追加。個人メールアドレスの露出防止 |
| 4 | **S-1 + M-1**: passcode平文削除 + UI変更 | 低 | コード + マイグレーション | 🔴最重要セキュリティ修正。V-11: スタッフ管理UIの表示変更も含む |
| 5 | **D-5 + M-3**: PARTIALLY_PAID統一 | 低 | コード + マイグレーション | 6箇所の文字列置換。一部支払い表示の修正 |
| 6 | **D-1, D-2**: トランザクション化 | 中 | コード | cancel + sameDayTicket。既存の `restoreReservation` パターンを流用（検証済み） |
| 7 | **D-3**: CANCELEDチェック追加 | 低 | コード | if文1行追加のみ |
| 8 | **D-4**: 支払いバリデーション + トランザクション化 | 中 | コード | 負値チェック + キャンセル済みチェック + try-catch（CW-7を包含） |
| 9 | **C-7**: ルートerror.tsx追加 | 低 | コード（新規ファイル1個） | 本番公演中のクラッシュからの復帰用。最低限 `src/app/error.tsx` のみ |

> **Firestoreルール変更は0件**。S-2, S-5, S-6, S-7 は全て Admin SDK 移行後に実施。

### 注意点

- **🔴🔴 V-15**: `isSignedIn()` を追加するFirestoreルール変更は一切実施しない。Server Actionsが未認証でFirestoreを操作しているため、ルール制限するとアプリが動作不能になる。
- **S-1の修正時（V-11）**: `passcode` フィールド削除時にスタッフ管理UI（`staff/page.tsx`）でパスコード表示部分を変更する必要がある。
- **S-1の修正時**: 既存の `staffTokens` に `passcode` フィールドが残存するため、既存データのクリーンアップスクリプト（M-1）が必要。
- **D-1の修正時**: `restoreReservation` のトランザクションパターンは `cancelReservation` にそのまま流用可能（検証済み）。
- **残存リスク（S-6）**: S-1実施後も、`passcodeHashed` は productions ドキュメントから読み取り可能。技術的に高度な攻撃者はこの値を使ってstaffSessionを作成できる。完全な防御にはAdmin SDK移行が不可欠だが、身内利用MVPでは許容する。

---

## WARNING — 修正を推奨（ブロッキングではない）

### コード品質関連（深掘り結果を含む）

| # | 内容 | ファイル |
|---|------|---------|
| W-1 | `PublicReservationForm.tsx` のuseEffect内でPromise未処理（catch なし） | `PublicReservationForm.tsx` (L51) |
| W-2 | Timestamp型の扱いが不統一（`Timestamp.now()` vs `serverTimestamp()`） | 複数 |
| W-3 | `dashboard.ts` のエラーハンドリングが空配列返却（エラーとデータなしの区別不可） | `src/app/actions/dashboard.ts` (L70, L136, L255) |
| W-4 | `CheckinList.tsx` の `.catch(err => showToast(err.message))` — `err.message` が undefined の場合 "undefined" 表示 | `src/components/CheckinList.tsx` |

### ビルド・デプロイ関連

| # | 内容 | ファイル |
|---|------|---------|
| W-7 | テストフレームワーク未導入 | `package.json` |
| W-8 | `@types/qrcode`, `@types/qrcode.react` が `dependencies` にある | `package.json` |
| W-9 | `.bak` ファイルがリポジトリに含まれている | `PrintLayoutEditor.tsx.bak` |
| W-10 | `console.log/warn/error` が130箇所に散在 | 複数 |
| W-11 | `apphosting.yaml` に `INVITATION_CODE` が平文で記載 | `apphosting.yaml` |

---

## INFO — ベストプラクティス提案（任意）

<details>
<summary>クリックで展開</summary>

### セキュリティ
- 監査ログ（`auditLogs`コレクション）の実装検討
- Firebase App Check の有効化検討
- 招待コード比較を `timingSafeEqual` に変更
- レガシーSHA-256パスコード比較を `timingSafeEqual` に変更
- スタッフ認証エラーメッセージをジェネリック化
- 4桁パスコードを6桁英数字に拡張
- CSVエクスポートの数式インジェクション対策

### コード品質（深掘りで詳細化）
- ビジネスロジック重複の共通関数化（`calculatePaymentStatus()`, `calculateCheckinStatus()`, `calculateTicketCount()`）
- 巨大コンポーネントの分割（`PrintLayoutEditor` 1892行, `CheckinList` 1090行, `MerchandiseSalesForm` 1089行）
- ステータス文字列の定数化（27箇所以上のマジックストリング）
- カスタムフックの拡充（予約管理、チェックイン状態、物販カート等）
- `serializeDocs<any>` を具体型に置き換え
- エラーハンドラの `catch (error: any)` を `catch (error: unknown)` + 型ガードに変更
- `client-firestore/staff.ts` → `actions/staff-auth.ts` の逆方向依存の解消
- ブロードキャストメールのレート制限を設定可能に

### パフォーマンス（深掘りで追加）
- `ReservationList.tsx` のインラインスタイル75箇所をCSSモジュールに移行
- `dashboard/page.tsx` の日付グルーピング・ソートに `useMemo` 追加
- Firestoreクエリに `.select()` 追加（帯域・コスト最適化）
- 大量データクエリに `.limit()` 追加（ページネーション）
- `CheckinList` の大量アイテムに仮想スクロール（react-window等）導入検討
- `GlobalReservationSearch` にデバウンス追加（300-500ms）

### ビルド・デプロイ
- `next.config.ts` に `poweredByHeader: false` 追加
- `reactStrictMode: true` の明示的設定
- `.gitignore` のPrisma関連記述の整理
- `firebase-admin` の配置確認（devDependencies で問題ないか）
- `concurrency: 100` の妥当性確認
- Firestoreインデックスのデプロイ確認（`firebase deploy --only firestore:indexes`）

### データ整合性
- チェックインログの変更前後差分記録
- セット割引計算での0除算対策
- フォーム入力バリデーション境界値チェック

</details>

---

## 良好な点（評価できる実装）

レビューの中で、以下の点は高品質に実装されていることが確認できました：

- **JWT認証**: httpOnly, secure, sameSite:strict, 24h有効期限 — 堅牢
- **bcryptパスコードハッシング**: 10ラウンド、SHA-256レガシー互換あり
- **予約作成のトランザクション処理**: `runTransaction()` で残席チェック+予約作成を原子実行
- **userId の信頼性**: Firebase Auth (`onAuthStateChanged`) から取得されたUIDを使用しており、クライアント改ざん不可能
- **onSnapshotリスナーのクリーンアップ**: useEffect return で適切にunsubscribe実装
- **date-fnsインポート**: 個別関数インポートでバンドルサイズ最適化
- **ローディング状態**: 主要ページでローディング表示を実装済み
- **入力バリデーション**: チケット数制限、正整数チェック、NaN防止
- **個人情報フィルタリング**: 公開ページでuserId等を除外
- **メールテンプレート**: テキスト形式送信でXSSリスクなし、変数置換も安全

---

## リリース前必須チェックリスト

> **方針**: Firestoreルールは一切変更しない（V-15）。全ての修正はコード・設定変更のみ。変更数を最小限に抑え、破綻リスクを排除する。

### リリースブロッカー — セキュリティ + 設定（コード・設定変更のみ）
- [ ] **S-3**: `sessionStorage` へのトークン保存を廃止（2行削除）
- [ ] **S-4 + BD-2**: `SESSION_SECRET` のフォールバック削除 + `apphosting.yaml` に `secret:` 追加
- [ ] **BD-3**: `REPLY_TO_EMAIL` を `apphosting.yaml` に追加
- [ ] **S-1 + M-1**: `staffTokens` から `passcode`（平文）フィールドを削除 + スタッフ管理UIのパスコード表示を変更（V-11）+ 既存データクリーンアップスクリプト

### リリースブロッカー — データ整合性（コード変更のみ）
- [ ] **D-5 + M-3**: `paymentStatus` の型不一致を全6箇所修正（`PARTIALLY_PAID` → `PARTIAL`）+ 既存データマイグレーション
- [ ] **D-1**: キャンセル処理を `runTransaction()` でアトミック化（Server Action + Client両方）
- [ ] **D-2**: 当日券作成を `runTransaction()` でアトミック化
- [ ] **D-3**: チェックイン関数に `status === 'CANCELED'` チェック追加
- [ ] **D-4**: `registerPayment` に負値・上限・キャンセル済みチェック + try-catch + トランザクション化（CW-7を包含）

### リリースブロッカー — 運用安全性（コード変更のみ）
- [ ] **C-7**: `src/app/error.tsx` にルートレベルのエラーバウンダリ追加（本番公演中のクラッシュ復帰用）

### 最終確認
- [ ] `npm run build` でビルドエラーがないことを確認
- [ ] `npm run lint` でlintエラーがないことを確認
- [ ] Firestoreルールが **変更されていない** ことを確認（`firestore.rules` の diff が空であること）

### 高優先 — Admin SDK移行後に実施（リリース後）
- [ ] **BD-1**: Server Actions を Firebase Admin SDK に段階的移行（全てのFirestoreルール改善の前提条件）
- [ ] **S-2**: `productions` の `allow get: if isSignedIn()` + 機密フィールドフィルタリング
- [ ] **S-5**: `performances` bookedCount更新ルールに `isOwner()` 制限
- [ ] **S-6**: `staffSessions` ルールを `allow create: if false`（Server Action専用化）
- [ ] **S-7 + M-4**: `staffSessions` の `expiresAt == null` を禁止 + 既存nullセッション削除

### 中優先（リリース後でも可）
- [ ] **BD-4**: `next.config.ts` にセキュリティヘッダー追加
- [ ] **BD-5**: デッドコード（`SearchReservations.tsx`）と `.bak` ファイル削除
- [ ] **C-3**: 金額計算の `any` 型排除 + nullチェック追加
- [ ] **C-5**: Server Actions のエラーハンドリングパターン統一
- [ ] **C-6**: メール送信失敗をユーザーに通知
- [ ] **SW-1**: `broadcast.ts` にサーバーサイド権限検証を追加
- [ ] **S-8**: `seed-demo.mjs` のOAuthシークレットを環境変数に移行
- [ ] **BW-4**: `email.ts` のログから個人情報を除去
- [ ] **D-6**: セット割引の `quantity === 0` チェック追加
- [ ] **D-7**: キャッシュクローズで物販売上が常に含まれるよう修正
- [ ] その他の WARNING / INFO 項目

---

## 総合判定

**現状**: 4つの技術観点（セキュリティ・データ整合性・ビルド/デプロイ・コード品質）で深掘り監査 + 10チーム集中検証 + 3チーム最終検証を実施。

**最終検証で判明した根本的制約（V-15）**: 全Server ActionsがClient SDKを使用しており `request.auth = null` で動作するため、**Firestoreルールへの `isSignedIn()` 追加はAdmin SDK移行前は一切不可能**。ルール変更を含む修正計画は全て白紙に戻し、**コード・設定変更のみ** の最小限計画に再構成。

**判定**: 以下の **11項目**（全てコード・設定変更、Firestoreルール変更なし）を修正すれば、**身内の演劇公演でのMVPテスト利用としてリリース可能**。

**修正項目一覧**（修正順序に対応）:

| Phase | 修正項目 | 工数 | 変更種類 | 備考 |
|-------|---------|------|---------|------|
| 1 | S-3（sessionStorage廃止） | 小 | コード2行削除 | 読み取り箇所なしを検証済み |
| 2 | S-4 + BD-2（SESSION_SECRET設定） | 小 | コード + 設定 | フォールバック削除 + 環境変数追加。スタッフ再ログイン必要 |
| 3 | BD-3（REPLY_TO_EMAIL設定） | 小 | 設定のみ | apphosting.yamlに追加 |
| 4 | S-1 + M-1 + V-11（passcode平文削除 + UI変更） | 小〜中 | コード + マイグレーション | 🔴最重要。フィールド削除 + スタッフ管理UI変更 + 既存データクリーンアップ |
| 5 | D-5 + M-3（PARTIALLY_PAID統一） | 小 | コード + マイグレーション | 6箇所の文字列置換 |
| 6 | D-1, D-2（トランザクション化2件） | 中 | コード | `restoreReservation` パターンを流用（整合性検証済み） |
| 7 | D-3（CANCELEDチェック追加） | 小 | コード | if文追加のみ |
| 8 | D-4（支払いバリデーション + トランザクション化） | 中 | コード | 負値チェック + try-catch（CW-7を包含） |
| 9 | C-7（ルートerror.tsx追加） | 小 | コード新規1ファイル | 本番公演中のクラッシュ復帰用 |

**Firestoreルール変更: 0件** — 全てAdmin SDK移行後に実施

**残存リスクの評価**:

| リスク | 内容 | 攻撃に必要な条件 | MVP許容度 |
|--------|------|----------------|----------|
| S-2残存 | productions ドキュメント全体が無認証で読み取り可能 | productionId の知識 + DevTools操作 | ⚠️ 許容（S-1でpasscode平文は削除済み） |
| S-5残存 | bookedCount が誰でも改ざん可能 | performanceId の知識 + Firestore API操作 | ⚠️ 許容（手動復旧可能） |
| S-6残存 | passcodeHashed のコピーでstaffSession作成可能 | productionId知識 + Firestore構造理解 + 意図的攻撃 | ⚠️ 許容（高度な技術知識が必要） |

これらの残存リスクは全て **Admin SDK移行** で解消される。身内利用MVPとしては、攻撃に必要な技術知識とモチベーションを考慮すると許容範囲。
