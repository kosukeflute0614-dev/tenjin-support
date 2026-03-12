'use server'

import { db } from "@/lib/firebase";
import {
    doc,
    runTransaction,
    serverTimestamp
} from "firebase/firestore";
import { revalidatePath } from 'next/cache'
import { FirestoreReservation } from "@/types";

export async function registerPayment(reservationId: string, receivedAmount: number, performanceId: string, productionId: string, userId: string) {
    if (!userId) throw new Error('Unauthorized');
    if (typeof receivedAmount !== 'number' || receivedAmount < 0) {
        throw new Error('支払い金額が不正です');
    }

    const resRef = doc(db, "reservations", reservationId);

    await runTransaction(db, async (transaction) => {
        const resSnap = await transaction.get(resRef);
        if (!resSnap.exists()) throw new Error('予約が見つかりません');
        const reservation = resSnap.data() as FirestoreReservation;
        if (reservation.userId !== userId) throw new Error('Unauthorized');
        if (reservation.status === 'CANCELED') throw new Error('キャンセル済みの予約は操作できません');

        const totalAmount = (reservation.tickets || []).reduce((sum, t) => sum + ((t.price || 0) * (t.count || 0)), 0);
        const newPaidAmount = (reservation.paidAmount || 0) + receivedAmount;

        let status = "UNPAID";
        if (newPaidAmount >= totalAmount) {
            status = "PAID";
        } else if (newPaidAmount > 0) {
            status = "PARTIAL";
        }

        transaction.update(resRef, {
            paidAmount: newPaidAmount,
            paymentStatus: status,
            updatedAt: serverTimestamp()
        });
    });

    revalidatePath(`/productions/${productionId}/checkin/${performanceId}`);
}
