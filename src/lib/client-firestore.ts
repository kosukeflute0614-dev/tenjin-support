import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { Production, Performance, PerformanceStats, FirestoreReservation, DuplicateGroup, TicketType } from '@/types';
import { serializeDocs, serializeDoc } from '@/lib/firestore-utils';

/**
 * クライアント側で直接 Firestore から公演詳細を取得する。
 * サーバーアクション経由ではなく、ブラウザ上で実行されるため、
 * Firebase Auth の認証状態が正しく使われ、セキュリティルールに準拠する。
 */
export async function fetchProductionDetailsClient(
    productionId: string,
    userId?: string | null
): Promise<{ production: Production; performances: Performance[] } | null> {
    const docRef = doc(db, "productions", productionId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) return null;

    const rawData = docSnap.data();

    // ログイン中の場合は所有権チェック（ADMIN用途）
    if (userId && rawData.userId !== userId) {
        return null;
    }

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
    let q;

    if (userId) {
        // ADMIN用途: 自分の公演回のみ取得（セキュリティルールに合致）
        q = query(
            performancesRef,
            where("userId", "==", userId)
        );
    } else {
        // PUBLIC用途: productionId でフィルタ（セキュリティルールで全読み可能前提）
        q = query(
            performancesRef,
            where("productionId", "==", productionId)
        );
    }

    const querySnapshot = await getDocs(q);
    const rawPerformances = serializeDocs<Performance>(querySnapshot.docs);

    // productionId でさらに絞り込み（userId クエリの場合用）とマッピング、ソート
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

/**
 * ダッシュボード用の統計情報を取得する（クライアント側）
 */
export async function fetchDashboardStatsClient(
    productionId: string,
    userId: string
): Promise<PerformanceStats[]> {
    if (!productionId || !userId) return [];

    const performancesRef = collection(db, "performances");
    const qPerf = query(
        performancesRef,
        where("productionId", "==", productionId)
    );
    const perfSnapshot = await getDocs(qPerf);
    const performances = serializeDocs<Performance>(perfSnapshot.docs)
        .filter(p => p.userId === userId)
        .sort((a, b) => {
            const timeA = a.startTime ? new Date(a.startTime).getTime() : 0;
            const timeB = b.startTime ? new Date(b.startTime).getTime() : 0;
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

/**
 * 予約登録用の選択肢（公演・公演回）を取得する（クライアント側）
 */
export async function fetchBookingOptionsClient(
    activeProductionId?: string,
    userId?: string
): Promise<Production[]> {
    if (!userId) {
        if (!activeProductionId) return [];
        const res = await fetchProductionDetailsClient(activeProductionId);
        return res ? [{ ...res.production, performances: res.performances } as any] : [];
    }

    let prods: Production[] = [];
    if (activeProductionId) {
        const res = await fetchProductionDetailsClient(activeProductionId, userId);
        if (res) prods = [{ ...res.production, performances: res.performances } as any];
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

        // 関連する全公演回を読み込む
        const performancesRef = collection(db, "performances");
        const qPerf = query(performancesRef, where("userId", "==", userId));
        const perfSnap = await getDocs(qPerf);
        const allPerfs = serializeDocs<any>(perfSnap.docs);

        prods = prods.map(p => ({
            ...p,
            performances: allPerfs.filter(perf => perf.productionId === p.id)
                .sort((a, b) => {
                    const tA = a.startTime ? (a.startTime.toDate ? a.startTime.toDate().getTime() : new Date(a.startTime).getTime()) : 0;
                    const tB = b.startTime ? (b.startTime.toDate ? b.startTime.toDate().getTime() : new Date(b.startTime).getTime()) : 0;
                    return tA - tB;
                })
        }));
    }

    return prods;
}
