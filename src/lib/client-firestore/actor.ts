import { db } from '@/lib/firebase';
import { collection, doc, getDoc, updateDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';

/**
 * 役者（窓口）を追加する（クライアント側）
 */
export async function addActorClient(productionId: string, name: string, userId: string): Promise<void> {
    if (!productionId || !name || !userId) return;

    try {
        const docRef = doc(db, "productions", productionId);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) throw new Error('Production not found');
        if (docSnap.data().userId !== userId) throw new Error('Unauthorized');

        const newActor = {
            id: doc(collection(db, "_temp_")).id,
            name
        };

        await updateDoc(docRef, {
            actors: arrayUnion(newActor),
            updatedAt: serverTimestamp()
        });
    } catch (error) {
        console.error("[client-firestore] addActorClient error:", error);
        throw error;
    }
}

/**
 * 役者（窓口）を削除する（クライアント側）
 */
export async function deleteActorClient(productionId: string, actorId: string, userId: string): Promise<void> {
    if (!productionId || !actorId || !userId) return;

    try {
        const docRef = doc(db, "productions", productionId);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) throw new Error('Production not found');
        if (docSnap.data().userId !== userId) throw new Error('Unauthorized');

        const currentActors = docSnap.data().actors || [];
        const updatedActors = currentActors.filter((a: any) => a.id !== actorId);

        await updateDoc(docRef, {
            actors: updatedActors,
            updatedAt: serverTimestamp()
        });
    } catch (error) {
        console.error("[client-firestore] deleteActorClient error:", error);
        throw error;
    }
}
