import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { Production, Performance } from '@/types';
import { serializeDocs } from '@/lib/firestore-utils';

/**
 * クライアント側で直接 Firestore から公演詳細を取得する。
 * サーバーアクション経由ではなく、ブラウザ上で実行されるため、
 * Firebase Auth の認証状態が正しく使われ、セキュリティルールに準拠する。
 */
export async function fetchProductionDetailsClient(
    productionId: string,
    userId: string
): Promise<{ production: Production; performances: Performance[] } | null> {
    const docRef = doc(db, "productions", productionId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) return null;

    const rawData = docSnap.data();
    if (rawData.userId !== userId) return null;

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
    } as Production;

    // 公演回の取得
    const performancesRef = collection(db, "performances");
    const q = query(
        performancesRef,
        where("userId", "==", userId)
    );
    const querySnapshot = await getDocs(q);
    const rawPerformances = serializeDocs<Performance>(querySnapshot.docs);

    const performances = rawPerformances
        .filter(perf => perf.productionId === productionId)
        .map(perf => ({
            id: perf.id,
            startTime: perf.startTime,
            capacity: perf.capacity,
            productionId: perf.productionId
        } as Performance))
        .sort((a, b) => {
            const timeA = a.startTime ? new Date(a.startTime).getTime() : 0;
            const timeB = b.startTime ? new Date(b.startTime).getTime() : 0;
            return timeA - timeB;
        });

    return { production, performances };
}
