'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getActiveProductionId } from '@/app/actions/production-context';
import { fetchDashboardStatsClient, fetchDuplicateReservationsClient, fetchProductionSalesReportClient } from '@/lib/client-firestore';
import { formatDate, formatTime, formatCurrency } from '@/lib/format';
import DuplicateNotification from '@/components/DuplicateNotification';
import { useAuth } from '@/components/AuthProvider';
import { PerformanceStats, DuplicateGroup, SalesReport, Production } from '@/types';
import { db } from '@/lib/firebase';
import { doc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { serializeDoc, toDate } from '@/lib/firestore-utils';
import { Settings, Ticket, Bell, Smartphone, Users, Key, ClipboardList, FileEdit, Wallet, Mail, BarChart3, Calendar } from 'lucide-react';
import SetupChecklist from '@/components/SetupChecklist';

type Badge = { label: string; bg: string; color: string; borderColor: string };

export default function DashboardPage() {
    const { user, loading, profile } = useAuth();
    const router = useRouter();
    const [activeProductionId, setActiveProductionId] = useState<string | null>(null);
    const [production, setProduction] = useState<Production | null>(null);
    const [stats, setStats] = useState<PerformanceStats[]>([]);
    const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
    const [isDataLoading, setIsDataLoading] = useState(true);
    const [salesReport, setSalesReport] = useState<SalesReport | null>(null);

    useEffect(() => {
        let unsubReservations: () => void = () => { };
        let unsubProduction: () => void = () => { };

        const fetchData = async () => {
            if (!user) return;
            const activeId = await getActiveProductionId();
            if (!activeId) {
                router.push('/productions');
                return;
            }
            setActiveProductionId(activeId);

            // Production docをリアルタイム監視（バッジ用）
            const prodRef = doc(db, "productions", activeId);
            unsubProduction = onSnapshot(prodRef, (snap) => {
                if (snap.exists()) {
                    setProduction(serializeDoc<Production>(snap));
                }
            });

            try {
                const [dashboardStats, duplicates, report] = await Promise.all([
                    fetchDashboardStatsClient(activeId, user.uid),
                    fetchDuplicateReservationsClient(activeId, user.uid),
                    fetchProductionSalesReportClient(activeId, user.uid).catch(() => null)
                ]);

                if (dashboardStats.length === 0) {
                    console.warn("[Dashboard] No stats found for active ID, it might be invalid.");
                }

                setStats(dashboardStats);
                setDuplicateGroups(duplicates);
                setSalesReport(report);
            } catch (error) {
                console.error("Dashboard data fetch failed:", error);
                if ((error as any).code === 'permission-denied' || (error as any).message?.includes('not found')) {
                    router.push('/productions');
                }
            } finally {
                setIsDataLoading(false);
            }
        };

        if (!loading && user) {
            fetchData();

            const reservationsRef = collection(db, "reservations");
            const q = query(
                reservationsRef,
                where("userId", "==", user.uid)
            );
            unsubReservations = onSnapshot(q, () => {
                fetchData();
            });
        } else if (!loading && !user) {
            setIsDataLoading(false);
        }

        return () => {
            unsubReservations();
            unsubProduction();
        };
    }, [user, loading, router]);

    if (loading || (user && isDataLoading)) {
        return <div className="flex-center" style={{ height: '50vh' }}>読み込み中...</div>;
    }

    // ステータスバッジの計算
    const receptionBadge: Badge | undefined = production?.receptionStatus === 'OPEN'
        ? { label: '受付中', bg: '#dcfce7', color: '#166534', borderColor: '#bbf7d0' }
        : production?.receptionStatus === 'CLOSED'
            ? { label: '停止中', bg: '#f1f5f9', color: '#64748b', borderColor: '#e2e8f0' }
            : undefined;

    const reservationBadge: Badge | undefined = salesReport && salesReport.totalTickets > 0
        ? { label: `${salesReport.totalTickets}件`, bg: '#dbeafe', color: '#1e40af', borderColor: '#bfdbfe' }
        : undefined;

    const staffTokenCount = production?.staffTokens ? Object.keys(production.staffTokens).length : 0;
    const staffBadge: Badge | undefined = staffTokenCount > 0
        ? { label: `${staffTokenCount}名`, bg: '#f3e8ff', color: '#7c3aed', borderColor: '#e9d5ff' }
        : undefined;

    // href helper
    const prodHref = (path: string) => activeProductionId ? `/productions/${activeProductionId}${path}` : '/productions';

    // セクション定義
    const sections = [
        {
            id: 'settings',
            label: '公演の基本設定',
            description: '公演に必要な各種設定を行います',
            borderColor: '#6366f1',
            items: [
                { href: prodHref(''), icon: <Settings size={32} color="var(--primary)" />, title: '公演設定', desc: '価格・回・詳細設定' },
                { href: prodHref('/form-editor'), icon: <FileEdit size={32} color="var(--primary)" />, title: '予約フォーム編集', desc: '予約フォームの項目設定' },
                { href: prodHref('/email'), icon: <Mail size={32} color="var(--primary)" />, title: 'メール管理', desc: '自動メール・一斉送信の設定' },
            ]
        },
        {
            id: 'reservation',
            label: '予約・受付',
            description: '予約の受付設定と予約の管理',
            borderColor: '#0891b2',
            items: [
                { href: prodHref('/reception'), icon: <Bell size={32} color="var(--primary)" />, title: '予約受付設定', desc: '受付の開始・停止・期間設定', badge: receptionBadge },
                { href: '/reservations', icon: <Ticket size={32} color="var(--primary)" />, title: '予約管理', desc: '予約の確認・追加', badge: reservationBadge },
            ]
        },
        {
            id: 'operations',
            label: '当日の運営',
            description: '公演当日の受付・来場管理・スタッフ体制',
            borderColor: '#d97706',
            items: [
                { href: '/reception', icon: <Smartphone size={32} color="var(--primary)" />, title: '当日受付', desc: '来場処理・当日券対応' },
                { href: prodHref('/attendance'), icon: <Users size={32} color="var(--primary)" />, title: '来場状況', desc: 'リアルタイム着券状況の確認' },
                { href: prodHref('/staff'), icon: <Key size={32} color="var(--primary)" />, title: 'スタッフ管理', desc: '合鍵（スタッフ用URL）の発行と管理', badge: staffBadge },
            ]
        },
        {
            id: 'analytics',
            label: '集計・分析',
            description: '売上やアンケートの集計・分析',
            borderColor: '#64748b',
            items: [
                { href: prodHref('/report'), icon: <ClipboardList size={32} color="var(--primary)" />, title: 'レポート', desc: '売上・券種別の詳細集計' },
                { href: prodHref('/cashclose-report'), icon: <Wallet size={32} color="var(--primary)" />, title: 'レジ締めレポート', desc: '各公演回の精算結果を確認' },
                { href: prodHref('/survey'), icon: <FileEdit size={32} color="var(--primary)" />, title: 'アンケート管理', desc: 'アンケートの作成・集計・分析' },
            ]
        }
    ];

    return (
        <div className="dashboard">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h2 className="heading-lg" style={{ marginBottom: '0.2rem' }}>ダッシュボード</h2>
                    <p className="text-muted" style={{ fontSize: '0.9rem' }}>{profile?.troupeName || '劇団'} の制作管理</p>
                </div>
            </div>

            <DuplicateNotification groups={duplicateGroups} />

            {/* セットアップチェックリスト */}
            {activeProductionId && production && (
                <SetupChecklist production={production} productionId={activeProductionId} />
            )}

            {/* KPIサマリー + 予約状況テーブル */}
            <div className="stats-section" style={{ marginBottom: '3rem' }}>
                <h3 className="heading-md" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <BarChart3 size={22} color="var(--primary)" /> 予約状況
                </h3>

                {salesReport && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                        <div style={{
                            backgroundColor: 'var(--card-bg)',
                            borderRadius: 'var(--border-radius)',
                            border: '1px solid var(--card-border)',
                            padding: '1.25rem 1.5rem',
                            boxShadow: 'var(--shadow-sm)'
                        }}>
                            <div style={{ fontSize: '0.8rem', color: '#888', fontWeight: 'bold', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Wallet size={16} /> 売上予定金額</div>
                            <div style={{ fontSize: '1.6rem', fontWeight: '900', color: 'var(--foreground)' }}>{formatCurrency(salesReport.totalRevenue)}</div>
                        </div>
                        <div style={{
                            backgroundColor: 'var(--card-bg)',
                            borderRadius: 'var(--border-radius)',
                            border: '1px solid var(--card-border)',
                            padding: '1.25rem 1.5rem',
                            boxShadow: 'var(--shadow-sm)'
                        }}>
                            <div style={{ fontSize: '0.8rem', color: '#888', fontWeight: 'bold', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Ticket size={16} /> 予約総数</div>
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
                        boxShadow: 'var(--shadow-sm)'
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
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><Calendar size={16} /> {dateKey} ({dayOfWeek})</span>
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

            {/* メニューセクション */}
            {sections.map(section => (
                <div key={section.id} className="dashboard-section" style={{ borderLeftColor: section.borderColor }}>
                    <div className="section-header">
                        <h3>{section.label}</h3>
                        <p>{section.description}</p>
                    </div>
                    <div className="menu-grid">
                        {section.items.map(item => (
                            <Link href={item.href} className="menu-card" key={item.href}>
                                {item.badge && (
                                    <span className="card-badge" style={{
                                        backgroundColor: item.badge.bg,
                                        color: item.badge.color,
                                        borderColor: item.badge.borderColor
                                    }}>
                                        {item.badge.label}
                                    </span>
                                )}
                                <span className="icon">{item.icon}</span>
                                <h3>{item.title}</h3>
                                <p>{item.desc}</p>
                            </Link>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
