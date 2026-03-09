'use server'

import { db } from "@/lib/firebase";
import {
    collection,
    addDoc,
    getDoc,
    getDocs,
    doc,
    query,
    where,
    serverTimestamp
} from "firebase/firestore";
import { revalidatePath } from 'next/cache'
import { Performance, Production, FirestoreReservation } from "@/types";

export async function createSameDayTicket(formData: FormData, userId: string) {
    if (!userId) throw new Error('Unauthorized')
    const performanceId = formData.get('performanceId') as string
    const productionId = formData.get('productionId') as string
    const customerName = formData.get('customerName') as string
    const customerNameKana = formData.get('customerNameKana') as string || ""
    const breakdownJson = formData.get('breakdown') as string

    if (!performanceId || !customerName || !breakdownJson || !productionId) {
        throw new Error('入力内容が不足しています')
    }

    const breakdown: { [ticketTypeId: string]: number } = JSON.parse(breakdownJson)
    const activeTicketCounts = Object.entries(breakdown).filter(([_, count]) => count > 0)

    if (activeTicketCounts.length === 0) {
        throw new Error('枚数が指定されていません')
    }

    const totalQuantity = activeTicketCounts.reduce((sum, [_, count]) => sum + count, 0)

    // 1. 公演の残数チェック
    const performanceRef = doc(db, "performances", performanceId);
    const performanceSnap = await getDoc(performanceRef);
    if (!performanceSnap.exists()) throw new Error('公演が見つかりません')
    const performance = { id: performanceSnap.id, ...performanceSnap.data() } as Performance;
    if (performance.userId !== userId) throw new Error('Unauthorized'); // Security check

    const reservationsRef = collection(db, "reservations");
    const qRes = query(
        reservationsRef,
        where("userId", "==", userId)
    );
    const resSnapshot = await getDocs(qRes);

    const bookedCount = resSnapshot.docs.reduce((sum, doc) => {
        const res = doc.data() as FirestoreReservation;
        if (res.performanceId !== performanceId) return sum; // Filter performanceId in memory
        if (res.status === 'CANCELED') return sum;
        const ticketCount = res.tickets?.reduce((tSum: number, t: any) => tSum + (t.count || 0), 0) || 0;
        return sum + ticketCount;
    }, 0);

    const remaining = performance.capacity - bookedCount

    if (totalQuantity > remaining) {
        throw new Error(`枚数が販売可能数（${remaining}枚）を超えています`)
    }

    // 2. 券種データの取得（Production に埋め込まれている）
    const productionRef = doc(db, "productions", productionId);
    const productionSnap = await getDoc(productionRef);
    if (!productionSnap.exists()) throw new Error('プロダクションが見つかりません')
    const production = productionSnap.data() as Production;

    let totalAmount = 0
    const ticketDatas = activeTicketCounts.map(([id, count]) => {
        const tt = production.ticketTypes.find(t => t.id === id)
        if (!tt) throw new Error('券種が見つかりません')
        totalAmount += (tt.doorPrice ?? tt.price) * count
        return {
            ticketTypeId: id,
            count,
            price: tt.doorPrice ?? tt.price
        }
    })

    // 3. 予約の作成 (source: SAME_DAY, checkedInAt: now)
    await addDoc(collection(db, "reservations"), {
        userId, // Organizer ID
        performanceId,
        customerName,
        customerNameKana,
        source: "SAME_DAY",
        checkedInAt: serverTimestamp(),
        checkedInTickets: totalQuantity,
        checkinStatus: "CHECKED_IN",
        status: "CONFIRMED",
        paymentStatus: "PAID",
        paidAmount: totalAmount,
        tickets: ticketDatas,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    })

    revalidatePath(`/productions/${productionId}/checkin/${performanceId}`)
}
