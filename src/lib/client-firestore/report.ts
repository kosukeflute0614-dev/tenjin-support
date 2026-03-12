import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { Production, Performance, FirestoreReservation, SalesReport } from '@/types';
import { serializeDocs, serializeDoc } from '@/lib/firestore-utils';
import { timestampToDate } from './_utils';

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
                const at = a.startTime ? timestampToDate(a.startTime)!.getTime() : 0;
                const bt = b.startTime ? timestampToDate(b.startTime)!.getTime() : 0;
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

        return report;
    } catch (error) {
        console.error("[SalesReport] Client-side calculation error:", error);
        throw error;
    }
}
