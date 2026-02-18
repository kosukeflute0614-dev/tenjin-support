'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getActiveProductionId } from '@/app/actions/production-context';
import { fetchDashboardStatsClient, fetchDuplicateReservationsClient } from '@/lib/client-firestore';
import { formatDate, formatTime } from '@/lib/format';
import DuplicateNotification from '@/components/DuplicateNotification';
import { useAuth } from '@/components/AuthProvider';
import { PerformanceStats, DuplicateGroup } from '@/types';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [activeProductionId, setActiveProductionId] = useState<string | null>(null);
  const [stats, setStats] = useState<PerformanceStats[]>([]);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(true);

  useEffect(() => {
    let unsubscribe: () => void = () => { };

    const fetchData = async () => {
      if (!user) return;
      const activeId = await getActiveProductionId();
      if (!activeId) {
        router.push('/productions');
        return;
      }
      setActiveProductionId(activeId);

      try {
        const [dashboardStats, duplicates] = await Promise.all([
          fetchDashboardStatsClient(activeId, user.uid),
          fetchDuplicateReservationsClient(activeId, user.uid)
        ]);
        setStats(dashboardStats);
        setDuplicateGroups(duplicates);
      } catch (error) {
        console.error("Dashboard data fetch failed:", error);
      } finally {
        setIsDataLoading(false);
      }
    };

    if (!loading && user) {
      fetchData();

      // Listen for changes in reservations to trigger refresh
      if (activeProductionId) {
        const reservationsRef = collection(db, "reservations");
        const q = query(
          reservationsRef,
          where("userId", "==", user.uid)
        );
        unsubscribe = onSnapshot(q, () => {
          // When any reservation changes, refresh stats
          fetchData();
        });
      }
    } else if (!loading && !user) {
      setIsDataLoading(false);
    }

    return () => unsubscribe();
  }, [user, loading, router, activeProductionId]); // Added activeProductionId to dependencies

  if (loading || (user && isDataLoading)) {
    return <div className="flex-center" style={{ height: '50vh' }}>読み込み中...</div>;
  }

  if (!user) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>🎭</div>
        <h2 className="heading-md">制作者ログイン</h2>
        <p className="text-muted">ダッシュボードを利用するにはログインしてください。</p>
        <Link href="/" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>ホームへ</Link>
      </div>
    );
  }

  if (!activeProductionId && !isDataLoading) {
    return null; // Will redirect via useEffect
  }

  return (
    <div className="dashboard">
      <h2 className="heading-lg">ダッシュボード</h2>

      <DuplicateNotification groups={duplicateGroups} />

      <div className="menu-grid">
        <Link href={`/productions/${activeProductionId}`} className="menu-card">
          <span className="icon">⚙️</span>
          <h3>公演設定</h3>
          <p>この公演の価格・回・詳細設定</p>
        </Link>
        <Link href="/reservations" className="menu-card">
          <span className="icon">🎫</span>
          <h3>予約管理</h3>
          <p>予約の確認・追加・メール送信</p>
        </Link>
        <Link href={`/productions/${activeProductionId}/reception`} className="menu-card">
          <span className="icon">🔔</span>
          <h3>予約受付</h3>
          <p>一般予約の開始・停止・期間設定</p>
        </Link>
        <Link href="/reception" className="menu-card">
          <span className="icon">📱</span>
          <h3>当日受付</h3>
          <p>来場処理・当日券対応</p>
        </Link>
      </div>

      <div className="stats-section" style={{ marginTop: '3rem' }}>
        <h3 className="heading-md" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '1.4rem' }}>📊</span> 公演の予約状況
        </h3>

        {stats.length === 0 ? (
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
                    // 日付ごとにグループ化
                    const grouped = stats.reduce((acc, perf) => {
                      const dateKey = formatDate(perf.startTime);
                      if (!acc[dateKey]) acc[dateKey] = [];
                      acc[dateKey].push(perf);
                      return acc;
                    }, {} as Record<string, typeof stats>);

                    const sortedDates = Object.keys(grouped).sort();

                    return sortedDates.map(dateKey => {
                      const dateObj = new Date(grouped[dateKey][0].startTime);
                      const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][dateObj.getDay()];

                      return (
                        <React.Fragment key={dateKey}>
                          {/* 日付セパレーター行 */}
                          <tr style={{ background: '#fcfcfc', borderBottom: '1px solid var(--card-border)' }}>
                            <td colSpan={3} style={{ padding: '0.6rem 1.2rem', fontWeight: 'bold', color: '#333', fontSize: '0.9rem' }}>
                              📅 {dateKey} ({dayOfWeek})
                            </td>
                          </tr>
                          {/* 公演回行 */}
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
                                <div style={{ width: '100%', height: '6px', backgroundColor: '#eeeff1', borderRadius: '3px', maxWidth: '140px', overflow: 'hidden' }}>
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
