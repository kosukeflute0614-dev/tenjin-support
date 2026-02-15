'use client';

import { useState } from 'react';
import { createPublicReservation } from '@/app/actions/reservation';
import { formatDateTime } from '@/lib/format';

type Props = {
    production: any;
};

export default function PublicReservationForm({ production }: Props) {
    const [selectedPerformanceId, setSelectedPerformanceId] = useState<string>("");
    const [ticketCounts, setTicketCounts] = useState<{ [key: string]: number }>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const performances = production.performances || [];
    const selectedPerformance = performances.find((p: any) => p.id === selectedPerformanceId);
    const ticketTypes = production.ticketTypes || [];

    const handleTicketChange = (ticketId: string, count: number) => {
        setTicketCounts(prev => ({
            ...prev,
            [ticketId]: count
        }));
    };

    const totalTickets = Object.values(ticketCounts).reduce((sum, count) => sum + count, 0);

    const handleSubmit = async (formData: FormData) => {
        setIsSubmitting(true);
        setError(null);
        try {
            await createPublicReservation(formData);
        } catch (err: any) {
            setError(err.message || '予約の登録に失敗しました。');
            setIsSubmitting(false);
        }
    };

    return (
        <form action={handleSubmit} className="card" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
            <input type="hidden" name="productionId" value={production.id} />

            <h2 className="heading-md" style={{ textAlign: 'center', marginBottom: '2rem', color: 'var(--primary)' }}>
                チケット予約フォーム
            </h2>

            {error && (
                <div style={{ padding: '1rem', backgroundColor: '#fff5f5', border: '1px solid #feb2b2', borderRadius: '8px', color: '#c53030', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                    {error}
                </div>
            )}

            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label htmlFor="customerName" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    お名前 <span style={{ color: 'var(--primary)', fontSize: '0.8rem' }}>(必須)</span>
                </label>
                <input
                    type="text"
                    id="customerName"
                    name="customerName"
                    required
                    className="input"
                    placeholder="例: 山田 太郎"
                    style={{ marginBottom: '0.5rem' }}
                />
                <input
                    type="text"
                    id="customerNameKana"
                    name="customerNameKana"
                    required
                    className="input"
                    placeholder="ふりがな (例: やまだ たろう)"
                    style={{ fontSize: '0.85rem' }}
                />
            </div>

            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label htmlFor="customerEmail" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    メールアドレス <span style={{ color: 'var(--primary)', fontSize: '0.8rem' }}>(必須)</span>
                </label>
                <input
                    type="email"
                    id="customerEmail"
                    name="customerEmail"
                    required
                    className="input"
                    placeholder="例: example@mail.com"
                />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    ※予約完了メールが送信されますので、正確に入力してください。
                </p>
            </div>

            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label htmlFor="performanceId" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    観劇日時 <span style={{ color: 'var(--primary)', fontSize: '0.8rem' }}>(必須)</span>
                </label>
                <select
                    id="performanceId"
                    name="performanceId"
                    className="input"
                    value={selectedPerformanceId}
                    onChange={(e) => {
                        setSelectedPerformanceId(e.target.value);
                        setTicketCounts({});
                    }}
                    required
                >
                    <option value="">日時を選択してください</option>
                    {performances.map((perf: any) => {
                        const { isPerformanceReceptionOpen } = require('@/lib/production');
                        const isOpen = isPerformanceReceptionOpen(perf, production);
                        return (
                            <option key={perf.id} value={perf.id} disabled={!isOpen}>
                                {formatDateTime(perf.startTime)}{!isOpen ? ' (受付終了)' : ''}
                            </option>
                        );
                    })}
                </select>
            </div>

            {selectedPerformanceId && (
                <div className="form-group" style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid var(--card-border)', borderRadius: '8px', background: '#fcfcfc' }}>
                    <label style={{ display: 'block', marginBottom: '1rem', fontWeight: 'bold' }}>
                        券種・枚数 <span style={{ color: 'var(--primary)', fontSize: '0.8rem' }}>(必須: 合計1枚以上)</span>
                    </label>
                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                        {ticketTypes.map((ticket: any) => (
                            <div key={ticket.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', borderBottom: '1px solid #f0f0f0' }}>
                                <div>
                                    <div style={{ fontWeight: 'bold' }}>{ticket.name}</div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>¥{ticket.price.toLocaleString()}</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <input
                                        type="number"
                                        name={`ticket_${ticket.id}`}
                                        min="0"
                                        max="10"
                                        value={ticketCounts[ticket.id] || 0}
                                        onChange={(e) => handleTicketChange(ticket.id, parseInt(e.target.value) || 0)}
                                        className="input"
                                        style={{ width: '70px', textAlign: 'right', marginBottom: 0 }}
                                    />
                                    <span style={{ fontSize: '0.9rem' }}>枚</span>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div style={{ marginTop: '1rem', textAlign: 'right', fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--primary)' }}>
                        合計: {totalTickets}枚
                    </div>
                </div>
            )}

            <div className="form-group" style={{ marginBottom: '2rem' }}>
                <label htmlFor="remarks" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    備考 <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>(任意)</span>
                </label>
                <textarea
                    id="remarks"
                    name="remarks"
                    className="input"
                    rows={2}
                    placeholder="車椅子でのご来場など、伝えたいことがあればご記入ください。"
                />
            </div>

            <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', padding: '1.2rem', fontWeight: 'bold', fontSize: '1.2rem' }}
                disabled={!selectedPerformanceId || totalTickets === 0 || isSubmitting}
            >
                {isSubmitting ? '処理中...' : '予約を確定する'}
            </button>
            <p style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '1rem' }}>
                ※「予約を確定する」を押すと予約が送信されます。
            </p>
        </form>
    );
}
