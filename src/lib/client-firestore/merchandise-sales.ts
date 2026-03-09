import { db } from '@/lib/firebase';
import {
    collection, doc, addDoc, updateDoc, getDoc, getDocs, query, where, orderBy, limit,
    onSnapshot, Unsubscribe, Timestamp
} from 'firebase/firestore';
import { MerchandiseSale, MerchandiseSaleItem, MerchandiseSet, MerchandiseProduct, MerchandiseCancellationItem, MerchandiseCancellation } from '@/types';
import { serializeDocs } from '@/lib/firestore-utils';

// ── 物販売上合計取得 ──

export async function getMerchandiseSalesTotalClient(
    performanceId: string,
    productionId: string,
    userId: string,
): Promise<number> {
    const ref = collection(db, 'merchandiseSales');
    const q = query(
        ref,
        where('userId', '==', userId),
        where('performanceId', '==', performanceId),
        where('productionId', '==', productionId),
    );
    const snapshot = await getDocs(q);
    const sales = serializeDocs<MerchandiseSale>(snapshot.docs);
    return sales
        .filter(s => s.status !== 'CANCELED')
        .reduce((sum, s) => sum + s.effectiveAmount, 0);
}

// ── 販売記録 ──

export interface CreateSaleInput {
    productionId: string;
    performanceId: string;
    userId: string;
    items: MerchandiseSaleItem[];
    sets: MerchandiseSet[];
    soldBy: string;
    soldByType: 'ORGANIZER' | 'STAFF';
}

function calculateSetDiscounts(items: MerchandiseSaleItem[], sets: MerchandiseSet[]) {
    const discounts: { setId: string; setName: string; discountAmount: number }[] = [];
    if (!sets || sets.length === 0) return discounts;

    for (const set of sets) {
        if (!set.isActive) continue;

        const variantQuantities = new Map<string, number>();
        const productQuantities = new Map<string, number>();
        for (const item of items) {
            const vKey = item.variantId ? `${item.productId}:${item.variantId}` : item.productId;
            variantQuantities.set(vKey, (variantQuantities.get(vKey) || 0) + item.quantity);
            productQuantities.set(item.productId, (productQuantities.get(item.productId) || 0) + item.quantity);
        }

        // セットが何回適用できるか計算（各アイテムの available / required の最小値）
        let timesApplicable = Infinity;
        let regularTotal = 0;
        for (const setItem of set.items) {
            let available: number;
            if (setItem.variantId) {
                const key = `${setItem.productId}:${setItem.variantId}`;
                available = variantQuantities.get(key) || 0;
            } else {
                available = productQuantities.get(setItem.productId) || 0;
            }

            timesApplicable = Math.min(timesApplicable, Math.floor(available / setItem.quantity));
            if (timesApplicable === 0) break;

            const cartItem = items.find(i =>
                i.productId === setItem.productId &&
                (setItem.variantId ? i.variantId === setItem.variantId : true)
            );
            if (cartItem) {
                regularTotal += cartItem.unitPrice * setItem.quantity;
            }
        }

        const discountPerSet = regularTotal - set.setPrice;
        if (timesApplicable > 0 && discountPerSet > 0) {
            discounts.push({
                setId: set.id,
                setName: set.name,
                discountAmount: discountPerSet * timesApplicable,
            });
        }
    }

    return discounts;
}

export async function createMerchandiseSaleClient(input: CreateSaleInput): Promise<string> {
    const { productionId, performanceId, userId, items, sets, soldBy, soldByType } = input;

    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    const setDiscounts = calculateSetDiscounts(items, sets);
    const totalDiscount = setDiscounts.reduce((sum, d) => sum + d.discountAmount, 0);
    const totalAmount = subtotal - totalDiscount;

    const saleData = {
        productionId,
        performanceId,
        userId,
        items: items.map(item => ({
            ...item,
            canceledQuantity: 0,
        })),
        setDiscounts,
        bulkDiscounts: [],
        subtotal,
        totalDiscount,
        totalAmount,
        refundedAmount: 0,
        effectiveAmount: totalAmount,
        status: 'COMPLETED',
        cancellations: [],
        canceledAt: null,
        cancelReason: null,
        soldBy,
        soldByType,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
    };

    const ref = collection(db, 'merchandiseSales');
    const docRef = await addDoc(ref, saleData);
    return docRef.id;
}

