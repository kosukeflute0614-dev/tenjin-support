'use server'

import { db } from "@/lib/firebase";
import {
    collection,
    addDoc,
    getDoc,
    updateDoc,
    doc,
    serverTimestamp,
    increment,
    runTransaction
} from "firebase/firestore";
import { revalidatePath } from 'next/cache'
import { Production } from "@/types";
import { validateTicketInput } from '@/lib/capacity-utils';

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

    // 入力バリデーション
    const ticketArray = activeTicketCounts.map(([_, count]) => ({ count }));
    const { error: inputError } = validateTicketInput(ticketArray);
    if (inputError) throw new Error(inputError);

    // 券種データの取得（Production に埋め込まれている）
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

    // 予約の作成 (source: SAME_DAY, checkedInAt: now) — トランザクションで原子的に実行
    const performanceRef = doc(db, "performances", performanceId);
    const newReservationRef = doc(collection(db, "reservations"));

    await runTransaction(db, async (transaction) => {
        // 公演回の存在確認
        const perfSnap = await transaction.get(performanceRef);
        if (!perfSnap.exists()) throw new Error('公演回が見つかりません');

        transaction.set(newReservationRef, {
            userId,
            productionId,
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
        });

        transaction.update(performanceRef, { bookedCount: increment(totalQuantity) });
    });

    revalidatePath(`/productions/${productionId}/checkin/${performanceId}`)
}
