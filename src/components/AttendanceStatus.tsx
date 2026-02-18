'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { formatDateTime } from '@/lib/format';
import { FirestoreReservation } from '@/types';

type Props = {
    productionId: string;
    performances: any[];
};

export default function AttendanceStatus({ productionId, performances }: Props) {
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
        if (!selectedPerfId) return;

        setLoading(true);
        const q = query(
            collection(db, "reservations"),
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
    }, [selectedPerfId]);

    // 集計
    const stats = {
        totalReservations: 0,
        confirmedAttendance: 0, // 事前予約の来場済み
        notAttended: 0,       // 未着
        sameDayTickets: 0,    // 当日券
        totalCheckedIn: 0     // 合計来場数
    };

    reservations.forEach(res => {
        const ticketCount = res.tickets?.reduce((sum, t) => sum + (t.count || 0), 0) || 0;

        if (res.source === 'SAME_DAY') {
            stats.sameDayTickets += ticketCount;
        } else {
            stats.totalReservations += ticketCount;
            stats.confirmedAttendance += (res.checkedInTickets || 0);
        }
    });

    stats.notAttended = Math.max(0, stats.totalReservations - stats.confirmedAttendance);
    stats.totalCheckedIn = stats.confirmedAttendance + stats.sameDayTickets;

    const selectedPerf = performances.find(p => p.id === selectedPerfId);

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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>

                    {/* 未着（最重要） */}
                    <div className="card" style={{ padding: '2rem', textAlign: 'center', borderTop: '6px solid var(--primary)', background: '#fffcfc' }}>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>未着 (あと何人)</div>
                        <div style={{ fontSize: '4.5rem', fontWeight: '900', color: 'var(--primary)', lineHeight: 1 }}>
                            {stats.notAttended}
                        </div>
                        <div style={{ marginTop: '0.5rem', fontSize: '1.1rem', fontWeight: 'bold' }}>名</div>
                    </div>

                    {/* 来場済み */}
                    <div className="card" style={{ padding: '2rem', textAlign: 'center', borderTop: '6px solid var(--success)' }}>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>来場済み (合計)</div>
                        <div style={{ fontSize: '3.5rem', fontWeight: 'bold', color: 'var(--success)', lineHeight: 1 }}>
                            {stats.totalCheckedIn}
                        </div>
                        <div style={{ marginTop: '0.5rem', fontSize: '1rem' }}>名</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                            (内 当日券: {stats.sameDayTickets}枚)
                        </div>
                    </div>

                    {/* 予約総数 */}
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

                </div>
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
