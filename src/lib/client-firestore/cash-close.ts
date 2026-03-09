import { db } from '@/lib/firebase';
import {
    collection,
    addDoc,
    getDocs,
    query,
    where,
    orderBy,
    limit,
    serverTimestamp,
} from 'firebase/firestore';
import { CashClosing, FirestoreReservation, InventoryCheckItem } from '@/types';
import { serializeDocs } from '@/lib/firestore-utils';
import { toDate } from '@/lib/firestore-utils';

export async function getPerformancePaidTotalClient(
    performanceId: string,
    userId: string
): Promise<number> {
    const reservationsRef = collection(db, 'reservations');
    const q = query(
        reservationsRef,
        where('userId', '==', userId),
        where('performanceId', '==', performanceId)
    );
    const snapshot = await getDocs(q);
    const reservations = serializeDocs<FirestoreReservation>(snapshot.docs)
        .filter(r => r.status !== 'CANCELED');

    return reservations.reduce((sum, r) => sum + (r.paidAmount || 0), 0);
}

export async function saveCashClosingClient(
    data: Omit<CashClosing, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
    const newDoc = await addDoc(collection(db, 'cashClosings'), {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
    return newDoc.id;
}

export async function getCashClosingsClient(
    performanceId: string,
    productionId: string,
    userId: string
): Promise<CashClosing[]> {
    const ref = collection(db, 'cashClosings');
    const q = query(
        ref,
        where('userId', '==', userId),
        where('performanceId', '==', performanceId),
        where('productionId', '==', productionId),
        orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return serializeDocs<CashClosing>(snapshot.docs);
}

export async function getCashClosingsByProductionClient(
    productionId: string,
    userId: string
): Promise<CashClosing[]> {
    const ref = collection(db, 'cashClosings');
    const q = query(
        ref,
        where('userId', '==', userId),
        where('productionId', '==', productionId),
        orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return serializeDocs<CashClosing>(snapshot.docs);
}

// ── 最新の在庫チェック結果を取得（公演横断） ──

export interface LatestInventoryCheck {
    checkItems: InventoryCheckItem[];
    checkedAt: Date;
}

export async function getLatestInventoryCheckClient(
    productionId: string,
    userId: string,
): Promise<LatestInventoryCheck | null> {
    // cashClosings の中から inventoryCheck が存在するものを最新順で取得
    const ref = collection(db, 'cashClosings');
    const q = query(
        ref,
        where('userId', '==', userId),
        where('productionId', '==', productionId),
        orderBy('createdAt', 'desc'),
    );
    const snapshot = await getDocs(q);
    const closings = serializeDocs<CashClosing>(snapshot.docs);

    // inventoryCheck が存在する最新のレコードを探す
    for (const closing of closings) {
        if (closing.inventoryCheck && closing.inventoryCheck.length > 0) {
            const checkedAt = closing.createdAt ? toDate(closing.createdAt) : new Date();
            return {
                checkItems: closing.inventoryCheck,
                checkedAt,
            };
        }
    }

    return null;
}
