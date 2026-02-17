'use server'

import { db } from "@/lib/firebase";
import {
    collection,
    addDoc,
    updateDoc,
    doc,
    getDoc,
    getDocs,
    deleteDoc,
    query,
    where,
    serverTimestamp,
    orderBy,
    arrayUnion,
    arrayRemove
} from "firebase/firestore";
import { revalidatePath } from 'next/cache'
import { Production, Performance, TicketType, Actor, FirestoreReservation } from "@/types";
import { serializeDoc, serializeDocs } from "@/lib/firestore-utils";

export async function addPerformance(formData: FormData, userId: string) {
    if (!userId) throw new Error('Unauthorized');
    const productionId = formData.get('productionId') as string
    const date = formData.get('date') as string
    const time = formData.get('time') as string
    const startTimeStr = formData.get('startTime') as string
    const capacity = parseInt(formData.get('capacity') as string)

    if (!productionId || isNaN(capacity) || capacity < 1) {
        throw new Error('Invalid input')
    }

    let startTime: Date
    if (date && time) {
        startTime = new Date(`${date}T${time}`)
    } else if (startTimeStr) {
        startTime = new Date(startTimeStr)
    } else {
        throw new Error('日時を入力してください')
    }

    const performancesRef = collection(db, "performances");
    await addDoc(performancesRef, {
        userId,
        productionId,
        startTime,
        capacity,
        receptionEndHours: 1, // Default
        receptionEndMinutes: 0, // Default
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });

    revalidatePath(`/productions/${productionId}`)
}

