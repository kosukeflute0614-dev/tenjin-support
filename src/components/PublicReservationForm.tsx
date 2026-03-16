'use client';

import { useState, useEffect } from 'react';
import { createReservation } from '@/app/actions/reservation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatDateTime } from '@/lib/format';
import { Production, Performance, TicketType, FormFieldConfig } from '@/types';
import { useToast } from '@/components/Toast';

type ProductionWithPerformances = Production & { performances: Performance[] };

type Props = {
    production: ProductionWithPerformances;
    promoterId?: string | null;
};

const BUILTIN_FIELD_IDS = ['customer_name', 'customer_kana', 'customer_email', 'performance_select', 'ticket_select', 'remarks'];

const DEFAULT_FORM_FIELDS: FormFieldConfig[] = [
    { id: 'customer_name', label: 'お名前', type: 'text', enabled: true, required: true },
    { id: 'customer_kana', label: 'ふりがな', type: 'text', enabled: true, required: true },
    { id: 'customer_email', label: 'メールアドレス', type: 'text', enabled: true, required: true },
    { id: 'performance_select', label: '観劇日時', type: 'select', enabled: true, required: true },
    { id: 'ticket_select', label: '券種選択', type: 'select', enabled: true, required: true },
    { id: 'remarks', label: '備考', type: 'textarea', enabled: true, required: true },
];

