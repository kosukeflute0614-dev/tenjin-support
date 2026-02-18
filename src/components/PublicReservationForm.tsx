'use client';

import { useState } from 'react';
import { createReservationClient } from '@/lib/client-firestore';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatDateTime } from '@/lib/format';

type Props = {
    production: any;
};

export default function PublicReservationForm({ production }: Props) {
    const [step, setStep] = useState<'input' | 'confirm' | 'success'>('input');
    const [selectedPerformanceId, setSelectedPerformanceId] = useState<string>("");
    const [ticketCounts, setTicketCounts] = useState<{ [key: string]: number }>({});
    const [customerInfo, setCustomerInfo] = useState({
        name: '',
        kana: '',
        email: '',
        remarks: ''
    });
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

    const handleToConfirm = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        setCustomerInfo({
            name: formData.get('customerName') as string,
            kana: formData.get('customerNameKana') as string,
            email: formData.get('customerEmail') as string,
            remarks: formData.get('remarks') as string
        });
        setStep('confirm');
        window.scrollTo(0, 0);
    };

    const handleFinalSubmit = async () => {
        setIsSubmitting(true);
        setError(null);
        try {
            // 公演のオーナーIDを取得
            const perfRef = doc(db, "performances", selectedPerformanceId);
            const perfSnap = await getDoc(perfRef);
            if (!perfSnap.exists()) throw new Error("公演情報が見つかりません。");
            const ownerId = perfSnap.data().userId;

            const tickets = Object.entries(ticketCounts)
                .filter(([_, count]) => count > 0)
                .map(([id, count]) => {
                    const type = production.ticketTypes.find((tt: any) => tt.id === id);
                    return {
                        ticketTypeId: id,
                        count: count,
                        price: type?.price || 0
                    };
                });

            await createReservationClient({
                performanceId: selectedPerformanceId,
                productionId: production.id, // 新しいセキュリティルールで必須
                customerName: customerInfo.name,
                customerNameKana: customerInfo.kana,
                customerEmail: customerInfo.email,
                checkedInTickets: 0,
                checkinStatus: 'NOT_ATTENDED',
                tickets: tickets as any,
                status: 'CONFIRMED',
                paymentStatus: 'UNPAID',
                paidAmount: 0,
                source: 'PRE_RESERVATION',
                remarks: customerInfo.remarks,
                userId: ownerId,
            } as any);

            setStep('success');
            window.scrollTo(0, 0);
        } catch (err: any) {
            setError(err.message || '予約の登録に失敗しました。');
            setStep('input');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (step === 'success') {
        return (
            <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
                <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎉</div>
                <h2 className="heading-md" style={{ color: 'var(--success)', marginBottom: '1rem' }}>予約を承りました</h2>
                <p style={{ marginBottom: '2rem', lineHeight: '1.8' }}>
                    ご予約ありがとうございます。<br />
                    入力いただいたメールアドレスに確認メールを送信しましたので、順次ご確認ください。
                </p>
                <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: '1.5rem' }}>
                    <p className="text-muted" style={{ fontSize: '0.9rem' }}>
                        ※メールが届かない場合は、迷惑メールフォルダをご確認いただくか、主催者までお問い合わせください。
                    </p>
                </div>
            </div>
        );
    }

    if (step === 'confirm') {
        return (
            <div className="card" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
                <h2 className="heading-md" style={{ textAlign: 'center', marginBottom: '2rem', color: 'var(--primary)' }}>
                    予約内容の確認
                </h2>

                <div style={{ display: 'grid', gap: '1.5rem', marginBottom: '2rem' }}>
                    <section>
                        <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>お名前</h3>
                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{customerInfo.name} ({customerInfo.kana})</div>
                    </section>

                    <section>
                        <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>メールアドレス</h3>
                        <div style={{ fontWeight: 'bold' }}>{customerInfo.email}</div>
                    </section>

                    <section>
                        <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>観劇日時</h3>
                        <div style={{ fontWeight: 'bold' }}>{selectedPerformance ? formatDateTime(selectedPerformance.startTime) : '未選択'}</div>
                    </section>

                    <section style={{ backgroundColor: '#fcfcfc', padding: '1rem', borderRadius: '8px' }}>
                        <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>予約枚数</h3>
                        <div style={{ display: 'grid', gap: '0.5rem' }}>
                            {Object.entries(ticketCounts).map(([typeId, count]) => {
                                if (count === 0) return null;
                                const type = ticketTypes.find((t: any) => t.id === typeId);
                                return (
                                    <div key={typeId} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>{type?.name || '不明'}</span>
                                        <span style={{ fontWeight: 'bold' }}>{count} 枚</span>
                                    </div>
                                );
                            })}
                            <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #eee', textAlign: 'right', fontWeight: 'bold', color: 'var(--primary)', fontSize: '1.2rem' }}>
                                合計: {totalTickets}枚
                            </div>
                        </div>
                    </section>

                    {customerInfo.remarks && (
                        <section>
                            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>備考</h3>
                            <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{customerInfo.remarks}</div>
                        </section>
                    )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
                    <button
                        type="button"
                        onClick={() => setStep('input')}
                        className="btn btn-secondary"
                        style={{ padding: '1rem' }}
                        disabled={isSubmitting}
                    >
                        変更
                    </button>
                    <button
                        type="button"
                        onClick={handleFinalSubmit}
                        className="btn btn-primary"
                        style={{ padding: '1rem', fontWeight: 'bold', fontSize: '1.1rem', backgroundColor: 'var(--success)', border: 'none' }}
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? '処理中...' : '確定'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <form onSubmit={handleToConfirm} className="card" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
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
                    defaultValue={customerInfo.name}
                    className="input"
                    placeholder="例: 山田 太郎"
                    style={{ marginBottom: '0.5rem' }}
                />
                <input
                    type="text"
                    id="customerNameKana"
                    name="customerNameKana"
                    required
                    pattern="[ぁ-ん\u3000\s]+"
                    title="ひらがなで入力してください"
                    defaultValue={customerInfo.kana}
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
                    defaultValue={customerInfo.email}
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
                    defaultValue={customerInfo.remarks}
                    placeholder="車椅子でのご来場など、伝えたいことがあればご記入ください。"
                />
            </div>

            <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', padding: '1.2rem', fontWeight: 'bold', fontSize: '1.2rem' }}
                disabled={!selectedPerformanceId || totalTickets === 0 || isSubmitting}
            >
                予約する
            </button>
            <p style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '1rem' }}>
                ※「予約する」を押すと確認画面へ進みます。
            </p>
        </form>
    );
}
