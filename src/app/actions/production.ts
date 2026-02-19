'use server'

import { db } from "@/lib/firebase";
import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    serverTimestamp
} from "firebase/firestore";
import { Production } from "@/types";
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { serializeDoc, serializeDocs } from "@/lib/firestore-utils";

export async function getProductions(userId: string): Promise<Production[]> {
    if (!userId) return [];
    try {
        const productionsRef = collection(db, "productions");
        const q = query(
            productionsRef,
            where("userId", "==", userId)
        );
        const querySnapshot = await getDocs(q);

        const prods = serializeDocs<Production>(querySnapshot.docs);
        return prods.sort((a, b) => {
            const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            return timeB - timeA;
        });
    } catch (error) {
        console.error("Error getting productions from Firestore:", error);
        throw error;
    }
}

export async function getProductionById(id: string, userId: string): Promise<Production | null> {
    if (!userId) return null;
    try {
        const docRef = doc(db, "productions", id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.userId !== userId) return null; // Security check
            return serializeDoc<Production>(docSnap);
        }
        return null;
    } catch (error) {
        console.error("Error getting production by id from Firestore:", error);
        return null;
    }
}

export async function createProduction(formData: FormData, userId: string) {
    if (!userId) throw new Error('Unauthorized');
    const title = formData.get('title') as string
    const orgId = "default_org_id";

    if (!title) {
        throw new Error('Title is required')
    }

    const productionsRef = collection(db, "productions");
    const newDoc = await addDoc(productionsRef, {
        userId,
        organizationId: orgId,
        title,
        ticketTypes: [],
        actors: [],
        receptionStatus: 'CLOSED',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });

    revalidatePath('/productions')
    redirect('/productions')
}

export async function updateProduction(id: string, formData: FormData) {
    const title = formData.get('title') as string

    const productionRef = doc(db, "productions", id);
    await updateDoc(productionRef, {
        title,
        updatedAt: serverTimestamp()
    });

    revalidatePath(`/productions/${id}`)
    revalidatePath('/productions')
}

export async function deleteProduction(id: string) {
    await deleteDoc(doc(db, "productions", id));
    revalidatePath('/productions')
}

export async function updateReceptionStatus(id: string, status: 'OPEN' | 'CLOSED') {
    const productionRef = doc(db, "productions", id);
    await updateDoc(productionRef, {
        receptionStatus: status,
        updatedAt: serverTimestamp()
    });

    revalidatePath(`/productions/${id}/reception`)
    revalidatePath(`/productions/${id}`)
    revalidatePath(`/book/${id}`)
    revalidatePath('/')
}

export async function updateReceptionStart(id: string, startStr: string | null) {
    const productionRef = doc(db, "productions", id);
    await updateDoc(productionRef, {
        receptionStart: startStr ? new Date(startStr) : null,
        receptionStatus: 'CLOSED',
        updatedAt: serverTimestamp()
    });

    revalidatePath(`/productions/${id}/reception`)
    revalidatePath(`/productions/${id}`)
    revalidatePath(`/book/${id}`)
    revalidatePath('/')
}

export async function updateReceptionEnd(id: string, formData: FormData) {
    const endStr = formData.get('receptionEnd') as string
    const mode = formData.get('receptionEndMode') as string
    const minutes = parseInt(formData.get('receptionEndMinutes') as string || '0', 10)

    const productionRef = doc(db, "productions", id);
    await updateDoc(productionRef, {
        receptionEnd: endStr ? new Date(endStr) : null,
        receptionEndMode: mode || 'MANUAL',
        receptionEndMinutes: minutes || 0,
        receptionStatus: 'CLOSED',
        updatedAt: serverTimestamp()
    });

    revalidatePath(`/productions/${id}/reception`)
    revalidatePath(`/productions/${id}`)
    revalidatePath(`/book/${id}`)
    revalidatePath('/')
}

export async function updateReceptionSchedule(id: string, formData: FormData) {
    const startStr = formData.get('receptionStart') as string
    const endStr = formData.get('receptionEnd') as string
    const mode = formData.get('receptionEndMode') as string
    const minutes = parseInt(formData.get('receptionEndMinutes') as string || '0', 10)

    const productionRef = doc(db, "productions", id);
    await updateDoc(productionRef, {
        receptionStart: startStr ? new Date(startStr) : null,
        receptionEnd: endStr ? new Date(endStr) : null,
        receptionEndMode: mode || 'MANUAL',
        receptionEndMinutes: minutes || 0,
        updatedAt: serverTimestamp()
    });

    revalidatePath(`/book/${id}`)
    revalidatePath('/')
}

export async function updateProductionCustomId(id: string, customId: string) {
    const productionRef = doc(db, "productions", id);
    await updateDoc(productionRef, {
        customId: customId || null,
        updatedAt: serverTimestamp()
    });

    revalidatePath(`/productions/${id}`)
    revalidatePath('/productions')
    if (customId) {
        revalidatePath(`/book/${customId}`)
    }
    revalidatePath(`/book/${id}`)
}
