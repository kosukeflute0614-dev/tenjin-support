'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { formatDateTime } from '@/lib/format';
import { FirestoreReservation } from '@/types';
import { useAuth } from './AuthProvider';

type Props = {
    productionId: string;
    performances: any[];
};

export default function AttendanceStatus({ productionId, performances }: Props) {
    const { user } = useAuth();
    const [selectedPerfId, setSelectedPerfId] = useState<string>('');
    const [reservations, setReservations] = useState<FirestoreReservation[]>([]);
    const [loading, setLoading] = useState(true);

    // デフォルトで直近の公演（現在時刻に近いもの）を選択
    useEffect(() => {
        if (performances.length > 0 && !selectedPerfId) {
            const now = new Date();
            const closest = performances.reduce((prev, curr) => {
                const prevTime = new Date(prev.startTime).getTime();
                const currTime = new Date(curr.startTime).getTime();
                return Math.abs(currTime - now.getTime()) < Math.abs(prevTime - now.getTime()) ? curr : prev;
            });
            setSelectedPerfId(closest.id);
        }
    }, [performances, selectedPerfId]);

    // 選択された公演の予約をリアルタイム監視
    useEffect(() => {
        if (!selectedPerfId || !user) return;

        setLoading(true);
        const q = query(
            collection(db, "reservations"),
            where("productionId", "==", productionId),
            where("performanceId", "==", selectedPerfId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const resData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as FirestoreReservation));

            // キャンセルを除外
            setReservations(resData.filter(r => r.status !== 'CANCELED'));
            setLoading(false);
        }, (err) => {
            console.error("Attendance listener error:", err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [selectedPerfId, user]);

    const selectedPerf = performances.find(p => p.id === selectedPerfId);

    // 集計
    const stats = {
        totalReservations: 0,
        confirmedAttendance: 0,
        notAttended: 0,
        sameDayTickets: 0,
        totalCheckedIn: 0,
        ticketTypeBreakdown: {} as Record<string, { name: string, total: number, checkedIn: number }>
    };

    // Initialize breakdown
    selectedPerf?.ticketTypes?.forEach((tt: any) => {
        stats.ticketTypeBreakdown[tt.id] = { name: tt.name, total: 0, checkedIn: 0 };
    });

    reservations.forEach(res => {
        res.tickets?.forEach(t => {
            const count = t.count || 0;
            const ttId = t.ticketTypeId;

            if (res.source === 'SAME_DAY') {
                stats.sameDayTickets += count;
            } else {
                stats.totalReservations += count;
                // Note: checkedInTickets is per reservation, but we want to distribute it
                // Logic: If the whole reservation is checked in, all its tickets are checked in.
                // If partially checked in, we simplify for the breakdown display.
            }

            if (stats.ticketTypeBreakdown[ttId]) {
                stats.ticketTypeBreakdown[ttId].total += count;
                if (res.source === 'SAME_DAY') {
                    stats.ticketTypeBreakdown[ttId].checkedIn += count;
                } else if (res.checkinStatus === 'CHECKED_IN') {
                    stats.ticketTypeBreakdown[ttId].checkedIn += count;
                } else if (res.checkedInTickets && res.checkedInTickets > 0) {
                    // Partial checkin - simplified attribution to first ticket types
                    // (In reality this is complex with multi-type reservations)
                }
            }
        });

        if (res.source !== 'SAME_DAY') {
            stats.confirmedAttendance += (res.checkedInTickets || 0);
        }
    });

    stats.notAttended = Math.max(0, stats.totalReservations - stats.confirmedAttendance);
    stats.totalCheckedIn = stats.confirmedAttendance + stats.sameDayTickets;

    const [listTab, setListTab] = useState<'not_attended' | 'attended'>('not_attended');

    return (
        <div style={{ display: 'grid', gap: '2rem' }}>
            {/* 公演選択 */}
            <div className="form-group">
                <label className="label">表示する公演回</label>
                <select
                    className="input"
                    value={selectedPerfId}
                    onChange={(e) => setSelectedPerfId(e.target.value)}
                    style={{ maxWidth: '400px' }}
                >
                    {performances.map(perf => (
                        <option key={perf.id} value={perf.id}>
                            {formatDateTime(perf.startTime)}
                        </option>
                    ))}
                </select>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>読み込み中...</div>
            ) : (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>

                        {/* 予約総数（左） */}
                        <div className="card" style={{ padding: '2rem', textAlign: 'center', borderTop: '6px solid #64748b' }}>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>事前予約総数</div>
                            <div style={{ fontSize: '3.5rem', fontWeight: 'bold', color: '#334155', lineHeight: 1 }}>
                                {stats.totalReservations}
                            </div>
                            <div style={{ marginTop: '0.5rem', fontSize: '1rem' }}>枚</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                定員: {selectedPerf?.capacity || '-'}
                            </div>
                        </div>

                        {/* 来場済み（中） */}
                        <div className="card" style={{ padding: '2rem', textAlign: 'center', borderTop: '6px solid var(--success)' }}>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>来場人数 (合計)</div>
                            <div style={{ fontSize: '3.5rem', fontWeight: 'bold', color: 'var(--success)', lineHeight: 1 }}>
                                {stats.totalCheckedIn}
                            </div>
                            <div style={{ marginTop: '0.5rem', fontSize: '1rem' }}>人</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                (内 当日券: {stats.sameDayTickets}枚)
                            </div>
                        </div>

                        {/* 未着（右・最重要） */}
                        <div className="card" style={{ padding: '2rem', textAlign: 'center', borderTop: '6px solid var(--primary)', background: '#fffcfc' }}>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>未着 (あと何人)</div>
                            <div style={{ fontSize: '4.5rem', fontWeight: '900', color: 'var(--primary)', lineHeight: 1 }}>
                                {stats.notAttended}
                            </div>
                            <div style={{ marginTop: '0.5rem', fontSize: '1.1rem', fontWeight: 'bold' }}>人</div>
                        </div>
                    </div>

                    {/* 券種別内訳 */}
                    <div className="card" style={{ padding: '1.5rem' }}>
                        <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: 'var(--text-muted)' }}>券種別詳細</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                            {Object.values(stats.ticketTypeBreakdown).map((tt: any, idx) => (
                                <div key={idx} style={{ padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>{tt.name}</div>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.3rem' }}>
                                        <span style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>{tt.checkedIn}</span>
                                        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>/ {tt.total}</span>
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: tt.total - tt.checkedIn > 0 ? 'var(--primary)' : 'var(--text-muted)', marginTop: '0.2rem' }}>
                                        未着: {tt.total - tt.checkedIn}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 名前一覧セクション */}
                    <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', borderBottom: '1px solid var(--card-border)', background: '#f8fafc' }}>
                            <button
                                onClick={() => setListTab('not_attended')}
                                style={{
                                    flex: 1, padding: '1rem', border: 'none', background: listTab === 'not_attended' ? '#fff' : 'transparent',
                                    fontWeight: 'bold', color: listTab === 'not_attended' ? 'var(--primary)' : 'var(--text-muted)',
                                    borderBottom: listTab === 'not_attended' ? '3px solid var(--primary)' : 'none', cursor: 'pointer'
                                }}
                            >
                                未着者リスト ({reservations.filter(r => (r.tickets?.reduce((s, t) => s + (t.count || 0), 0) || 0) > (r.checkedInTickets || 0) && r.source !== 'SAME_DAY').length}組)
                            </button>
                            <button
                                onClick={() => setListTab('attended')}
                                style={{
                                    flex: 1, padding: '1rem', border: 'none', background: listTab === 'attended' ? '#fff' : 'transparent',
                                    fontWeight: 'bold', color: listTab === 'attended' ? 'var(--success)' : 'var(--text-muted)',
                                    borderBottom: listTab === 'attended' ? '3px solid var(--success)' : 'none', cursor: 'pointer'
                                }}
                            >
                                来場済みリスト ({reservations.filter(r => (r.checkedInTickets || 0) > 0 || r.source === 'SAME_DAY').length}組)
                            </button>
                        </div>

                        <div style={{ maxHeight: '500px', overflowY: 'auto', padding: '1rem' }}>
                            {listTab === 'not_attended' ? (
                                <div style={{ display: 'grid', gap: '0.75rem' }}>
                                    {reservations
                                        .filter(r => (r.tickets?.reduce((s, t) => s + (t.count || 0), 0) || 0) > (r.checkedInTickets || 0) && r.source !== 'SAME_DAY')
                                        .sort((a, b) => {
                                            // かながあればかなで、なければ名前で比較
                                            const nameA = a.customerNameKana || a.customerName || '';
                                            const nameB = b.customerNameKana || b.customerName || '';
                                            return nameA.localeCompare(nameB, 'ja');
                                        })
                                        .map(r => {
                                            const total = r.tickets?.reduce((s, t) => s + (t.count || 0), 0) || 0;
                                            const arrived = r.checkedInTickets || 0;
                                            return (
                                                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.8rem 1.2rem', background: '#fff', border: '1px solid #edf2f7', borderRadius: '8px' }}>
                                                    <div>
                                                        <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{r.customerName}</span>
                                                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>様</span>
                                                        {arrived > 0 && <span style={{ marginLeft: '0.8rem', padding: '2px 8px', background: '#fef3c7', color: '#92400e', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>🟡 一部来場 ({arrived}/{total})</span>}
                                                    </div>
                                                    <div style={{ fontWeight: 'bold' }}>{total - arrived} 名 未着</div>
                                                </div>
                                            );
                                        })
                                    }
                                    {reservations.filter(r => (r.tickets?.reduce((s, t) => s + (t.count || 0), 0) || 0) > (r.checkedInTickets || 0) && r.source !== 'SAME_DAY').length === 0 && (
                                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>対象者がいません</div>
                                    )}
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gap: '0.75rem' }}>
                                    {reservations
                                        .filter(r => (r.checkedInTickets || 0) > 0 || r.source === 'SAME_DAY')
                                        .sort((a, b) => {
                                            // 1. source によるソート (PRE_RESERVATION < SAME_DAY)
                                            if (a.source === 'PRE_RESERVATION' && b.source === 'SAME_DAY') return -1;
                                            if (a.source === 'SAME_DAY' && b.source === 'PRE_RESERVATION') return 1;

                                            // 2. 名前のあいうえお順
                                            const nameA = a.customerNameKana || a.customerName || '';
                                            const nameB = b.customerNameKana || b.customerName || '';
                                            return nameA.localeCompare(nameB, 'ja');
                                        })
                                        .map(r => {
                                            const total = r.tickets?.reduce((s, t) => s + (t.count || 0), 0) || 0;
                                            const arrived = r.checkedInTickets || 0;
                                            const isSameDay = r.source === 'SAME_DAY';
                                            const isPartial = !isSameDay && arrived < total;

                                            return (
                                                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.8rem 1.2rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                                                    <div>
                                                        <span style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#475569' }}>{r.customerName || '当日券客'}</span>
                                                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>様</span>
                                                        {isSameDay && <span style={{ marginLeft: '0.8rem', padding: '2px 8px', background: '#e2e8f0', color: '#475569', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>当日券</span>}
                                                        {isPartial && <span style={{ marginLeft: '0.8rem', padding: '2px 8px', background: '#fef3c7', color: '#92400e', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>一部来場</span>}
                                                    </div>
                                                    <div style={{ fontWeight: 'bold', color: 'var(--success)' }}>
                                                        {isSameDay ? total : `${arrived} / ${total}`} 名 入場済
                                                    </div>
                                                </div>
                                            );
                                        })
                                    }
                                    {reservations.filter(r => (r.checkedInTickets || 0) > 0 || r.source === 'SAME_DAY').length === 0 && (
                                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>対象者がいません</div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}

            <div style={{
                padding: '1rem',
                backgroundColor: '#f8fafc',
                borderRadius: '8px',
                fontSize: '0.85rem',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
            }}>
                <span style={{ fontSize: '1.2rem' }}>⚡</span>
                受付での操作（チェックイン・当日券登録）はリアルタイムにこの画面に反映されます。
            </div>
        </div>
    );
}
