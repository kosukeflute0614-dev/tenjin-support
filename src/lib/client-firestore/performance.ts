import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, query, where, addDoc, updateDoc, serverTimestamp, deleteDoc, runTransaction } from 'firebase/firestore';
import { calculateBookedCount } from '@/lib/capacity-utils';

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
        bookedCount: 0,
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

    await runTransaction(db, async (transaction) => {
        const ref = doc(db, "performances", id);
        const snap = await transaction.get(ref);
        if (!snap.exists()) throw new Error('NotFound');
        if (snap.data().userId !== userId) throw new Error('Unauthorized');

        const currentData = snap.data();

        // 定員削減時: 現在の予約数を下回らないかチェック
        if (capacity < currentData.capacity) {
            const reservationsRef = collection(db, "reservations");
            const qRes = query(
                reservationsRef,
                where("performanceId", "==", id)
            );
            const resSnapshot = await getDocs(qRes);
            const bookedCount = calculateBookedCount(
                resSnapshot.docs.map(d => d.data() as any),
                id
            );

            if (capacity < bookedCount) {
                throw new Error(`現在${bookedCount}枚の予約があるため、定員を${capacity}に減らすことはできません。`);
            }
        }

        transaction.update(ref, {
            startTime,
            capacity,
            updatedAt: serverTimestamp()
        });
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
