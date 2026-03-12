import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, query, where, updateDoc, serverTimestamp, runTransaction, increment } from 'firebase/firestore';
import { Production, Performance, FirestoreReservation } from '@/types';
import { hashPasscodeSecure } from '@/app/actions/staff-auth';

// SEC-05: パスコードハッシュはサーバーサイド (bcrypt) で実行

/**
 * スタッフ用トークンを発行する（クライアント側）
 * 個別の4桁パスコード（平文・ハッシュ）を生成して保存する。
 */
export async function generateStaffTokenClient(productionId: string, role: string = 'reception'): Promise<{ token: string; passcode: string }> {
    const newToken = crypto.randomUUID();
    const prodRef = doc(db, "productions", productionId);

    const autoPasscode = Math.floor(1000 + Math.random() * 9000).toString();
    const hashed = await hashPasscodeSecure(autoPasscode);

    await updateDoc(prodRef, {
        [`staffTokens.${newToken}`]: {
            role,
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
    const hashed = await hashPasscodeSecure(newPasscode);

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

    const totalQuantity = Object.values(breakdown).reduce((sum, count) => sum + count, 0);

    // プロダクション情報の取得（券種情報はトランザクション外で取得可能）
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

    // トランザクション内で残席チェック + 予約作成（アトミック）
    await runTransaction(db, async (transaction) => {
        // トランザクション内でperformanceを読み取り（楽観的ロック）
        const performanceRef = doc(db, "performances", performanceId);
        const performanceSnap = await transaction.get(performanceRef);
        if (!performanceSnap.exists()) throw new Error('公演が見つかりません');
        const performance = performanceSnap.data() as Performance;

        // 全予約を取得して集計
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

        const remaining = performance.capacity - bookedCount;
        if (totalQuantity > remaining) {
            throw new Error(`枚数が販売可能数（${remaining}枚）を超えています`);
        }

        const newResRef = doc(collection(db, "reservations"));
        transaction.set(newResRef, {
            userId: production.userId,
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
            staffVerified: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        transaction.update(performanceRef, { bookedCount: increment(totalQuantity) });
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
        if (reservation.status === 'CANCELED') throw new Error('キャンセル済みの予約は操作できません');

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
            paymentStatus = "PARTIAL";
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
            userId: reservation.userId,
            productionId,
            performanceId,
            type: 'CHECKIN',
            count: checkinCount,
            paymentInfo: JSON.stringify(paymentBreakdown),
            staffVerified: true, // スタッフ操作の記録用
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
        if (reservation.status === 'CANCELED') throw new Error('キャンセル済みの予約は操作できません');

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
            userId: reservation.userId,
            productionId,
            performanceId,
            type: 'RESET',
            count: reservation.checkedInTickets || 0,
            staffVerified: true,
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
        if (reservation.status === 'CANCELED') throw new Error('キャンセル済みの予約は操作できません');

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
            paymentStatus = "PARTIAL";
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
            userId: reservation.userId,
            productionId,
            performanceId,
            type: 'RESET',
            count: resetCheckinCount,
            paymentInfo: JSON.stringify(Object.fromEntries(
                Object.entries(refundBreakdown).map(([k, v]) => [k, -v])
            )),
            staffVerified: true,
            createdAt: serverTimestamp()
        });
    });
}