export default function PublicReservationForm({ production, promoterId }: Props) {
    const [step, setStep] = useState<'input' | 'confirm' | 'success'>('input');
    const [selectedPerformanceId, setSelectedPerformanceId] = useState<string>("");
    const [ticketCounts, setTicketCounts] = useState<{ [key: string]: number }>({});
    const [customerInfo, setCustomerInfo] = useState({
        name: '',
        kana: '',
        email: '',
        remarks: ''
    });
    const [customFieldValues, setCustomFieldValues] = useState<Record<string, string | boolean>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { showToast } = useToast();
    const [remainingSeats, setRemainingSeats] = useState<number | null>(null);
    const [remainingLoading, setRemainingLoading] = useState(false);

    useEffect(() => {
        if (!selectedPerformanceId) { setRemainingSeats(null); return; }
        const fetchRemaining = async () => {
            setRemainingLoading(true);
            setRemainingSeats(null);
            try {
                const perfRef = doc(db, "performances", selectedPerformanceId);
                const perfSnap = await getDoc(perfRef);
                if (!perfSnap.exists()) { setRemainingSeats(null); return; }
                const perf = perfSnap.data();
                if (!perf.capacity || perf.capacity <= 0) {
                    setRemainingSeats(null); return;
                }

                const bookedCount = perf.bookedCount || 0;
                setRemainingSeats(Math.max(0, perf.capacity - bookedCount));
            } catch (err: any) {
                console.error("残席取得エラー:", err);
                setRemainingSeats(null);
            } finally {
                setRemainingLoading(false);
            }
        };
        fetchRemaining();
    }, [selectedPerformanceId, production.id]);

    const performances = production.performances || [];
    const selectedPerformance = performances.find((p: Performance) => p.id === selectedPerformanceId);
    const ticketTypes = (production.ticketTypes || []).filter((tt: TicketType) => tt.isPublic !== false);

    // formFields が保存されていればそれを使用、なければデフォルト
    const formFields: FormFieldConfig[] = production.formFields && production.formFields.length > 0
        ? production.formFields.filter(f => f.enabled)
        : DEFAULT_FORM_FIELDS;

    const handleTicketChange = (ticketId: string, count: number) => {
        setTicketCounts(prev => ({
            ...prev,
            [ticketId]: count
        }));
    };

    const totalTickets = Object.values(ticketCounts).reduce((sum, count) => sum + count, 0);

    const handleToConfirm = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (totalTickets === 0) {
            showToast('チケットを1枚以上選択してください', 'error');
            return;
        }
        const formData = new FormData(e.currentTarget);
        setCustomerInfo({
            name: formData.get('customerName') as string,
            kana: formData.get('customerNameKana') as string,
            email: formData.get('customerEmail') as string,
            remarks: formData.get('remarks') as string
        });

        // カスタムフィールド値を収集
        const newCustomValues: Record<string, string | boolean> = {};
        formFields.forEach(field => {
            if (BUILTIN_FIELD_IDS.includes(field.id)) return;
            if (field.type === 'checkbox') {
                const el = (e.currentTarget as HTMLFormElement).elements.namedItem(field.id) as HTMLInputElement;
                newCustomValues[field.id] = el?.checked ?? false;
            } else {
                newCustomValues[field.id] = (formData.get(field.id) as string) || '';
            }
        });
        setCustomFieldValues(newCustomValues);

        setStep('confirm');
        window.scrollTo(0, 0);
    };

    const handleFinalSubmit = async () => {
        setIsSubmitting(true);
        try {
            const perfRef = doc(db, "performances", selectedPerformanceId);
            const perfSnap = await getDoc(perfRef);
            if (!perfSnap.exists()) throw new Error("公演情報が見つかりません。");
            const ownerId = perfSnap.data().userId;
            const userId = promoterId || "";

            const tickets = Object.entries(ticketCounts)
                .filter(([_, count]) => count > 0)
                .map(([id, count]) => {
                    const type = production.ticketTypes.find((tt: TicketType) => tt.id === id);
                    return {
                        ticketTypeId: id,
                        count: count,
                        price: type?.price || 0
                    };
                });

            await createReservation({
                performanceId: selectedPerformanceId,
                productionId: production.id,
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
                promoterId: userId,
                ...(Object.keys(customFieldValues).length > 0 ? { customFieldValues } : {}),
            } as any);

            setStep('success');
            window.scrollTo(0, 0);
        } catch (err: any) {
            showToast(err.message || '予約の登録に失敗しました。', 'error');
            setStep('input');
        } finally {
            setIsSubmitting(false);
        }
    };

    // カスタムフィールドのラベルを取得するヘルパー
    const getFieldLabel = (fieldId: string): string => {
        const field = formFields.find(f => f.id === fieldId);
        return field?.label || fieldId;
    };

    // --- 組み込みフィールドのレンダリング ---

    const renderNameField = () => (
        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label htmlFor="customerName" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                お名前 <span style={{ color: 'var(--primary)', fontSize: '0.8rem' }}>(必須)</span>
            </label>
            <input
                type="text" id="customerName" name="customerName" required
                aria-required="true" autoComplete="name"
                defaultValue={customerInfo.name} className="input"
                placeholder="例: 山田 太郎" style={{ marginBottom: '0.5rem' }}
            />
            <input
                type="text" id="customerNameKana" name="customerNameKana" required
                aria-required="true"
                pattern="[ぁ-ん\u3000\s]+" title="ひらがなで入力してください"
                defaultValue={customerInfo.kana} className="input"
                placeholder="ふりがな (例: やまだ たろう)" style={{ fontSize: '0.85rem' }}
            />
        </div>
    );

    const renderEmailField = () => (
        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label htmlFor="customerEmail" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                メールアドレス <span style={{ color: 'var(--primary)', fontSize: '0.8rem' }}>(必須)</span>
            </label>
            <input
                type="email" id="customerEmail" name="customerEmail" required
                aria-required="true" autoComplete="email"
                defaultValue={customerInfo.email} className="input"
                placeholder="例: example@mail.com"
            />
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                ※予約完了メールが送信されますので、正確に入力してください。
            </p>
        </div>
    );

    const renderPerformanceField = () => (
        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label htmlFor="performanceId" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                観劇日時 <span style={{ color: 'var(--primary)', fontSize: '0.8rem' }}>(必須)</span>
            </label>
            <select
                id="performanceId" name="performanceId" className="input"
                value={selectedPerformanceId}
                onChange={(e) => { setSelectedPerformanceId(e.target.value); setTicketCounts({}); }}
                required
                aria-required="true"
            >
                <option value="">日時を選択してください</option>
                {performances.map((perf: Performance) => {
                    const { isPerformanceReceptionOpen } = require('@/lib/production');
                    const isOpen = isPerformanceReceptionOpen(perf, production);
                    return (
                        <option key={perf.id} value={perf.id} disabled={!isOpen}>
                            {formatDateTime(perf.startTime)}{!isOpen ? ' (受付終了)' : ''}
                        </option>
                    );
                })}
            </select>
            {remainingSeats !== null && (
                <div style={{
                    padding: '0.6rem 1rem',
                    background: remainingSeats === 0 ? '#fff5f5' : '#f0fff4',
                    border: `1px solid ${remainingSeats === 0 ? '#fed7d7' : '#c6f6d5'}`,
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    color: remainingSeats === 0 ? '#c53030' : '#276749',
                    marginTop: '0.5rem',
                }}>
                    {remainingSeats === 0
                        ? 'この公演回は満席です'
                        : `残席: ${remainingSeats}枚`
                    }
                </div>
            )}
        </div>
    );

    const renderTicketField = () => {
        if (!selectedPerformanceId) return null;
        return (
            <div className="form-group" style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid var(--card-border)', borderRadius: '8px', background: 'var(--card-bg)' }}>
                <label style={{ display: 'block', marginBottom: '1rem', fontWeight: 'bold' }}>
                    券種・枚数 <span style={{ color: 'var(--primary)', fontSize: '0.8rem' }}>(必須: 合計1枚以上)</span>
                </label>
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {ticketTypes.map((ticket: TicketType) => (
                        <div key={ticket.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', borderBottom: '1px solid var(--card-border)' }}>
                            <div>
                                <div style={{ fontWeight: 'bold' }}>{ticket.name}</div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>¥{ticket.price.toLocaleString()}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <input
                                    type="number" name={`ticket_${ticket.id}`}
                                    min="0" max="10"
                                    value={ticketCounts[ticket.id] || 0}
                                    onChange={(e) => handleTicketChange(ticket.id, parseInt(e.target.value) || 0)}
                                    onFocus={(e) => { if (e.target.value === '0') e.target.value = ''; }}
                                    onBlur={(e) => { if (e.target.value === '') { e.target.value = '0'; handleTicketChange(ticket.id, 0); } }}
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
        );
    };

    const renderRemarksField = () => (
        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label htmlFor="remarks" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                備考 <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>(任意)</span>
            </label>
            <textarea
                id="remarks" name="remarks" className="input" rows={2}
                defaultValue={customerInfo.remarks}
                placeholder="車椅子でのご来場など、伝えたいことがあればご記入ください。"
            />
        </div>
    );

    // --- カスタムフィールドのレンダリング ---

    const renderCustomField = (field: FormFieldConfig) => {
        const requiredLabel = field.required
            ? <span style={{ color: 'var(--primary)', fontSize: '0.8rem' }}>(必須)</span>
            : <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>(任意)</span>;

        // 電話番号テンプレート
        if (field.templateType === 'phone') {
            return (
                <div key={field.id} className="form-group" style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                        {field.label} {requiredLabel}
                    </label>
                    <input
                        type="tel" name={field.id} className="input"
                        required={field.required}
                        pattern="[0-9]+" title="半角数字のみで入力してください（ハイフンなし）"
                        inputMode="numeric"
                        placeholder={field.placeholder || '09012345678'}
                        defaultValue={(customFieldValues[field.id] as string) || ''}
                    />
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        ※半角数字のみ・ハイフンなしで入力してください
                    </p>
                </div>
            );
        }

        // チェックボックス（newsletter含む）
        if (field.type === 'checkbox') {
            return (
                <div key={field.id} className="form-group" style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input
                            type="checkbox" name={field.id}
                            defaultChecked={customFieldValues[field.id] === true}
                            style={{ accentColor: 'var(--primary)', width: '18px', height: '18px' }}
                        />
                        <span style={{ fontWeight: '500' }}>{field.label}</span>
                    </label>
                </div>
            );
        }

        // セレクトボックス
        if (field.type === 'select') {
            return (
                <div key={field.id} className="form-group" style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                        {field.label} {requiredLabel}
                    </label>
                    <select name={field.id} className="input" required={field.required}
                        defaultValue={(customFieldValues[field.id] as string) || ''}>
                        <option value="">選択してください</option>
                        {(field.options || []).map((opt, i) => (
                            <option key={i} value={opt}>{opt}</option>
                        ))}
                    </select>
                </div>
            );
        }

        // テキストエリア
        if (field.type === 'textarea') {
            return (
                <div key={field.id} className="form-group" style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                        {field.label} {requiredLabel}
                    </label>
                    <textarea name={field.id} className="input" rows={2}
                        required={field.required}
                        placeholder={field.placeholder || ''}
                        defaultValue={(customFieldValues[field.id] as string) || ''} />
                </div>
            );
        }

        // テキスト（デフォルト）
        return (
            <div key={field.id} className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    {field.label} {requiredLabel}
                </label>
                <input type="text" name={field.id} className="input"
                    required={field.required}
                    placeholder={field.placeholder || ''}
                    defaultValue={(customFieldValues[field.id] as string) || ''} />
            </div>
        );
    };

    // --- フィールドのレンダリングディスパッチ ---

    const renderFormField = (field: FormFieldConfig) => {
        switch (field.id) {
            case 'customer_name':
                return <div key={field.id}>{renderNameField()}</div>;
            case 'customer_kana':
                return null; // customer_name 内で一緒にレンダリング済み
            case 'customer_email':
                return <div key={field.id}>{renderEmailField()}</div>;
            case 'performance_select':
                return <div key={field.id}>{renderPerformanceField()}{renderTicketField()}</div>;
            case 'ticket_select':
                return null; // performance_select 内で一緒にレンダリング済み
            case 'remarks':
                return <div key={field.id}>{renderRemarksField()}</div>;
            default:
                return renderCustomField(field);
        }
    };

    // --- 問い合わせフッター ---
    const contactFooter = production.organizerEmail ? (
        <p style={{
            textAlign: 'center',
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
            marginTop: '2rem',
            lineHeight: '1.8',
        }}>
            ご予約がうまくできない場合やメールが届かない場合は、<br />
            <a
                href={`mailto:${production.organizerEmail}`}
                style={{ fontWeight: 600, color: 'var(--text-muted)' }}
            >
                {production.organizerEmail}
            </a>
            {' '}までお気軽にお問い合わせください。
        </p>
    ) : null;

    // --- ステップ表示 ---

    const stepIndicator = (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 'clamp(0.5rem, 2vw, 1rem)', marginBottom: '2rem' }}>
            {[
                { key: 'input', label: '入力', num: 1 },
                { key: 'confirm', label: '確認', num: 2 },
                { key: 'success', label: '完了', num: 3 },
            ].map(s => (
                <div key={s.key} style={{
                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                    color: step === s.key ? 'var(--primary)' : '#ccc',
                    fontWeight: step === s.key ? 'bold' : 'normal'
                }}>
                    <span style={{
                        width: '28px', height: '28px', borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        backgroundColor: step === s.key ? 'var(--primary)' : '#eee',
                        color: step === s.key ? 'white' : '#999',
                        fontSize: '0.85rem', fontWeight: 'bold', flexShrink: 0,
                    }}>{s.num}</span>
                    <span style={{ fontSize: '0.9rem' }}>{s.label}</span>
                </div>
            ))}
        </div>
    );

    if (step === 'success') {
        return (
            <>
                <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
                    {stepIndicator}
                    <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎉</div>
                    <h2 className="heading-md" style={{ color: 'var(--success)', marginBottom: '1rem' }}>予約を承りました</h2>
                    <p style={{ marginBottom: '2rem', lineHeight: '1.8' }}>
                        ご予約ありがとうございます。<br />
                        入力いただいたメールアドレスに確認メールを送信しましたので、順次ご確認ください。
                    </p>
                    <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: '1.5rem' }}>
                        <p className="text-muted" style={{ fontSize: '0.9rem' }}>
                            ※メールが届かない場合は、迷惑メールフォルダをご確認いただくか、{production.organizerEmail
                                ? <a href={`mailto:${production.organizerEmail}`} style={{ color: 'inherit', fontWeight: 600 }}>{production.organizerEmail}</a>
                                : '主催者'}までお問い合わせください。
                        </p>
                    </div>
                </div>
                {contactFooter}
            </>
        );
    }

    if (step === 'confirm') {
        // カスタムフィールドの確認表示用
        const customFields = formFields.filter(f => !BUILTIN_FIELD_IDS.includes(f.id));
        const filledCustomFields = customFields.filter(f => {
            const val = customFieldValues[f.id];
            return val !== undefined && val !== '' && val !== false;
        });

        return (
            <>
            <div className="card" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
                {stepIndicator}
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

                    <section style={{ backgroundColor: 'var(--card-bg)', padding: '1rem', borderRadius: '8px' }}>
                        <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>予約枚数</h3>
                        <div style={{ display: 'grid', gap: '0.5rem' }}>
                            {Object.entries(ticketCounts).map(([typeId, count]) => {
                                if (count === 0) return null;
                                const type = ticketTypes.find((t: TicketType) => t.id === typeId);
                                return (
                                    <div key={typeId} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>{type?.name || '不明'}</span>
                                        <span style={{ fontWeight: 'bold' }}>{count} 枚</span>
                                    </div>
                                );
                            })}
                            <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--card-border)', textAlign: 'right', fontWeight: 'bold', color: 'var(--primary)', fontSize: '1.2rem' }}>
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

                    {filledCustomFields.map(field => (
                        <section key={field.id}>
                            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{field.label}</h3>
                            <div style={{ fontWeight: 'bold' }}>
                                {typeof customFieldValues[field.id] === 'boolean'
                                    ? (customFieldValues[field.id] ? 'はい' : 'いいえ')
                                    : String(customFieldValues[field.id])}
                            </div>
                        </section>
                    ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem' }}>
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
            {contactFooter}
            </>
        );
    }

    return (
        <>
        <form onSubmit={handleToConfirm} className="card" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
            <input type="hidden" name="productionId" value={production.id} />

            {stepIndicator}
            <h2 className="heading-md" style={{ textAlign: 'center', marginBottom: '2rem', color: 'var(--primary)' }}>
                チケット予約フォーム
            </h2>

            {formFields.map(field => renderFormField(field))}

            {remainingSeats !== null && remainingSeats > 0 && totalTickets > remainingSeats && (
                <div style={{ padding: '1rem', backgroundColor: 'rgba(220, 53, 69, 0.08)', border: '1px solid #feb2b2', borderRadius: '8px', color: 'var(--accent)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                    残席数（{remainingSeats}枚）を超える予約はできません。枚数を調整してください。
                </div>
            )}

            <div style={{ marginTop: '0.5rem' }}>
                <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ width: '100%', padding: '1.2rem', fontWeight: 'bold', fontSize: '1.2rem', minHeight: '48px' }}
                    disabled={!selectedPerformanceId || totalTickets === 0 || isSubmitting || (remainingSeats !== null && totalTickets > remainingSeats)}
                >
                    予約する
                </button>
                <p style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '1rem' }}>
                    ※「予約する」を押すと確認画面へ進みます。
                </p>
            </div>
        </form>
        {contactFooter}
        </>
    );
}
