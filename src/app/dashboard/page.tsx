'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getActiveProductionId } from '@/app/actions/production-context';
import { fetchDashboardStatsClient, fetchDuplicateReservationsClient, fetchProductionSalesReportClient } from '@/lib/client-firestore';
import { formatDate, formatTime, formatCurrency } from '@/lib/format';
import DuplicateNotification from '@/components/DuplicateNotification';
import { useAuth } from '@/components/AuthProvider';
import { PerformanceStats, DuplicateGroup, SalesReport } from '@/types';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { toDate } from '@/lib/firestore-utils';

export default function DashboardPage() {
    const { user, loading, profile } = useAuth();
    const router = useRouter();
    const [activeProductionId, setActiveProductionId] = useState<string | null>(null);
    const [stats, setStats] = useState<PerformanceStats[]>([]);
    const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
    const [isDataLoading, setIsDataLoading] = useState(true);
    const [salesReport, setSalesReport] = useState<SalesReport | null>(null);

    useEffect(() => {
        let unsubscribe: () => void = () => { };

        const fetchData = async () => {
            if (!user) return;
            const activeId = await getActiveProductionId();
            if (!activeId) {
                // 公演がまだ一つもない場合は公演一覧へ
                router.push('/productions');
                return;
            }
            setActiveProductionId(activeId);

            try {
                const [dashboardStats, duplicates, report] = await Promise.all([
                    fetchDashboardStatsClient(activeId, user.uid),
                    fetchDuplicateReservationsClient(activeId, user.uid),
                    fetchProductionSalesReportClient(activeId, user.uid).catch(() => null)
                ]);

                // IDは存在するが、DB初期化等でデータが空（無効なID）の場合
                if (dashboardStats.length === 0) {
                    // もし全公演を調べても見つからない場合はCookieを消して一覧へ
                    // (ここでは簡易的に、統計が取れない場合は無効とみなす)
                    console.warn("[Dashboard] No stats found for active ID, it might be invalid.");
                }

                setStats(dashboardStats);
                setDuplicateGroups(duplicates);
                setSalesReport(report);
            } catch (error) {
                console.error("Dashboard data fetch failed:", error);
                // 権限エラーや存在しないエラーの場合はCookieが古い可能性が高い
                if ((error as any).code === 'permission-denied' || (error as any).message?.includes('not found')) {
                    router.push('/productions');
                }
            } finally {
                setIsDataLoading(false);
            }
        };

        if (!loading && user) {
            fetchData();

            // Listen for changes in reservations to trigger refresh
            const reservationsRef = collection(db, "reservations");
            const q = query(
                reservationsRef,
                where("userId", "==", user.uid)
            );
            unsubscribe = onSnapshot(q, () => {
                fetchData();
            });
        } else if (!loading && !user) {
            setIsDataLoading(false);
        }

        return () => unsubscribe();
    }, [user, loading, router]);

    if (loading || (user && isDataLoading)) {
        return <div className="flex-center" style={{ height: '50vh' }}>読み込み中...</div>;
    }

    return (
        <div className="dashboard">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h2 className="heading-lg" style={{ marginBottom: '0.2rem' }}>ダッシュボード</h2>
                    <p className="text-muted" style={{ fontSize: '0.9rem' }}>{profile?.troupeName || '劇団'} の制作管理</p>
                </div>
            </div>

            <DuplicateNotification groups={duplicateGroups} />

            <div className="menu-grid">
                <Link href={activeProductionId ? `/productions/${activeProductionId}` : '/productions'} className="menu-card">
                    <span className="icon">⚙️</span>
                    <h3>公演設定</h3>
                    <p>価格・回・詳細設定</p>
                </Link>
                <Link href="/reservations" className="menu-card">
                    <span className="icon">🎫</span>
                    <h3>予約管理</h3>
                    <p>予約の確認・追加・メール送信</p>
                </Link>
                <Link href={activeProductionId ? `/productions/${activeProductionId}/reception` : '/productions'} className="menu-card">
                    <span className="icon">🔔</span>
                    <h3>予約受付</h3>
                    <p>受付の開始・停止・期間設定</p>
                </Link>
                <Link href="/reception" className="menu-card">
                    <span className="icon">📱</span>
                    <h3>当日受付</h3>
                    <p>来場処理・当日券対応</p>
                </Link>
                <Link href={activeProductionId ? `/productions/${activeProductionId}/attendance` : '/productions'} className="menu-card">
                    <span className="icon">👥</span>
                    <h3>来場状況</h3>
                    <p>リアルタイム着券状況の確認</p>
                </Link>
                <Link href={activeProductionId ? `/productions/${activeProductionId}/staff` : '/productions'} className="menu-card">
                    <span className="icon">🔑</span>
                    <h3>スタッフ招待・管理</h3>
                    <p>合鍵（スタッフ用URL）の発行と管理</p>
                </Link>
                <Link href={activeProductionId ? `/productions/${activeProductionId}/report` : '/productions'} className="menu-card">
                    <span className="icon">📋</span>
                    <h3>レポート</h3>
                    <p>売上・券種別の詳細集計</p>
                </Link>
                <Link href={activeProductionId ? `/productions/${activeProductionId}/survey` : '/productions'} className="menu-card">
                    <span className="icon">📝</span>
                    <h3>アンケート管理</h3>
                    <p>アンケートの作成・集計・分析</p>
                </Link>
                <Link href={activeProductionId ? `/productions/${activeProductionId}/cashclose-report` : '/productions'} className="menu-card">
                    <span className="icon">💰</span>
                    <h3>レジ締めレポート</h3>
                    <p>各公演回の精算結果を確認</p>
                </Link>
                <Link href={activeProductionId ? `/productions/${activeProductionId}/email` : '/productions'} className="menu-card">
                    <span className="icon">✉️</span>
                    <h3>メール管理</h3>
                    <p>自動メール・一斉送信の設定</p>
                </Link>
                <Link href={activeProductionId ? `/productions/${activeProductionId}/form-editor` : '/productions'} className="menu-card">
                    <span className="icon">📝</span>
                    <h3>予約フォーム編集</h3>
                    <p>予約フォームの項目設定</p>
                </Link>
            </div>

            <div className="stats-section" style={{ marginTop: '3rem' }}>
                <h3 className="heading-md" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontSize: '1.4rem' }}>📊</span> 予約状況
                </h3>

                {/* サマリーカード */}
                {salesReport && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                        <div style={{
                            backgroundColor: 'var(--card-bg)',
                            borderRadius: 'var(--border-radius)',
                            border: '1px solid var(--card-border)',
                            padding: '1.25rem 1.5rem',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                        }}>
                            <div style={{ fontSize: '0.8rem', color: '#888', fontWeight: 'bold', marginBottom: '0.4rem' }}>💰 売上予定金額</div>
                            <div style={{ fontSize: '1.6rem', fontWeight: '900', color: 'var(--foreground)' }}>{formatCurrency(salesReport.totalRevenue)}</div>
                        </div>
                        <div style={{
                            backgroundColor: 'var(--card-bg)',
                            borderRadius: 'var(--border-radius)',
                            border: '1px solid var(--card-border)',
                            padding: '1.25rem 1.5rem',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                        }}>
                            <div style={{ fontSize: '0.8rem', color: '#888', fontWeight: 'bold', marginBottom: '0.4rem' }}>🎫 予約総数</div>
                            <div style={{ fontSize: '1.6rem', fontWeight: '900', color: 'var(--foreground)' }}>{salesReport.totalTickets}<span style={{ fontSize: '0.9rem', fontWeight: 'bold', marginLeft: '0.25rem', color: '#666' }}>枚</span></div>
                        </div>
                    </div>
                )}

                {!activeProductionId ? (
                    <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
                        <p className="text-muted">まずは最初の公演を作成しましょう。</p>
                        <Link href="/productions/new" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>公演を作成する</Link>
                    </div>
                ) : stats.length === 0 ? (
                    <p className="text-muted">公演スケジュールが設定されていません。</p>
                ) : (
                    <div style={{
                        backgroundColor: 'var(--card-bg)',
                        borderRadius: 'var(--border-radius)',
                        border: '1px solid var(--card-border)',
                        overflow: 'hidden',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                    }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.95rem', minWidth: '500px' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--card-border)', background: '#f8f9fa' }}>
                                        <th style={{ padding: '0.8rem 1.2rem', color: '#666', fontWeight: 'bold', fontSize: '0.8rem', width: '25%' }}>開演時間</th>
                                        <th style={{ padding: '0.8rem 1.2rem', color: '#666', fontWeight: 'bold', fontSize: '0.8rem', width: '45%' }}>予約状況 / 定員</th>
                                        <th style={{ padding: '0.8rem 1.2rem', color: '#666', fontWeight: 'bold', fontSize: '0.8rem', width: '30%' }}>残席</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(() => {
                                        const grouped = stats.reduce((acc, perf) => {
                                            const dateKey = formatDate(perf.startTime);
                                            if (!acc[dateKey]) acc[dateKey] = [];
                                            acc[dateKey].push(perf);
                                            return acc;
                                        }, {} as Record<string, typeof stats>);

                                        const sortedDates = Object.keys(grouped).sort();

                                        return sortedDates.map(dateKey => {
                                            const dateObj = toDate(grouped[dateKey][0].startTime);
                                            const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][dateObj.getDay()];

                                            return (
                                                <React.Fragment key={dateKey}>
                                                    <tr style={{ background: '#fcfcfc', borderBottom: '1px solid var(--card-border)' }}>
                                                        <td colSpan={3} style={{ padding: '0.6rem 1.2rem', fontWeight: 'bold', color: '#333', fontSize: '0.9rem' }}>
                                                            📅 {dateKey} ({dayOfWeek})
                                                        </td>
                                                    </tr>
                                                    {grouped[dateKey].map(perf => (
                                                        <tr key={perf.id} style={{ borderBottom: '1px solid var(--card-border)', transition: 'background-color 0.2s' }}>
                                                            <td style={{ padding: '1rem 1.2rem' }}>
                                                                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--foreground)' }}>{formatTime(perf.startTime)}</div>
                                                            </td>
                                                            <td style={{ padding: '1rem 1.2rem' }}>
                                                                <div style={{ marginBottom: '6px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                                                                    <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{perf.bookedCount}</span>
                                                                    <span style={{ fontSize: '0.8rem', color: '#888' }}>/ {perf.capacity} 席</span>
                                                                </div>
                                                                <div
                                                                    role="progressbar"
                                                                    aria-valuenow={Math.round(perf.occupancyRate)}
                                                                    aria-valuemin={0}
                                                                    aria-valuemax={100}
                                                                    aria-label={`予約率 ${Math.round(perf.occupancyRate)}%`}
                                                                    style={{ width: '100%', height: '6px', backgroundColor: '#eeeff1', borderRadius: '3px', maxWidth: '140px', overflow: 'hidden' }}
                                                                >
                                                                    <div style={{
                                                                        height: '100%',
                                                                        width: `${Math.min(perf.occupancyRate, 100)}%`,
                                                                        backgroundColor: perf.occupancyRate >= 90 ? '#8b0000' : perf.occupancyRate >= 70 ? '#f9a825' : '#2e7d32',
                                                                        transition: 'width 0.5s ease-out'
                                                                    }} />
                                                                </div>
                                                            </td>
                                                            <td style={{ padding: '1rem 1.2rem' }}>
                                                                <div style={{
                                                                    display: 'inline-block',
                                                                    fontWeight: 'bold',
                                                                    padding: '4px 10px',
                                                                    borderRadius: '6px',
                                                                    fontSize: '0.9rem',
                                                                    backgroundColor: perf.remainingCount <= 5 ? 'rgba(139, 0, 0, 0.1)' : '#f8f9fa',
                                                                    color: perf.remainingCount <= 5 ? '#8b0000' : '#444',
                                                                    border: perf.remainingCount <= 5 ? '1px solid rgba(139, 0, 0, 0.2)' : '1px solid #eee'
                                                                }}>
                                                                    あと {perf.remainingCount} 席
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </React.Fragment>
                                            );
                                        });
                                    })()}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
