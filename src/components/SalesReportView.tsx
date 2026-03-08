'use client';

import { useState, useEffect } from 'react';
import { fetchProductionSalesReportClient } from '@/lib/client-firestore';
import { SalesReport } from '@/types';
import { useAuth } from './AuthProvider';
import { useToast } from '@/components/Toast';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { exportToCSV } from '@/lib/export-utils';

type Props = {
    productionId: string;
};

export default function SalesReportView({ productionId }: Props) {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [report, setReport] = useState<SalesReport | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchReport = async () => {
            if (!user) return;
            setLoading(true);
            try {
                const data = await fetchProductionSalesReportClient(productionId, user.uid);
                setReport(data);
                if (!data) {
                    showToast('レポートデータが見つかりませんでした。', 'error');
                }
            } catch (err: any) {
                console.error("Failed to fetch sales report:", err);
                // 権限エラーの場合のメッセージを具体化
                if (err.code === 'permission-denied') {
                    showToast('閲覧権限がありません。管理者としてログインしているか確認してください。', 'error');
                } else {
                    showToast('データの取得中にエラーが発生しました。詳細はブラウザのコンソールを確認してください。', 'error');
                }
            } finally {
                setLoading(false);
            }
        };
        fetchReport();
    }, [productionId, user]);

    const handleExportCSV = () => {
        if (!report) return;

        // 1. 券種別
        const ticketData = Object.values(report.ticketTypeBreakdown).map(tt => ({
            '券種名': tt.name,
            '枚数': tt.count,
            '金額': tt.revenue
        }));
        exportToCSV(ticketData, `sales-tickets-${productionId}.csv`, [
            { key: '券種名', label: '券種名' },
            { key: '枚数', label: '枚数' },
            { key: '金額', label: '金額' }
        ]);

        // 2. 公演回別
        const perfData = report.performanceSummaries.map(perf => ({
            '開演時間': formatDateTime(perf.startTime),
            '予約枚数': perf.bookedCount,
            '来場人数': perf.checkedInCount,
            '売上': perf.revenue
        }));
        exportToCSV(perfData, `sales-performances-${productionId}.csv`, [
            { key: '開演時間', label: '開演時間' },
            { key: '予約枚数', label: '予約枚数' },
            { key: '来場人数', label: '来場人数' },
            { key: '売上', label: '売上' }
        ]);
    };

    if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>集計中...</div>;
    if (!report) return <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>データを取得できませんでした</div>;

    return (
        <div style={{ display: 'grid', gap: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="heading-md" style={{ margin: 0 }}>売上集計レポート</h3>
                <button className="btn btn-secondary" onClick={handleExportCSV}>
                    📥 CSVエクスポート
                </button>
            </div>

            {/* サマリーカード */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
                <div className="card" style={{ padding: '1.5rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>総予約枚数</div>
                    <div style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{report.totalTickets}<span style={{ fontSize: '1rem', marginLeft: '0.2rem' }}>枚</span></div>
                </div>
                <div className="card" style={{ padding: '1.5rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>概算総売上</div>
                    <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--success)' }}>{formatCurrency(report.totalRevenue)}</div>
                </div>
            </div>

            {/* 券種別内訳 */}
            <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                <div style={{ padding: '1rem 1.5rem', background: '#f8fafc', fontWeight: 'bold', borderBottom: '1px solid var(--card-border)' }}>
                    券種別内訳
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--card-border)', background: 'var(--card-bg)' }}>
                                <th style={{ padding: '0.75rem 1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>券種名</th>
                                <th style={{ padding: '0.75rem 1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'right' }}>枚数</th>
                                <th style={{ padding: '0.75rem 1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'right' }}>金額</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.values(report.ticketTypeBreakdown).map((tt, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '0.75rem 1.5rem' }}>{tt.name}</td>
                                    <td style={{ padding: '0.75rem 1.5rem', textAlign: 'right' }}>{tt.count} 枚</td>
                                    <td style={{ padding: '0.75rem 1.5rem', textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(tt.revenue)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 公演回別集計 */}
            <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                <div style={{ padding: '1rem 1.5rem', background: '#f8fafc', fontWeight: 'bold', borderBottom: '1px solid var(--card-border)' }}>
                    公演回別集計
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--card-border)', background: 'var(--card-bg)' }}>
                                <th style={{ padding: '0.75rem 1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>開演時間</th>
                                <th style={{ padding: '0.75rem 1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'right' }}>予約枚数</th>
                                <th style={{ padding: '0.75rem 1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'right' }}>来場人数</th>
                                <th style={{ padding: '0.75rem 1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'right' }}>売上 (概算)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {report.performanceSummaries.map((perf) => (
                                <tr key={perf.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '0.75rem 1.5rem' }}>{formatDateTime(perf.startTime)}</td>
                                    <td style={{ padding: '0.75rem 1.5rem', textAlign: 'right' }}>{perf.bookedCount} 枚</td>
                                    <td style={{ padding: '0.75rem 1.5rem', textAlign: 'right' }}>{perf.checkedInCount} 人</td>
                                    <td style={{ padding: '0.75rem 1.5rem', textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(perf.revenue)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