// ── 販売キャンセル（全体） ──

export async function cancelMerchandiseSaleClient(
    saleId: string,
    canceledBy: string,
    canceledByType: 'ORGANIZER' | 'STAFF',
    reason?: string,
): Promise<void> {
    const ref = doc(db, 'merchandiseSales', saleId);
    await updateDoc(ref, {
        status: 'CANCELED',
        canceledAt: Timestamp.now(),
        cancelReason: reason || null,
        effectiveAmount: 0,
        refundedAmount: 0,
        updatedAt: Timestamp.now(),
    });
}

// ── 部分キャンセル ──

export interface PartialCancelInput {
    saleId: string;
    cancelItems: MerchandiseCancellationItem[];
    canceledBy: string;
    canceledByType: 'ORGANIZER' | 'STAFF';
    reason?: string;
    /** 元のセット情報（割引再計算用） */
    sets: MerchandiseSet[];
}

export async function partialCancelMerchandiseSaleClient(input: PartialCancelInput): Promise<void> {
    const { saleId, cancelItems, canceledBy, canceledByType, reason, sets } = input;

    // 現在のセールデータを取得
    const saleRef = doc(db, 'merchandiseSales', saleId);
    const saleSnap = await getDoc(saleRef);
    if (!saleSnap.exists()) throw new Error('販売記録が見つかりません');

    const sale = { id: saleSnap.id, ...saleSnap.data() } as MerchandiseSale;

    // canceledQuantity を更新した items を構築
    const updatedItems = sale.items.map(item => {
        const cancelItem = cancelItems.find(
            ci => ci.productId === item.productId && ci.variantId === item.variantId
        );
        if (!cancelItem) return item;
        return {
            ...item,
            canceledQuantity: (item.canceledQuantity || 0) + cancelItem.quantity,
        };
    });

    // 全品キャンセルかどうか判定
    const isFullCancel = updatedItems.every(
        item => item.canceledQuantity >= item.quantity
    );

    // 残存アイテムでセット割引を再計算
    const remainingForDiscount: MerchandiseSaleItem[] = updatedItems.map(item => ({
        ...item,
        quantity: item.quantity - item.canceledQuantity,
    }));
    const newSetDiscounts = calculateSetDiscounts(remainingForDiscount, sets);
    const newTotalDiscount = newSetDiscounts.reduce((sum, d) => sum + d.discountAmount, 0);

    // 新しい小計（残存分のみ）
    const newSubtotal = remainingForDiscount.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity, 0
    );
    const newTotalAmount = newSubtotal - newTotalDiscount;

    // 返金額 = 元の effectiveAmount - 新しい合計額
    const refundAmount = sale.effectiveAmount - newTotalAmount;

    // キャンセルされた商品の単価合計（割引調整前）
    const itemRefund = cancelItems.reduce((sum, ci) => {
        const originalItem = sale.items.find(
            i => i.productId === ci.productId && i.variantId === ci.variantId
        );
        return sum + (originalItem ? originalItem.unitPrice * ci.quantity : 0);
    }, 0);

    // 割引調整額 = 商品の単価合計 - 実際の返金額
    const discountAdjustment = itemRefund - refundAmount;

    const cancellationId = `cancel_${Date.now()}`;
    const newCancellation: Omit<MerchandiseCancellation, 'canceledAt'> & { canceledAt: any } = {
        id: cancellationId,
        canceledAt: Timestamp.now(),
        canceledBy,
        canceledByType,
        reason: reason || null,
        items: cancelItems,
        refundAmount: Math.max(0, refundAmount),
        refundBreakdown: {
            itemRefund,
            discountAdjustment: Math.max(0, discountAdjustment),
        },
    };

    const newRefundedAmount = (sale.refundedAmount || 0) + Math.max(0, refundAmount);
    const newEffectiveAmount = Math.max(0, newTotalAmount);

    await updateDoc(saleRef, {
        items: updatedItems,
        setDiscounts: newSetDiscounts,
        subtotal: updatedItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
        totalDiscount: newTotalDiscount,
        effectiveAmount: newEffectiveAmount,
        refundedAmount: newRefundedAmount,
        status: isFullCancel ? 'CANCELED' : 'PARTIALLY_CANCELED',
        cancellations: [...(sale.cancellations || []), newCancellation],
        ...(isFullCancel ? { canceledAt: Timestamp.now() } : {}),
        cancelReason: reason || sale.cancelReason || null,
        updatedAt: Timestamp.now(),
    });
}

