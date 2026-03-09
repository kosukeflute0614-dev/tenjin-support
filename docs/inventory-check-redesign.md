# 在庫チェック ロジック再設計 計画書

## 1. 現状の問題

### 現在の計算式
```
予想残数 = 初期在庫数 − その公演回の販売数
```

### 何が問題か

在庫は**公演横断で共有される物理的な在庫**なのに、計算が**公演回ごとに独立**している。

**具体例：パンフレット（初期在庫50部）**

| 公演回 | 販売数 | 現在の予想残 | 実数 | 差異 |
|--------|--------|-------------|------|------|
| 第1回 | 5部 | 45部 (50-5) | 46部 | +1 |
| 第2回 | 5部 | 45部 (50-5) ← **誤り** | ? | ? |

- 第2回の予想残が「45部」になっている（第1回の販売が考慮されていない）
- 正しくは **41部**（第1回の実数46 − 第2回の販売5）
- 全体の累積差異も追跡されていない

---

## 2. 設計方針

### 基本原則：「最後の確定実数から引き継ぐ」

在庫チェックを確定した時点の**実数**を次の基準点とする。

### 新しい計算式

```
直近の在庫チェック結果がある場合：
  基準在庫 = 直近の在庫チェックの actualRemaining
  基準以降の販売数 = 基準チェック以降に記録された全販売数
  予想残数 = 基準在庫 − 基準以降の販売数

直近の在庫チェック結果がない場合（初回）：
  基準在庫 = 初期在庫（product.stock / variant.stock）
  全販売数 = 全公演回の累計販売数
  予想残数 = 基準在庫 − 全販売数
```

### 具体例で確認

**パンフレット（初期在庫50部）**

| 公演回 | 販売数 | 予想残 | 実数 | 差異 |
|--------|--------|--------|------|------|
| 第1回 | 5部 | 45部 (50-5) | 46部 | +1 |
| 第2回 | 5部 | **41部** (46-5) | 41部 | 0 |
| 第3回 | 10部 | **31部** (41-10) | 29部 | -2 |
| 第4回 | 3部 | **26部** (29-3) | 26部 | 0 |

- 第2回：前回実数46から5部販売 → 41部が正しい
- 第3回：前回実数41から10部販売 → 31部が正しい（実数29、2部不足）
- 第4回：前回実数29から3部販売 → 26部

### 在庫チェック未実施の公演を挟んだ場合

| 公演回 | 販売数 | チェック実施 | 予想残 | 実数 |
|--------|--------|-------------|--------|------|
| 第1回 | 5部 | Yes | 45部 | 46部 |
| 第2回 | 5部 | **No** | - | - |
| 第3回 | 10部 | Yes | **31部** (46-5-10) | 30部 |

- 第3回：最後のチェック（第1回の実数46）から、その後の全販売（5+10=15）を引く
- チェックしなかった公演の販売も正しく反映される

---

## 3. UI表示の改善

### 在庫チェック画面に追加する情報

各商品の行に以下を表示：

```
パンフレット
  基準: 46個（第1回チェック） → 販売: 5個 → 予想残: 41個
  実数: [  41  ] 個    差異: 一致
```

- **基準**：どこから計算しているか明示（前回チェック or 初期在庫）
- **販売**：基準以降の販売数
- **予想残**：基準 − 販売
- **累積差異サマリー**：画面上部に全品目の差異合計を表示

### 在庫チェック履歴

精算履歴に在庫チェック結果の詳細を表示：
- いつ、どの公演回でチェックしたか
- 各商品の差異
- 累積差異の推移

---

## 4. データモデル変更

### 変更なし
- `MerchandiseProduct` / `MerchandiseVariant`：`stock` フィールドはそのまま（初期在庫として使う）
- `InventoryCheckItem` 型：既存フィールドで十分

### 追加フィールド（InventoryCheckItem）

