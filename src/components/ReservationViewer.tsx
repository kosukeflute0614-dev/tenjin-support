'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { serializeDocs, toDate } from '@/lib/firestore-utils';
import { FirestoreReservation, TicketType } from '@/types';

interface Performance {
    id: string;
    startTime: any;
    capacity: number;
    bookedCount?: number;
    [key: string]: any;
}

interface Props {
    productionId: string;
    productionTitle: string;
    performances: Performance[];
    ticketTypes: TicketType[];
}

export default function ReservationViewer({ productionId, productionTitle, performances, ticketTypes }: Props) {
    const [allReservations, setAllReservations] = useState<FirestoreReservation[]>([]);
    const [searchTerm, setSearchTerm] = useState('');

    const sortedPerformances = [...performances].sort((a, b) => {
        const timeA = a.startTime ? toDate(a.startTime).getTime() : 0;
        const timeB = b.startTime ? toDate(b.startTime).getTime() : 0;
        return timeA - timeB;
    });

    // 全公演回の予約をリアルタイム購読
    useEffect(() => {
        if (!productionId) return;

        const q = query(
            collection(db, 'reservations'),
            where('productionId', '==', productionId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docs = serializeDocs<FirestoreReservation>(snapshot.docs)
                .filter(r => r.status !== 'CANCELED');
            setAllReservations(docs);
        });

        return () => unsubscribe();
    }, [productionId]);

    // 公演回ごとの予約数を集計
    const perfStats = sortedPerformances.map(perf => {
        const perfReservations = allReservations.filter(r => r.performanceId === perf.id);
        const ticketCount = perfReservations.reduce((sum, r) =>
            sum + (r.tickets || []).reduce((ts, t) => ts + (t.count || 0), 0), 0);
        return { perf, ticketCount };
    });

    const totalCapacity = sortedPerformances.reduce((sum, p) => sum + (p.capacity || 0), 0);
    const totalTickets = perfStats.reduce((sum, s) => sum + s.ticketCount, 0);

    // 全公演混ぜて、ふりがな順でソート
    const allSorted = [...allReservations].sort((a, b) => {
        const nameA = a.customerNameKana || a.customerName || '';
        const nameB = b.customerNameKana || b.customerName || '';
        return nameA.localeCompare(nameB, 'ja');
    });

    const filteredReservations = searchTerm
        ? allSorted.filter(r =>
            r.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (r.customerNameKana || '').includes(searchTerm)
        )
        : allSorted;

    return (
        <div style={{ backgroundColor: '#f4f7f6', minHeight: '100vh', paddingBottom: '2rem' }}>
            <header style={{ backgroundColor: 'var(--card-bg)', padding: '1rem', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', position: 'sticky', top: 0, zIndex: 100 }}>
                <div className="container" style={{ maxWidth: '800px' }}>
                    <h1 style={{ fontSize: '1rem', fontWeight: 'bold', margin: 0 }}>{productionTitle}</h1>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>予約状況確認（読み取り専用）</p>
                </div>
            </header>

            <main className="container" style={{ maxWidth: '800px', marginTop: '1.5rem' }}>
                {/* 各公演回の予約数 */}
                <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '1rem', color: 'var(--text-muted)' }}>公演回ごとの予約数</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {perfStats.map(({ perf, ticketCount }) => {
                            const d = perf.startTime ? toDate(perf.startTime) : null;
                            const dateStr = d ? `${d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' })} ${d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}` : '';
                            const ratio = perf.capacity ? ticketCount / perf.capacity : 0;
                            return (
                                <div key={perf.id} style={{
                                    padding: '0.75rem 1rem',
                                    borderRadius: '8px',
                                    border: '1px solid var(--card-border)',
                                    background: 'var(--card-bg)',
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                        <span style={{ fontSize: '0.85rem', fontWeight: '500' }}>{dateStr}</span>
                                        <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                                            {ticketCount} / {perf.capacity || '—'}
                                        </span>
                                    </div>
                                    <div style={{ width: '100%', height: '6px', backgroundColor: '#edf2f7', borderRadius: '3px', overflow: 'hidden' }}>
                                        <div style={{
                                            width: `${Math.min(100, ratio * 100)}%`,
                                            height: '100%',
                                            backgroundColor: ratio >= 1 ? '#d32f2f' : 'var(--primary)',
                                            borderRadius: '3px',
                                            transition: 'width 0.3s ease',
                                        }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {/* 合計 */}
                    <div style={{
                        marginTop: '0.75rem',
                        padding: '0.75rem 1rem',
                        borderRadius: '8px',
                        background: 'var(--secondary)',
                        borderTop: '2px solid var(--card-border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>全公演 合計</span>
                        <span style={{ fontSize: '1rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                            {totalTickets} / {totalCapacity}
                        </span>
                    </div>
                </div>

                {/* 予約者一覧（全公演混合・ふりがな順） */}
                <div className="card" style={{ padding: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-muted)', margin: 0 }}>
                            予約者一覧
                        </h3>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{filteredReservations.length}件</span>
                    </div>

                    {/* 検索 */}
                    <div style={{ position: 'relative', marginBottom: '1rem' }}>
                        <input
                            type="search"
                            className="input"
                            placeholder="名前で検索..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%',
                                height: '3rem',
                                fontSize: '0.95rem',
                                borderRadius: '10px',
                                paddingLeft: '2.5rem',
                                backgroundColor: '#f8fafc',
                                border: '1px solid #e2e8f0',
                            }}
                        />
                        <span style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', fontSize: '1.1rem', color: '#94a3b8' }}>🔍</span>
                    </div>

                    {/* リスト */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        {filteredReservations.length === 0 ? (
                            <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                {searchTerm ? '該当する予約者がいません' : '予約はまだありません'}
                            </p>
                        ) : (
                            filteredReservations.map((r) => {
                                const totalTickets = (r.tickets || []).reduce((sum, t) => sum + (t.count || 0), 0);
                                return (
                                    <div key={r.id} style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '0.6rem 0.75rem',
                                        borderRadius: '6px',
                                        border: '1px solid #f0f0f0',
                                        background: 'var(--card-bg)',
                                    }}>
                                        <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{r.customerName}</span>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--primary)', flexShrink: 0 }}>
                                            {totalTickets}枚
                                        </span>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
