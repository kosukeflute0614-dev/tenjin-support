'use server';

import { db } from "@/lib/firebase";
import {
    collection,
    addDoc,
    updateDoc,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    serverTimestamp,
    runTransaction
} from "firebase/firestore";
import { revalidatePath } from "next/cache";
import { FirestoreReservation, Production } from "@/types";
import { validateTicketInput } from '@/lib/capacity-utils';
import { serializeDoc, serializeDocs, toDate } from "@/lib/firestore-utils";
import { sendReservationConfirmation } from "@/lib/email";

export async function getBookingOptions(activeProductionId?: string, userId?: string): Promise<Production[]> {
    let prods: Production[] = [];

    try {
        if (!userId) {
            if (activeProductionId) {
                const docRef = doc(db, "productions", activeProductionId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const prod = serializeDoc<Production>(docSnap);
                    if (prod.receptionStatus !== 'OPEN') {
                        return []; // SEC-07: Block access to closed productions
                    }
                    prods = [prod];
                }
            }
        } else {
            if (activeProductionId) {
                const docRef = doc(db, "productions", activeProductionId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const prod = serializeDoc<Production>(docSnap);
                    if (prod.userId === userId) prods = [prod];
                }
            } else {
                const productionsRef = collection(db, "productions");
                const q = query(productionsRef, where("userId", "==", userId));
                const querySnapshot = await getDocs(q);
                prods = serializeDocs<Production>(querySnapshot.docs);
                prods.sort((a, b) => {
                    const timeA = a.updatedAt ? toDate(a.updatedAt!).getTime() : 0;
                    const timeB = b.updatedAt ? toDate(b.updatedAt!).getTime() : 0;
                    return timeB - timeA;
                });
            }
        }

        if (prods.length === 0) return [];

        // 全ての公演回を一括取得
        const performancesRef = collection(db, "performances");
        let perfQ;
        if (userId) {
            perfQ = query(performancesRef, where("userId", "==", userId));
        } else {
            // userIdがない場合は、取得できたprods[0]に関連するものだけ取得
            perfQ = query(performancesRef, where("productionId", "==", prods[0].id));
        }

        const perfSnap = await getDocs(perfQ);
        const allPerfs = serializeDocs<any>(perfSnap.docs);

        // 公演に公演回を紐付ける
        return prods.map(p => ({
            ...p,
            performances: allPerfs.filter(perf => perf.productionId === p.id)
                .sort((a, b) => {
                    const tA = a.startTime ? toDate(a.startTime).getTime() : 0;
                    const tB = b.startTime ? toDate(b.startTime).getTime() : 0;
                    return tA - tB;
                })
        }));

    } catch (error) {
        console.error("Error getting booking options from Firestore:", error);
        return prods.map(p => ({ ...p, performances: [] }));
    }
}