```typescript
export interface InventoryCheckItem {
    productId: string;
    productName: string;
    variantId: string | null;
    variantName: string | null;
    expectedRemaining: number;   // 既存：予想残数
    actualRemaining: number;     // 既存：実数
    discrepancy: number;         // 既存：差異
    // ── 追加 ──
    baseStock: number;           // 基準在庫（前回実数 or 初期在庫）
    baseSource: 'INITIAL' | 'PREVIOUS_CHECK';  // 基準の出所
    soldSinceBase: number;       // 基準以降の販売数
}
```

### 新規関数

```typescript
// 全公演回の累計販売数を取得（performanceIdフィルタなし）
getMerchandiseSoldQuantitiesAllPerformancesClient(
    productionId: string,
    userId: string,
): Promise<SoldQuantityItem[]>

// 特定時刻以降の全販売数を取得
getMerchandiseSoldQuantitiesSinceClient(
    productionId: string,
    userId: string,
    since: Date,
): Promise<SoldQuantityItem[]>

// 最新の在庫チェック結果を取得
getLatestInventoryCheckClient(
    productionId: string,
    userId: string,
): Promise<{ checkItems: InventoryCheckItem[], checkedAt: Date } | null>
```

---

## 5. 実装計画

### Step 1：データ取得関数の追加
**ファイル**: `src/lib/client-firestore/merchandise-sales.ts`

- `getMerchandiseSoldQuantitiesAllPerformancesClient()` を追加
  - 既存の `getMerchandiseSoldQuantitiesClient()` と同じロジックだが `performanceId` フィルタなし
- `getMerchandiseSoldQuantitiesSinceClient()` を追加
  - `createdAt > since` の条件を追加

**ファイル**: `src/lib/client-firestore/cash-close.ts`

- `getLatestInventoryCheckClient()` を追加
  - `cashClosings` コレクションから `remarks` が「【在庫チェック】」で始まるもの
  - `inventoryCheck` が存在するもの
  - `createdAt` 降順で1件取得

### Step 2：CashCloseForm の計算ロジック変更
**ファイル**: `src/components/CashCloseForm.tsx`

- `loadData()` 内で：
  1. `getLatestInventoryCheckClient()` で直近チェックを取得
  2. 直近チェックがあれば → `getMerchandiseSoldQuantitiesSinceClient()` でそれ以降の販売を取得
  3. なければ → `getMerchandiseSoldQuantitiesAllPerformancesClient()` で全販売を取得
- `inventoryItems` memo の計算を変更：
  - `baseStock` = 前回actualRemaining or initialStock
  - `soldSinceBase` = 取得した販売数
  - `expectedRemaining` = baseStock − soldSinceBase

### Step 3：UI更新
**ファイル**: `src/components/CashCloseForm.tsx`

- 各商品行に「基準」「販売」情報を追加表示
- 画面上部に在庫サマリーカード追加（差異合計）

### Step 4：型定義更新
**ファイル**: `src/types/index.ts`

- `InventoryCheckItem` に `baseStock`, `baseSource`, `soldSinceBase` フィールド追加

---

## 6. Firestoreインデックス

新規クエリで必要になる可能性のあるインデックス：

1. `merchandiseSales`: `userId` + `productionId` + `createdAt`（全公演cumulative + since対応）
2. `cashClosings`: `productionId` + `userId` + `createdAt`（最新チェック取得用）

---

## 7. 考慮事項

### Q: 在庫チェックを間違えて確定した場合は？
A: 次のチェックで上書きされる。間違った値が基準になるが、次のチェックで正しい実数を入力すれば自己修正される。将来的に「チェック取消」機能を追加する余地あり。

### Q: 複数の端末で同時にチェックした場合は？
A: `createdAt` が最新のものが基準になるため、最後に保存した方が勝つ。実運用上は1人がチェックするため問題なし。

### Q: 公演の途中でチェックした場合は？
A: 問題なし。基準は最新のチェック時点なので、その後の販売が正しくカウントされる。

### Q: SIMPLE/INDEPENDENT モード間の違い
A: 在庫ロジックは共通。CashCloseForm は共有コンポーネントなので両モードで同じ動作。
