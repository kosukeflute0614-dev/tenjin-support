import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, query, where, addDoc, updateDoc, serverTimestamp, deleteDoc, arrayUnion, runTransaction, onSnapshot } from 'firebase/firestore';
import { Production, Performance, PerformanceStats, FirestoreReservation, DuplicateGroup, TicketType, SalesReport } from '@/types';
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
    try {
        const productionsRef = collection(db, "productions");
        let docSnap;

        // 1. まずドキュメントIDとして試行
        const docRef = doc(db, "productions", productionId);
        docSnap = await getDoc(docRef);

        // 2. 見つからない場合は customId として検索
        if (!docSnap.exists()) {
            const qCustom = query(productionsRef, where("customId", "==", productionId));
            const customSnap = await getDocs(qCustom);
            if (!customSnap.empty) {
                docSnap = customSnap.docs[0];
            }
        }

        if (!docSnap || !docSnap.exists()) {
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
            description: rawData.description || null,
            organizationId: rawData.organizationId || '',
            troupeId: rawData.troupeId || null,
            customId: rawData.customId || null,
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
            actors: rawData.actors || [],
            staffTokens: rawData.staffTokens || {},
            userId: rawData.userId || '',
        } as Production;

        // 公演回の取得
        const realId = docSnap.id;
        const performancesRef = collection(db, "performances");
        let q;

        if (userId) {
            // ADMIN用途: 自分の公演回のみ取得（セキュリティルールに合致）
            q = query(
                performancesRef,
                where("userId", "==", userId)
            );
        } else {
            // PUBLIC用途: productionId でフィルタ
            q = query(
                performancesRef,
                where("productionId", "==", realId)
            );
        }

        const querySnapshot = await getDocs(q);
        const rawPerformances = serializeDocs<Performance>(querySnapshot.docs);

        // productionId でさらに絞り込み（userId クエリの場合用）とマッピング、ソート
        const performances = rawPerformances
            .filter(perf => perf.productionId === realId)
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
    } catch (error) {
        console.error("[client-firestore] fetchProductionDetailsClient error:", error);
        return null;
    }
}

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
    } catch (error) {
        console.error("[client-firestore] fetchDashboardStatsClient error:", error);
        return [];
    }
}

/**
 * 公演を削除する（クライアント側）
 */
export async function deleteProductionClient(productionId: string): Promise<void> {
    if (!productionId) return;

    try {
        // 本来は一括削除（TransactionやBatch）が望ましいが、
        // セキュリティルールに従い、まず公演回などを取得して削除する必要がある場合があります。
        // ここではシンプルに公演本体を削除します。
        // ※ 関連データ（Performance/Reservation）の削除が必要な場合は別途実装が必要です。
        const productionRef = doc(db, "productions", productionId);
        await deleteDoc(productionRef);
    } catch (error) {
        console.error("[client-firestore] deleteProductionClient error:", error);
        throw error;
    }
}

/**
 * 公演のカスタムID（URLスラッグ）を更新する（クライアント側）
 */