export async function createReservation(data: FirestoreReservation) {
    // 入力バリデーション
    const { error: inputError } = validateTicketInput(data.tickets || []);
    if (inputError) throw new Error(inputError);

    const newResRef = await addDoc(collection(db, "reservations"), {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
    const newId = newResRef.id;

    // Transaction 外: revalidatePath + メール送信（既存ロジック維持）
    revalidatePath('/reservations');
    revalidatePath('/');

    if (data.customerEmail) {
        try {
            const [productionSnap, performanceSnap] = await Promise.all([
                getDoc(doc(db, "productions", data.productionId)),
                getDoc(doc(db, "performances", data.performanceId)),
            ]);
            const production = productionSnap.exists() ? productionSnap.data() as Production : null;
            const performanceData = performanceSnap.exists() ? performanceSnap.data() : null;
            if (production && performanceData) {
                await sendReservationConfirmation({
                    reservation: data,
                    reservationId: newId,
                    productionTitle: production.title,
                    performanceStartTime: performanceData.startTime,
                    ticketTypes: production.ticketTypes || [],
                    venue: production.venue,
                    organizerEmail: production.organizerEmail,
                    template: production.emailTemplates?.confirmation || null,
                    confirmationEnabled: production.emailTemplates?.confirmationEnabled,
                });
            }
        } catch (emailError) {
            console.error("メール送信エラー（予約自体は成功）:", emailError);
        }
    }

    return { success: true, id: newId };
}

/**
 * 予約作成後にメール送信のみ行うサーバーアクション
 * （クライアント側で予約を作成した後に呼び出す）
 */
export async function sendReservationEmail(reservationData: {
    customerEmail?: string | null;
    customerName: string;
    productionId: string;
    performanceId: string;
    tickets: { ticketTypeId: string; count: number; price: number }[];
    reservationId: string;
}) {
    if (!reservationData.customerEmail) return;

    try {
        const [productionSnap, performanceSnap] = await Promise.all([
            getDoc(doc(db, "productions", reservationData.productionId)),
            getDoc(doc(db, "performances", reservationData.performanceId)),
        ]);
        const production = productionSnap.exists() ? productionSnap.data() as Production : null;
        const performanceData = performanceSnap.exists() ? performanceSnap.data() : null;
        if (production && performanceData) {
            await sendReservationConfirmation({
                reservation: reservationData as any,
                reservationId: reservationData.reservationId,
                productionTitle: production.title,
                performanceStartTime: performanceData.startTime,
                ticketTypes: production.ticketTypes || [],
                venue: production.venue,
                organizerEmail: production.organizerEmail,
                template: production.emailTemplates?.confirmation || null,
                confirmationEnabled: production.emailTemplates?.confirmationEnabled,
            });
        }
    } catch (emailError) {
        console.error("メール送信エラー:", emailError);
    }
}

export async function createReservationAction(formData: FormData, userId: string): Promise<void> {
    if (!userId) throw new Error('Unauthorized');
    // This is a simplified wrapper for form actions
    const data: any = {
        status: 'CONFIRMED',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        source: 'PRE_RESERVATION',
        tickets: [],
        userId: userId // Set user id here
    };

    formData.forEach((value, key) => {
        if (key.startsWith('ticket_')) {
            const count = parseInt(value as string);
            if (count > 0) {
                data.tickets.push({
                    ticketTypeId: key.replace('ticket_', ''),
                    count: count
                });
            }
        } else {
            data[key] = value;
        }
    });

    await createReservation(data as FirestoreReservation);
}

// Alias for PublicReservationForm if it expects this name
export async function createPublicReservation(formData: FormData): Promise<void> {
    const performanceId = formData.get('performanceId') as string;
    if (!performanceId) throw new Error("公演回を選択してください。");

    // Find owner ID from performance
    const perfRef = doc(db, "performances", performanceId);
    const perfSnap = await getDoc(perfRef);
    if (!perfSnap.exists()) throw new Error("公演情報が見つかりません。");
    const perfData = perfSnap.data();
    const ownerId = perfData.userId;

    if (!ownerId) throw new Error("公演のオーナー情報が見つかりません。");

    const data: any = {
        status: 'CONFIRMED',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        source: 'PUBLIC_FORM',
        tickets: [],
        userId: ownerId,
        performanceId: performanceId,
        customerName: formData.get('customerName'),
        customerNameKana: formData.get('customerNameKana'),
        customerEmail: formData.get('customerEmail'),
        remarks: formData.get('remarks')
    };

    formData.forEach((value, key) => {
        if (key.startsWith('ticket_')) {
            const count = parseInt(value as string);
            if (!isNaN(count) && count > 0) {
                data.tickets.push({
                    ticketTypeId: key.replace('ticket_', ''),
                    count: count
                });
            }
        }
    });

    // 入力バリデーション
    const { error: ticketError } = validateTicketInput(data.tickets);
    if (ticketError) throw new Error(ticketError);

    await createReservation(data as FirestoreReservation);
}

export async function getReservations(performanceId: string | undefined, userId: string): Promise<FirestoreReservation[]> {
    if (!userId) return [];
    try {
        const reservationsRef = collection(db, "reservations");
        let q;

        if (performanceId) {
            q = query(
                reservationsRef,
                where("performanceId", "==", performanceId)
            );
            const querySnapshot = await getDocs(q);
            const res = serializeDocs<FirestoreReservation>(querySnapshot.docs);
            return res
                .filter(r => r.userId === userId) // Filter userId in memory
                .sort((a, b) => {
                    const timeA = a.createdAt ? toDate(a.createdAt!).getTime() : 0;
                    const timeB = b.createdAt ? toDate(b.createdAt!).getTime() : 0;
                    return timeB - timeA;
                });
        } else {
            q = query(
                reservationsRef,
                where("userId", "==", userId)
            );
        }

        const querySnapshot = await getDocs(q);
        const res = serializeDocs<FirestoreReservation>(querySnapshot.docs);
        return res.sort((a, b) => {
            const timeA = a.createdAt ? toDate(a.createdAt!).getTime() : 0;
            const timeB = b.createdAt ? toDate(b.createdAt!).getTime() : 0;
            return timeB - timeA;
        });
    } catch (error) {
        console.error("Error getting reservations from Firestore:", error);
        return [];
    }
}

export async function cancelReservation(reservationId: string, userId: string) {
    if (!userId) throw new Error('Unauthorized');
    try {
        const reservationRef = doc(db, "reservations", reservationId);
        const resSnap = await getDoc(reservationRef);
        if (!resSnap.exists()) throw new Error('Reservation not found');
        const resData = resSnap.data();
        if (resData.userId !== userId) throw new Error('Unauthorized');

        await updateDoc(reservationRef, {
            status: 'CANCELED',
            updatedAt: serverTimestamp(),
        });

        revalidatePath('/');
        revalidatePath('/reservations');
        return { success: true };
    } catch (error: any) {
        console.error("Error canceling reservation in Firestore:", error);
        throw new Error(`予約のキャンセルに失敗しました: ${error?.message || error}`);
    }
}

export async function updateReservation(reservationId: string, formData: FormData, userId: string) {
    if (!userId) throw new Error('Unauthorized');
    try {
        const reservationRef = doc(db, "reservations", reservationId);
        const resSnap = await getDoc(reservationRef);
        if (!resSnap.exists()) throw new Error('Reservation not found');
        const resData = resSnap.data();
        if (resData.userId !== userId) throw new Error('Unauthorized');

        const data: any = {};
        formData.forEach((value, key) => {
            if (key.startsWith('ticket_')) {
                // Handle ticket counts if necessary
            } else {
                data[key] = value;
            }
        });

        await updateDoc(reservationRef, {
            ...data,
            updatedAt: serverTimestamp(),
        });

        revalidatePath('/');
        revalidatePath('/reservations');
        return { success: true };
    } catch (error) {
        console.error("Error updating reservation in Firestore:", error);
        throw new Error("更新に失敗しました。");
    }
}

export async function restoreReservation(reservationId: string, userId: string) {
    if (!userId) throw new Error('Unauthorized');
    try {
        const reservationRef = doc(db, "reservations", reservationId);

        // トランザクション内で最新データ確認 + 書き込み
        await runTransaction(db, async (transaction) => {
            const resSnap = await transaction.get(reservationRef);
            if (!resSnap.exists()) throw new Error('Reservation not found');
            const resData = resSnap.data();
            if (resData.userId !== userId) throw new Error('Unauthorized');

            transaction.update(reservationRef, {
                status: 'CONFIRMED',
                updatedAt: serverTimestamp(),
            });
        });

        revalidatePath('/');
        revalidatePath('/reservations');
        return { success: true };
    } catch (error) {
        console.error("Error restoring reservation in Firestore:", error);
        throw error;
    }
}

export async function confirmReservation(reservationId: string, userId: string) {
    if (!userId) throw new Error('Unauthorized');
    try {
        const reservationRef = doc(db, "reservations", reservationId);
        const resSnap = await getDoc(reservationRef);
        if (!resSnap.exists()) throw new Error('Reservation not found');
        const resData = resSnap.data();
        if (resData.userId !== userId) throw new Error('Unauthorized');

        await updateDoc(reservationRef, {
            status: 'CONFIRMED',
            updatedAt: serverTimestamp(),
        });

        revalidatePath('/');
        return { success: true };
    } catch (error) {
        console.error("Error confirming reservation in Firestore:", error);
        throw new Error("確定に失敗しました。");
    }
}
