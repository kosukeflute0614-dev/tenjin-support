'use server'

import { db } from "@/lib/firebase";
import {
    doc,
    getDoc,
    updateDoc,
    serverTimestamp
} from "firebase/firestore";
import { revalidatePath } from 'next/cache'
import { FirestoreReservation } from "@/types";

export async function registerPayment(reservationId: string, receivedAmount: number, performanceId: string, productionId: string, userId: string) {
    if (!userId) throw new Error('Unauthorized');
    const resRef = doc(db, "reservations", reservationId);
    const resSnap = await getDoc(resRef);

    if (!resSnap.exists()) throw new Error('予約が見つかりません')
    const reservation = { id: resSnap.id, ...resSnap.data() } as FirestoreReservation;
    if (reservation.userId !== userId) throw new Error('Unauthorized');

    const totalAmount = reservation.tickets.reduce((sum, t) => sum + (t.price * t.count), 0)
    const newPaidAmount = (reservation.paidAmount || 0) + receivedAmount

    let status = "UNPAID"
    if (newPaidAmount >= totalAmount) {
        status = "PAID"
    } else if (newPaidAmount > 0) {
        status = "PARTIALLY_PAID"
    }

    await updateDoc(resRef, {
        paidAmount: newPaidAmount,
        paymentStatus: status,
        updatedAt: serverTimestamp()
    })

    revalidatePath(`/productions/${productionId}/checkin/${performanceId}`)
}