export async function updateProductionCustomIdClient(productionId: string, customId: string): Promise<void> {
    if (!productionId) return;

    try {
        const productionRef = doc(db, "productions", productionId);
        await updateDoc(productionRef, {
            customId: customId || null,
            updatedAt: serverTimestamp()
        });
    } catch (error) {
        console.error("[client-firestore] updateProductionCustomIdClient error:", error);
        throw error;
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

/**
 * スタッフ用トークンを用いて予約情報を更新する（ロール制限付き）
 */
export async function updateReservationByStaffToken(
    reservationId: string,
    productionId: string,
    staffToken: string,
    data: any
): Promise<void> {
    if (!reservationId || !productionId || !staffToken) {
        throw new Error("Missing required parameters for staff token update");
    }

    try {
        const reservationRef = doc(db, "reservations", reservationId);
        await updateDoc(reservationRef, {
            ...data,
            _staffToken: staffToken, // セキュリティルールでの判定用
            updatedAt: serverTimestamp()
        });
    } catch (error) {
        console.error("[client-firestore] updateReservationByStaffToken error:", error);
        throw error;
    }
}

/**
 * トークンを用いてログイン不要で予約一覧を取得する
 */
export async function getReservationsByToken(
    productionId: string,
    staffToken: string
): Promise<FirestoreReservation[]> {
    const reservationsRef = collection(db, "reservations");
    // セキュリティルールを通過するため、productionId と staffToken (クエリ) を明示
    const q = query(
        reservationsRef,
        where("productionId", "==", productionId),
        where("staffToken", "==", staffToken) // ルール側の list 判定用
    );

    const querySnapshot = await getDocs(q);
    return serializeDocs<FirestoreReservation>(querySnapshot.docs);
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

/**
 * 受付ステータスを更新する（クライアント版）
 */
export async function updateReceptionStatusClient(id: string, status: 'OPEN' | 'CLOSED', userId: string) {
    if (!userId) throw new Error('Unauthorized');
    const ref = doc(db, "productions", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('NotFound');
    if (snap.data().userId !== userId) throw new Error('Unauthorized');

    await updateDoc(ref, {
        receptionStatus: status,
        updatedAt: serverTimestamp()
    });
}

/**
 * 受付スケジュールを一括更新する（クライアント版）
 */
export async function updateReceptionScheduleClient(
    id: string,
    data: {
        receptionStart?: Date | string | null;
        receptionEnd?: Date | string | null;
        receptionEndMode?: string;
        receptionEndMinutes?: number;
    },
    userId: string
) {
    if (!userId) throw new Error('Unauthorized');
    const ref = doc(db, "productions", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('NotFound');
    if (snap.data().userId !== userId) throw new Error('Unauthorized');

    const updateData: any = {
        updatedAt: serverTimestamp()
    };

    if (data.receptionStart !== undefined) {
        updateData.receptionStart = data.receptionStart ? new Date(data.receptionStart) : null;
    }
    if (data.receptionEnd !== undefined) {
        updateData.receptionEnd = data.receptionEnd ? new Date(data.receptionEnd) : null;
    }
    if (data.receptionEndMode !== undefined) {
        updateData.receptionEndMode = data.receptionEndMode;
    }
    if (data.receptionEndMinutes !== undefined) {
        updateData.receptionEndMinutes = data.receptionEndMinutes;
    }

    await updateDoc(ref, updateData);
}

/**
 * カスタムIDの重複をチェックする（クライアント側）
 */
export async function checkCustomIdDuplicateClient(customId: string, excludeProductionId?: string): Promise<boolean> {
    if (!customId) return false;

    const productionsRef = collection(db, "productions");
    const q = query(productionsRef, where("customId", "==", customId));
    const snapshot = await getDocs(q);

    if (snapshot.empty) return false;

    // 自分自身を除外してチェック
    if (excludeProductionId) {
        return snapshot.docs.some(doc => doc.id !== excludeProductionId);
    }

    return true;
}
/**
 * パスコードをハッシュ化する（クライアント側：Web Crypto APIを使用）
 */
async function hashPasscodeClient(passcode: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(passcode);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * スタッフ用トークンを発行する（クライアント側）
 * 個別の4桁パスコード（平文・ハッシュ）を生成して保存する。
 */
export async function generateStaffTokenClient(productionId: string, role: string = 'reception'): Promise<{ token: string; passcode: string }> {
    const newToken = crypto.randomUUID();
    const prodRef = doc(db, "productions", productionId);

    const autoPasscode = Math.floor(1000 + Math.random() * 9000).toString();
    const hashed = await hashPasscodeClient(autoPasscode);

    await updateDoc(prodRef, {
        [`staffTokens.${newToken}`]: {
            role,
            passcode: autoPasscode,
            passcodeHashed: hashed
        },
        updatedAt: serverTimestamp()
    });

    return { token: newToken, passcode: autoPasscode };
}

/**
 * 特定のスタッフ用トークンのパスコードを更新する
 */
export async function updateStaffTokenPasscodeClient(
    productionId: string,
    token: string,
    newPasscode: string
): Promise<void> {
    if (!/^\d{4}$/.test(newPasscode)) {
        throw new Error('パスコードは数字4桁で入力してください');
    }

    const prodRef = doc(db, "productions", productionId);
    const hashed = await hashPasscodeClient(newPasscode);

    // 既存のドキュメントからロールを取得する必要がある（ネストしたフィールドの特定部分のみ更新）
    const prodSnap = await getDoc(prodRef);
    if (!prodSnap.exists()) throw new Error('公演が見つかりません');

    const staffTokens = prodSnap.data().staffTokens || {};
    const currentTokenData = staffTokens[token];
    if (!currentTokenData) throw new Error('指定されたトークンが見つかりません');

    const role = typeof currentTokenData === 'string' ? currentTokenData : currentTokenData.role;

    await updateDoc(prodRef, {
        [`staffTokens.${token}`]: {
            role,
            passcode: newPasscode,
            passcodeHashed: hashed
        },
        updatedAt: serverTimestamp()
    });
}

/**
 * スタッフ用トークンを無効化する（クライアント側）
 */
export async function revokeStaffTokenClient(productionId: string, token: string): Promise<void> {
    const { deleteField } = await import('firebase/firestore');
    const prodRef = doc(db, "productions", productionId);

    await updateDoc(prodRef, {
        [`staffTokens.${token}`]: deleteField(),
        updatedAt: serverTimestamp()
    });
}

/**
 * 当日券を登録する（スタッフ・トークン認証版）
 */
export async function createSameDayTicketStaffClient(
    performanceId: string,
    productionId: string,
    customerName: string,
    breakdown: { [ticketTypeId: string]: number },
    staffToken: string
) {
    if (!staffToken) throw new Error('Unauthorized: Staff token required');

    // 1. 残数チェックのためのデータ取得（トランザクションの外で実行）
    const performanceRef = doc(db, "performances", performanceId);
    const performanceSnap = await getDoc(performanceRef);
    if (!performanceSnap.exists()) throw new Error('公演が見つかりません');
    const performance = performanceSnap.data() as Performance;

    // 全予約を取得して集計（スタッフだけでなく一般客も含める）
    const reservationsRef = collection(db, "reservations");
    const qRes = query(
        reservationsRef,
        where("productionId", "==", productionId),
        where("performanceId", "==", performanceId)
    );
    const resSnapshot = await getDocs(qRes);

    const bookedCount = resSnapshot.docs.reduce((sum, d) => {
        const res = d.data() as FirestoreReservation;
        if (res.status === 'CANCELED') return sum;
        return sum + (res.tickets?.reduce((tSum: number, t: any) => tSum + (t.count || 0), 0) || 0);
    }, 0);

    const totalQuantity = Object.values(breakdown).reduce((sum, count) => sum + count, 0);
    const remaining = performance.capacity - bookedCount;

    if (totalQuantity > remaining) {
        throw new Error(`枚数が販売可能数（${remaining}枚）を超えています`);
    }

    // 2. プロダクション情報の取得
    const productionRef = doc(db, "productions", productionId);
    const productionSnap = await getDoc(productionRef);
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

    // 3. 予約の作成（トランザクション内で実行）
    await runTransaction(db, async (transaction) => {
        const newResRef = doc(collection(db, "reservations"));
        transaction.set(newResRef, {
            userId: production.userId, // 主催者のIDを保持
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
            staffToken, // スタッフ用クエリ・更新判別用
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
    });
}

/**
 * チェックイン処理（スタッフ・トークン認証版）
 */
export async function processCheckinWithPaymentStaffClient(
    reservationId: string,
    checkinCount: number,
    additionalPaidAmount: number,
    paymentBreakdown: { [ticketTypeId: string]: number },
    performanceId: string,
    productionId: string,
    staffToken: string
) {
    if (!staffToken) throw new Error('Unauthorized');
    const resRef = doc(db, "reservations", reservationId);

    await runTransaction(db, async (transaction) => {
        const resSnap = await transaction.get(resRef);
        if (!resSnap.exists()) throw new Error('予約が見つかりません');
        const reservation = resSnap.data() as FirestoreReservation;

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
            checkedInTickets: newCheckedInTickets,
            checkinStatus: checkinStatus,
            paidAmount: newPaidAmount,
            paymentStatus: paymentStatus,
            tickets: updatedTickets,
            checkedInAt: reservation.checkedInAt || serverTimestamp(),
            _staffToken: staffToken, // セキュリティルール用
            updatedAt: serverTimestamp()
        });

        const logsRef = doc(collection(db, "checkinLogs"));
        transaction.set(logsRef, {
            reservationId,
            productionId,
            performanceId,
            type: 'CHECKIN',
            count: checkinCount,
            paymentInfo: JSON.stringify(paymentBreakdown),
            staffToken, // スタッフ操作の記録用
            createdAt: serverTimestamp()
        });
    });
}

/**
 * 入場リセット（スタッフ・トークン認証版）
 */
export async function resetCheckInStaffClient(
    reservationId: string,
    performanceId: string,
    productionId: string,
    staffToken: string
) {
    const resRef = doc(db, "reservations", reservationId);

    await runTransaction(db, async (transaction) => {
        const resSnap = await transaction.get(resRef);
        if (!resSnap.exists()) throw new Error('予約が見つかりません');
        const reservation = resSnap.data() as FirestoreReservation;

        const updatedTickets = (reservation.tickets || []).map(t => ({
            ...t,
            paidCount: 0
        }));

        transaction.update(resRef, {
            checkedInTickets: 0,
            checkinStatus: "NOT_CHECKED_IN",
            checkedInAt: null,
            paidAmount: 0,
            paymentStatus: "UNPAID",
            tickets: updatedTickets,
            _staffToken: staffToken,
            updatedAt: serverTimestamp()
        });

        const logsRef = doc(collection(db, "checkinLogs"));
        transaction.set(logsRef, {
            reservationId,
            productionId,
            performanceId,
            type: 'RESET',
            count: reservation.checkedInTickets || 0,
            staffToken,
            createdAt: serverTimestamp()
        });
    });
}

/**
 * 一部入場取消（スタッフ・トークン認証版）
 */
export async function processPartialResetStaffClient(
    reservationId: string,
    resetCheckinCount: number,
    refundAmount: number,
    refundBreakdown: { [ticketTypeId: string]: number },
    performanceId: string,
    productionId: string,
    staffToken: string
) {
    const resRef = doc(db, "reservations", reservationId);

    await runTransaction(db, async (transaction) => {
        const resSnap = await transaction.get(resRef);
        if (!resSnap.exists()) throw new Error('予約が見つかりません');
        const reservation = resSnap.data() as FirestoreReservation;

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
            checkedInTickets: newCheckedInTickets,
            checkinStatus: checkinStatus,
            paidAmount: newPaidAmount,
            paymentStatus: paymentStatus,
            tickets: updatedTickets,
            checkedInAt: newCheckedInTickets === 0 ? null : reservation.checkedInAt,
            _staffToken: staffToken,
            updatedAt: serverTimestamp()
        });

        const logsRef = doc(collection(db, "checkinLogs"));
        transaction.set(logsRef, {
            reservationId,
            productionId,
            performanceId,
            type: 'RESET',
            count: resetCheckinCount,
            paymentInfo: JSON.stringify(Object.fromEntries(
                Object.entries(refundBreakdown).map(([k, v]) => [k, -v])
            )),
            staffToken,
            createdAt: serverTimestamp()
        });
    });
}
/**
 * 売上レポートを生成する（クライアント側）
 * 実行時エラーや権限不足を防ぐため、認証済みのクライアントコンテキストで動作させる。
 */
export async function fetchProductionSalesReportClient(
    productionId: string,
    userId: string
): Promise<SalesReport | null> {
    if (!productionId || !userId) return null;

    try {
        console.log(`[SalesReport] Generating client-side report for production: ${productionId}`);

        // 1. プロダクション情報の取得
        const productionRef = doc(db, "productions", productionId);
        const productionSnap = await getDoc(productionRef);
        if (!productionSnap.exists()) return null;
        const production = serializeDoc<Production>(productionSnap);

        // 2. 公演回の取得
        const performancesRef = collection(db, "performances");
        const qPerf = query(performancesRef, where("productionId", "==", productionId));
        const perfSnapshot = await getDocs(qPerf);
        const performances = serializeDocs<Performance>(perfSnapshot.docs)
            .filter(p => p.userId === userId)
            .sort((a, b) => {
                const at = a.startTime ? new Date(a.startTime).getTime() : 0;
                const bt = b.startTime ? new Date(b.startTime).getTime() : 0;
                return at - bt;
            });

        // 3. 予約データの取得（セキュリティルールの isSignedIn() を通すためクライアントで実行）
        const reservationsRef = collection(db, "reservations");
        const qRes = query(reservationsRef, where("userId", "==", userId));
        const resSnapshot = await getDocs(qRes);
        const reservations = serializeDocs<FirestoreReservation>(resSnapshot.docs)
            .filter(r => r.productionId === productionId && r.status !== 'CANCELED');

        const report: SalesReport = {
            totalRevenue: 0,
            totalTickets: 0,
            ticketTypeBreakdown: {},
            performanceSummaries: []
        };

        // 券種内訳の初期化
        const ticketTypes = production.ticketTypes || [];
        ticketTypes.forEach(tt => {
            if (tt && tt.id) {
                report.ticketTypeBreakdown[tt.id] = {
                    name: tt.name || '名称未設定',
                    count: 0,
                    revenue: 0
                };
            }
        });

        const OTHER_TT_ID = 'other';
        report.ticketTypeBreakdown[OTHER_TT_ID] = {
            name: 'その他/不明',
            count: 0,
            revenue: 0
        };

        const performanceMap: { [id: string]: any } = {};
        performances.forEach(perf => {
            performanceMap[perf.id] = {
                id: perf.id,
                startTime: perf.startTime,
                bookedCount: 0,
                checkedInCount: 0,
                revenue: 0
            };
        });

        reservations.forEach(res => {
            const perfSummary = performanceMap[res.performanceId];
            const tickets = res.tickets || [];

            tickets.forEach(t => {
                const count = Number(t.count || 0);
                const price = Number(t.price || 0);
                const ticketRevenue = count * price;

                report.totalTickets += count;
                report.totalRevenue += ticketRevenue;

                const ttId = t.ticketTypeId || OTHER_TT_ID;
                if (!report.ticketTypeBreakdown[ttId]) {
                    report.ticketTypeBreakdown[OTHER_TT_ID].count += count;
                    report.ticketTypeBreakdown[OTHER_TT_ID].revenue += ticketRevenue;
                } else {
                    report.ticketTypeBreakdown[ttId].count += count;
                    report.ticketTypeBreakdown[ttId].revenue += ticketRevenue;
                }

                if (perfSummary) {
                    perfSummary.bookedCount += count;
                    perfSummary.revenue += ticketRevenue;
                }
            });

            if (perfSummary) {
                perfSummary.checkedInCount += (res.checkedInTickets || 0);
            }
        });

        report.performanceSummaries = Object.values(performanceMap);

        if (report.ticketTypeBreakdown[OTHER_TT_ID].count === 0) {
            delete report.ticketTypeBreakdown[OTHER_TT_ID];
        }

        console.log(`[SalesReport] Client-side report generated: Total Revenue = ${report.totalRevenue}`);
        return report;
    } catch (error) {
        console.error("[SalesReport] Client-side calculation error:", error);
        throw error;
    }
}