export async function addTicketType(formData: FormData, userId: string) {
    if (!userId) throw new Error('Unauthorized');
    const productionId = formData.get('productionId') as string
    const name = formData.get('name') as string
    const advancePrice = parseInt(formData.get('advancePrice') as string)
    const doorPrice = parseInt(formData.get('doorPrice') as string)

    if (!productionId || !name || isNaN(advancePrice) || isNaN(doorPrice)) {
        throw new Error('Invalid input')
    }

    const docRef = doc(db, "productions", productionId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error('Production not found');
    const prodData = docSnap.data();
    if (prodData.userId !== userId) throw new Error('Unauthorized');
    const newTicketType: TicketType = {
        id: crypto.randomUUID(), // Simple ID generation
        name,
        price: advancePrice, // Legacy
        advancePrice,
        doorPrice,
        isPublic: true
    };

    await updateDoc(docRef, {
        ticketTypes: arrayUnion(newTicketType),
        updatedAt: serverTimestamp()
    });

    revalidatePath(`/productions/${productionId}`)
}

export async function getProductionDetails(id: string, userId?: string | null): Promise<{ production: Production, performances: Performance[] } | null> {
    if (!id) throw new Error('ID is required');
    const docRef = doc(db, "productions", id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        const rawData = docSnap.data();

        // ログイン中の場合は所有権チェック
        if (userId && rawData.userId !== userId) {
            return null;
        }

        // 明示的なマッピング (Public View Model)
        // ゲストアクセスの場合や、セキュリティ担保のために常に必要な項目のみを抽出
        const production: Production = {
            id: docSnap.id,
            title: rawData.title || '',
            receptionStatus: rawData.receptionStatus || 'CLOSED',
            receptionStart: rawData.receptionStart ? rawData.receptionStart.toDate().toISOString() : null,
            receptionEnd: rawData.receptionEnd ? rawData.receptionEnd.toDate().toISOString() : null,
            receptionEndMode: rawData.receptionEndMode || 'MANUAL',
            receptionEndMinutes: rawData.receptionEndMinutes || 0,
            ticketTypes: (rawData.ticketTypes || []).map((tt: any) => ({
                id: tt.id,
                name: tt.name,
                price: tt.price,
                doorPrice: tt.doorPrice,
                isPublic: tt.isPublic
            })),
            // 管理用 / 個人情報のフィールド（userId等）は含めない
        } as Production;

        // 公演回の取得 (所有者の権限で取得するように userId は渡さない)
        const performances = await getPerformancesByProductionId(id);

        return { production, performances };
    }
    return null;
}

export async function getPerformancesByProductionId(productionId: string, userId?: string | null): Promise<Performance[]> {
    const performancesRef = collection(db, "performances");
    let q;

    if (userId) {
        q = query(
            performancesRef,
            where("productionId", "==", productionId)
        );
        const querySnapshot = await getDocs(q);
        const rawPerformances = serializeDocs<Performance>(querySnapshot.docs);
        return rawPerformances
            .filter(perf => perf.userId === userId) // Filter userId in memory
            .map(perf => ({
                id: perf.id,
                startTime: perf.startTime,
                capacity: perf.capacity,
                productionId: perf.productionId
            } as Performance)).sort((a, b) => {
                const timeA = a.startTime ? new Date(a.startTime).getTime() : 0;
                const timeB = b.startTime ? new Date(b.startTime).getTime() : 0;
                return timeA - timeB;
            });
    } else {
        // ゲストアクセスの場合は productionId のみで絞り込む
        q = query(
            performancesRef,
            where("productionId", "==", productionId)
        );
    }

    const querySnapshot = await getDocs(q);
    const rawPerformances = serializeDocs<Performance>(querySnapshot.docs);

    // 明示的なマッピングで必要な項目のみを返す
    return rawPerformances.map(perf => ({
        id: perf.id,
        startTime: perf.startTime,
        capacity: perf.capacity,
        productionId: perf.productionId
    } as Performance)).sort((a, b) => {
        const timeA = a.startTime ? new Date(a.startTime).getTime() : 0;
        const timeB = b.startTime ? new Date(b.startTime).getTime() : 0;
        return timeA - timeB;
    });
}

export async function updatePerformance(id: string, formData: FormData, userId: string) {
    if (!userId) throw new Error('Unauthorized');
    const date = formData.get('date') as string
    const time = formData.get('time') as string
    const capacity = parseInt(formData.get('capacity') as string)
    const productionId = formData.get('productionId') as string

    const startTime = new Date(`${date}T${time}`)

    const perfRef = doc(db, "performances", id);
    const perfSnap = await getDoc(perfRef);
    if (!perfSnap.exists()) throw new Error('Performance not found');
    const perfData = perfSnap.data();
    if (perfData.userId !== userId) throw new Error('Unauthorized');

    if (!id || isNaN(capacity) || capacity < 1 || !productionId) {
        throw new Error('Invalid input')
    }

    await updateDoc(perfRef, {
        startTime,
        capacity,
        updatedAt: serverTimestamp()
    });

    revalidatePath(`/productions/${productionId}`)
}

export async function deletePerformance(id: string, productionId: string, userId: string) {
    if (!userId) throw new Error('Unauthorized');
    if (!id || !productionId) throw new Error('Missing ID');

    const perfRef = doc(db, "performances", id);
    const perfSnap = await getDoc(perfRef);
    if (!perfSnap.exists()) throw new Error('Performance not found');
    const perfData = perfSnap.data();
    if (perfData.userId !== userId) throw new Error('Unauthorized');

    // Check for existing reservations in Firestore
    const reservationsRef = collection(db, "reservations");
    const q = query(
        reservationsRef,
        where("userId", "==", userId)
    );
    const querySnapshot = await getDocs(q);

    const hasActiveReservations = querySnapshot.docs.some(doc => {
        const data = doc.data();
        return data.performanceId === id && data.status !== 'CANCELED'; // Filter performanceId in memory
    });

    if (hasActiveReservations) {
        throw new Error('すでに予約があるため削除できません');
    }

    await deleteDoc(doc(db, "performances", id));
    revalidatePath(`/productions/${productionId}`)
}

export async function updateTicketType(id: string, formData: FormData, userId: string) {
    if (!userId) throw new Error('Unauthorized');
    const name = formData.get('name') as string
    const advancePrice = parseInt(formData.get('advancePrice') as string)
    const doorPrice = parseInt(formData.get('doorPrice') as string)
    const productionId = formData.get('productionId') as string

    if (!id || !name || isNaN(advancePrice) || isNaN(doorPrice)) {
        throw new Error('Invalid input')
    }

    const docRef = doc(db, "productions", productionId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error('Production not found');
    const prodData = docSnap.data();
    if (prodData.userId !== userId) throw new Error('Unauthorized');

    const production = prodData as Production;
    const updatedTicketTypes = production.ticketTypes.map(tt =>
        tt.id === id ? { ...tt, name, price: advancePrice, advancePrice, doorPrice } : tt
    );

    await updateDoc(docRef, {
        ticketTypes: updatedTicketTypes,
        updatedAt: serverTimestamp()
    });

    revalidatePath(`/productions/${productionId}`)
}

export async function deleteTicketType(id: string, productionId: string, userId: string) {
    if (!userId) throw new Error('Unauthorized');
    if (!id || !productionId) throw new Error('Missing ID');

    const docRef = doc(db, "productions", productionId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error('Production not found');
    const prodData = docSnap.data();
    if (prodData.userId !== userId) throw new Error('Unauthorized');
    // Check for existing reservations with this ticket type in Firestore
    const reservationsRef = collection(db, "reservations");
    const q = query(
        reservationsRef,
        where("userId", "==", userId)
    );
    const querySnapshot = await getDocs(q);

    const hasActiveTicket = querySnapshot.docs.some(doc => {
        const res = doc.data() as FirestoreReservation;
        return res.status !== 'CANCELED' && res.tickets && res.tickets.some((t: any) => t.ticketTypeId === id);
    });

    if (hasActiveTicket) {
        throw new Error('すでに予約があるため削除できません');
    }

    const productionRef = doc(db, "productions", productionId);
    const prodSnap = await getDoc(productionRef);
    if (!prodSnap.exists()) throw new Error("Production not found");

    const production = prodSnap.data() as Production;
    const updatedTicketTypes = production.ticketTypes.filter(tt => tt.id !== id);

    await updateDoc(productionRef, {
        ticketTypes: updatedTicketTypes,
        updatedAt: serverTimestamp()
    });

    revalidatePath(`/productions/${productionId}`)
}
