import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, query, where, addDoc, updateDoc, serverTimestamp, deleteDoc, arrayUnion, runTransaction, onSnapshot } from 'firebase/firestore';
import { Production, Performance, PerformanceStats, FirestoreReservation, DuplicateGroup, TicketType } from '@/types';
import { serializeDocs, serializeDoc } from '@/lib/firestore-utils';

/**
 * Firestore の Timestamp または日付型を安全に Date に変換する
 */
function timestampToDate(val: any): Date | null {
    if (!val) return null;
    if (typeof val.toDate === 'function') return val.toDate();
    if (val instanceof Date) return val;
    if (typeof val === 'string' || typeof val === 'number') return new Date(val);
    if (val.seconds !== undefined) return new Date(val.seconds * 1000);
    return null;
}

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

    if (!docSnap.exists()) {
        return null;
    }

    const rawData = docSnap.data();

    // ログイン中の場合は所有権チェック（ADMIN用途）
    if (userId && rawData.userId !== userId) {
        return null;
    }

    const production: Production = {
        id: docSnap.id,
        title: rawData.title || '',
        receptionStatus: rawData.receptionStatus || 'CLOSED',
        receptionStart: timestampToDate(rawData.receptionStart)?.toISOString() || null,
        receptionEnd: timestampToDate(rawData.receptionEnd)?.toISOString() || null,
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

/**
 * 公演を新規作成する（クライアント側）
 */
export async function createProductionClient(title: string, userId: string) {
    if (!userId) throw new Error('Unauthorized');
    if (!title) throw new Error('Title is required');

    const productionsRef = collection(db, "productions");
    const newDoc = await addDoc(productionsRef, {
        userId,
        organizationId: "default_org_id",
        title,
        ticketTypes: [],
        actors: [],
        receptionStatus: 'CLOSED',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
    return newDoc.id;
}

/**
 * 公演回を追加する（クライアント側）
 */
export async function addPerformanceClient(productionId: string, startTime: string, capacity: number, userId: string) {
    if (!userId) throw new Error('Unauthorized');

    const performancesRef = collection(db, "performances");
    const newDoc = await addDoc(performancesRef, {
        productionId,
        startTime: new Date(startTime),
        capacity,
        userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });

    // 公演の更新日時も更新
    const prodRef = doc(db, "productions", productionId);
    await updateDoc(prodRef, { updatedAt: serverTimestamp() });

    return newDoc.id;
}

/**
 * 予約を作成する（クライアント側）
 */
export async function createReservationClient(data: Partial<FirestoreReservation>) {
    const reservationsRef = collection(db, "reservations");
    const newDoc = await addDoc(reservationsRef, {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
    return newDoc.id;
}

/**
 * 予約をキャンセルする（クライアント側）
 */
export async function cancelReservationClient(reservationId: string, userId: string) {
    if (!userId) throw new Error('Unauthorized');
    const ref = doc(db, "reservations", reservationId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('NotFound');
    if (snap.data().userId !== userId) throw new Error('Unauthorized');

    await updateDoc(ref, {
        status: 'CANCELED',
        updatedAt: serverTimestamp()
    });
}

/**
 * 公演回を更新する（クライアント側）
 */
export async function updatePerformanceClient(id: string, startTime: Date, capacity: number, userId: string) {
    if (!userId) throw new Error('Unauthorized');
    const ref = doc(db, "performances", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('NotFound');
    if (snap.data().userId !== userId) throw new Error('Unauthorized');

    await updateDoc(ref, {
        startTime,
        capacity,
        updatedAt: serverTimestamp()
    });
}

/**
 * 公演回を削除する（クライアント側）
 */
export async function deletePerformanceClient(id: string, userId: string) {
    if (!userId) throw new Error('Unauthorized');
    const ref = doc(db, "performances", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('NotFound');
    if (snap.data().userId !== userId) throw new Error('Unauthorized');

    // 予約があるかチェック
    const reservationsRef = collection(db, "reservations");
    const q = query(reservationsRef, where("performanceId", "==", id), where("status", "!=", "CANCELED"));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
        throw new Error('すでに予約があるため削除できません');
    }

    await deleteDoc(ref);
}

/**
 * 券種を追加する（クライアント側）
 */
export async function addTicketTypeClient(productionId: string, name: string, advancePrice: number, doorPrice: number, userId: string) {
    console.log("[DEBUG] lib: addTicketTypeClient 開始", { productionId, name, userId });

    const docRef = doc(db, "productions", productionId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
        console.error("[DEBUG] lib: Production が見つかりません", productionId);
        throw new Error('Production not found');
    }

    const prodData = docSnap.data();
    console.log("[DEBUG] lib: 所有権チェック", { docUserId: prodData.userId, requestUserId: userId });

    if (prodData.userId !== userId) {
        console.error("[DEBUG] lib: Unauthorized - userId が一致しません");
        throw new Error('Unauthorized');
    }

    // Firestore 標準の方式で ID を生成 (ランダム文字列)
    const newId = doc(collection(db, "_temp_")).id;
    console.log("[DEBUG] lib: 生成された新チケットID:", newId);

    const newTicketType: TicketType = {
        id: newId,
        name,
        price: advancePrice,
        advancePrice,
        doorPrice,
        isPublic: true
    };

    await updateDoc(docRef, {
        ticketTypes: arrayUnion(newTicketType),
        updatedAt: serverTimestamp()
    });
    console.log("[DEBUG] lib: updateDoc 成功");
}

/**
 * 券種を更新する（クライアント側）
 */
export async function updateTicketTypeClient(productionId: string, ticketTypeId: string, name: string, advancePrice: number, doorPrice: number, userId: string) {
    const docRef = doc(db, "productions", productionId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error('Production not found');
    if (docSnap.data().userId !== userId) throw new Error('Unauthorized');

    const production = docSnap.data() as Production;
    const updatedTicketTypes = (production.ticketTypes || []).map(tt =>
        tt.id === ticketTypeId ? { ...tt, name, price: advancePrice, advancePrice, doorPrice } : tt
    );

    await updateDoc(docRef, {
        ticketTypes: updatedTicketTypes,
        updatedAt: serverTimestamp()
    });
}

/**
 * 券種を削除する（クライアント側）
 */
export async function deleteTicketTypeClient(productionId: string, ticketTypeId: string, userId: string) {
    const docRef = doc(db, "productions", productionId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error('Production not found');
    if (docSnap.data().userId !== userId) throw new Error('Unauthorized');

    // 予約があるかチェック
    const reservationsRef = collection(db, "reservations");
    const q = query(reservationsRef, where("userId", "==", userId));
    const querySnapshot = await getDocs(q);
    const hasActiveTicket = querySnapshot.docs.some(d => {
        const res = d.data() as FirestoreReservation;
        return res.status !== 'CANCELED' && (res.tickets || []).some(t => t.ticketTypeId === ticketTypeId);
    });

    if (hasActiveTicket) {
        throw new Error('すでに予約があるため削除できません');
    }

    const updatedTicketTypes = (docSnap.data().ticketTypes || []).filter((tt: any) => tt.id !== ticketTypeId);
    await updateDoc(docRef, {
        ticketTypes: updatedTicketTypes,
        updatedAt: serverTimestamp()
    });
}

/**
 * 予約情報を更新する（クライアント側）
 */
export async function updateReservationFullClient(reservationId: string, data: Partial<FirestoreReservation>, userId: string) {
    if (!userId) throw new Error('Unauthorized');
    const ref = doc(db, "reservations", reservationId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('NotFound');
    if (snap.data().userId !== userId) throw new Error('Unauthorized');

    await updateDoc(ref, {
        ...data,
        updatedAt: serverTimestamp()
    });
}

/**
 * 当日券を登録する（クライアント側）
 */
export async function createSameDayTicketClient(
    performanceId: string,
    productionId: string,
    customerName: string,
    breakdown: { [ticketTypeId: string]: number },
    userId: string
) {
    if (!userId) throw new Error('Unauthorized');

    await runTransaction(db, async (transaction) => {
        // 1. 公演の残数チェック
        const performanceRef = doc(db, "performances", performanceId);
        const performanceSnap = await transaction.get(performanceRef);
        if (!performanceSnap.exists()) throw new Error('公演が見つかりません');
        const performance = performanceSnap.data() as Performance;

        const reservationsRef = collection(db, "reservations");
        const qRes = query(reservationsRef, where("userId", "==", userId));
        const resSnapshot = await getDocs(qRes); // Transaction 外で取得してメモリでフィルタ（Firestore の制限）

        const bookedCount = resSnapshot.docs.reduce((sum, d) => {
            const res = d.data() as FirestoreReservation;
            if (res.performanceId !== performanceId || res.status === 'CANCELED') return sum;
            return sum + (res.tickets?.reduce((tSum: number, t: any) => tSum + (t.count || 0), 0) || 0);
        }, 0);

        const totalQuantity = Object.values(breakdown).reduce((sum, count) => sum + count, 0);
        const remaining = performance.capacity - bookedCount;

        if (totalQuantity > remaining) {
            throw new Error(`枚数が販売可能数（${remaining}枚）を超えています`);
        }

        // 2. プロダクション情報の取得
        const productionRef = doc(db, "productions", productionId);
        const productionSnap = await transaction.get(productionRef);
        if (!productionSnap.exists()) throw new Error('プロダクションが見つかりません');
        const production = productionSnap.data() as Production;

        let totalAmount = 0;
        const ticketDatas = Object.entries(breakdown)
            .filter(([_, count]) => count > 0)
            .map(([id, count]) => {
                const tt = production.ticketTypes.find(t => t.id === id);
                if (!tt) throw new Error('券種が見つかりません');
                totalAmount += (tt.doorPrice ?? tt.price) * count;
                return {
                    ticketTypeId: id,
                    count,
                    price: tt.doorPrice ?? tt.price
                };
            });

        // 3. 予約の作成
        const newResRef = doc(collection(db, "reservations"));
        transaction.set(newResRef, {
            userId,
            productionId,
            performanceId,
            customerName,
            customerNameKana: "",
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
    });
}

/**
 * チェックイン処理（会計込み・クライアント版）
 */
export async function processCheckinWithPaymentClient(
    reservationId: string,
    checkinCount: number,
    additionalPaidAmount: number,
    paymentBreakdown: { [ticketTypeId: string]: number },
    performanceId: string,
    productionId: string,
    userId: string
) {
    const resRef = doc(db, "reservations", reservationId);

    await runTransaction(db, async (transaction) => {
        const resSnap = await transaction.get(resRef);
        if (!resSnap.exists()) throw new Error('予約が見つかりません');
        const reservation = resSnap.data() as FirestoreReservation;
        if (reservation.userId !== userId) throw new Error('Unauthorized');

        const totalTickets = (reservation.tickets || []).reduce((sum: number, t: any) => sum + (t.count || 0), 0);
        const totalAmount = (reservation.tickets || []).reduce((sum: number, t: any) => sum + ((t.price || 0) * (t.count || 0)), 0);

        const newCheckedInTickets = Math.min((reservation.checkedInTickets || 0) + checkinCount, totalTickets);
        const newPaidAmount = (reservation.paidAmount || 0) + additionalPaidAmount;

        let checkinStatus = "PARTIALLY_CHECKED_IN";
        if (newCheckedInTickets === totalTickets && totalTickets > 0) {
            checkinStatus = "CHECKED_IN";
        } else if (newCheckedInTickets === 0) {
            checkinStatus = "NOT_CHECKED_IN";
        }

        let paymentStatus = "UNPAID";
        if (newPaidAmount >= totalAmount && totalAmount > 0) {
            paymentStatus = "PAID";
        } else if (newPaidAmount > 0) {
            paymentStatus = "PARTIALLY_PAID";
        }

        const updatedTickets = (reservation.tickets || []).map(t => {
            const added = paymentBreakdown[t.ticketTypeId] || 0;
            return {
                ...t,
                paidCount: (t.paidCount || 0) + added
            };
        });

        transaction.update(resRef, {
            userId,
            productionId,
            performanceId,
            checkedInTickets: newCheckedInTickets,
            checkinStatus: checkinStatus,
            paidAmount: newPaidAmount,
            paymentStatus: paymentStatus,
            tickets: updatedTickets,
            checkedInAt: reservation.checkedInAt || serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        const logsRef = doc(collection(db, "checkinLogs"));
        transaction.set(logsRef, {
            reservationId,
            userId,
            productionId,
            performanceId,
            type: 'CHECKIN',
            count: checkinCount,
            paymentInfo: JSON.stringify(paymentBreakdown),
            createdAt: serverTimestamp()
        });
    });
}

/**
 * 入場リセット（クライアント版）
 */
export async function resetCheckInClient(reservationId: string, performanceId: string, productionId: string, userId: string) {
    const resRef = doc(db, "reservations", reservationId);

    await runTransaction(db, async (transaction) => {
        const resSnap = await transaction.get(resRef);
        if (!resSnap.exists()) throw new Error('予約が見つかりません');
        const reservation = resSnap.data() as FirestoreReservation;
        if (reservation.userId !== userId) throw new Error('Unauthorized');

        const updatedTickets = (reservation.tickets || []).map(t => ({
            ...t,
            paidCount: 0
        }));

        transaction.update(resRef, {
            userId,
            productionId,
            performanceId,
            checkedInTickets: 0,
            checkinStatus: "NOT_CHECKED_IN",
            checkedInAt: null,
            paidAmount: 0,
            paymentStatus: "UNPAID",
            tickets: updatedTickets,
            updatedAt: serverTimestamp()
        });

        const logsRef = doc(collection(db, "checkinLogs"));
        transaction.set(logsRef, {
            reservationId,
            userId,
            productionId,
            performanceId,
            type: 'RESET',
            count: reservation.checkedInTickets || 0,
            createdAt: serverTimestamp()
        });
    });
}

/**
 * 一部入場取消（クライアント版）
 */
export async function processPartialResetClient(
    reservationId: string,
    resetCheckinCount: number,
    refundAmount: number,
    refundBreakdown: { [ticketTypeId: string]: number },
    performanceId: string,
    productionId: string,
    userId: string
) {
    const resRef = doc(db, "reservations", reservationId);

    await runTransaction(db, async (transaction) => {
        const resSnap = await transaction.get(resRef);
        if (!resSnap.exists()) throw new Error('予約が見つかりません');
        const reservation = resSnap.data() as FirestoreReservation;
        if (reservation.userId !== userId) throw new Error('Unauthorized');

        const totalTickets = (reservation.tickets || []).reduce((sum: number, t: any) => sum + (t.count || 0), 0);
        const totalAmount = (reservation.tickets || []).reduce((sum: number, t: any) => sum + ((t.price || 0) * (t.count || 0)), 0);

        const newCheckedInTickets = Math.max((reservation.checkedInTickets || 0) - resetCheckinCount, 0);
        const newPaidAmount = Math.max((reservation.paidAmount || 0) - refundAmount, 0);

        let checkinStatus = "PARTIALLY_CHECKED_IN";
        if (newCheckedInTickets === totalTickets && totalTickets > 0) {
            checkinStatus = "CHECKED_IN";
        } else if (newCheckedInTickets === 0) {
            checkinStatus = "NOT_CHECKED_IN";
        }

        let paymentStatus = "UNPAID";
        if (newPaidAmount >= totalAmount && totalAmount > 0) {
            paymentStatus = "PAID";
        } else if (newPaidAmount > 0) {
            paymentStatus = "PARTIALLY_PAID";
        }

        const updatedTickets = (reservation.tickets || []).map(t => {
            const subtracted = refundBreakdown[t.ticketTypeId] || 0;
            return {
                ...t,
                paidCount: Math.max((t.paidCount || 0) - subtracted, 0)
            };
        });

        transaction.update(resRef, {
            userId,
            productionId,
            performanceId,
            checkedInTickets: newCheckedInTickets,
            checkinStatus: checkinStatus,
            paidAmount: newPaidAmount,
            paymentStatus: paymentStatus,
            tickets: updatedTickets,
            checkedInAt: newCheckedInTickets === 0 ? null : reservation.checkedInAt,
            updatedAt: serverTimestamp()
        });

        const logsRef = doc(collection(db, "checkinLogs"));
        transaction.set(logsRef, {
            reservationId,
            userId,
            productionId,
            performanceId,
            type: 'RESET',
            count: resetCheckinCount,
            paymentInfo: JSON.stringify(Object.fromEntries(
                Object.entries(refundBreakdown).map(([k, v]) => [k, -v])
            )),
            createdAt: serverTimestamp()
        });
    });
}
