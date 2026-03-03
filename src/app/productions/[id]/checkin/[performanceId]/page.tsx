'use client';

import { useEffect, useState } from 'react';
import { db } from "@/lib/firebase";
import {
    collection,
    getDocs,
    getDoc,
    doc,
    query,
    where,
    onSnapshot
} from "firebase/firestore";
import { notFound, useRouter } from 'next/navigation';
import { toDate } from '@/lib/firestore-utils';
import { formatDateTime } from '@/lib/format';
import CheckinList from '@/components/CheckinList';
import SameDayTicketForm from '@/components/SameDayTicketForm';
import CashCloseForm from '@/components/CashCloseForm';
import GlobalReservationSearch from '@/components/GlobalReservationSearch';
import Link from 'next/link';
import { Production, Performance, FirestoreReservation } from "@/types";
import { useAuth } from '@/components/AuthProvider';
import Breadcrumb from '@/components/Breadcrumb';
import { serializeDoc, serializeDocs } from '@/lib/firestore-utils';

export default function CheckinPage({ params }: { params: any }) {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [data, setData] = useState<{
        production: Production,
        performance: Performance,
        reservations: FirestoreReservation[],
        remainingCount: number
    } | null>(null);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showCheckedIn, setShowCheckedIn] = useState(false);
    const [activeTab, setActiveTab] = useState<'LIST' | 'SAME_DAY' | 'CASH_CLOSE'>('LIST');

    useEffect(() => {
        let unsubscribeReservations: () => void;
        let unsubscribeLogs: () => void;

        const fetchData = async () => {
            if (user) {
                const resolvedParams = await params;
                const { id: productionId, performanceId } = resolvedParams;

                try {
                    // 1. Get Production
                    const productionRef = doc(db, "productions", productionId);
                    const productionSnap = await getDoc(productionRef);
                    if (!productionSnap.exists()) {
                        setIsInitialLoading(false);
                        return;
                    }
                    const production = serializeDoc<Production>(productionSnap);

                    // Check Ownership
                    if (production.userId !== user.uid) {
                        router.push('/productions');
                        return;
                    }

                    // 2. Get Performance
                    const performanceRef = doc(db, "performances", performanceId);
                    const performanceSnap = await getDoc(performanceRef);
                    if (!performanceSnap.exists()) {
                        setIsInitialLoading(false);
                        return;
                    }
                    const performance = serializeDoc<Performance>(performanceSnap);

                    // 3. Set up Real-time listeners
                    const reservationsRef = collection(db, "reservations");
                    const qRes = query(
                        reservationsRef,
                        where("userId", "==", user.uid),
                        where("performanceId", "==", performanceId)
                    );

                    const logsRef = collection(db, "checkinLogs");
                    const qLogs = query(
                        logsRef,
                        where("userId", "==", user.uid),
                        where("performanceId", "==", performanceId)
                    );

                    let currentReservations: FirestoreReservation[] = [];
                    let currentLogs: any[] = [];

                    const updateData = (res: FirestoreReservation[], logs: any[]) => {
                        const logsByResId: { [key: string]: any[] } = {};
                        logs.forEach(log => {
                            if (!logsByResId[log.reservationId]) logsByResId[log.reservationId] = [];
                            logsByResId[log.reservationId].push(log);
                        });

                        const reservationsWithLogs = res.map(r => ({
                            ...r,
                            logs: (logsByResId[r.id] || []).sort((a, b) => {
                                const tA = a.createdAt?.seconds || 0;
                                const tB = b.createdAt?.seconds || 0;
                                return tB - tA;
                            })
                        }));

                        const bookedCount = res.reduce((sum, item) => {
                            return sum + (item.tickets || []).reduce((tSum: number, t: any) => tSum + (t.count || 0), 0);
                        }, 0);
                        const remainingCount = performance.capacity - bookedCount;

                        setData({
                            production,
                            performance,
                            reservations: reservationsWithLogs,
                            remainingCount
                        });
                        setIsInitialLoading(false);
                    };

                    unsubscribeReservations = onSnapshot(qRes, (snapshot) => {
                        const allRes = serializeDocs<FirestoreReservation>(snapshot.docs);
                        currentReservations = allRes
                            .filter(res => res.status !== 'CANCELED')
                            .map(res => ({
                                ...res,
                                tickets: (res.tickets || []).map((t: any) => ({
                                    ...t,
                                    ticketType: production.ticketTypes.find((tt: any) => tt.id === t.ticketTypeId) || { name: '不明な券種', price: t.price || 0 }
                                }))
                            }));
                        updateData(currentReservations, currentLogs);
                    }, (err) => {
                        console.error("Reservations Snapshot error:", err);
                        setIsInitialLoading(false);
                    });

                    unsubscribeLogs = onSnapshot(qLogs, (snapshot) => {
                        currentLogs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                        updateData(currentReservations, currentLogs);
                    }, (err) => {
                        console.error("Logs Snapshot error:", err);
                    });

                } catch (err) {
                    console.error("Fetch error:", err);
                    setIsInitialLoading(false);
                }
            } else if (!loading) {
                setIsInitialLoading(false);
            }
        };

        fetchData();

        return () => {
            if (unsubscribeReservations) unsubscribeReservations();
            if (unsubscribeLogs) unsubscribeLogs();
        };
    }, [user, loading, params, router]);

    if (loading || isInitialLoading) {
        return <div className="flex-center" style={{ height: '50vh' }}>読み込み中...</div>;
    }

    if (!user) {
        return (
            <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>
                <h2 className="heading-md">ログインが必要です</h2>
                <Link href="/" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>ホームに戻る</Link>
            </div>
        );
    }

    if (!data) {
        return notFound();
    }

    const { production, performance, reservations, remainingCount } = data;

    // フィルタリングとソート
    const filteredReservations = reservations
        .filter(res => {
            // 検索ワードにマッチするか
            const matchesSearch = res.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (res.customerNameKana || '').includes(searchTerm);

            // 入場済み表示フィルタ
            // 検索ワードが入っている場合は自動的に全員を表示し、空の場合はチェックボックスに従う
            const isFullyCheckedIn = res.checkinStatus === 'CHECKED_IN';
            const matchesCheckin = (showCheckedIn || searchTerm) ? true : !isFullyCheckedIn;

            return matchesSearch && matchesCheckin;
        })
        .sort((a, b) => {
            // 未入場（または一部入場）を上に、全員入場済みを下に
            const score = (r: any) => r.checkinStatus === 'CHECKED_IN' ? 1 : 0;
            if (score(a) !== score(b)) return score(a) - score(b);

            // 名前順でソート（既存の挙動を尊重）
            const nameA = a.customerNameKana || a.customerName;
            const nameB = b.customerNameKana || b.customerName;
            return nameA.localeCompare(nameB, 'ja');
        });

    // 来場統計の計算
    const stats = {
        total: reservations.reduce((sum, r) => sum + (r.tickets || []).reduce((ts: number, t: any) => ts + (t.count || 0), 0), 0),
        checkedIn: reservations.reduce((sum, r) => sum + (r.checkedInTickets || 0), 0)
    };

    const startTime = performance?.startTime;
    const startDate = startTime ? toDate(startTime) : null;
    const perfDateStr = startDate ? startDate.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }) : '';
    const perfTimeStr = startDate ? startDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '';

    return (
        <div className="container" style={{ paddingBottom: '4rem', maxWidth: '1200px' }}>
            <Breadcrumb items={[
                { label: 'ダッシュボード', href: '/dashboard' },
                { label: data.production.title, href: `/productions/${data.production.id}` },
                { label: 'チェックイン' }
            ]} />
            <header style={{
                marginBottom: '2rem',
                borderBottom: '1px solid #eee',
                padding: '1rem 0',
                position: 'sticky',
                top: 0,
                backgroundColor: '#fff',
                zIndex: 100
            }}>
                <Link href="/reception" className="btn btn-secondary" style={{ marginBottom: '1rem', display: 'inline-block', fontSize: '0.85rem', borderRadius: '8px' }}>
                    &larr; 公演回の選択に戻る
                </Link>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.5rem' }}>
                    <div style={{ flex: '1', minWidth: '300px' }}>
                        <div style={{ marginBottom: '0.5rem' }}>
                            <span style={{ background: 'var(--secondary)', color: 'var(--primary)', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                主催者
                            </span>
                        </div>
                        <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#666', marginBottom: '0.25rem' }}>
                            公演：{production.title}
                        </div>
                        <h2 style={{ fontSize: '1.8rem', fontWeight: '900', margin: 0, color: 'var(--primary)', lineHeight: '1.2' }}>
                            {perfDateStr} {perfTimeStr}
                        </h2>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        {/* 進捗バー */}
                        <div style={{ width: '180px', backgroundColor: '#fff', padding: '0.75rem', borderRadius: '12px', border: '1px solid #eee', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '0.4rem' }}>
                                <span>来場進捗</span>
                                <span>{stats.checkedIn}/{stats.total}人</span>
                            </div>
                            <div style={{ width: '100%', height: '8px', backgroundColor: '#edf2f7', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{
                                    width: `${Math.min(100, (stats.checkedIn / (stats.total || 1)) * 100)}%`,
                                    height: '100%',
                                    backgroundColor: 'var(--primary)',
                                    transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
                                }} />
                            </div>
                        </div>

                        {/* 当日券残数 */}
                        <div style={{
                            background: 'white',
                            padding: '0.75rem 1.25rem',
                            borderRadius: '12px',
                            border: '2px solid var(--primary)',
                            textAlign: 'center',
                            minWidth: '120px',
                            boxShadow: '0 4px 12px rgba(var(--primary-rgb), 0.1)'
                        }}>
                            <div style={{ fontSize: '0.65rem', color: '#666', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>当日券 残数</div>
                            <div style={{ fontSize: '1.6rem', fontWeight: '900', color: 'var(--primary)', lineHeight: '1' }}>
                                {remainingCount} <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>枚</span>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* タブナビゲーション */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                {(['LIST', 'SAME_DAY', 'CASH_CLOSE'] as const).map((tab) => {
                    const labels = { LIST: '予約リスト', SAME_DAY: '当日券発行', CASH_CLOSE: 'レジ締め' };
                    return (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            style={{
                                padding: '0.6rem 1.2rem',
                                borderRadius: '8px',
                                border: 'none',
                                fontSize: '0.9rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                                background: activeTab === tab ? 'var(--primary)' : '#e2e8f0',
                                color: activeTab === tab ? '#fff' : '#4a5568',
                            }}
                        >
                            {labels[tab]}
                        </button>
                    );
                })}
            </div>

            {activeTab === 'CASH_CLOSE' ? (
                /* レジ締めタブ */
                <CashCloseForm
                    productionId={production.id}
                    performanceId={performance.id}
                    userId={user.uid}
                    closedByType="ORGANIZER"
                    closedBy={user.uid}
                />
            ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '2rem', alignItems: 'start' }}>
                {/* 左カラム: メインコンテンツ */}
                <div className="card" style={{ padding: '1.5rem', borderRadius: '16px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                    {activeTab === 'LIST' && (
                    <>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: 0 }}>予約リスト ({filteredReservations.length}件)</h2>
                            <span style={{ fontSize: '0.8rem', color: '#666' }}>未入場の方を優先表示しています</span>
                        </div>
                        <div style={{ position: 'relative' }}>
                            <input
                                type="search"
                                className="input"
                                placeholder="名前またはカタカナで検索..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{
                                    height: '3.5rem',
                                    fontSize: '1rem',
                                    borderRadius: '12px',
                                    paddingLeft: '3rem',
                                    backgroundColor: '#f8fafc',
                                    border: '1px solid #e2e8f0',
                                    width: '100%',
                                    marginBottom: '1rem'
                                }}
                            />
                            <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', marginTop: '-0.5rem', fontSize: '1.2rem', color: '#94a3b8' }}>🔍</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0' }}>
                            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '0.9rem', color: '#4a5568', fontWeight: '500' }}>
                                <input
                                    type="checkbox"
                                    checked={showCheckedIn}
                                    onChange={(e) => setShowCheckedIn(e.target.checked)}
                                    style={{ width: '1.2rem', height: '1.2rem', cursor: 'pointer', marginRight: '0.5rem' }}
                                />
                                入場済みを表示
                            </label>
                        </div>
                    </div>

                    <CheckinList
                        reservations={filteredReservations as any}
                        performanceId={performance.id}
                        productionId={production.id}
                    />
                    </>
                    )}
                    {activeTab === 'SAME_DAY' && (
                    <>
                        <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid #f0f0f0', paddingBottom: '0.75rem' }}>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: 0 }}>当日券を発行</h2>
                        </div>
                        <SameDayTicketForm
                            productionId={production.id}
                            performanceId={performance.id}
                            ticketTypes={production.ticketTypes}
                            remainingCount={remainingCount}
                            nextNumber={reservations.filter(r => r.source === 'SAME_DAY').length + 1}
                        />
                    </>
                    )}
                </div>

                {/* 右カラム: サイドバー */}
                <aside style={{ position: 'sticky', top: '7.5rem' }}>
                    <div className="card" style={{ padding: '1.5rem', borderRadius: '16px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                        <div style={{ marginBottom: '0.75rem' }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 'bold', margin: 0, color: '#666' }}>来場状況</h3>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '0.4rem' }}>
                            <span>入場済み</span>
                            <span>{stats.checkedIn}/{stats.total}人</span>
                        </div>
                        <div style={{ width: '100%', height: '8px', backgroundColor: '#edf2f7', borderRadius: '4px', overflow: 'hidden', marginBottom: '1rem' }}>
                            <div style={{
                                width: `${Math.min(100, (stats.checkedIn / (stats.total || 1)) * 100)}%`,
                                height: '100%',
                                backgroundColor: 'var(--primary)',
                                transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
                            }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#555' }}>
                            <span>当日券残数</span>
                            <span style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{remainingCount}枚</span>
                        </div>
                    </div>

                    <div style={{ marginTop: '1rem' }}>
                        <Link
                            href={`/productions/${production.id}/cashclose-report`}
                            className="btn btn-secondary"
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                fontSize: '0.85rem',
                                borderRadius: '12px',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                gap: '0.5rem',
                            }}
                        >
                            レジ締めレポート
                        </Link>
                    </div>

                    <div style={{ marginTop: '1rem', padding: '1rem', background: '#eef2f1', borderRadius: '12px', fontSize: '0.8rem', color: '#4a5568' }}>
                        <p style={{ margin: 0, fontWeight: 'bold' }}>ヒント</p>
                        <p style={{ margin: '0.25rem 0 0 0' }}>
                            {activeTab === 'LIST'
                                ? '予約リストからお客様を検索し、チェックインを行ってください。'
                                : '当日の飛び込みのお客様はこちらから情報を入力してチケットを発行してください。'
                            }
                        </p>
                    </div>
                </aside>
            </div>
            )}
        </div>
    );
}
