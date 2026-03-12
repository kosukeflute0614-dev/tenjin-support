import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

/**
 * 受付ステータスを更新する（クライアント版）
 */
export async function updateReceptionStatusClient(id: string, status: 'OPEN' | 'CLOSED', userId: string) {
    if (!userId) throw new Error('Unauthorized');
    const ref = doc(db, "productions", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('NotFound');
    if (snap.data().userId !== userId) throw new Error('Unauthorized');

    await updateDoc(ref, {
        receptionStatus: status,
        updatedAt: serverTimestamp()
    });
}

/**
 * 受付スケジュールを一括更新する（クライアント版）
 */
export async function updateReceptionScheduleClient(
    id: string,
    data: {
        receptionStart?: Date | string | null;
        receptionEnd?: Date | string | null;
        receptionEndMode?: string;
        receptionEndMinutes?: number;
    },
    userId: string
) {
    if (!userId) throw new Error('Unauthorized');
    const ref = doc(db, "productions", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('NotFound');
    if (snap.data().userId !== userId) throw new Error('Unauthorized');

    const updateData: any = {
        updatedAt: serverTimestamp()
    };

    if (data.receptionStart !== undefined) {
        updateData.receptionStart = data.receptionStart ? new Date(data.receptionStart) : null;
    }
    if (data.receptionEnd !== undefined) {
        updateData.receptionEnd = data.receptionEnd ? new Date(data.receptionEnd) : null;
    }
    if (data.receptionEndMode !== undefined) {
        updateData.receptionEndMode = data.receptionEndMode;
    }
    if (data.receptionEndMinutes !== undefined) {
        updateData.receptionEndMinutes = data.receptionEndMinutes;
    }

    await updateDoc(ref, updateData);
}
