import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, query, where, addDoc, updateDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';

/**
 * 公演回を追加する（クライアント側）
 */
export async function addPerformanceClient(productionId: string, startTime: string, capacity: number, userId: string) {
    if (!userId) throw new Error('Unauthorized');

    const performancesRef = collection(db, "performances");
    const newDoc = await addDoc(performancesRef, {
        productionId,
        startTime: new Date(startTime),
        capacity,
        userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });

    // 公演の更新日時も更新
    const prodRef = doc(db, "productions", productionId);
    await updateDoc(prodRef, { updatedAt: serverTimestamp() });

    return newDoc.id;
}

/**
 * 公演回を更新する（クライアント側）
 */
export async function updatePerformanceClient(id: string, startTime: Date, capacity: number, userId: string) {
    if (!userId) throw new Error('Unauthorized');
    const ref = doc(db, "performances", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('NotFound');
    if (snap.data().userId !== userId) throw new Error('Unauthorized');

    await updateDoc(ref, {
        startTime,
        capacity,
        updatedAt: serverTimestamp()
    });
}

/**
 * 公演回を削除する（クライアント側）
 */
export async function deletePerformanceClient(id: string, userId: string) {
    if (!userId) throw new Error('Unauthorized');
    const ref = doc(db, "performances", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('NotFound');
    if (snap.data().userId !== userId) throw new Error('Unauthorized');

    // 予約があるかチェック
    const reservationsRef = collection(db, "reservations");
    const q = query(reservationsRef, where("performanceId", "==", id), where("status", "!=", "CANCELED"));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
        throw new Error('すでに予約があるため削除できません');
    }

    await deleteDoc(ref);
}
