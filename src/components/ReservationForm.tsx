'use client';

import { useState, useEffect } from 'react';
import { createReservationClient } from '@/lib/client-firestore';
import { sendReservationEmail } from '@/app/actions/reservation';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { calculateBookedCount } from '@/lib/capacity-utils';
import { formatDateTime } from '@/lib/format';
import { useAuth } from './AuthProvider';
import { useToast } from '@/components/Toast';
import { Production, Performance, TicketType } from '@/types';

type ProductionWithPerformances = Production & { performances: Performance[] };

type Props = {
    productions: ProductionWithPerformances[];
};

export default function ReservationForm({ productions }: Props) {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [selectedPerformanceId, setSelectedPerformanceId] = useState<string>("");
    const [ticketCounts, setTicketCounts] = useState<{ [key: string]: number }>({});
    const [remainingMap, setRemainingMap] = useState<Record<string, number>>({});

    // Flatten all performances from all productions
    const allPerformances = productions.flatMap(prod =>
        prod.performances.map(perf => ({
            ...perf,
            productionTitle: prod.title,
            ticketTypes: prod.ticketTypes // Attach ticket types to performance for easy access
        }))
    );

    const selectedPerformance = allPerformances.find(p => p.id === selectedPerformanceId);
    const ticketTypes = selectedPerformance ? selectedPerformance.ticketTypes : [];

    useEffect(() => {
        if (allPerformances.length === 0) return;
        const fetchAll = async () => {
            const productionIds = [...new Set(allPerformances.map(p => p.productionId))];
            const allResDocs: any[] = [];
            for (const pid of productionIds) {
                const qRes = query(collection(db, "reservations"), where("productionId", "==", pid));
                const snapshot = await getDocs(qRes);
                allResDocs.push(...snapshot.docs.map(d => d.data()));
            }
            const map: Record<string, number> = {};
            for (const perf of allPerformances) {
                const booked = calculateBookedCount(allResDocs, perf.id);
                map[perf.id] = perf.capacity > 0 ? Math.max(0, perf.capacity - booked) : -1;
            }
            setRemainingMap(map);
        };
        fetchAll();
    }, [allPerformances.length]);

    const handleTicketChange = (ticketId: string, count: number) => {
        setTicketCounts(prev => ({
            ...prev,
            [ticketId]: count
        }));
    };

    const totalTickets = Object.values(ticketCounts).reduce((sum, count) => sum + count, 0);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!user || !selectedPerformance) return;
        if (totalTickets === 0) {
            showToast('チケットを1枚以上選択してください', 'warning');
            return;
        }

        const formData = new FormData(e.currentTarget);

        const tickets = Object.entries(ticketCounts)
            .filter(([_, count]) => count > 0)
            .map(([id, count]) => {
                const type = selectedPerformance.ticketTypes.find((tt: TicketType) => tt.id === id);
                return {
                    ticketTypeId: id,
                    count: count,
                    price: type?.price || 0
                };
            });

        try {
            const customerEmail = formData.get('customerEmail') as string;
            const customerName = formData.get('customerName') as string;

            const newResId = await createReservationClient({
                performanceId: selectedPerformanceId,
                productionId: selectedPerformance.productionId,
                customerName,
                customerNameKana: formData.get('customerNameKana') as string,
                customerEmail,
                checkedInTickets: 0,
                checkinStatus: 'NOT_ATTENDED',
                tickets: tickets as any,
                status: 'CONFIRMED',
                paymentStatus: 'UNPAID',
                paidAmount: 0,
                source: 'PRE_RESERVATION',
                remarks: formData.get('remarks') as string,
                userId: user.uid,
            } as any);

            // メールアドレスがあればメール送信（サーバーアクション経由）
            if (customerEmail) {
                sendReservationEmail({
                    customerEmail,
                    customerName,
                    productionId: selectedPerformance.productionId,
                    performanceId: selectedPerformanceId,
                    tickets: tickets as any,
                    reservationId: newResId,
                }).catch(err => console.error('メール送信エラー:', err));
            }

            // 成功時の処理（フォームリセットなど）
            setSelectedPerformanceId("");
            setTicketCounts({});
            (e.target as HTMLFormElement).reset();
            showToast('予約を登録しました。', 'success');
        } catch (error: any) {
            console.error("Error creating reservation:", error);
            showToast('予約の登録に失敗しました。', 'error');
        }
    };

    return (
        <form onSubmit={handleSubmit} className="card">
            {/* 1. Customer Info (Reordered) */}
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label htmlFor="customerName" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    お客様氏名 <span style={{ color: 'var(--accent)', fontSize: '0.8rem' }}>(必須)</span>
                </label>
                <input
                    type="text"
                    id="customerName"
                    name="customerName"
                    required
                    aria-required="true"
                    autoComplete="name"
                    className="input"
                    placeholder="例: 演劇 太郎"
                    style={{ marginBottom: '0.5rem' }}
                />
                <input
                    type="text"
                    id="customerNameKana"
                    name="customerNameKana"
                    required
                    aria-required="true"
                    pattern="[ぁ-ん\u3000\s]+"
                    title="ひらがなで入力してください"
                    className="input"
                    placeholder="ふりがな (例: えんげき たろう)"
                    style={{ fontSize: '0.85rem' }}
                />
            </div>

            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label htmlFor="customerEmail" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    メールアドレス <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>(任意)</span>
                </label>
                <input
                    type="email"
                    id="customerEmail"
                    name="customerEmail"
                    autoComplete="email"
                    className="input"
                    placeholder="例: taro@example.com"
                />
            </div>

            {/* 2. Performance Select (Flattened) */}
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label htmlFor="performanceId" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    公演・日時選択 <span style={{ color: 'var(--accent)', fontSize: '0.8rem' }}>(必須)</span>
                </label>
                <select
                    id="performanceId"
                    name="performanceId"
                    className="input"
                    value={selectedPerformanceId}
                    onChange={(e) => {
                        setSelectedPerformanceId(e.target.value);
                        setTicketCounts({}); // Reset tickets on performance change
                    }}
                    required
                    aria-required="true"
                >
                    <option value="">選択してください</option>
                    {allPerformances.map(perf => (
                        <option key={perf.id} value={perf.id}>
                            【{perf.productionTitle}】 {formatDateTime(perf.startTime)}{remainingMap[perf.id] !== undefined && remainingMap[perf.id] >= 0
                                ? ` (残: ${remainingMap[perf.id]})`
                                : remainingMap[perf.id] === -1 ? '' : ''
                            }
                        </option>
                    ))}
                </select>
            </div>

            {/* 3. Ticket Types Inputs */}
            {selectedPerformanceId && (
                <div className="form-group" style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid var(--card-border)', borderRadius: '8px', background: 'var(--background-light)' }}>
                    <label style={{ display: 'block', marginBottom: '1rem', fontWeight: 'bold' }}>
                        券種・枚数 <span style={{ color: 'var(--accent)', fontSize: '0.8rem' }}>(必須: 合計1枚以上)</span>
                        <span style={{ fontSize: '0.9rem', fontWeight: 'bold', marginLeft: '1rem', color: totalTickets > 0 ? 'var(--success)' : 'var(--accent)' }}>
                            合計: {totalTickets}枚
                        </span>
                    </label>
                    {ticketTypes.length === 0 ? (
                        <p className="text-muted">券種が登録されていません。</p>
                    ) : (
                        <div style={{ display: 'grid', gap: '0.75rem' }}>
                            {ticketTypes.map((ticket: TicketType) => (
                                <div key={ticket.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                                    <div>
                                        <div style={{ fontWeight: 'bold' }}>{ticket.name}</div>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>¥{ticket.price.toLocaleString()}</div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <input
                                            type="number"
                                            name={`ticket_${ticket.id}`}
                                            min="0"
                                            value={ticketCounts[ticket.id] || 0}
                                            onChange={(e) => handleTicketChange(ticket.id, parseInt(e.target.value) || 0)}
                                            className="input"
                                            style={{ width: '80px', textAlign: 'right' }}
                                        />
                                        <span style={{ fontSize: '0.9rem' }}>枚</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* 4. Remarks (New) */}
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label htmlFor="remarks" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    備考 <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>(任意)</span>
                </label>
                <textarea
                    id="remarks"
                    name="remarks"
                    className="input"
                    rows={3}
                    placeholder="その他、ご要望などがあれば入力してください。"
                />
            </div>

            <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', padding: '1rem', fontWeight: 'bold', fontSize: '1.1rem' }}
                disabled={!selectedPerformanceId || totalTickets === 0 || (remainingMap[selectedPerformanceId] >= 0 && totalTickets > remainingMap[selectedPerformanceId])}
            >
                予約を登録する
            </button>
        </form>
    );
}
