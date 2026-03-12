import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { Production, Performance, PerformanceStats, FirestoreReservation, DuplicateGroup, TicketType } from '@/types';
import { serializeDocs, serializeDoc } from '@/lib/firestore-utils';
import { timestampToDate } from './_utils';

/**
 * ダッシュボード用の統計情報を取得する（クライアント側）
 */
export async function fetchDashboardStatsClient(
    productionId: string,
    userId: string
): Promise<PerformanceStats[]> {
    if (!productionId || !userId) return [];
    try {
        const performancesRef = collection(db, "performances");
        const qPerf = query(
            performancesRef,
            where("productionId", "==", productionId)
        );
        const perfSnapshot = await getDocs(qPerf);
        const performances = serializeDocs<Performance>(perfSnapshot.docs)
            .filter(p => p.userId === userId)
            .sort((a, b) => {
                const timeA = a.startTime ? timestampToDate(a.startTime)!.getTime() : 0;
                const timeB = b.startTime ? timestampToDate(b.startTime)!.getTime() : 0;
                return timeA - timeB;
            });

        const reservationsRef = collection(db, "reservations");
        const qRes = query(
            reservationsRef,
            where("userId", "==", userId)
        );
        const resSnapshot = await getDocs(qRes);
        const allReservations = serializeDocs<FirestoreReservation>(resSnapshot.docs)
            .filter(res => res.status !== 'CANCELED');

        return performances.map(perf => {
            const perfReservations = allReservations.filter(res => res.performanceId === perf.id);
            const bookedCount = perfReservations.reduce((sum: number, res: FirestoreReservation) => {
                const ticketCount = (res.tickets || []).reduce((tSum: number, t: any) => tSum + (t.count || 0), 0);
                return sum + ticketCount;
            }, 0);

            const remainingCount = Math.max(0, perf.capacity - bookedCount);
            const occupancyRate = perf.capacity > 0 ? (bookedCount / perf.capacity) * 100 : 0;

            return {
                id: perf.id,
                startTime: perf.startTime,
                capacity: perf.capacity,
                bookedCount,
                remainingCount,
                occupancyRate
            };
        });
    } catch (error) {
        console.error("[client-firestore] fetchDashboardStatsClient error:", error);
        return [];
    }
}

/**
 * 重複予約をチェックする（クライアント側）
 */
export async function fetchDuplicateReservationsClient(
    productionId: string,
    userId: string
): Promise<DuplicateGroup[]> {
    if (!productionId || !userId) return [];

    // 1. Get production
    const docRef = doc(db, "productions", productionId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return [];
    const production = serializeDoc<Production>(docSnap);
    if (production.userId !== userId) return [];

    // 2. Get performances
    const performancesRef = collection(db, "performances");
    const qPerf = query(performancesRef, where("productionId", "==", productionId));
    const perfSnapshot = await getDocs(qPerf);
    const performanceMap: Record<string, Performance> = {};
    perfSnapshot.forEach(d => {
        const perf = serializeDoc<Performance>(d);
        if (perf.userId === userId) {
            performanceMap[d.id] = perf;
        }
    });

    // 3. Get all reservations
    const reservationsRef = collection(db, "reservations");
    const qRes = query(reservationsRef, where("userId", "==", userId));
    const snapshot = await getDocs(qRes);

    const reservations = serializeDocs<any>(snapshot.docs)
        .filter(res => performanceMap[res.performanceId] && res.status !== 'CANCELED');

    const groups: { [key: string]: any[] } = {};

    reservations.forEach(res => {
        const perf = performanceMap[res.performanceId];
        res.performance = perf;
        res.tickets = (res.tickets || []).map((t: any) => ({
            ...t,
            ticketType: production.ticketTypes.find((tt: TicketType) => tt.id === t.ticketTypeId)
        }));

        const nameKey = `${res.performanceId}_${res.customerName.replace(/\s/g, '')}`;
        if (!groups[nameKey]) groups[nameKey] = [];
        groups[nameKey].push(res);
    });

    return Object.entries(groups)
        .filter(([_, resList]) => resList.length > 1)
        .map(([key, resList]) => ({
            id: key,
            reservations: resList
        }));
}
