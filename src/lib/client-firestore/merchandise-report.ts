import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { Production, Performance, MerchandiseSale, FirestoreTimestamp } from '@/types';
import { serializeDocs, serializeDoc } from '@/lib/firestore-utils';
import { timestampToDate } from './_utils';

// ── 物販レポート型定義 ──

export interface VariantBreakdown {
    variantId: string;
    variantName: string;
    quantity: number;
    canceledQuantity: number;
    revenue: number;
}

export interface ProductBreakdown {
    productId: string;
    productName: string;
    quantity: number;
    canceledQuantity: number;
    revenue: number;
    variants: VariantBreakdown[];
}

export interface PerformanceMerchandiseSummary {
    id: string;
    startTime: FirestoreTimestamp;
    transactionCount: number;
    canceledTransactionCount: number;
    totalItems: number;
    revenue: number;
}

export interface MerchandiseReportData {
    totalRevenue: number;
    totalItems: number;
    totalTransactions: number;
    canceledTransactions: number;
    productBreakdown: ProductBreakdown[];
    performanceSummaries: PerformanceMerchandiseSummary[];
}

/**
 * 物販レポートを生成する（クライアント側）
 * 全公演回の物販売上を集計し、商品別・公演回別のレポートを返す。
 */
export async function fetchMerchandiseReportClient(
    productionId: string,
    userId: string
): Promise<MerchandiseReportData | null> {
    if (!productionId || !userId) return null;

    try {
        // 1. プロダクション情報の取得
        const productionRef = doc(db, 'productions', productionId);
        const productionSnap = await getDoc(productionRef);
        if (!productionSnap.exists()) return null;
        const production = serializeDoc<Production>(productionSnap);

        // 2. 公演回の取得
        const performancesRef = collection(db, 'performances');
        const qPerf = query(performancesRef, where('productionId', '==', productionId));
        const perfSnapshot = await getDocs(qPerf);
        const performances = serializeDocs<Performance>(perfSnapshot.docs)
            .filter(p => p.userId === userId)
            .sort((a, b) => {
                const at = a.startTime ? timestampToDate(a.startTime)!.getTime() : 0;
                const bt = b.startTime ? timestampToDate(b.startTime)!.getTime() : 0;
                return at - bt;
            });

        // 3. 物販売上データの取得
        const salesRef = collection(db, 'merchandiseSales');
        const qSales = query(
            salesRef,
            where('userId', '==', userId),
            where('productionId', '==', productionId),
        );
        const salesSnapshot = await getDocs(qSales);
        const sales = serializeDocs<MerchandiseSale>(salesSnapshot.docs);

        // 4. 集計
        const report: MerchandiseReportData = {
            totalRevenue: 0,
            totalItems: 0,
            totalTransactions: 0,
            canceledTransactions: 0,
            productBreakdown: [],
            performanceSummaries: [],
        };

        // 商品別集計マップ
        const productMap = new Map<string, ProductBreakdown>();
        // 公演回別集計マップ
        const perfMap = new Map<string, PerformanceMerchandiseSummary>();

        // 公演回マップを初期化
        performances.forEach(perf => {
            perfMap.set(perf.id, {
                id: perf.id,
                startTime: perf.startTime,
                transactionCount: 0,
                canceledTransactionCount: 0,
                totalItems: 0,
                revenue: 0,
            });
        });

        for (const sale of sales) {
            report.totalTransactions++;

            if (sale.status === 'CANCELED') {
                report.canceledTransactions++;
                // キャンセル済みの取引は公演回のキャンセル数にのみ反映
                const perfSummary = perfMap.get(sale.performanceId);
                if (perfSummary) {
                    perfSummary.transactionCount++;
                    perfSummary.canceledTransactionCount++;
                }
                continue;
            }

            // 有効な売上額を加算
            report.totalRevenue += sale.effectiveAmount;

            // 公演回サマリーに加算
            const perfSummary = perfMap.get(sale.performanceId);
            if (perfSummary) {
                perfSummary.transactionCount++;
                if (sale.status === 'PARTIALLY_CANCELED') {
                    perfSummary.canceledTransactionCount++;
                }
                perfSummary.revenue += sale.effectiveAmount;
            }

            // アイテム別集計
            for (const item of sale.items) {
                const effectiveQty = item.quantity - (item.canceledQuantity || 0);
                report.totalItems += effectiveQty;

                if (perfSummary) {
                    perfSummary.totalItems += effectiveQty;
                }

                // 商品マップの初期化/更新
                if (!productMap.has(item.productId)) {
                    productMap.set(item.productId, {
                        productId: item.productId,
                        productName: item.productName,
                        quantity: 0,
                        canceledQuantity: 0,
                        revenue: 0,
                        variants: [],
                    });
                }
                const productEntry = productMap.get(item.productId)!;
                productEntry.quantity += item.quantity;
                productEntry.canceledQuantity += (item.canceledQuantity || 0);
                productEntry.revenue += item.unitPrice * effectiveQty;

                // バリアント別集計
                if (item.variantId) {
                    let variantEntry = productEntry.variants.find(v => v.variantId === item.variantId);
                    if (!variantEntry) {
                        variantEntry = {
                            variantId: item.variantId,
                            variantName: item.variantName || '不明',
                            quantity: 0,
                            canceledQuantity: 0,
                            revenue: 0,
                        };
                        productEntry.variants.push(variantEntry);
                    }
                    variantEntry.quantity += item.quantity;
                    variantEntry.canceledQuantity += (item.canceledQuantity || 0);
                    variantEntry.revenue += item.unitPrice * effectiveQty;
                }
            }
        }

        // マップから配列に変換（売上順にソート）
        report.productBreakdown = Array.from(productMap.values())
            .sort((a, b) => b.revenue - a.revenue);

        report.performanceSummaries = Array.from(perfMap.values());

        return report;
    } catch (error) {
        console.error('[MerchandiseReport] Client-side calculation error:', error);
        throw error;
    }
}
