import { db } from '@/lib/firebase';
import {
    collection, doc, getDoc, getDocs, query, where, addDoc, updateDoc, deleteDoc,
    serverTimestamp, orderBy, writeBatch
} from 'firebase/firestore';
import { MerchandiseProduct, MerchandiseSet } from '@/types';
import { serializeDocs } from '@/lib/firestore-utils';

// ── 物販設定 ──

export async function updateMerchandiseSettingsClient(
    productionId: string,
    settings: {
        merchandiseMode?: 'SIMPLE' | 'INDEPENDENT';
        merchandiseInventoryEnabled?: boolean;
    }
): Promise<void> {
    const ref = doc(db, 'productions', productionId);
    await updateDoc(ref, {
        ...settings,
        updatedAt: serverTimestamp(),
    });
}

// ── 商品 CRUD ──

export async function fetchMerchandiseProductsClient(
    productionId: string
): Promise<MerchandiseProduct[]> {
    const ref = collection(db, 'merchandiseProducts');
    const q = query(ref, where('productionId', '==', productionId), orderBy('sortOrder', 'asc'));
    const snap = await getDocs(q);
    return serializeDocs<MerchandiseProduct>(snap.docs);
}

export async function createMerchandiseProductClient(
    data: Omit<MerchandiseProduct, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
    const ref = collection(db, 'merchandiseProducts');
    const docRef = await addDoc(ref, {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
    return docRef.id;
}

export async function updateMerchandiseProductClient(
    productId: string,
    data: Partial<Omit<MerchandiseProduct, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
    const ref = doc(db, 'merchandiseProducts', productId);
    await updateDoc(ref, {
        ...data,
        updatedAt: serverTimestamp(),
    });
}

export async function deleteMerchandiseProductClient(productId: string): Promise<void> {
    const ref = doc(db, 'merchandiseProducts', productId);
    await deleteDoc(ref);
}

// ── 商品並び替え ──

export async function reorderMerchandiseProductsClient(
    productIds: string[]
): Promise<void> {
    const batch = writeBatch(db);
    productIds.forEach((id, index) => {
        const ref = doc(db, 'merchandiseProducts', id);
        batch.update(ref, { sortOrder: index, updatedAt: serverTimestamp() });
    });
    await batch.commit();
}

// ── セット販売 CRUD（Production内の merchandiseSets 配列を更新）──

export async function updateMerchandiseSetsClient(
    productionId: string,
    sets: MerchandiseSet[]
): Promise<void> {
    const ref = doc(db, 'productions', productionId);
    // Firestore は undefined を受け付けないため、各アイテムからundefinedフィールドを除去
    const cleanSets = sets.map(set => ({
        ...set,
        items: set.items.map(item => {
            const clean: Record<string, unknown> = {
                productId: item.productId,
                quantity: item.quantity,
            };
            if (item.variantId) {
                clean.variantId = item.variantId;
            }
            return clean;
        }),
    }));
    await updateDoc(ref, {
        merchandiseSets: cleanSets,
        updatedAt: serverTimestamp(),
    });
}

// ── 商品数取得（物販有効判定用）──

export async function getMerchandiseProductCountClient(
    productionId: string
): Promise<number> {
    const ref = collection(db, 'merchandiseProducts');
    const q = query(ref, where('productionId', '==', productionId), where('isActive', '==', true));
    const snap = await getDocs(q);
    return snap.size;
}