// ── 販売履歴取得（リアルタイム） ──

export function subscribeMerchandiseSales(
    performanceId: string,
    productionId: string,
    userId: string,
    callback: (sales: MerchandiseSale[]) => void,
    limitCount: number = 20,
): Unsubscribe {
    const ref = collection(db, 'merchandiseSales');
    const q = query(
        ref,
        where('userId', '==', userId),
        where('performanceId', '==', performanceId),
        where('productionId', '==', productionId),
        orderBy('createdAt', 'desc'),
        limit(limitCount),
    );

    return onSnapshot(q, (snap) => {
        callback(serializeDocs<MerchandiseSale>(snap.docs));
    });
}

// ── 商品別販売数量の集計（在庫チェック用） ──

export interface SoldQuantityItem {
    productId: string;
    variantId: string | null;
    totalSold: number;
}

export async function getMerchandiseSoldQuantitiesClient(
    performanceId: string,
    productionId: string,
    userId: string,
): Promise<SoldQuantityItem[]> {
    const ref = collection(db, 'merchandiseSales');
    const q = query(
        ref,
        where('userId', '==', userId),
        where('performanceId', '==', performanceId),
        where('productionId', '==', productionId),
    );
    const snapshot = await getDocs(q);
    const sales = serializeDocs<MerchandiseSale>(snapshot.docs);

    const qtyMap = new Map<string, number>();
    for (const sale of sales) {
        if (sale.status === 'CANCELED') continue;
        for (const item of sale.items) {
            const key = item.variantId ? `${item.productId}:${item.variantId}` : item.productId;
            const effectiveQty = item.quantity - (item.canceledQuantity || 0);
            qtyMap.set(key, (qtyMap.get(key) || 0) + effectiveQty);
        }
    }

    const result: SoldQuantityItem[] = [];
    for (const [key, totalSold] of qtyMap) {
        const parts = key.split(':');
        result.push({
            productId: parts[0],
            variantId: parts.length > 1 ? parts[1] : null,
            totalSold,
        });
    }
    return result;
}

// ── 全公演回の累計販売数量（在庫チェック用） ──

export async function getMerchandiseSoldQuantitiesAllClient(
    productionId: string,
    userId: string,
): Promise<SoldQuantityItem[]> {
    const ref = collection(db, 'merchandiseSales');
    const q = query(
        ref,
        where('userId', '==', userId),
        where('productionId', '==', productionId),
    );
    const snapshot = await getDocs(q);
    const sales = serializeDocs<MerchandiseSale>(snapshot.docs);

    return aggregateSoldQuantities(sales);
}

// ── 指定時刻以降の全販売数量（在庫チェック用） ──

export async function getMerchandiseSoldQuantitiesSinceClient(
    productionId: string,
    userId: string,
    since: Date,
): Promise<SoldQuantityItem[]> {
    const ref = collection(db, 'merchandiseSales');
    const q = query(
        ref,
        where('userId', '==', userId),
        where('productionId', '==', productionId),
        where('createdAt', '>', Timestamp.fromDate(since)),
    );
    const snapshot = await getDocs(q);
    const sales = serializeDocs<MerchandiseSale>(snapshot.docs);

    return aggregateSoldQuantities(sales);
}

// ── 共通集計ヘルパー ──

function aggregateSoldQuantities(sales: MerchandiseSale[]): SoldQuantityItem[] {
    const qtyMap = new Map<string, number>();
    for (const sale of sales) {
        if (sale.status === 'CANCELED') continue;
        for (const item of sale.items) {
            const key = item.variantId ? `${item.productId}:${item.variantId}` : item.productId;
            const effectiveQty = item.quantity - (item.canceledQuantity || 0);
            qtyMap.set(key, (qtyMap.get(key) || 0) + effectiveQty);
        }
    }

    const result: SoldQuantityItem[] = [];
    for (const [key, totalSold] of qtyMap) {
        const parts = key.split(':');
        result.push({
            productId: parts[0],
            variantId: parts.length > 1 ? parts[1] : null,
            totalSold,
        });
    }
    return result;
}
