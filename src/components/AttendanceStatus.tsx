'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { formatDateTime } from '@/lib/format';
import { FirestoreReservation } from '@/types';
import { useAuth } from './AuthProvider';
import styles from './AttendanceStatus.module.css';

type Props = {
    productionId: string;
    performances: any[];
    readOnly?: boolean;
};

export default function AttendanceStatus({ productionId, performances, readOnly = false }: Props) {
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
        if (!selectedPerfId || (!user && !readOnly)) return;

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
    }, [selectedPerfId, user, readOnly]);

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
            }

            if (stats.ticketTypeBreakdown[ttId]) {
                stats.ticketTypeBreakdown[ttId].total += count;
                if (res.source === 'SAME_DAY') {
                    stats.ticketTypeBreakdown[ttId].checkedIn += count;
                } else if (res.checkinStatus === 'CHECKED_IN') {
                    stats.ticketTypeBreakdown[ttId].checkedIn += count;
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

    const capacity = selectedPerf?.capacity || 0;
    const sameDayRemaining = Math.max(0, capacity - stats.totalReservations - stats.sameDayTickets);
    const isZero = sameDayRemaining === 0;

    // フィルタ済みリスト
    const notAttendedList = reservations
        .filter(r => (r.tickets?.reduce((s, t) => s + (t.count || 0), 0) || 0) > (r.checkedInTickets || 0) && r.source !== 'SAME_DAY')
        .sort((a, b) => {
            const nameA = a.customerNameKana || a.customerName || '';
            const nameB = b.customerNameKana || b.customerName || '';
            return nameA.localeCompare(nameB, 'ja');
        });

    const attendedList = reservations
        .filter(r => (r.checkedInTickets || 0) > 0 || r.source === 'SAME_DAY')
        .sort((a, b) => {
            if (a.source === 'PRE_RESERVATION' && b.source === 'SAME_DAY') return -1;
            if (a.source === 'SAME_DAY' && b.source === 'PRE_RESERVATION') return 1;
            const nameA = a.customerNameKana || a.customerName || '';
            const nameB = b.customerNameKana || b.customerName || '';
            return nameA.localeCompare(nameB, 'ja');
        });

    return (
        <div className={styles.wrapper}>
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
                    {/* === 統計カード群 === */}
                    <div className={styles.statsGrid}>
                        {/* 上段: 予約総数 / 来場合計 / 未着 (スマホ3列) */}
                        <div className={styles.statsRow1}>
                            {/* 事前予約総数 */}
                            <div className={`${styles.statCard} ${styles.borderSlate}`}>
                                <div className={styles.label}>事前予約総数</div>
                                <div className={`${styles.value} ${styles.colorSlate}`}>
                                    {stats.totalReservations}
                                </div>
                                <div className={styles.unit}>枚</div>
                                <div className={styles.sub}>
                                    定員: {selectedPerf?.capacity || '-'}
                                </div>
                            </div>

                            {/* 来場人数 (合計) */}
                            <div className={`${styles.statCard} ${styles.borderSuccess}`}>
                                <div className={styles.label}>来場人数 (合計)</div>
                                <div className={`${styles.value} ${styles.colorSuccess}`}>
                                    {stats.totalCheckedIn}
                                </div>
                                <div className={styles.unit}>人</div>
                                <div className={styles.sub}>
                                    内 当日券: {stats.sameDayTickets}枚
                                </div>
                            </div>

                            {/* 未着 (最重要) */}
                            <div className={`${styles.statCardPrimary} ${styles.borderPrimary}`}>
                                <div className={styles.label}>未着 (あと何人)</div>
                                <div className={`${styles.value} ${styles.colorPrimary}`}>
                                    {stats.notAttended}
                                </div>
                                <div className={styles.unit} style={{ fontWeight: 'bold' }}>人</div>
                            </div>
                        </div>

                        {/* 下段: 当日券 発行 / 残り発行可能 (スマホ2列) */}
                        <div className={styles.statsRow2}>
                            {/* 当日券 発行枚数 */}
                            <div className={`${styles.statCard} ${styles.borderAmber}`}>
                                <div className={styles.label}>当日券 発行枚数</div>
                                <div className={`${styles.value} ${styles.colorAmber}`}>
                                    {stats.sameDayTickets}
                                </div>
                                <div className={styles.unit}>人</div>
                            </div>

                            {/* 当日券 残り発行可能 */}
                            <div className={`${styles.statCard} ${isZero ? styles.borderDanger : styles.borderAmber}`}>
                                <div className={styles.label}>当日券 残り発行可能</div>
                                <div className={`${styles.value} ${isZero ? styles.colorDanger : styles.colorAmber}`}>
                                    {sameDayRemaining}
                                </div>
                                <div className={styles.unit}>枚</div>
                            </div>
                        </div>
                    </div>

                    {/* === 券種別内訳 === */}
                    <div className={styles.breakdownCard}>
                        <h4>券種別詳細</h4>
                        <div className={styles.breakdownGrid}>
                            {Object.values(stats.ticketTypeBreakdown).map((tt: any, idx) => (
                                <div key={idx} className={styles.breakdownItem}>
                                    <div className={styles.ttName}>{tt.name}</div>
                                    <div className={styles.ttValues}>
                                        <span className={styles.ttCheckedIn}>{tt.checkedIn}</span>
                                        <span className={styles.ttTotal}>/ {tt.total}</span>
                                    </div>
                                    <div
                                        className={styles.ttNotAttended}
                                        style={{ color: tt.total - tt.checkedIn > 0 ? 'var(--primary)' : 'var(--text-muted)' }}
                                    >
                                        未着: {tt.total - tt.checkedIn}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* === 名前一覧セクション === */}
                    <div className={styles.listCard}>
                        <div className={styles.tabBar}>
                            <button
                                onClick={() => setListTab('not_attended')}
                                className={`${styles.tab} ${listTab === 'not_attended' ? styles.tabActivePrimary : ''}`}
                            >
                                未着者リスト ({notAttendedList.length}組)
                            </button>
                            <button
                                onClick={() => setListTab('attended')}
                                className={`${styles.tab} ${listTab === 'attended' ? styles.tabActiveSuccess : ''}`}
                            >
                                来場済みリスト ({attendedList.length}組)
                            </button>
                        </div>

                        <div className={styles.listBody}>
                            {listTab === 'not_attended' ? (
                                <div className={styles.listItems}>
                                    {notAttendedList.map(r => {
                                        const total = r.tickets?.reduce((s, t) => s + (t.count || 0), 0) || 0;
                                        const arrived = r.checkedInTickets || 0;
                                        return (
                                            <div key={r.id} className={styles.listItem}>
                                                <div>
                                                    <span className={styles.listItemName}>{r.customerName}</span>
                                                    <span className={styles.listItemSuffix}>様</span>
                                                    {arrived > 0 && (
                                                        <span className={`${styles.listItemBadge} ${styles.badgePartial}`}>
                                                            一部来場 ({arrived}/{total})
                                                        </span>
                                                    )}
                                                </div>
                                                <div className={styles.listItemStatus}>{total - arrived} 名 未着</div>
                                            </div>
                                        );
                                    })}
                                    {notAttendedList.length === 0 && (
                                        <div className={styles.emptyMessage}>対象者がいません</div>
                                    )}
                                </div>
                            ) : (
                                <div className={styles.listItems}>
                                    {attendedList.map(r => {
                                        const total = r.tickets?.reduce((s, t) => s + (t.count || 0), 0) || 0;
                                        const arrived = r.checkedInTickets || 0;
                                        const isSameDay = r.source === 'SAME_DAY';
                                        const isPartial = !isSameDay && arrived < total;
                                        return (
                                            <div key={r.id} className={styles.listItem} style={{ background: 'var(--slate-50)' }}>
                                                <div>
                                                    <span className={styles.listItemName} style={{ color: 'var(--slate-600)' }}>
                                                        {r.customerName || '当日券客'}
                                                    </span>
                                                    <span className={styles.listItemSuffix}>様</span>
                                                    {isSameDay && (
                                                        <span className={`${styles.listItemBadge} ${styles.badgeSameDay}`}>当日券</span>
                                                    )}
                                                    {isPartial && (
                                                        <span className={`${styles.listItemBadge} ${styles.badgePartial}`}>一部来場</span>
                                                    )}
                                                </div>
                                                <div className={styles.listItemStatus} style={{ color: 'var(--success)' }}>
                                                    {isSameDay ? total : `${arrived} / ${total}`} 名 入場済
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {attendedList.length === 0 && (
                                        <div className={styles.emptyMessage}>対象者がいません</div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}

            <div className={styles.footer}>
                <span style={{ fontSize: '1.2rem' }}>&#9889;</span>
                受付での操作（チェックイン・当日券登録）はリアルタイムにこの画面に反映されます。
            </div>
        </div>
    );
}
