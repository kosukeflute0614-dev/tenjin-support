# 公開予約フォーム 権限エラー修正ログ (2026-03-09)

## 1. 発生していた問題

公開予約フォーム (`/book/{productionId}`) で、未ログインユーザーが予約しようとすると
**「Missing or insufficient permissions」** エラーが発生し、予約ができなかった。

### エラーの発生箇所（2つ）

1. **残席チェック時**: `PublicReservationForm.tsx` が `reservations` コレクションを `getDocs()` でクエリ → セキュリティルール `isSignedIn()` で拒否
2. **予約送信時**: サーバーアクション `createReservation` が `runTransaction` 内で `getDocs(reservations)` を実行 → 同様に拒否

### 根本原因

- `reservations` コレクションの `list` ルールが `isSignedIn()` を要求
- サーバーアクション (`'use server'`) は Firebase **クライアント SDK** を使っているため、サーバー上では認証コンテキストがない
- この問題はコミット `ab6b6dc` でオーバーブッキング防止のため `runTransaction` + `getDocs(reservations)` を追加した際に発生

---

## 2. 採用した解決策: bookedCount 方式

`reservations` をクエリする代わりに、`performances` ドキュメントに `bookedCount`（予約済み枚数）フィールドを追加。
`performances` は `allow read: if true` なので未認証でも読める。

### 変更したファイル一覧（11ファイル）

| ファイル | 変更内容 |
|---|---|
| `src/types/index.ts` | `Performance` 型に `bookedCount?: number` 追加 |
| `firestore.rules` | performance の update ルール分離。`bookedCount` のみの更新は認証不要に |
| `src/app/actions/production-details.ts` | `addPerformance()` で `bookedCount: 0` 初期化 |
| `src/lib/client-firestore/performance.ts` | `addPerformanceClient()` で `bookedCount: 0` 初期化 |
| `src/app/actions/reservation.ts` | `createReservation`: `getDocs` 削除 → `bookedCount` で残席チェック + `increment()` で加算。`cancelReservation`: `increment(-count)` で減算。`restoreReservation`: 同様に修正 |
| `src/app/actions/sameDayTicket.ts` | `createSameDayTicket`: `increment()` で `bookedCount` 加算 |
| `src/lib/client-firestore/reservation.ts` | `createReservationClient`: トランザクション内で `increment()` 加算。`cancelReservationClient`: `increment(-count)` 減算 |
| `src/lib/client-firestore/checkin.ts` | `createSameDayTicketClient`: トランザクション内で `increment()` 加算 |
| `src/lib/client-firestore/staff.ts` | `createSameDayTicketStaffClient`: トランザクション内で `increment()` 加算 |
| `src/components/PublicReservationForm.tsx` | `getDocs(reservations)` 削除 → `perf.bookedCount \|\| 0` で残席計算。デバッグパネル削除 |
| `src/app/book/[productionId]/page.tsx` | デバッグパネル削除 |

### Firestore ルールの変更ポイント

```
// Before
allow update, delete: if isOwner(resource.data.userId);

// After
allow update: if isOwner(resource.data.userId)
  || (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['bookedCount']));
allow delete: if isOwner(resource.data.userId);
```

これにより `bookedCount` のみの更新は認証不要（他のフィールドは変更不可）。

### ビルド結果

`npx next build` → **成功（エラーなし）**

---

## 3. 未完了: ローカルテスト

### devサーバーがフリーズする問題

ビルドは通ったが、`npx next dev` でローカルテストを試みたところ、
devサーバーが数十秒〜1分で応答不能になる問題が発生。

### 試したこと

| 対処 | 結果 |
|---|---|
| サーバー再起動（ポート3000） | 起動直後は動くが、1分以内にフリーズ |
| `.next/` キャッシュ削除 → 再起動 | 同上 |
| 残存 worktree (`.claude/worktrees/`) 削除 | 効果なし |
| `.gitignore` に `.claude/` 追加 | 効果なし |
| 別ポート（3001）で起動 | curl では 200 返るが、ブラウザでは同様にフリーズ |

### 観察された症状

- ブラウザで「Compiling」表示のまま停止
- `netstat` で `CLOSE_WAIT` 接続が大量に蓄積
- nodeプロセスのメモリ使用量が1.5GB超に膨張
- `curl` もタイムアウト（サーバーが完全に応答不能）
- Claude Code のプロセス（PID 14836）からの接続が `FIN_WAIT_2` で滞留していた

### 推定原因

Claude Code プロセスがdevサーバーに接続し、その接続が正常にクローズされないことで
node のイベントループがブロックされている可能性。
PC再起動後、Claude Code なしでdevサーバーを起動して確認するのが望ましい。

**注: コードの問題ではなく環境要因の可能性が高い**（ビルドは成功している）

---

## 4. 次回やること

1. **PC再起動後にdevサーバー起動 → ブラウザテスト**
   - シークレットウィンドウで `/book/{productionId}` にアクセス
   - 公演回選択 → 残席表示されること
   - 予約送信 → 成功すること
2. **テスト成功後、Firestore ルールをデプロイ**
   - `npx firebase deploy --only firestore:rules`
3. **本番デプロイ**

---

## 5. ブランチ情報

変更は `fix/public-reservation-bookedcount` ブランチにプッシュ済み。
main にはまだマージしていない。
