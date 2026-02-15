'use client';

import { useState } from 'react';
import { createReservation } from '@/app/actions/reservation';
import { formatDateTime } from '@/lib/format';

type Props = {
    productions: any[]; // refine type later if needed
};

export default function ReservationForm({ productions }: Props) {
    const [selectedPerformanceId, setSelectedPerformanceId] = useState<string>("");
    const [ticketCounts, setTicketCounts] = useState<{ [key: string]: number }>({});

    // Flatten all performances from all productions
    const allPerformances = productions.flatMap(prod =>
        prod.performances.map((perf: any) => ({
            ...perf,
            productionTitle: prod.title,
            ticketTypes: prod.ticketTypes // Attach ticket types to performance for easy access
        }))
    );

    const selectedPerformance = allPerformances.find(p => p.id === selectedPerformanceId);
    const ticketTypes = selectedPerformance ? selectedPerformance.ticketTypes : [];

    const handleTicketChange = (ticketId: string, count: number) => {
        setTicketCounts(prev => ({
            ...prev,
            [ticketId]: count
        }));
    };

    const totalTickets = Object.values(ticketCounts).reduce((sum, count) => sum + count, 0);

    return (
        <form action={createReservation} className="card">
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
                    className="input"
                    placeholder="例: 演劇 太郎"
                    style={{ marginBottom: '0.5rem' }}
                />
                <input
                    type="text"
                    id="customerNameKana"
                    name="customerNameKana"
                    required
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
                >
                    <option value="">選択してください</option>
                    {allPerformances.map(perf => (
                        <option key={perf.id} value={perf.id}>
                            【{perf.productionTitle}】 {formatDateTime(perf.startTime)} (残: {perf.capacity})
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
                            {ticketTypes.map((ticket: any) => (
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
                disabled={!selectedPerformanceId || totalTickets === 0}
            >
                予約を登録する
            </button>
        </form>
    );
}
