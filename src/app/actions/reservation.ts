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
    orderBy
} from "firebase/firestore";
import { revalidatePath } from "next/cache";
import { FirestoreReservation, Production } from "@/types";
import { serializeDoc, serializeDocs } from "@/lib/firestore-utils";

export async function getBookingOptions(activeProductionId?: string, userId?: string): Promise<Production[]> {
    let prods: Production[] = [];

    try {
        if (!userId) {
            if (activeProductionId) {
                const docRef = doc(db, "productions", activeProductionId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    prods = [serializeDoc<Production>(docSnap)];
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
                    const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
                    const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
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
                    const tA = a.startTime ? (a.startTime.toDate ? a.startTime.toDate().getTime() : new Date(a.startTime).getTime()) : 0;
                    const tB = b.startTime ? (b.startTime.toDate ? b.startTime.toDate().getTime() : new Date(b.startTime).getTime()) : 0;
                    return tA - tB;
                })
        }));

    } catch (error) {
        console.error("Error getting booking options from Firestore:", error);
        return prods.map(p => ({ ...p, performances: [] }));
    }
}

export async function createReservation(data: FirestoreReservation) {
    try {
        // セキュリティ・合鍵アクセスのために公演ドキュメントから現在のスタッフ用トークンを取得
        const productionRef = doc(db, "productions", data.productionId);
        const productionSnap = await getDoc(productionRef);
        const staffToken = productionSnap.exists() ? (productionSnap.data().staffToken || null) : null;

        const reservationsRef = collection(db, "reservations");
        const newDoc = await addDoc(reservationsRef, {
            ...data,
            staffToken, // 合鍵情報を予約にコピー（Firestoreルールでの検索用）
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });

        // 管理画面のリスト等を更新するために必要
        revalidatePath('/reservations');
        revalidatePath('/');

        return { success: true, id: newDoc.id };
    } catch (error) {
        console.error("Error creating reservation in Firestore:", error);
        throw new Error("予約の作成に失敗しました。");
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
            if (count > 0) {
                data.tickets.push({
                    ticketTypeId: key.replace('ticket_', ''),
                    count: count
                });
            }
        }
    });

    if (data.tickets.length === 0) {
        throw new Error("券種を1枚以上選択してください。");
    }

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
                    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
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
            const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
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
    } catch (error) {
        console.error("Error canceling reservation in Firestore:", error);
        throw new Error("予約のキャンセルに失敗しました。");
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
        const resSnap = await getDoc(reservationRef);
        if (!resSnap.exists()) throw new Error('Reservation not found');
        const resData = resSnap.data();
        if (resData.userId !== userId) throw new Error('Unauthorized');

        await updateDoc(reservationRef, {
            status: 'CONFIRMED',
            updatedAt: serverTimestamp(),
        });

        revalidatePath('/');
        revalidatePath('/reservations');
        return { success: true };
    } catch (error) {
        console.error("Error restoring reservation in Firestore:", error);
        throw new Error("復元に失敗しました。");
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
