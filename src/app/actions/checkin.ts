'use server'

import { db } from "@/lib/firebase";
import {
    doc,
    getDoc,
    runTransaction,
    serverTimestamp,
    collection,
    addDoc
} from "firebase/firestore";
import { revalidatePath } from 'next/cache'
import { FirestoreReservation } from "@/types";

export async function addCheckedInTickets(reservationId: string, count: number, performanceId: string, productionId: string, userId: string) {
    if (!userId) throw new Error('Unauthorized');
    const resRef = doc(db, "reservations", reservationId);

    await runTransaction(db, async (transaction) => {
        const resSnap = await transaction.get(resRef);
        if (!resSnap.exists()) throw new Error('予約が見つかりません');
        const reservation = resSnap.data() as FirestoreReservation;
        if (reservation.userId !== userId) throw new Error('Unauthorized');

        const totalTickets = (reservation.tickets || []).reduce((sum: number, t: any) => sum + (t.count || 0), 0)
        const newCheckedInTickets = Math.min((reservation.checkedInTickets || 0) + count, totalTickets)

        let status = "PARTIALLY_CHECKED_IN"
        if (newCheckedInTickets === totalTickets) {
            status = "CHECKED_IN"
        } else if (newCheckedInTickets === 0) {
            status = "NOT_CHECKED_IN"
        }

        transaction.update(resRef, {
            checkedInTickets: newCheckedInTickets,
            checkinStatus: status,
            checkedInAt: reservation.checkedInAt || serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        // Add log entry (logs are in a separate collection for now, as Prisma had a separate table)
        const logsRef = collection(db, "checkinLogs");
        transaction.set(doc(logsRef), {
            reservationId,
            type: 'CHECKIN',
            count: count,
            createdAt: serverTimestamp()
        });
    });

    revalidatePath(`/productions/${productionId}/checkin/${performanceId}`)
}

export async function resetCheckIn(reservationId: string, performanceId: string, productionId: string, userId: string) {
    if (!userId) throw new Error('Unauthorized');
    const resRef = doc(db, "reservations", reservationId);

    await runTransaction(db, async (transaction) => {
        const resSnap = await transaction.get(resRef);
        if (!resSnap.exists()) throw new Error('予約が見つかりません');
        const reservation = resSnap.data() as FirestoreReservation;
        if (reservation.userId !== userId) throw new Error('Unauthorized');

        // Reset tickets' paidCount
        const updatedTickets = reservation.tickets.map(t => ({
            ...t,
            paidCount: 0
        }));

        transaction.update(resRef, {
            checkedInTickets: 0,
            checkinStatus: "NOT_CHECKED_IN",
            checkedInAt: null,
            paidAmount: 0,
            paymentStatus: "UNPAID",
            tickets: updatedTickets,
            updatedAt: serverTimestamp()
        });

        const logsRef = collection(db, "checkinLogs");
        transaction.set(doc(logsRef), {
            reservationId,
            type: 'RESET',
            count: reservation.checkedInTickets || 0,
            createdAt: serverTimestamp()
        });
    });

    revalidatePath(`/productions/${productionId}/checkin/${performanceId}`)
}

export async function processCheckinWithPayment(
    reservationId: string,
    checkinCount: number,
    additionalPaidAmount: number,
    paymentBreakdown: { [ticketTypeId: string]: number },
    performanceId: string,
    productionId: string,
    userId: string
) {
    if (!userId) throw new Error('Unauthorized');
    const resRef = doc(db, "reservations", reservationId);

    await runTransaction(db, async (transaction) => {
        const resSnap = await transaction.get(resRef);
        if (!resSnap.exists()) throw new Error('予約が見つかりません');
        const reservation = resSnap.data() as FirestoreReservation;
        if (reservation.userId !== userId) throw new Error('Unauthorized');

        const totalTickets = (reservation.tickets || []).reduce((sum: number, t: any) => sum + (t.count || 0), 0)
        const totalAmount = (reservation.tickets || []).reduce((sum: number, t: any) => sum + (t.price * t.count), 0)

        const newCheckedInTickets = Math.min((reservation.checkedInTickets || 0) + checkinCount, totalTickets)
        const newPaidAmount = (reservation.paidAmount || 0) + additionalPaidAmount

        let checkinStatus = "PARTIALLY_CHECKED_IN"
        if (newCheckedInTickets === totalTickets) {
            checkinStatus = "CHECKED_IN"
        } else if (newCheckedInTickets === 0) {
            checkinStatus = "NOT_CHECKED_IN"
        }

        let paymentStatus = "UNPAID"
        if (newPaidAmount >= totalAmount) {
            paymentStatus = "PAID"
        } else if (newPaidAmount > 0) {
            paymentStatus = "PARTIALLY_PAID"
        }

        // Update individual ticket types' paidCount within the tickets array
        const updatedTickets = reservation.tickets.map(t => {
            const added = paymentBreakdown[t.ticketTypeId] || 0;
            return {
                ...t,
                paidCount: (t.paidCount || 0) + added
            };
        });

        transaction.update(resRef, {
            checkedInTickets: newCheckedInTickets,
            checkinStatus: checkinStatus,
            paidAmount: newPaidAmount,
            paymentStatus: paymentStatus,
            tickets: updatedTickets,
            checkedInAt: reservation.checkedInAt || serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        const logsRef = collection(db, "checkinLogs");
        transaction.set(doc(logsRef), {
            reservationId,
            type: 'CHECKIN',
            count: checkinCount,
            paymentInfo: JSON.stringify(paymentBreakdown),
            createdAt: serverTimestamp()
        });
    });

    revalidatePath(`/productions/${productionId}/checkin/${performanceId}`)
}

export async function processPartialReset(
    reservationId: string,
    resetCheckinCount: number,
    refundAmount: number,
    refundBreakdown: { [ticketTypeId: string]: number },
    performanceId: string,
    productionId: string,
    userId: string
) {
    if (!userId) throw new Error('Unauthorized');
    const resRef = doc(db, "reservations", reservationId);

    await runTransaction(db, async (transaction) => {
        const resSnap = await transaction.get(resRef);
        if (!resSnap.exists()) throw new Error('予約が見つかりません');
        const reservation = resSnap.data() as FirestoreReservation;
        if (reservation.userId !== userId) throw new Error('Unauthorized');

        const totalTickets = (reservation.tickets || []).reduce((sum: number, t: any) => sum + (t.count || 0), 0)
        const totalAmount = (reservation.tickets || []).reduce((sum: number, t: any) => sum + (t.price * t.count), 0)

        const newCheckedInTickets = Math.max((reservation.checkedInTickets || 0) - resetCheckinCount, 0)
        const newPaidAmount = Math.max((reservation.paidAmount || 0) - refundAmount, 0)

        let checkinStatus = "PARTIALLY_CHECKED_IN"
        if (newCheckedInTickets === totalTickets) {
            checkinStatus = "CHECKED_IN"
        } else if (newCheckedInTickets === 0) {
            checkinStatus = "NOT_CHECKED_IN"
        }

        let paymentStatus = "UNPAID"
        if (newPaidAmount >= totalAmount) {
            paymentStatus = "PAID"
        } else if (newPaidAmount > 0) {
            paymentStatus = "PARTIALLY_PAID"
        }

        // Update individual ticket types' paidCount (decrement)
        const updatedTickets = reservation.tickets.map(t => {
            const subtracted = refundBreakdown[t.ticketTypeId] || 0;
            return {
                ...t,
                paidCount: Math.max((t.paidCount || 0) - subtracted, 0)
            };
        });

        transaction.update(resRef, {
            checkedInTickets: newCheckedInTickets,
            checkinStatus: checkinStatus,
            paidAmount: newPaidAmount,
            paymentStatus: paymentStatus,
            tickets: updatedTickets,
            checkedInAt: newCheckedInTickets === 0 ? null : reservation.checkedInAt,
            updatedAt: serverTimestamp()
        });

        const logsRef = collection(db, "checkinLogs");
        transaction.set(doc(logsRef), {
            reservationId,
            type: 'RESET',
            count: resetCheckinCount,
            paymentInfo: JSON.stringify(Object.fromEntries(
                Object.entries(refundBreakdown).map(([k, v]) => [k, -v])
            )),
            createdAt: serverTimestamp()
        });
    });

    revalidatePath(`/productions/${productionId}/checkin/${performanceId}`)
}
