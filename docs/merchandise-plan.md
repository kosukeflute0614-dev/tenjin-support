# 物販管理機能（Merchandise Sales Management）実装計画書

最終更新: 2026-03-09（v2: レビュー反映 + 画面遷移設計 + オフライン対応 + 部分返品対応）

## 目次
1. [要件定義書](#1-要件定義書)
2. [Firestoreデータモデル](#2-firestoreデータモデル)
3. [型定義（TypeScript）](#3-型定義typescript)
4. [ページ・ルート設計](#4-ページルート設計)
5. [画面遷移・動線設計](#5-画面遷移動線設計)
6. [販売画面UI詳細設計](#6-販売画面ui詳細設計)
7. [コンポーネント設計](#7-コンポーネント設計)
8. [Client Firestore関数設計](#8-client-firestore関数設計)
9. [オフラインキュー設計](#9-オフラインキュー設計)
10. [Firestore Security Rules](#10-firestore-security-rules)
11. [スタッフ権限設計](#11-スタッフ権限設計)
12. [部分返品設計](#12-部分返品設計)
13. [エッジケース対応](#13-エッジケース対応)
14. [実装チーム構成](#14-実装チーム構成)
15. [実装フェーズ](#15-実装フェーズ)

---

## 1. 要件定義書

### 1.1 機能概要
公演ごとに物販（グッズ販売）機能を有効化し、商品登録・販売記録・レジ締め・売上レポートを一元管理する。かんたんモード（チケットと共有レジ）と独立モード（物販専用レジ）の2運用スタイルをサポートし、在庫管理はオプションで提供する。オフライン環境（地下劇場等）でも販売操作を継続できるオフラインキュー機能を備える。

### 1.2 設定項目（公演単位）

> **設計方針**: 元の4設定（ON/OFF, レジモード, ページモード, 在庫管理）を2設定に簡略化。
> 物販の有効/無効は商品が1つ以上登録されていれば自動的にONとして扱い、明示設定を不要にする。
> レジモードとページモードは実運用上セットで動くため、「運用スタイル」として1つに統合する。

| 設定名 | フィールド名 | 型 | デフォルト | 説明 |
|---|---|---|---|---|
| 運用スタイル | `merchandiseMode` | `'SIMPLE' \| 'INDEPENDENT'` | `'SIMPLE'` | SIMPLE（かんたんモード）: チケットと共有レジ＋チェックインページ内で操作 / INDEPENDENT（独立モード）: 物販専用レジ＋専用ページで操作 |
| 在庫管理 | `merchandiseInventoryEnabled` | `boolean` | `false` | 在庫数の追跡ON/OFF |

#### 運用スタイル詳細

| | かんたんモード (`SIMPLE`) | 独立モード (`INDEPENDENT`) |
|---|---|---|
| レジ | チケットと共有 | 物販専用レジ |
| UI配置 | チェックインページ内に統合 | 独立した物販ページ |
| レジ締め | 既存CashCloseFormに物販売上を合算 | 物販専用レジ締め |
| スタッフ | receptionスタッフが兼任 | merchandiseスタッフが専任 |
| 向いている運用 | 小規模公演、物販点数少 | 大規模公演、物販専任スタッフあり |

#### モード選択ガイドライン

**かんたんモードを選ぶべきケース:**
- 商品数が5点以下
- 物販専任スタッフを配置できない（受付スタッフが兼任）
- バリアント（サイズ・色）がほぼない
- 在庫管理が不要（パンフレット、ステッカー等の少額商品中心）

**独立モードを選ぶべきケース:**
- 商品数が6点以上、またはバリアント展開が多い
- 物販専任スタッフを1名以上配置できる
- アパレル商品があり在庫管理が必須
- 物販ブースがチケット受付と物理的に離れている

> **注意**: 公演期間中のモード切替は非推奨。迷ったらかんたんモードから始めることを推奨。

### 1.3 商品モデル（親子構造）

- **親商品（Product）**: 名前、基本価格、カテゴリ（任意）
- **バリアント（Variant）**: 親商品に紐づくサイズ・色等のバリエーション。個別価格と在庫数を持つ
- **バリアントなし**: 親商品のみで販売。在庫管理ON時は親商品に在庫数を持つ
- **バリアント選択**: 在庫管理ON時はバリアント選択必須。OFF時はスキップも可能（親商品として記録）
- **セット専用商品**: 独立した1商品として登録（構成商品の参照は持たない）

### 1.4 価格体系

| 種類 | 説明 | データ表現 |
|---|---|---|
| 単品価格 | 各商品/バリアントの通常価格 | `price` フィールド |
| セット価格 | A + B セットで割引価格 | `merchandiseSets` 配列（Production内） |
| まとめ割 | N個以上で単価割引 | `bulkDiscount` オブジェクト（Product内） |
| セット専用 | 単品販売不可、セットのみで販売 | `isSellableAlone: false` |

### 1.5 販売フロー

1. 顧客来店 → 商品選択 → バリアント選択（該当時） → 数量入力 → セット割自動適用 → 合計表示 → 販売確定
2. 確定時に `merchandiseSales` コレクションにドキュメント追加（オンライン時）またはオフラインキューに追加（オフライン時）
3. 在庫管理ON時は在庫数をデクリメント（Firestoreトランザクション / オフライン時はローカル在庫を楽観的更新）
4. 在庫管理ON時は `onSnapshot` でリアルタイム在庫数を表示（複数端末対応）
5. キャンセル時は在庫復元 + 売上取消（部分返品にも完全対応）

### 1.6 レジ締め

#### かんたんモード（`SIMPLE`）
- 既存の `CashCloseForm` をそのまま使用
- `expectedSalesOverride` に「チケット売上 + 物販売上」の合算を渡す
- レジ締め画面のラベルを「チケット売上合計」→「売上合計（チケット＋物販）」に変更
  - `CashCloseForm.tsx` L301 のラベル変更が必要（`expectedSalesOverride`使用時のみ条件分岐）
- 内訳表示セクション追加（チケット: ¥XX / 物販: ¥XX）
- 何回でも実行可能（段階的レジ締め対応）

#### 独立モード（`INDEPENDENT`）
- 物販専用のレジ締めUI（`merchandiseCashClosings` コレクション）
- チケットのレジ締めとは完全に独立したタイミングで実行
- 在庫管理ON時: レジ締め画面に在庫差異セクションを追加

### 1.7 レポート

- チケット売上レポートとは分離した物販専用レポート
- 公演回別売上集計
- 商品別売上（数量・金額）- 部分キャンセル分を差し引いた有効数量/有効売上で集計
- バリアント別内訳
- 全公演回合算
- 在庫管理ON時: 最終在庫照合（初期在庫 - 販売数 = 理論残数 vs 実残数）
- 現金のみ（電子決済は対象外）

---

## 2. Firestoreデータモデル

### 2.1 `productions` コレクション（フィールド追加）

```
productions/{productionId}
├── ... (既存フィールド)
├── merchandiseMode: string              // 'SIMPLE' | 'INDEPENDENT' (default: 'SIMPLE')
├── merchandiseInventoryEnabled: boolean // default: false
└── merchandiseSets: [                   // セット販売定義
        {
            id: string,
            name: string,                // 例: "Tシャツ＋ステッカーセット"
            items: [
                { productId: string, variantId?: string, quantity: number }
            ],
            setPrice: number,
            isActive: boolean
        }
    ]
```

### 2.2 `merchandiseProducts` コレクション（新規）

```
merchandiseProducts/{productId}
├── id: string
├── productionId: string
├── userId: string
├── name: string
├── category: string | null
├── price: number                        // 基本価格
├── isSellableAlone: boolean             // 単品販売可否
├── hasVariants: boolean
├── variants: [
│       {
│           id: string,
│           name: string,                // "S", "M", "L" etc.
│           price: number,
│           stock: number,               // inventoryEnabled時のみ使用
│           isActive: boolean
│       }
│   ]
├── stock: number                        // バリアントなし＋inventoryEnabled時
├── bulkDiscount: {
│       minQuantity: number,
│       discountedPrice: number
│   } | null
├── sortOrder: number
├── isActive: boolean
├── createdAt: Timestamp
└── updatedAt: Timestamp
```

### 2.3 `merchandiseSales` コレクション（新規）

```
merchandiseSales/{saleId}
├── id: string
├── localId: string | null               // オフライン販売時のクライアント側UUID（べき等性保証用）
├── productionId: string
├── performanceId: string                // 必須（常にいずれかの公演回に紐付け）
├── userId: string
├── items: [
│       {
│           productId: string,
│           productName: string,         // 非正規化
│           variantId: string | null,
│           variantName: string | null,
│           quantity: number,            // 元の購入数量（不変）
│           canceledQuantity: number,    // キャンセル済み数量（デフォルト: 0）
│           unitPrice: number,
│           subtotal: number             // unitPrice * quantity（不変）
│       }
│   ]
├── setDiscounts: [
│       { setId: string, setName: string, discountAmount: number }
│   ]
├── bulkDiscounts: [
│       { productId: string, productName: string, discountAmount: number }
│   ]
├── subtotal: number                     // 割引前合計（不変）
├── totalDiscount: number                // 割引合計（不変）
├── totalAmount: number                  // 元の支払額（不変）
├── refundedAmount: number               // 累計返金額（デフォルト: 0）
├── effectiveAmount: number              // 実質売上 = totalAmount - refundedAmount
├── status: string                       // 'COMPLETED' | 'PARTIALLY_CANCELED' | 'CANCELED'
├── cancellations: [                     // キャンセル履歴（追記型）
│       {
│           id: string,
│           canceledAt: Timestamp,
│           canceledBy: string,
│           canceledByType: string,      // 'ORGANIZER' | 'STAFF'
│           reason: string | null,
│           items: [
│               { productId: string, variantId: string | null, quantity: number }
│           ],
│           refundAmount: number,
│           refundBreakdown: {
│               itemRefund: number,
│               discountAdjustment: number
│           }
│       }
│   ]
├── canceledAt: Timestamp | null         // 全体キャンセル時のみ（後方互換）
├── cancelReason: string | null          // 全体キャンセル時のみ（後方互換）
├── soldBy: string
├── soldByType: string                   // 'ORGANIZER' | 'STAFF'
├── createdAt: Timestamp
└── updatedAt: Timestamp
```

### 2.4 `merchandiseInventoryLogs` コレクション（新規）

```
merchandiseInventoryLogs/{logId}
├── id: string
├── productionId: string
├── userId: string
├── productId: string
├── variantId: string | null
├── type: string                         // 'SALE' | 'CANCEL_RESTORE' | 'PARTIAL_CANCEL_RESTORE' | 'MANUAL_ADJUST'
├── quantityChange: number               // 正: 増加, 負: 減少
├── previousStock: number
├── newStock: number
├── saleId: string | null
├── cancellationId: string | null        // 部分キャンセル時のcancellations[].id
├── remarks: string | null
├── createdAt: Timestamp
```

### 2.5 `merchandiseCashClosings` コレクション（新規 / 独立モード用）

```
merchandiseCashClosings/{docId}
├── id: string
├── productionId: string
├── performanceId: string
├── userId: string
├── closedBy: string
├── closedByType: string
├── changeFloat: number
├── denominations: [{ denomination: number, count: number }]
├── cashTotal: number
├── expectedSales: number
├── actualSales: number
├── discrepancy: number
├── inventoryCheck: [                    // 在庫管理ON時のみ
│       {
│           productId: string,
│           productName: string,
│           variantId: string | null,
│           variantName: string | null,
│           expectedRemaining: number,
│           actualRemaining: number,
│           discrepancy: number
│       }
│   ] | null
├── remarks: string | null
├── createdAt: Timestamp
└── updatedAt: Timestamp
```

### 2.6 Firestoreインデックス

| コレクション | フィールド |
|---|---|
| `merchandiseProducts` | `productionId` ASC, `sortOrder` ASC |
| `merchandiseSales` | `performanceId` ASC, `productionId` ASC, `createdAt` DESC |
| `merchandiseSales` | `productionId` ASC, `status` ASC, `createdAt` DESC |
| `merchandiseSales` | `productionId` ASC, `localId` ASC |
| `merchandiseInventoryLogs` | `productionId` ASC, `productId` ASC, `createdAt` DESC |
| `merchandiseCashClosings` | `performanceId` ASC, `productionId` ASC, `createdAt` DESC |

---

## 3. 型定義（TypeScript）

`src/types/index.ts` に追加:

```typescript
// ── 物販関連型定義 ──

export interface MerchandiseVariant {
    id: string;
    name: string;
    price: number;
    stock: number;
    isActive: boolean;
}

export interface BulkDiscount {
    minQuantity: number;
    discountedPrice: number;
}

export interface MerchandiseProduct {
    id: string;
    productionId: string;
    userId: string;
    name: string;
    category: string | null;
    price: number;
    isSellableAlone: boolean;
    hasVariants: boolean;
    variants: MerchandiseVariant[];
    stock: number;
    bulkDiscount: BulkDiscount | null;
    sortOrder: number;
    isActive: boolean;
    createdAt?: FirestoreTimestamp;
    updatedAt?: FirestoreTimestamp;
}

export interface MerchandiseSetItem {
    productId: string;
    variantId?: string;
    quantity: number;
}

export interface MerchandiseSet {
    id: string;
    name: string;
    items: MerchandiseSetItem[];
    setPrice: number;
    isActive: boolean;
}

export interface MerchandiseSaleItem {
    productId: string;
    productName: string;
    variantId: string | null;
    variantName: string | null;
    quantity: number;              // 元の購入数量（不変）
    canceledQuantity: number;      // キャンセル済み数量（デフォルト: 0）
    unitPrice: number;
    subtotal: number;              // unitPrice * quantity（不変）
}

export interface MerchandiseSaleSetDiscount {
    setId: string;
    setName: string;
    discountAmount: number;
}

export interface MerchandiseSaleBulkDiscount {
    productId: string;
    productName: string;
    discountAmount: number;
}

export interface MerchandiseCancellationItem {
    productId: string;
    variantId: string | null;
    quantity: number;
}

export interface MerchandiseCancellationRefundBreakdown {
    itemRefund: number;
    discountAdjustment: number;
}

export interface MerchandiseCancellation {
    id: string;
    canceledAt: FirestoreTimestamp;
    canceledBy: string;
    canceledByType: 'ORGANIZER' | 'STAFF';
    reason: string | null;
    items: MerchandiseCancellationItem[];
    refundAmount: number;
    refundBreakdown: MerchandiseCancellationRefundBreakdown;
}

export interface MerchandiseSale {
    id: string;
    localId?: string | null;
    productionId: string;
    performanceId: string;
    userId: string;
    items: MerchandiseSaleItem[];
    setDiscounts: MerchandiseSaleSetDiscount[];
    bulkDiscounts: MerchandiseSaleBulkDiscount[];
    subtotal: number;
    totalDiscount: number;
    totalAmount: number;
    refundedAmount: number;
    effectiveAmount: number;
    status: 'COMPLETED' | 'PARTIALLY_CANCELED' | 'CANCELED';
    cancellations: MerchandiseCancellation[];
    canceledAt?: FirestoreTimestamp | null;
    cancelReason?: string | null;
    soldBy: string;
    soldByType: 'ORGANIZER' | 'STAFF';
    createdAt?: FirestoreTimestamp;
    updatedAt?: FirestoreTimestamp;
}

export interface InventoryCheckItem {
    productId: string;
    productName: string;
    variantId: string | null;
    variantName: string | null;
    expectedRemaining: number;
    actualRemaining: number;
    discrepancy: number;
}

export interface MerchandiseCashClosing {
    id: string;
    productionId: string;
    performanceId: string;
    userId: string;
    closedBy: string;
    closedByType: 'ORGANIZER' | 'STAFF';
    changeFloat: number;
    denominations: CashDenomination[];
    cashTotal: number;
    expectedSales: number;
    actualSales: number;
    discrepancy: number;
    inventoryCheck: InventoryCheckItem[] | null;
    remarks?: string | null;
    createdAt?: FirestoreTimestamp;
    updatedAt?: FirestoreTimestamp;
}

export interface MerchandiseInventoryLog {
    id: string;
    productionId: string;
    userId: string;
    productId: string;
    variantId: string | null;
    type: 'SALE' | 'CANCEL_RESTORE' | 'PARTIAL_CANCEL_RESTORE' | 'MANUAL_ADJUST';
    quantityChange: number;
    previousStock: number;
    newStock: number;
    saleId: string | null;
    cancellationId: string | null;
    remarks: string | null;
    createdAt?: FirestoreTimestamp;
}

export interface MerchandiseSalesReport {
    totalRevenue: number;              // effectiveAmount の合計
    totalRefunded: number;             // 累計返金額
    totalItems: number;                // quantity - canceledQuantity の合計
    totalCanceledItems: number;        // canceledQuantity の合計
    totalTransactions: number;
    canceledTransactions: number;
    partiallyCanceledTransactions: number;
    productBreakdown: {
        [productId: string]: {
            name: string;
            category: string | null;
            totalQuantity: number;
            canceledQuantity: number;
            totalRevenue: number;
            variants: {
                [variantId: string]: {
                    name: string;
                    quantity: number;
                    canceledQuantity: number;
                    revenue: number;
                };
            };
        };
    };
    performanceSummaries: {
        performanceId: string;
        startTime: string;             // ISO 8601（Performanceから取得）
        transactionCount: number;
        revenue: number;
    }[];
    inventoryReconciliation?: {
        productId: string;
        productName: string;
        variantId: string | null;
        variantName: string | null;
        initialStock: number;
        sold: number;
        expectedRemaining: number;
        actualRemaining: number | null;
    }[];
}
```

**Production interface への追加**:

```typescript
export interface Production {
    // ... 既存フィールド全て ...
    merchandiseMode?: 'SIMPLE' | 'INDEPENDENT';
    merchandiseInventoryEnabled?: boolean;
    merchandiseSets?: MerchandiseSet[];
}
```

---

## 4. ページ・ルート設計

### 4.1 新規ルート

| ルート | 用途 | アクセス権 |
|---|---|---|
| `/productions/[id]/merchandise` | 商品管理 + 物販設定 | 主催者 |
| `/productions/[id]/merchandise/sales` | 物販販売: 公演回選択画面（独立モード） | 主催者 |
| `/productions/[id]/merchandise/sales/[performanceId]` | 物販販売画面（独立モード） | 主催者 |
| `/productions/[id]/merchandise/report` | 物販レポート | 主催者 |
| `/staff/[id]/merchandise` | スタッフ用物販: 公演回選択→販売画面（独立モード時） | merchandiseスタッフ |

### 4.2 既存ルートへの変更

| ルート | 変更内容 |
|---|---|
| チェックイン `/productions/[id]/checkin/[performanceId]` | タブ→ボトムナビに変更。かんたんモード時に「物販」タブ追加 |
| ダッシュボード `/dashboard` | merchandise有効時に物販セクション追加 |
| スタッフ管理 `/productions/[id]/staff` | ロール選択に `merchandise` 追加 |
| スタッフTOP `/staff/[id]` | merchandiseロール判定の分岐追加 |
| レジ締めレポート `/productions/[id]/cashclose-report` | 独立モード時に物販レジ締め履歴追加 |

### 4.3 チェックインページのボトムナビゲーション

現在のタブUI（`'LIST' | 'SAME_DAY' | 'CASH_CLOSE'`）をページ下部のボトムナビゲーションに変更する。

```
┌────────────────────────────┐
│ チェックインページ本体      │
│                            │
├────┬────┬────┬────┤
│ 📋  │ 🎫  │ 🛍️  │ 💰  │
│一覧 │当日券│物販  │精算  │
└────┴────┴────┴────┘
```

| 位置 | アイコン(lucide) | ラベル | 表示条件 |
|---|---|---|---|
| 1 | ClipboardList | 一覧 | 常時 |
| 2 | Ticket | 当日券 | 常時 |
| 3 | ShoppingBag | 物販 | `merchandiseMode === 'SIMPLE'` かつ商品1件以上 |
| 4 | Calculator | 精算 | 常時 |

- 型定義: `activeTab: 'LIST' | 'SAME_DAY' | 'MERCHANDISE' | 'CASH_CLOSE'`
- `position: fixed; bottom: 0` + `padding-bottom: env(safe-area-inset-bottom)` でiPhone対応
- タップ領域は最低44x44px（Apple HIG準拠）
- バッジ: 一覧=未チェックイン数、物販=在庫警告（5個以下のアイテムあり時に `!` マーク）
- 共通コンポーネント `BottomNav.tsx` として `staff/[id]/page.tsx` と `checkin/[performanceId]/page.tsx` で共用
- メインコンテンツに `padding-bottom: calc(64px + env(safe-area-inset-bottom) + 1rem)` を設定

### 4.4 物販管理ページのタブ構成

`/productions/[id]/merchandise`（独立ページ。公演設定のタブには入れない）:
- **物販設定タブ**: 運用スタイル選択（かんたん/独立）、在庫管理ON/OFF
- **商品管理タブ**: 商品CRUD（親子構造、バリアント、まとめ割）
- **セット販売タブ**: セット商品の定義

### 4.5 ダッシュボード連携

merchandise有効時（商品1つ以上登録あり）の表示:

```
「公演の基本設定」セクション:
  + 物販管理（商品登録・在庫管理）

「当日の運営」セクション:
  独立モード時: + 物販販売ページ

「集計・分析」セクション:
  + 物販レポート
```

SetupChecklistに「物販商品を登録しましょう（任意）」項目を追加（リンク先: `/productions/[id]/merchandise`）。

---

## 5. 画面遷移・動線設計

### 5.1 主催者: 初回セットアップフロー

```
[ダッシュボード /dashboard]
  → (「物販管理」カード or SetupChecklist「物販商品を登録」)
  → [物販管理 /productions/[id]/merchandise]
    → (物販設定タブ: 運用スタイル選択 + 在庫管理ON/OFF → 保存)
    → (商品管理タブに切り替え)
    → (「商品を追加」→ MerchandiseProductForm)
      → (商品名・価格入力 → バリアント追加 → 在庫数入力 → まとめ割設定 → 保存)
    → (商品を追加 × N回)
    → (セット販売タブに切り替え ※使う場合のみ)
    → (「セットを追加」→ セット名・構成商品・セット価格入力 → 保存)
```

### 5.2 主催者: 日常運用（かんたんモード）

```
[ダッシュボード]
  → (「当日受付」カード)
  → [当日受付 /reception → 公演回選択]
  → [チェックイン /productions/[id]/checkin/[performanceId]]
    → (ボトムナビ「物販」タップ → activeTab='MERCHANDISE')
    → [物販タブ]
      → (商品タップ → バリアント選択 → カートに追加)
      → (数量変更 → 割引自動適用 → 合計確認)
      → (「販売確定」タップ → 記録 → カートクリア → 次の顧客)
      → (販売履歴で「キャンセル」→ 全キャンセル or 部分返品)
    → (ボトムナビ「一覧」に戻ってチェックイン業務続行)
```

### 5.3 主催者: 日常運用（独立モード）

```
[ダッシュボード]
  → (「物販販売」カード)
  → [公演回選択 /productions/[id]/merchandise/sales]
  → [物販販売 /productions/[id]/merchandise/sales/[performanceId]]
    → (フルスクリーンの販売画面)
    → (商品タップ → バリアント選択 → カート → 販売確定)
    → (在庫管理ON時: 在庫0の商品は「売切」表示でブロック)
    → (販売履歴・キャンセル)
    → (在庫手動調整 → MerchandiseInventoryAdjust)
```

### 5.4 スタッフ: かんたんモード（receptionスタッフ）

```
[パスコード認証 → 公演回選択]
  → [チェックイン画面（ボトムナビ付き）]
    → (ボトムナビ「物販」タップ)
    → [物販タブ: MerchandiseSalesFormが全幅表示]
      → (商品選択 → カート → 販売確定 → 次の顧客)
    → (ボトムナビ「精算」タップ)
    → [精算タブ: CashCloseForm]
      → ラベル: 「売上合計（チケット＋物販）」
      → 内訳表示: チケット ¥XX / 物販 ¥XX
```

### 5.5 スタッフ: 独立モード（merchandiseスタッフ）

```
[パスコード認証 /staff/[id]/merchandise]
  → [公演回選択]
  → [物販専用メインUI]
    上部タブ: [販売] [履歴] [レジ締め]
    → (販売タブ: MerchandiseSalesForm)
    → (履歴タブ: MerchandiseSalesHistory 全件表示 + キャンセル機能)
    → (レジ締めタブ: MerchandiseCashCloseForm + 在庫チェック)
```

### 5.6 レジ締めフロー

#### かんたんモード

```
[チェックイン → ボトムナビ「精算」]
  → CashCloseForm
    expectedSalesOverride = チケット売上 + 物販売上(effectiveAmount合計)
    salesBreakdown = [
      { label: 'チケット売上', amount: チケット売上 },
      { label: '物販売上', amount: 物販売上 }
    ]
  → 釣銭準備金入力 → 金種別枚数カウント → 差異確認 → 確定
```

#### 独立モード

```
[物販専用ページ → レジ締めタブ]
  → MerchandiseCashCloseForm
    → 釣銭準備金入力
    → 金種別枚数カウント
    → 物販売上との差異確認
    → 在庫管理ON時: 在庫チェックセクション
      (各商品/バリアントの「実残数」入力 → 理論残数との差異自動表示)
    → 備考入力 → 確定
```

### 5.7 レポート確認フロー

```
[ダッシュボード]
  → (「物販レポート」カード)
  → [物販レポート /productions/[id]/merchandise/report]
    ├── 全公演回合算サマリー（総売上, 総販売数, 取引数, 返金額）
    ├── 公演回別売上集計テーブル
    ├── 商品別売上ランキング（数量・金額）→ 展開でバリアント別内訳
    ├── 在庫管理ON時: 在庫照合セクション
    └── CSV/印刷エクスポート
```

---

## 6. 販売画面UI詳細設計

### 6.1 全体レイアウト

#### デスクトップ (769px+): 2カラム

```
┌──────────────────────────┬────────────────────┐
│ カテゴリフィルタ(横並び)   │                    │
├──────────────────────────┤  カート (sticky)    │
│                          │  w: 340px           │
│  商品グリッド             │  (1280px+: 380px)  │
│  2列 (1280px+: 3列)      │                    │
│                          ├────────────────────┤
│                          │  販売履歴(折りたたみ) │
└──────────────────────────┴────────────────────┘
```

```css
.merch-sales-layout {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 1.5rem;
  align-items: start;
}
@media (min-width: 1280px) {
  .merch-sales-layout { grid-template-columns: 1fr 380px; }
}
@media (max-width: 768px) {
  .merch-sales-layout {
    grid-template-columns: 1fr;
    padding-bottom: 5rem;
  }
}
```

#### スマホ (768px以下): 1カラム + フローティングカートバー

```
┌────────────────────────────┐
│ カテゴリフィルタ(横スクロール) │
├────────────────────────────┤
│  商品グリッド 2列           │
│  (スクロール領域)           │
├────────────────────────────┤ ← フローティングカートバー（カートにアイテムがある時のみ）
│ ¥3,300 (3点) [カートを見る] │
├────────────────────────────┤ ← ボトムナビ（かんたんモード時）
│ 📋一覧 | 🎫当日券 | 🛍物販 | 💰精算 │
└────────────────────────────┘
```

「カートを見る」タップ → カート詳細がボトムシート（`position: fixed; bottom: 0` のスライドアップパネル）で展開。数量変更・割引確認・販売確定はここで行う。

### 6.2 商品グリッド

```css
.merch-product-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}
@media (min-width: 1280px) {
  .merch-product-grid { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 480px) {
  .merch-product-grid { gap: 0.5rem; }
}
```

#### 商品カード

```
┌─────────────────────┐
│ 商品名          残3  │  ← 名前(左) + 在庫バッジ(右上)
│ ¥1,500              │  ← 価格（var(--primary)色、太字）
│ S / M / L           │  ← バリアント要約（ある場合のみ、灰色小文字）
│ 3個以上で ¥1,200     │  ← まとめ割（ある場合のみ、緑小文字）
└─────────────────────┘
```

- カード: `min-height: 5.5rem`（スマホ: 4.5rem）、`padding: 1rem`（スマホ: 0.75rem）
- 商品名: `font-weight: 600; font-size: 0.95rem`、2行超過時は `-webkit-line-clamp: 2` で省略
- 価格: `font-size: 1rem; font-weight: 700; color: var(--primary)`
- バリアント要約: `font-size: 0.75rem; color: var(--text-muted)`、5個以上は「S / M / L 他2種」と省略
- タップ時: `transform: scale(0.97)` のフィードバック
- タップ動作: バリアントなし → 即カート追加 / バリアントあり → バリアント選択シート表示

#### 在庫バッジ（在庫管理ON時のみ）

- 通常: `background: var(--secondary); color: var(--text-muted)`
- 残少(5個以下): `background: #fff3cd; color: #856404; border-color: #ffc107`
- 在庫0: `background: #f8d7da; color: #721c24; border-color: #f5c6cb`
- リアルタイム更新時: `animation: stockPulse 0.6s` のパルスアニメーション

#### 売り切れ商品

- `opacity: 0.5; pointer-events: none`
- 「売切」テキストを中央に重畳表示（`rotate(-15deg)`, `color: var(--accent)`, `font-weight: 900`）

#### セット専用商品 (`isSellableAlone: false`)

- `opacity: 0.7` でやや薄く
- 左下に「セット専用」小ラベル（`font-size: 0.65rem; background: var(--secondary)`）
- タップすると `showToast('この商品はセット販売のみです', 'info')`

### 6.3 カテゴリフィルタ

- 商品グリッドの直上に横並びピルボタン
- スマホでは横スクロール（`overflow-x: auto; scrollbar-width: none`）
- 先頭に「すべて」チップ（`selectedCategory === null` で活性化）
- 各チップ: `padding: 0.4rem 0.9rem; border-radius: 9999px; min-height: 44px`
- アクティブ: `background: var(--primary); color: #fff`

### 6.4 バリアント選択

**表示方式: ボトムシート**（スマホ片手操作に最適化。デスクトップではセンターモーダルとしてレンダリング）

```
┌──────────────────────────┐
│  ── (ドラッグハンドル)     │
│  商品名          ¥1,500  │
│                          │
│  ┌─────┐ ┌─────┐ ┌─────┐│  ← バリアントボタン
│  │  S  │ │  M  │ │  L  ││
│  │¥1500│ │¥1500│ │¥1800││
│  │残12 │ │残 3 │ │売切 ││
│  └─────┘ └─────┘ └─────┘│
│                          │
│  [ - ]  1  [ + ]         │  ← NumberStepper（既存コンポーネント再利用）
│                          │
│  [   カートに追加   ]     │  ← btn-primary
│                          │
│  (在庫OFF時のみ:)        │
│  [ バリアントを指定しない ]│
└──────────────────────────┘
```

- ボトムシート: `border-radius: 16px 16px 0 0; max-height: 70vh; animation: slideUp 0.25s`
- デスクトップ: `max-width: 400px` のセンターモーダルに変換
- バリアント2-3個: 横1列 / 4個以上: 2列グリッド / 7個以上: 3列グリッド
- 各ボタン: `min-height: 4rem; border: 2px solid var(--card-border)`
- 選択中: `border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary)`
- 在庫0: `opacity: 0.4; pointer-events: none; text-decoration: line-through`
- 「バリアントを指定しない」: 在庫管理OFF時のみ表示。`border: 1px dashed; width: 100%`

### 6.5 カート

#### デスクトップ: 右サイドカラム (sticky)

```
┌──────────────────────────┐
│  カート (2点)             │
├──────────────────────────┤
│  Tシャツ (M)        ¥1,500│
│  [-] 2 [+]    小計 ¥3,000│  ← NumberStepper（幅140px固定）
│──────────────────────────│
│  ステッカー         ¥500 │
│  [-] 1 [+]      小計 ¥500│
├──────────────────────────┤
│  🏷 セット割適用   -¥200  │  ← 緑色の割引行
├──────────────────────────┤
│  小計           ¥3,500   │
│  割引            -¥200   │
│  ─────────────────────── │
│  合計           ¥3,300   │  ← font-size: 1.5rem; color: var(--primary)
│                          │
│  [ 販売確定 - ¥3,300 ]   │  ← btn-primary フルワイド、金額表示含む
│                          │
│  ▼ 直近の販売 (12件)     │  ← 折りたたみセクション
└──────────────────────────┘
```

- `position: sticky; top: 5rem; max-height: calc(100vh - 6rem)`
- NumberStepperで0にしたアイテムはカートから自動削除（確認なし）
- 各アイテム右端にゴミ箱アイコン（lucide `Trash2`, size=16）で即削除
- 割引なしの場合は小計・割引行を省略し合計のみ表示
- カート空時: ShoppingCartアイコン + 「商品をタップしてカートに追加」テキスト

#### スマホ: フローティングバー + ボトムシート

**フローティングバー**（カート内にアイテムがある時のみ表示）:
```
┌────────────────────────────────────┐
│  ¥3,300 (3点)    [ カートを見る ]  │
└────────────────────────────────────┘
```
- `position: fixed; bottom: 0` （ボトムナビがある場合はその直上に配置）
- 左: 合計金額（`font-size: 1.25rem; font-weight: 700; color: var(--primary)`）+ 点数
- 右: 「カートを見る」ボタン（`btn-primary`）
- タップ → カート詳細ボトムシート展開（`max-height: 85vh; animation: slideUp 0.25s`）

### 6.6 販売確定時のフィードバック

- **確認ステップなし**（POSレジのスピード感を重視。誤操作はキャンセルで対応）
- **成功フラッシュ**: 画面全体に0.8秒間の緑オーバーレイ（`pointer-events: none` で操作ブロックなし）
  - 中央にチェックマークアイコン（80px白丸 + lucide `Check`）
  - アニメーション中も次の操作が可能
- **トースト**: `showToast('販売を記録しました', 'success')`（オフライン時は `'販売を記録しました（オフライン）'`）
- カート即クリア → 商品一覧がそのまま表示

### 6.7 販売履歴・キャンセルUI

**デスクトップ**: カートサイドバー下に折りたたみセクション。**スマホ**: カートボトムシート内の下部。

直近10件を時系列降順で表示:
```
┌──────────────────────────────────┐
│  #12  14:32              ¥3,300 │
│  Tシャツ(M)x2, ステッカーx1     │
│                    [ キャンセル ] │
└──────────────────────────────────┘
```

キャンセル済みアイテム: `opacity: 0.5; text-decoration: line-through`
部分キャンセル済み: 通常表示 + 「一部返品済」バッジ

キャンセルボタンタップ → キャンセルダイアログ（Section 12.5 参照）

### 6.8 在庫警告の表示

- 残少(5個以下): バッジが黄色に変化
- 在庫0: カードが半透明 + 「売切」テキスト重畳
- リアルタイム更新: `onSnapshot` で在庫変化時にバッジに `animation: stockPulse 0.6s` パルス
- 全バリアント在庫0 → 商品カード自体を売り切れ表示

### 6.9 オフライン時のUI

- **オフラインバナー**: `position: fixed; top: 0; background: #d32f2f; color: #fff; z-index: 9999`
  - テキスト: "オフラインです - 販売データは復帰後に同期されます"
  - オンライン復帰時: 緑に変わり "オンラインに復帰しました" → 2秒後に消える
- **同期待ちバッジ**: オフライン販売の履歴行に「同期待ち」バッジ（黄色ピル）
- **接続状態インジケータ**: ヘッダー右上に常時表示（●緑=接続中 / ●黄=同期中 / ●赤=オフライン）

### 6.10 z-index設計

| 要素 | z-index |
|---|---|
| オフラインバナー | 9999 |
| 成功フラッシュ | 3000 |
| バリアント選択/カートボトムシート | 2001 |
| ボトムシートオーバーレイ | 2000 |
| フローティングカートバー | 1500 |
| ボトムナビ | 200 |

---

## 7. コンポーネント設計

### 7.1 新規コンポーネント

| コンポーネント名 | 説明 |
|---|---|
| `MerchandiseSettingsForm` | 物販設定フォーム（運用スタイル選択、在庫管理ON/OFF） |
| `MerchandiseProductManager` | 商品CRUD（TicketTypeManagerパターン踏襲） |
| `MerchandiseProductForm` | 商品追加/編集フォーム（バリアント・在庫・まとめ割） |
| `MerchandiseSetManager` | セット販売定義の管理UI |
| `MerchandiseSettingsTabs` | 物販管理ページのタブコンテナ |
| `MerchandiseSalesForm` | 販売画面メインフォーム（商品グリッド + カテゴリフィルタ） |
| `MerchandiseProductCard` | 商品グリッド内の個別カード |
| `MerchandiseVariantSheet` | バリアント選択ボトムシート |
| `MerchandiseCart` | カート表示（デスクトップ: サイドバー / スマホ: バー+シート） |
| `MerchandiseSalesHistory` | 販売履歴 + キャンセル（全キャンセル・部分返品対応） |
| `MerchandiseCancelDialog` | キャンセル確認ダイアログ（部分返品のアイテム選択UI含む） |
| `MerchandiseCashCloseForm` | 物販専用レジ締め（独立モード用、在庫差異チェック付き） |
| `MerchandiseReportView` | 物販レポート表示 |
| `MerchandiseInventoryAdjust` | 在庫手動調整フォーム |
| `MerchandiseCategoryFilter` | カテゴリフィルタ（横スクロールピルボタン） |
| `BottomNav` | ボトムナビゲーション（チェックイン/スタッフ共用） |
| `OfflineStatusIndicator` | 接続状態インジケータ |
| `SyncQueueDrawer` | 同期状況確認・コンフリクト解決UI |

### 7.2 既存コンポーネントへの変更

| コンポーネント | 変更内容 |
|---|---|
| `SetupChecklist.tsx` | 物販有効時にチェック項目追加（「商品を1つ以上登録」） |
| `CashCloseForm.tsx` | ラベル条件分岐 + `salesBreakdown` prop追加（下記詳細） |

#### CashCloseFormの変更点（かんたんモード対応）

- ロジック自体は変更不要（呼び出し元で `expectedSalesOverride` を計算して渡す）
- **ラベル変更**: L301付近の「チケット売上合計」→ `expectedSalesOverride` 使用時は「売上合計（チケット＋物販）」に条件分岐
- **内訳表示**: `expectedSalesOverride` 使用時に内訳セクションを追加
- 新規prop: `salesBreakdown?: { label: string; amount: number }[]`

### 7.3 販売フォームの状態管理

```
MerchandiseSalesForm state:
  - products: MerchandiseProduct[]         // onSnapshot でリアルタイム同期
  - cart: Map<string, CartItem>            // key: productId_variantId
  - appliedSets: MerchandiseSet[]
  - selectedCategory: string | null
  - isProcessing: boolean
  - isOffline: boolean                     // useNetworkStatus から取得

CartItem:
  - productId, variantId, productName, variantName
  - quantity, unitPrice, subtotal
```

### 7.4 割引計算ロジック

1. カート内アイテムに対して適用可能なセット割を自動検出
2. まとめ割の条件を満たす商品に対して自動適用
3. セット割とまとめ割は重複適用しない（セット割を優先）。セット適用されたアイテムの数量はまとめ割の計算から除外する
4. 割引後合計額をリアルタイム表示
5. セット構成商品が在庫不足の場合はセット割適用不可

---

## 8. Client Firestore関数設計

### 8.1 `src/lib/client-firestore/merchandise.ts`（新規）

- `getMerchandiseProductsClient(productionId, userId)` → 商品一覧取得
- `addMerchandiseProductClient(data)` → 商品追加
- `updateMerchandiseProductClient(productId, data, userId)` → 商品更新
- `deleteMerchandiseProductClient(productId, userId)` → 商品論理削除
- `reorderMerchandiseProductsClient(productionId, orderedIds, userId)` → 表示順更新
- `adjustMerchandiseStockClient(productId, variantId, adjustment, remarks, productionId, userId)` → 在庫手動調整

### 8.2 `src/lib/client-firestore/merchandise-sales.ts`（新規）

- `createMerchandiseSaleClient(sale, inventoryEnabled)` → 販売確定（オンライン時: トランザクション / オフライン時: キューに追加）
- `cancelMerchandiseSaleClient(saleId, cancelReason, inventoryEnabled)` → 全キャンセル
- `partialCancelMerchandiseSaleClient(saleId, cancelItems, cancelReason, inventoryEnabled)` → 部分キャンセル（Section 12 参照）
- `getMerchandiseSalesClient(performanceId, productionId, userId, limit?)` → 販売履歴取得
- `getMerchandiseTotalSalesClient(performanceId, productionId, userId)` → 売上合計（effectiveAmount合計）

### 8.3 `src/lib/client-firestore/merchandise-cash-close.ts`（新規）

- `saveMerchandiseCashClosingClient(data)` → 物販レジ締め保存
- `getMerchandiseCashClosingsClient(performanceId, productionId, userId)` → レジ締め履歴

### 8.4 `src/lib/client-firestore/merchandise-report.ts`（新規）

- `fetchMerchandiseSalesReportClient(productionId, userId)` → 物販レポート生成

### 8.5 既存ファイルへの変更

チェックインページ（呼び出し元）でかんたんモード時の`expectedSales`計算:
```
ticketSales = getPerformancePaidTotalClient(performanceId, userId)
merchandiseSales = getMerchandiseTotalSalesClient(performanceId, productionId, userId)
totalExpected = ticketSales + merchandiseSales
→ CashCloseForm expectedSalesOverride={totalExpected}
→ CashCloseForm salesBreakdown={[
    { label: 'チケット売上', amount: ticketSales },
    { label: '物販売上', amount: merchandiseSales }
  ]}
```

---

## 9. オフラインキュー設計

### 9.1 設計方針

小劇場の地下会場（電波不安定）でも物販販売を継続できることを最優先とする。Firestore SDKのビルトインオフラインキャッシュは `runTransaction` をオフラインで実行できないため、**アプリ独自のオフラインキュー層（IndexedDB）** を設け、オンライン復帰時にトランザクションとして確定する二段階方式を採用する。

### 9.2 ストレージ戦略

| 用途 | 技術 | 理由 |
|---|---|---|
| オフライン販売キュー | IndexedDB | 構造化データの永続保存、容量制限が緩い、クラッシュ後もデータ残存 |
| ローカル在庫スナップショット | IndexedDB | 商品マスタ＋在庫数のキャッシュ。オフライン中の楽観的在庫管理 |
| 同期ステータス | IndexedDB | 各エントリの状態追跡 |
| オフライン状態フラグ | React state | `navigator.onLine` + Firestore接続状態。UI表示用 |

Firestoreオフラインキャッシュ（`enableIndexedDbPersistence`）は**読み取りキャッシュ**としてのみ有効化する。

### 9.3 IndexedDBスキーマ

DB名: `tenjin-support-offline` (version: 1)

```
ObjectStore: offlineSaleQueue
  keyPath: localId (UUID v4)
  indexes: productionId, performanceId, status, createdAt

ObjectStore: localInventory
  keyPath: compositeKey ("{productId}_{variantId}")
  indexes: productionId

ObjectStore: syncMeta
  keyPath: key (最終同期時刻等)
```

### 9.4 キューデータ構造

```typescript
type OfflineSaleStatus = 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED' | 'CONFLICT';

interface OfflineSaleEntry {
    localId: string;                    // UUID v4
    productionId: string;
    performanceId: string;
    userId: string;
    items: MerchandiseSaleItem[];
    setDiscounts: MerchandiseSaleSetDiscount[];
    bulkDiscounts: MerchandiseSaleBulkDiscount[];
    subtotal: number;
    totalDiscount: number;
    totalAmount: number;
    soldBy: string;
    soldByType: 'ORGANIZER' | 'STAFF';
    inventoryChanges: { productId: string; variantId: string | null; quantityChange: number }[];
    status: OfflineSaleStatus;
    createdAt: string;                  // ISO 8601
    syncAttempts: number;
    lastSyncAttempt: string | null;
    syncError: string | null;
    firestoreSaleId: string | null;
}

interface LocalInventoryEntry {
    compositeKey: string;
    productionId: string;
    productId: string;
    variantId: string | null;
    stock: number;                      // ローカル在庫数（楽観的更新済み）
    lastSyncedStock: number;
    pendingDecrement: number;           // 未同期の減算量
}
```

### 9.5 同期メカニズム

**オンライン復帰検出**: 3チャネル
1. `window.addEventListener('online', ...)` - ブラウザのネットワーク変化
2. `onSnapshotsInSync(db, ...)` - Firestoreの実際の同期完了（最も信頼性が高い）
3. 30秒間隔ポーリング（フォールバック。画面アクティブ時のみ）

**同期フロー**:
```
[オンライン復帰検出]
  → キューから PENDING エントリを createdAt ASC で取得
  → 各エントリを順次処理（並列不可 -- 在庫整合性のため）
    → status を SYNCING に更新
    → Firestore runTransaction 実行
      → localId で既存ドキュメント検索（べき等性チェック）
      → 在庫管理ON: 現在の在庫数確認
      → addDoc + 在庫デクリメント + inventoryLog
    → 成功 → SYNCED + firestoreSaleId 記録
    → 在庫不足 → CONFLICT（ユーザーに通知）
    → その他エラー → FAILED + syncAttempts++ (3回で一時停止)
```

**排他制御**: `navigator.locks.request('tenjin-sync-lock', ...)` で同一ブラウザの複数タブから同時同期を防止。

### 9.6 在庫の楽観的更新

**オフライン時の販売確定**:
1. ローカル在庫チェック（`LocalInventoryEntry.stock >= 販売数量`）
2. OK → IndexedDBの在庫数を減算 + `pendingDecrement` 加算 + キューに `PENDING` エントリ追加
3. NG → 「在庫不足（ローカル残数: X個）」で販売ブロック
4. UI即時反映（React stateのローカル在庫を更新）

**オンライン復帰時**: `onSnapshot` で最新在庫を受信 → `stock = サーバー在庫 - 未同期pendingDecrement` で再計算

### 9.7 コンフリクト解決

複数端末が同時にオフラインで同一商品を売り、合計が在庫を超える場合:
- 先着のトランザクションが成功、後着が `CONFLICT`
- ユーザーに3つの選択肢を提示:
  1. **在庫超過を許可して確定**（商品は既に渡してしまったケース）
  2. **数量を減らして確定**（利用可能な在庫数に修正）
  3. **販売を取り消す**（返金対応が必要）
- 在庫バッファ警告: ローカル在庫が2個以下で「在庫わずか（オフラインのため実数と異なる可能性）」表示
- キュー5件以上で「ネットワーク接続を確認してください」通知

### 9.8 端末クラッシュ時の復旧

- IndexedDBはクラッシュ後もデータ保持
- 起動時に `offlineSaleQueue` をチェック:
  - `PENDING` → オンラインなら即同期
  - `SYNCING` → `PENDING` にリセットして再処理（commit前のクラッシュならサーバー未反映のため安全）
  - `SYNCING` + commit済みだった場合 → `localId` で既存ドキュメント検索して重複防止

### 9.9 同期状況管理画面

販売画面に「同期状況」ボタン → ドロワー/モーダルで:
- 未同期件数
- 各エントリの状態表示
- CONFLICTの解決UI
- FAILEDの手動再試行
- SYNCEDの一括クリア

### 9.10 新規ファイル

| ファイルパス | 責務 |
|---|---|
| `src/lib/offline/db.ts` | IndexedDB初期化・スキーマ（`idb`ライブラリ使用） |
| `src/lib/offline/sale-queue.ts` | キューCRUD |
| `src/lib/offline/local-inventory.ts` | ローカル在庫管理 |
| `src/lib/offline/sync-engine.ts` | 同期エンジン（べき等性、排他ロック、リトライ） |
| `src/lib/offline/conflict-resolver.ts` | コンフリクト解決ロジック |
| `src/lib/offline/types.ts` | オフライン関連型定義 |
| `src/hooks/useOfflineSync.ts` | React Hook: 同期エンジンライフサイクル管理 |
| `src/hooks/useNetworkStatus.ts` | React Hook: 接続状態統合管理 |

**追加パッケージ**: `idb` (^8.0.0) - IndexedDBのPromiseベースラッパー

---

## 10. Firestore Security Rules

```
// ── ヘルパー関数（既存ルールに追加） ──

// isAuthorizedMerchandiseStaff: 物販操作が許可されたスタッフかを判定
// - merchandiseロールのスタッフ → 常に許可
// - receptionロールのスタッフ → 該当公演のmerchandiseModeがSIMPLEの場合のみ許可
// 実装: staffSessions から role を取得し、必要に応じて productions/{id} の merchandiseMode を get() で参照
// 注意: Firestore get() 呼び出しは1リクエストあたり10回上限。既存の isAuthorizedStaff と合わせて上限に注意

// 物販商品
match /merchandiseProducts/{productId} {
    allow read: if isSignedIn() && (
        resource.data.userId == request.auth.uid ||
        isAuthorizedStaff(resource.data.productionId)
    );
    allow create: if isGoogleUser() && request.resource.data.userId == request.auth.uid;
    allow update, delete: if isOwner(resource.data.userId);
}

// 物販売上
match /merchandiseSales/{saleId} {
    allow read, list: if isSignedIn() && (
        resource.data.userId == request.auth.uid ||
        isAuthorizedStaff(resource.data.productionId)
    );
    allow create: if isSignedIn() && (
        request.resource.data.userId == request.auth.uid ||
        isAuthorizedMerchandiseStaff(request.resource.data.productionId)
    );
    // update: キャンセル/部分キャンセルのみ許可 + フィールド制限
    allow update: if isSignedIn() && (
        resource.data.userId == request.auth.uid ||
        isAuthorizedMerchandiseStaff(resource.data.productionId)
    ) && request.resource.data.status in ['CANCELED', 'PARTIALLY_CANCELED']
      && request.resource.data.diff(resource.data).affectedKeys().hasOnly(
        ['status', 'items', 'refundedAmount', 'effectiveAmount', 'cancellations', 'canceledAt', 'cancelReason', 'updatedAt']
      );
    allow delete: if false;
}

// 在庫ログ（追記のみ、変更不可）
match /merchandiseInventoryLogs/{logId} {
    allow read, list: if isSignedIn() && (
        resource.data.userId == request.auth.uid ||
        isAuthorizedStaff(resource.data.productionId)
    );
    allow create: if isSignedIn() && (
        request.resource.data.userId == request.auth.uid ||
        isAuthorizedMerchandiseStaff(request.resource.data.productionId)
    );
    allow update, delete: if false;
}

// 物販レジ締め（独立モード用）
match /merchandiseCashClosings/{docId} {
    allow read, list: if isSignedIn() && (
        resource.data.userId == request.auth.uid ||
        isAuthorizedStaff(resource.data.productionId)
    );
    allow create: if isSignedIn() && (
        request.resource.data.userId == request.auth.uid ||
        isAuthorizedMerchandiseStaff(request.resource.data.productionId)
    );
    allow update, delete: if false;
}
```

---

## 11. スタッフ権限設計

### 11.1 ロール定義

| ロール | 既存/新規 | 権限 |
|---|---|---|
| `reception` | 既存 | チェックイン、当日券発行、かんたんモード時の物販操作 |
| `monitor` | 既存 | 読み取り専用（物販含む） |
| `merchandise` | **新規** | 物販操作のみ（チェックインは不可） |

### 11.2 モード別の動作

#### かんたんモード（`SIMPLE`）
- `reception` スタッフがチェックインページのボトムナビ「物販」タブで操作
- 物販専用スタッフ不要

#### 独立モード（`INDEPENDENT`）
- `merchandise` スタッフが専用URL（`/staff/[id]/merchandise`）で操作
- スタッフTOPで公演回選択後に物販画面へ遷移（`performanceId`はこの時点で取得）
- スタッフ管理ページで `merchandise` ロールを発行

### 11.3 staffTokens拡張

```typescript
staffTokens?: {
    [token: string]: {
        role: 'reception' | 'monitor' | 'merchandise';
        passcode: string;
        passcodeHashed: string;
    } | string;
};
```

---

## 12. 部分返品設計

### 12.1 概要

1つの販売レコード内の特定アイテムだけをキャンセルできる。全アイテムキャンセル = 全体キャンセルと同等。

### 12.2 ステータス遷移

```
COMPLETED → PARTIALLY_CANCELED → CANCELED
                ↑  (部分キャンセルを繰り返し)
                └──────────────┘
```

- 一部アイテムキャンセル → `PARTIALLY_CANCELED`
- 全アイテムキャンセル → `CANCELED`（`canceledAt`, `cancelReason` も設定）

### 12.3 データモデル設計原則

- **元データ不変**: `quantity`, `subtotal`, `totalAmount` は販売時の値を保持
- **差分管理**: `canceledQuantity`, `refundedAmount`, `effectiveAmount` で差分を管理
- **追跡可能**: `cancellations` 配列で複数回の部分キャンセルを記録

### 12.4 返金額計算アルゴリズム

#### セット割適用済みの部分返品: 割引剥落方式

```
1. キャンセル後の残存アイテムを算出
2. セット条件が維持可能か判定
3. 崩壊した場合、割引額を返金から差し引く
   refundAmount = max(0, キャンセルアイテム単価合計 - 剥落した割引額)
```

**例**: Tシャツ(¥2,000) + ステッカー(¥500) = セット価格¥2,000（割引¥500）
- ステッカーのみキャンセル: 返金 = max(0, 500 - 500) = **¥0**（セット割剥落と相殺）
- Tシャツのみキャンセル: 返金 = max(0, 2000 - 500) = **¥1,500**

#### まとめ割適用済みの部分返品: 条件再評価方式

```
1. キャンセル後の残存数量でまとめ割の適用条件を再評価
2. まとめ割維持 → キャンセル分は割引後単価で返金
3. まとめ割崩壊 → 残存アイテムが正規価格に戻る差額を調整
   refundAmount = max(0, キャンセル分×割引単価 - 残存分の価格上昇額)
```

**例**: ポストカード¥300/枚、3枚以上で¥200/枚。5枚購入(¥1,000)
- 2枚キャンセル(残3枚、まとめ割維持): 返金 = 2×200 = **¥400**
- 3枚キャンセル(残2枚、まとめ割崩壊): 返金 = max(0, 3×200 - 2×100) = **¥400**

### 12.5 部分返品キャンセルUI

キャンセルダイアログ（`MerchandiseCancelDialog`）:

```
┌──────────────────────────────────┐
│  販売をキャンセル                  │
│  販売番号: #12  14:32             │
│  ──────────────────              │
│  ☑ Tシャツ (M) x2  [-]1[+] ¥2,000│  ← チェック + 数量選択
│  ☐ ステッカー  x1         ¥500   │  ← 未チェック = キャンセルしない
│  ──────────────────              │
│  返金額: ¥2,000                  │  ← リアルタイム計算
│  (セット割剥落分: -¥300)          │  ← 割引調整がある場合のみ表示
│  ──────────────────              │
│  キャンセル理由 (任意)            │
│  [________________________]      │
│  在庫管理ON: 在庫が復元されます   │
│                                  │
│  [ やめる ]     [ キャンセル確定 ] │
└──────────────────────────────────┘
```

- 各アイテムにチェックボックス + 数量選択（1〜購入数量-キャンセル済み数量）
- 返金額はアイテム選択に応じてリアルタイム計算
- 返金額が0円の場合「セット割引の剥落により返金額は0円です」と明示

### 12.6 部分キャンセルのトランザクション

```
Transaction: partialCancelMerchandiseSale
  1. READ: merchandiseSales/{saleId}
     - status が CANCELED ならエラー
     - cancelItems の各アイテムの cancelable数量 を検証
  2. READ: merchandiseProducts（在庫管理ON時）
  3. COMPUTE: 返金額計算 + 新ステータス決定
  4. WRITE: merchandiseSales 更新
     - items[].canceledQuantity 加算
     - refundedAmount += 返金額
     - effectiveAmount = totalAmount - refundedAmount
     - cancellations に追記
     - status 更新
  5. WRITE: 在庫復元 + inventoryLog 追加（在庫管理ON時）
```

---

## 13. エッジケース対応

### 13.1 在庫関連

| ケース | 対応 |
|---|---|
| 販売時に在庫不足 | トランザクション内でチェック。エラー「在庫が不足しています（残り: X個）」 |
| 複数スタッフが同時販売 | Firestoreトランザクションで楽観的ロック |
| 在庫管理の途中切替（OFF→ON） | 全商品の在庫数を0で初期化、手動入力を促す |
| 在庫管理の途中切替（ON→OFF） | 在庫数は保持するが販売時にチェックしない |
| キャンセル時の在庫復元 | トランザクション内で原子的に実行 |
| 販売済み商品の削除 | 論理削除（isActive: false）のみ。物理削除は不可 |
| 在庫残少アラート閾値 | 5個以下で黄色警告、0で赤表示+販売ブロック |
| オフライン時の在庫管理 | ローカル在庫で楽観的チェック。オンライン復帰時にサーバーと照合 |

### 13.2 バリアント関連

| ケース | 対応 |
|---|---|
| 在庫OFF + バリアントあり時の選択スキップ | 「バリアントを指定しない」ボタン表示。variantId: null で記録 |
| バリアント追加後の既存データ整合性 | 販売ドキュメントに商品名・バリアント名を非正規化しているため影響なし |
| バリアントの価格変更 | 変更前の販売は変更前価格で記録済み。変更後のみ新価格適用 |

### 13.3 セット販売関連

| ケース | 対応 |
|---|---|
| セット構成商品の在庫不足 | 全構成商品の在庫を事前チェック。1つでも不足ならセット適用不可 |
| セット専用商品の単品カート追加 | 販売フォーム側でブロック。トースト通知 |
| セット構成商品の非アクティブ化 | セット自体も自動非アクティブ化（UIで警告表示） |

### 13.4 レジ締め関連

| ケース | 対応 |
|---|---|
| かんたんモードの段階的レジ締め | 何回でも実行可能。各回で累計売上 vs 現金を確認 |
| レジ締め後のキャンセル | 警告表示「次回レジ締めで差額が反映されます」 |
| かんたんモードの在庫照合 | 物販レポートで確認（レジ締め画面には含めない） |

### 13.5 部分返品関連

| ケース | 対応 |
|---|---|
| セット割適用済みの1商品キャンセルで返金0円 | UIで「セット割引の剥落により返金額は0円です」と明示 |
| 同一販売の複数回部分キャンセル | `cancellations` 配列に追記。各回の返金額は独立計算 |
| 部分キャンセル後に残存アイテムも全キャンセル | `PARTIALLY_CANCELED` → `CANCELED` に遷移 |
| 部分キャンセル後のレジ締め | `effectiveAmount` で期待売上を計算 |
| 部分キャンセル後のレポート | `effectiveAmount` で集計 |

### 13.6 モード切替関連

| ケース | 対応 |
|---|---|
| 商品全削除（物販無効化） | データは保持（isActive: false）、UIから非表示 |
| かんたん→独立モード切替 | 確認ダイアログ。既存レジ締めは変更されず、以降のみ新モード適用 |
| 独立→かんたんモード切替 | 確認ダイアログ。物販専用レジ締めデータは保持、以降は共有レジに統合 |
| 公演期間中のモード切替 | 非推奨である旨をUIガイダンスで強調 |

### 13.7 オフライン関連

| ケース | 対応 |
|---|---|
| オフライン時の販売 | IndexedDBキューに保持、オンライン復帰時に自動同期 |
| 複数端末オフラインで在庫超過 | CONFLICT → ユーザーに3択提示（超過許可/数量修正/取消） |
| 端末クラッシュ | IndexedDBからキュー復旧。localIdでべき等性保証 |
| オフライン時のキャンセル | オンライン時のみ可能（トランザクション必須のため） |
| キュー未同期での端末切替 | 元の端末で同期を完了させる必要あり。UIで警告 |

---

## 14. 実装チーム構成

### 14.1 チーム構成方針

本機能はフェーズ依存関係上、Phase 3完了後に4つの独立ストリームが並行可能な構造を持つ。
この特性を活かし、**序盤は1チーム集中、中盤以降は並行分担**の段階的チーム構成を推奨する。

### 14.2 推奨チーム構成（3チーム体制）

| チーム名 | 担当Phase | 専門領域 | 主な成果物 |
|---|---|---|---|
| **Core（コア）** | Phase 1 → 2 → 3 → 8 | データモデル・販売フロー・統合 | 型定義、Security Rules、商品管理UI、販売画面、BottomNav |
| **Infra（インフラ）** | Phase 3.5 → 4 → 5 | オフライン・在庫・レジ締め | IndexedDB、同期エンジン、在庫トランザクション、レジ締め |
| **Extension（拡張）** | Phase 6 → 7 | スタッフ対応・レポート | スタッフ画面、権限制御、売上レポート、CSV出力 |

### 14.3 タイムライン

```
Week 1:  [Core] Phase 1 (基盤) + Phase 2 (商品管理UI)
         ───────────────────────────────────────
Week 2:  [Core] Phase 3 (販売フロー)
         ───────────────────────────────────────
Week 3:  [Core]      Phase 3 続き + Phase 8 準備
         [Infra]     Phase 3.5 (オフライン対応)
         [Extension] Phase 6 (スタッフ対応)
         ───────────────────────────────────────
Week 4:  [Infra]     Phase 4 (在庫管理)
         [Extension] Phase 7 (レポート) ← Phase 4の在庫データ定義は Week3末に共有
         ───────────────────────────────────────
Week 5:  [Infra]     Phase 5 (レジ締め) ← Phase 6完了を待つ
         [Core]      Phase 8 (統合テスト) ← 各チーム合流
```

### 14.4 ファイルオーナーシップ（競合防止）

並行作業時のファイル競合を防ぐため、各チームの排他的な担当ファイルを明確化する。

**Core チーム所有ファイル:**
- `src/types/index.ts` — 型定義（他チームは型追加時にCoreに依頼またはPR）
- `src/app/productions/[id]/merchandise/` — 商品管理ページ
- `src/app/productions/[id]/checkin/[performanceId]/` — チェックインページ（BottomNav統合）
- `src/components/Merchandise*.tsx`（Sales, Cart, ProductCard, CategoryFilter, VariantSheet, SalesHistory, CancelDialog）
- `src/components/BottomNav.tsx`
- `src/lib/client-firestore.ts` — 物販CRUD関数追加部分
- `firestore.rules` — Security Rules

**Infra チーム所有ファイル:**
- `src/lib/offline/` — オフラインキュー関連すべて（db.ts, sale-queue.ts, sync-engine.ts, conflict-resolver.ts, local-inventory.ts）
- `src/components/OfflineStatusIndicator.tsx`
- `src/components/SyncQueueDrawer.tsx`
- `src/lib/merchandise-inventory.ts` — 在庫トランザクション
- `src/components/MerchandiseInventoryAdjust.tsx`
- `src/lib/merchandise-cash-close.ts`
- `src/components/MerchandiseCashCloseForm.tsx`

**Extension チーム所有ファイル:**
- `src/app/staff/[id]/merchandise/` — スタッフ物販ページ
- `src/app/actions/staff-auth.ts` — merchandiseロール追加部分
- `src/lib/merchandise-report.ts`
- `src/components/MerchandiseReportView.tsx`
- `src/app/productions/[id]/report/` — レポートページへの物販セクション追加

**共有ファイル（変更時は事前調整が必要）:**
- `src/types/index.ts` — Core管理だが全チームが参照
- `src/lib/firebase.ts` — オフラインキャッシュ有効化（Infraが変更）
- `src/app/dashboard/` — KPI追加（Extension）、物販リンク追加（Core）
- `src/components/CashCloseForm.tsx` — かんたんモードの合算（Infra）
- `globals.css` — 新しいCSS変数追加時

### 14.5 チーム間インターフェース

各チームが独立して作業するために、Phase 3完了時点で以下のインターフェース（API境界）を確定させる。

| インターフェース | 提供元 | 利用先 | 内容 |
|---|---|---|---|
| 販売関数API | Core | Infra, Extension | `createMerchandiseSaleClient()`, `cancelMerchandiseSaleClient()`, `partialCancelMerchandiseSaleClient()` の引数・戻り値 |
| 商品データ型 | Core | 全チーム | `MerchandiseProduct`, `MerchandiseVariant`, `MerchandiseSet` の型定義 |
| 売上データ型 | Core | Infra, Extension | `MerchandiseSale`, `MerchandiseSaleCancellation` の型定義 |
| オフラインラッパー | Infra | Core | `createMerchandiseSaleClient` をラップする `createSaleOfflineAware()` の型定義 |
| 在庫チェック関数 | Infra | Core | `checkInventory(productId, variantId, quantity): Promise<boolean>` |
| スタッフ権限チェック | Extension | Core, Infra | `isAuthorizedMerchandiseStaff` の判定ロジック |

### 14.6 コミュニケーション規約

- **日次同期**: 各チームの進捗・ブロッカーを共有（短時間で済む非同期テキストベースでOK）
- **型定義変更**: `src/types/index.ts` への変更はPRベースで全チームレビュー
- **共有ファイル変更**: 事前にSlack/チャットで変更意図を共有してから着手
- **Phase完了報告**: 各Phaseの完了時にデモ可能な状態で引き渡し

### 14.7 リスクと対策

| リスク | 対策 |
|---|---|
| Phase 3が遅延→全チーム待ち | Phase 3の販売関数APIの型定義のみ先行確定し、Infra/ExtensionはモックでPhase開始可能にする |
| 型定義の頻繁な変更 | Phase 1で型を十分にレビューし、Phase 2以降の変更は最小限に抑える |
| オフライン対応の複雑さ | Phase 3.5は最もリスクが高い。Infraチームに経験者を配置し、早期にプロトタイプ検証する |
| レジ締めのPhase依存（5←3,6） | Phase 5着手はWeek 5だが、設計は事前にCoreと共有しておく |
| 統合テストで不整合発覚 | Week 4後半からCoreが各チーム成果物の結合を開始し、Phase 8前に早期発見する |

---

## 15. 実装フェーズ

### Phase 1: データモデル・型定義・基盤（2-3日）
依存: なし
1. 型定義追加（部分返品・オフライン対応含む）
2. Production interfaceに物販フィールド追加
3. Firestore Security Rules追加（`isAuthorizedMerchandiseStaff` 含む）
4. 商品CRUDの client-firestore関数作成
5. Firestoreインデックス定義

### Phase 2: 商品管理UI（3-4日）
依存: Phase 1
1. MerchandiseSettingsForm（運用スタイル選択 + 在庫管理ON/OFF）
2. MerchandiseProductForm（バリアント・まとめ割含む）
3. MerchandiseProductManager
4. MerchandiseSetManager
5. MerchandiseSettingsTabs
6. `/productions/[id]/merchandise` ページ
7. ダッシュボードに物販管理リンク追加
8. SetupChecklistに物販項目追加

### Phase 3: 販売フロー（5-6日）
依存: Phase 2

> 在庫管理OFF前提で実装。Phase 4で在庫対応を追加。

1. merchandise-sales.ts（販売・キャンセル・部分キャンセル・集計）
2. MerchandiseProductCard + MerchandiseCategoryFilter
3. MerchandiseVariantSheet（ボトムシート）
4. MerchandiseCart（割引計算ロジック含む）
5. MerchandiseSalesForm（2カラム/スマホレスポンシブ）
6. MerchandiseSalesHistory + MerchandiseCancelDialog（部分返品UI含む）
7. BottomNav コンポーネント作成
8. チェックインページのタブ→ボトムナビ変更 + 物販タブ追加（かんたんモード用）
9. 販売ページ（独立モード用 + 公演回選択画面）

### Phase 3.5: オフライン対応基盤（3-4日）
依存: Phase 3
1. `idb` パッケージ追加、`src/lib/offline/db.ts` 作成
2. `sale-queue.ts` + `local-inventory.ts` 作成
3. `sync-engine.ts` 作成（べき等性保証、排他ロック含む）
4. `conflict-resolver.ts` 作成
5. `useOfflineSync` + `useNetworkStatus` フック作成
6. `OfflineStatusIndicator` + `SyncQueueDrawer` コンポーネント作成
7. `createMerchandiseSaleClient` のオフラインラップ
8. `firebase.ts` にオフラインキャッシュ有効化追加

### Phase 4: 在庫管理（2-3日）
依存: Phase 3
1. 在庫デクリメント/復元トランザクション（部分キャンセル対応含む）
2. MerchandiseInventoryAdjust（手動調整）
3. 在庫ログ記録（`PARTIAL_CANCEL_RESTORE` 含む）
4. 在庫数バッジ表示（残少警告、パルスアニメーション）
5. 在庫0時の販売ブロック
6. `onSnapshot` によるリアルタイム在庫同期

### Phase 5: レジ締め連携（2-3日）
依存: Phase 3, Phase 6
1. merchandise-cash-close.ts
2. かんたんモード: expectedSalesOverrideに物販売上(effectiveAmount)加算 + CashCloseFormラベル条件分岐 + salesBreakdown prop + 内訳表示
3. 独立モード: MerchandiseCashCloseForm（在庫差異チェック付き）
4. レジ締めレポートに物販セクション追加

### Phase 6: スタッフ対応（2-3日）
依存: Phase 3
1. スタッフ管理のロール選択にmerchandise追加
2. `/staff/[id]/merchandise` ページ作成（公演回選択 + 販売/履歴/レジ締めタブ）
3. スタッフTOPのロール判定分岐追加
4. かんたんモード時のreceptionスタッフ物販アクセス許可

### Phase 7: レポート（2-3日）
依存: Phase 3, Phase 4
1. merchandise-report.ts（部分キャンセル対応: effectiveAmount, canceledQuantity集計）
2. MerchandiseReportView
3. 物販レポートページ
4. ダッシュボードに物販KPI追加
5. 在庫照合レポート
6. CSV/印刷エクスポート

### Phase 8: 統合テスト・仕上げ（2-3日）
依存: 全Phase
1. かんたんモード（SIMPLE）完全フロー確認
2. 独立モード（INDEPENDENT）完全フロー確認
3. 在庫ON/OFF切り替えテスト
4. 同時操作テスト
5. スタッフ権限テスト
6. 割引計算の正確性確認（セット割+まとめ割の排他含む）
7. レジ締め後キャンセルシナリオ確認
8. 部分返品フロー確認（セット割剥落・まとめ割再評価）
9. オフライン販売→同期フロー確認
10. コンフリクト解決フロー確認
11. 端末クラッシュ復旧テスト

### フェーズ依存関係

```
Phase 1 (基盤)
    └── Phase 2 (商品管理UI)
            └── Phase 3 (販売フロー)
                    ├── Phase 3.5 (オフライン対応)
                    ├── Phase 4 (在庫管理)
                    ├── Phase 5 (レジ締め) ← Phase 6にも依存
                    ├── Phase 6 (スタッフ)
                    └── Phase 7 (レポート) ← Phase 4にも依存
Phase 8 (統合テスト) ← 全Phase完了後
```

### 合計推定工数: 23-32日
