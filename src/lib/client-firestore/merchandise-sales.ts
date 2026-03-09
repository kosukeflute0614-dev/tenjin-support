import { db } from '@/lib/firebase';
import {
    collection, doc, addDoc, updateDoc, getDocs, query, where, orderBy, limit,
    serverTimestamp, onSnapshot, Unsubscribe
} from 'firebase/firestore';
import { MerchandiseSale, MerchandiseSaleItem, MerchandiseSet } from '@/types';
import { serializeDocs } from '@/lib/firestore-utils';

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

        // Check if all items in the set are present in the cart with sufficient quantity
        const itemQuantities = new Map<string, number>();
        for (const item of items) {
            const key = item.variantId ? `${item.productId}:${item.variantId}` : item.productId;
            itemQuantities.set(key, (itemQuantities.get(key) || 0) + item.quantity);
        }

        let canApply = true;
        let regularTotal = 0;
        for (const setItem of set.items) {
            const key = setItem.variantId ? `${setItem.productId}:${setItem.variantId}` : setItem.productId;
            const available = itemQuantities.get(key) || 0;
            if (available < setItem.quantity) {
                canApply = false;
                break;
            }
            // Find unit price from cart items
            const cartItem = items.find(i =>
                i.productId === setItem.productId &&
                (setItem.variantId ? i.variantId === setItem.variantId : true)
            );
            if (cartItem) {
                regularTotal += cartItem.unitPrice * setItem.quantity;
            }
        }

        if (canApply && regularTotal > set.setPrice) {
            discounts.push({
                setId: set.id,
                setName: set.name,
                discountAmount: regularTotal - set.setPrice,
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
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
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
        canceledAt: serverTimestamp(),
        cancelReason: reason || null,
        effectiveAmount: 0,
        refundedAmount: 0, // Will be set properly in full implementation
        updatedAt: serverTimestamp(),
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
