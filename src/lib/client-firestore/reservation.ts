import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, query, where, addDoc, updateDoc, serverTimestamp, runTransaction } from 'firebase/firestore';
import { FirestoreReservation } from '@/types';
import { serializeDocs } from '@/lib/firestore-utils';
import { calculateBookedCount, validateCapacity, validateTicketInput } from '@/lib/capacity-utils';

/**
 * スタッフ用トークンを用いて予約情報を更新する（ロール制限付き）
 */
export async function updateReservationByStaffToken(
    reservationId: string,
    productionId: string,
    staffToken: string,
    data: any
): Promise<void> {
    if (!reservationId || !productionId || !staffToken) {
        throw new Error("Missing required parameters for staff token update");
    }

    try {
        const reservationRef = doc(db, "reservations", reservationId);
        await updateDoc(reservationRef, {
            ...data,
            _staffToken: staffToken, // セキュリティルールでの判定用
            updatedAt: serverTimestamp()
        });
    } catch (error) {
        console.error("[client-firestore] updateReservationByStaffToken error:", error);
        throw error;
    }
}

/**
 * トークンを用いてログイン不要で予約一覧を取得する
 */
export async function getReservationsByToken(
    productionId: string,
    staffToken: string
): Promise<FirestoreReservation[]> {
    const reservationsRef = collection(db, "reservations");
    // セキュリティルールを通過するため、productionId と staffToken (クエリ) を明示
    const q = query(
        reservationsRef,
        where("productionId", "==", productionId),
        where("staffToken", "==", staffToken) // ルール側の list 判定用
    );

    const querySnapshot = await getDocs(q);
    return serializeDocs<FirestoreReservation>(querySnapshot.docs);
}

/**
 * 予約を作成する（クライアント側）
 */
export async function createReservationClient(data: Partial<FirestoreReservation>) {
    const tickets = (data as any).tickets || [];
    const { totalCount, error: inputError } = validateTicketInput(tickets);
    if (inputError) throw new Error(inputError);

    const performanceId = data.performanceId;
    if (!performanceId) throw new Error('公演回が指定されていません。');

    const performanceRef = doc(db, "performances", performanceId);
    const performanceSnap = await getDoc(performanceRef);
    if (!performanceSnap.exists()) throw new Error('公演回が見つかりません。');
    const performance = performanceSnap.data();

    if (performance.capacity > 0) {
        const qRes = query(
            collection(db, "reservations"),
            where("performanceId", "==", performanceId),
            where("productionId", "==", data.productionId)
        );
        const resSnapshot = await getDocs(qRes);
        const bookedCount = calculateBookedCount(
            resSnapshot.docs.map(d => d.data() as any),
            performanceId
        );
        const check = validateCapacity(performance.capacity, bookedCount, totalCount);
        if (!check.ok) throw new Error(check.error!);
    }

    const newResRef = doc(collection(db, "reservations"));
    await runTransaction(db, async (transaction) => {
        transaction.set(newResRef, {
            ...data,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    });
    return newResRef.id;
}

/**
 * 予約をキャンセルする（クライアント側）
 */
export async function cancelReservationClient(reservationId: string, userId: string) {
    if (!userId) throw new Error('Unauthorized');
    const ref = doc(db, "reservations", reservationId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('NotFound');
    if (snap.data().userId !== userId) throw new Error('Unauthorized');

    await updateDoc(ref, {
        status: 'CANCELED',
        updatedAt: serverTimestamp()
    });
}

/**
 * 予約情報を更新する（クライアント側）
 */
export async function updateReservationFullClient(reservationId: string, data: Partial<FirestoreReservation>, userId: string) {
    if (!userId) throw new Error('Unauthorized');
    const ref = doc(db, "reservations", reservationId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('NotFound');
    if (snap.data().userId !== userId) throw new Error('Unauthorized');

    await updateDoc(ref, {
        ...data,
        updatedAt: serverTimestamp()
    });
}
