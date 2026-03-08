'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { createProductionClient, updateProductionBasicInfoClient, updateProductionCustomIdClient, checkCustomIdDuplicateClient } from '@/lib/client-firestore';
import { addPerformanceClient } from '@/lib/client-firestore';
import { addTicketTypeClient } from '@/lib/client-firestore';
import { SmartMaskedDatePicker, SmartMaskedTimeInput } from '@/components/SmartInputs';
import { Trash2, Plus, ArrowRight, ArrowLeft, Check } from 'lucide-react';

const TOTAL_STEPS = 3;

const STEP_LABELS = [
    '公演タイトル',
    '公演日時',
    '券種・価格',
];

interface PerformanceEntry {
    id: string;
    date: string;
    time: string;
    capacity: number;
}

interface TicketEntry {
    id: string;
    name: string;
    advancePrice: number;
    doorPrice: number;
}

export default function NewProductionPage() {
    const { user, profile, loading } = useAuth();
    const router = useRouter();
    const { showToast } = useToast();

    const [step, setStep] = useState(1);
    const [isCreating, setIsCreating] = useState(false);

    // Step 1: タイトル
    const [title, setTitle] = useState('');

    // Step 2: 公演日時
    const [performances, setPerformances] = useState<PerformanceEntry[]>([
        { id: '1', date: '', time: '', capacity: 50 },
    ]);

    // Step 3: 券種
    const [tickets, setTickets] = useState<TicketEntry[]>([
        { id: '1', name: '', advancePrice: 0, doorPrice: 0 },
    ]);

    // --- Step 2 helpers ---
    const addPerformance = () => {
        setPerformances(prev => [...prev, {
            id: String(Date.now()),
            date: '',
            time: '',
            capacity: 50,
        }]);
    };

    const removePerformance = (id: string) => {
        if (performances.length <= 1) return;
        setPerformances(prev => prev.filter(p => p.id !== id));
    };

    const updatePerformance = (id: string, field: keyof PerformanceEntry, value: string | number) => {
        setPerformances(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
    };

    // --- Step 3 helpers ---
    const addTicket = () => {
        setTickets(prev => [...prev, {
            id: String(Date.now()),
            name: '',
            advancePrice: 0,
            doorPrice: 0,
        }]);
    };

    const removeTicket = (id: string) => {
        if (tickets.length <= 1) return;
        setTickets(prev => prev.filter(t => t.id !== id));
    };

    const updateTicket = (id: string, field: keyof TicketEntry, value: string | number) => {
        setTickets(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
    };

    // --- Validation ---
    const isStep1Valid = title.trim().length > 0;

    const isStep2Valid = performances.length > 0 && performances.every(p =>
        p.date && p.date.length === 10 && p.time && p.time.length === 5 && p.capacity > 0
    );

    const isStep3Valid = tickets.length > 0 && tickets.every(t => t.name.trim().length > 0);

    // --- Navigation ---
    const canGoNext = () => {
        switch (step) {
            case 1: return isStep1Valid;
            case 2: return isStep2Valid;
            case 3: return isStep3Valid;
            default: return false;
        }
    };

    const handleNext = () => {
        if (step < TOTAL_STEPS) setStep(step + 1);
    };

    const handleBack = () => {
        if (step > 1) setStep(step - 1);
    };

    // --- Final submit ---
    const handleComplete = async () => {
        if (!user) return;
        setIsCreating(true);

        try {
            // 1. 公演作成
            const productionId = await createProductionClient(title.trim(), user.uid);

            // 2. アクティブ公演に設定
            const { setActiveProductionId } = await import('@/app/actions/production-context');
            await setActiveProductionId(productionId);

            // 3. 公演日時を登録
            for (const perf of performances) {
                const startTime = `${perf.date}T${perf.time}`;
                await addPerformanceClient(productionId, startTime, perf.capacity, user.uid);
            }

            // 4. 券種を登録
            for (const ticket of tickets) {
                await addTicketTypeClient(
                    productionId,
                    ticket.name.trim(),
                    ticket.advancePrice,
                    ticket.doorPrice,
                    user.uid,
                );
            }

            // 5. 主催者メールアドレスをデフォルト設定
            if (user.email) {
                await updateProductionBasicInfoClient(productionId, {
                    organizerEmail: user.email,
                });
            }

            showToast('公演を作成しました!', 'success');
            router.push(`/productions/${productionId}`);
        } catch (error) {
            console.error('Production creation error:', error);
            showToast('公演の作成に失敗しました。', 'error');
            setIsCreating(false);
        }
    };

    if (loading) return <div className="flex-center" style={{ height: '50vh' }}>読み込み中...</div>;

    if (!user || !profile?.troupeName) {
        return (
            <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>
                <h2 className="heading-md">{!user ? 'ログインが必要です' : '劇団名の設定が必要です'}</h2>
                <p className="text-muted" style={{ marginTop: '1rem' }}>
                    {!user ? '公演を作成するにはログインしてください。' : '公演を作成する前に、まずは劇団名を登録してください。'}
                </p>
                <Link href={!user ? "/" : "/onboarding"} className="btn btn-primary" style={{ marginTop: '1.5rem' }}>
                    {!user ? 'ホームに戻る' : '設定に進む'}
                </Link>
            </div>
        );
    }

    return (
        <div className="container" style={{ maxWidth: '720px', paddingBottom: '3rem' }}>
            <div style={{ marginBottom: '1.5rem' }}>
                <Link href="/dashboard" className="btn btn-secondary" style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.85rem',
                }}>
                    <span>&larr;</span> ダッシュボードに戻る
                </Link>
            </div>

            {/* ヘッダー */}
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                <h2 className="heading-lg" style={{ marginBottom: '0.5rem' }}>
                    新規公演を作成
                </h2>
                <p className="text-muted" style={{ fontSize: '0.9rem' }}>
                    ステップに沿って公演情報を入力してください
                </p>
            </div>

            {/* プログレスバー */}
            <div style={{ marginBottom: '2.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    {STEP_LABELS.map((label, i) => {
                        const stepNum = i + 1;
                        const isActive = stepNum === step;
                        const isDone = stepNum < step;
                        return (
                            <div key={i} style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                flex: 1, position: 'relative',
                            }}>
                                <div style={{
                                    width: '36px', height: '36px', borderRadius: '50%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: isDone ? '1rem' : '0.9rem', fontWeight: 'bold',
                                    background: isDone ? 'var(--primary)' : isActive ? 'var(--primary)' : '#e0e0e0',
                                    color: isDone || isActive ? '#fff' : '#999',
                                    transition: 'all 0.3s',
                                }}>
                                    {isDone ? <Check size={18} /> : stepNum}
                                </div>
                                <span style={{
                                    fontSize: '0.75rem', marginTop: '0.4rem',
                                    fontWeight: isActive ? '700' : '500',
                                    color: isActive ? 'var(--primary)' : isDone ? '#333' : '#999',
                                    whiteSpace: 'nowrap',
                                }}>
                                    {label}
                                </span>
                            </div>
                        );
                    })}
                </div>
                <div style={{
                    height: '4px', background: '#e0e0e0', borderRadius: '2px',
                    position: 'relative', overflow: 'hidden',
                }}>
                    <div style={{
                        height: '100%', background: 'var(--primary)', borderRadius: '2px',
                        width: `${((step - 1) / (TOTAL_STEPS - 1)) * 100}%`,
                        transition: 'width 0.4s ease',
                    }} />
                </div>
            </div>

            {/* ステップコンテンツ */}
            <div className="card" style={{
                padding: '2rem', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                minHeight: '300px',
            }}>

                {/* Step 1: 公演タイトル */}
                {step === 1 && (
                    <div>
                        <h3 style={{ fontSize: '1.15rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                            公演タイトルを入力してください
                        </h3>
                        <p style={{ fontSize: '0.85rem', color: '#888', marginBottom: '1.5rem' }}>
                            チケットやメールに表示される公演名です。
                        </p>
                        <input
                            type="text"
                            className="input"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder='例: 第一回公演「初演」'
                            autoFocus
                            style={{ fontSize: '1.1rem', padding: '0.85rem 1rem' }}
                        />
                    </div>
                )}

                {/* Step 2: 公演日時 */}
                {step === 2 && (
                    <div>
                        <h3 style={{ fontSize: '1.15rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                            公演日時を登録してください
                        </h3>
                        <p style={{ fontSize: '0.85rem', color: '#888', marginBottom: '1.5rem' }}>
                            最低1つの公演回が必要です。後から追加・変更もできます。
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {performances.map((perf, idx) => (
                                <div key={perf.id} style={{
                                    padding: '1.25rem', background: '#f8f9fa', borderRadius: '10px',
                                    border: '1px solid #eee', position: 'relative',
                                }}>
                                    <div style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        marginBottom: '0.75rem',
                                    }}>
                                        <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--primary)' }}>
                                            公演 {idx + 1}
                                        </span>
                                        {performances.length > 1 && (
                                            <button
                                                onClick={() => removePerformance(perf.id)}
                                                style={{
                                                    border: 'none', background: 'none', cursor: 'pointer',
                                                    color: '#ccc', padding: '0.25rem',
                                                }}
                                                title="削除"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                        <div style={{ flex: '1 1 200px' }}>
                                            <SmartMaskedDatePicker
                                                name={`perf-date-${perf.id}`}
                                                label="日付"
                                                defaultValue={perf.date || undefined}
                                                onChange={(v) => updatePerformance(perf.id, 'date', v)}
                                                required
                                            />
                                        </div>
                                        <div style={{ flex: '0 1 140px' }}>
                                            <SmartMaskedTimeInput
                                                name={`perf-time-${perf.id}`}
                                                label="開演時刻"
                                                defaultValue={perf.time || undefined}
                                                onChange={(v) => updatePerformance(perf.id, 'time', v)}
                                                required
                                            />
                                        </div>
                                        <div style={{ flex: '0 1 120px' }}>
                                            <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#444', display: 'block', marginBottom: '6px', marginLeft: '4px' }}>
                                                定員
                                            </label>
                                            <input
                                                type="number"
                                                className="input"
                                                value={perf.capacity}
                                                onChange={(e) => updatePerformance(perf.id, 'capacity', Math.max(1, parseInt(e.target.value) || 1))}
                                                min={1}
                                                style={{ height: '50px', marginBottom: 0 }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={addPerformance}
                            style={{
                                marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem',
                                padding: '0.6rem 1.25rem', border: '1px dashed #ccc', borderRadius: '8px',
                                background: 'transparent', cursor: 'pointer', fontSize: '0.9rem', color: '#666',
                                width: '100%', justifyContent: 'center',
                                transition: 'all 0.15s',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#ccc'; e.currentTarget.style.color = '#666'; }}
                        >
                            <Plus size={16} /> 公演回を追加
                        </button>
                    </div>
                )}

                {/* Step 3: 券種・価格 */}
                {step === 3 && (
                    <div>
                        <h3 style={{ fontSize: '1.15rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                            券種と価格を設定してください
                        </h3>
                        <p style={{ fontSize: '0.85rem', color: '#888', marginBottom: '1.5rem' }}>
                            最低1つの券種が必要です。後から追加・変更もできます。
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {tickets.map((ticket, idx) => (
                                <div key={ticket.id} style={{
                                    padding: '1.25rem', background: '#f8f9fa', borderRadius: '10px',
                                    border: '1px solid #eee', position: 'relative',
                                }}>
                                    <div style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        marginBottom: '0.75rem',
                                    }}>
                                        <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--primary)' }}>
                                            券種 {idx + 1}
                                        </span>
                                        {tickets.length > 1 && (
                                            <button
                                                onClick={() => removeTicket(ticket.id)}
                                                style={{
                                                    border: 'none', background: 'none', cursor: 'pointer',
                                                    color: '#ccc', padding: '0.25rem',
                                                }}
                                                title="削除"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                        <div style={{ flex: '1 1 200px' }}>
                                            <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#444', display: 'block', marginBottom: '6px', marginLeft: '4px' }}>
                                                券種名
                                            </label>
                                            <input
                                                type="text"
                                                className="input"
                                                value={ticket.name}
                                                onChange={(e) => updateTicket(ticket.id, 'name', e.target.value)}
                                                placeholder="例: 一般"
                                                style={{ marginBottom: 0 }}
                                            />
                                        </div>
                                        <div style={{ flex: '0 1 140px' }}>
                                            <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#444', display: 'block', marginBottom: '6px', marginLeft: '4px' }}>
                                                前売り (円)
                                            </label>
                                            <input
                                                type="number"
                                                className="input"
                                                value={ticket.advancePrice}
                                                onChange={(e) => updateTicket(ticket.id, 'advancePrice', Math.max(0, parseInt(e.target.value) || 0))}
                                                min={0}
                                                style={{ marginBottom: 0 }}
                                            />
                                        </div>
                                        <div style={{ flex: '0 1 140px' }}>
                                            <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#444', display: 'block', marginBottom: '6px', marginLeft: '4px' }}>
                                                当日 (円)
                                            </label>
                                            <input
                                                type="number"
                                                className="input"
                                                value={ticket.doorPrice}
                                                onChange={(e) => updateTicket(ticket.id, 'doorPrice', Math.max(0, parseInt(e.target.value) || 0))}
                                                min={0}
                                                style={{ marginBottom: 0 }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={addTicket}
                            style={{
                                marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem',
                                padding: '0.6rem 1.25rem', border: '1px dashed #ccc', borderRadius: '8px',
                                background: 'transparent', cursor: 'pointer', fontSize: '0.9rem', color: '#666',
                                width: '100%', justifyContent: 'center',
                                transition: 'all 0.15s',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#ccc'; e.currentTarget.style.color = '#666'; }}
                        >
                            <Plus size={16} /> 券種を追加
                        </button>
                    </div>
                )}
            </div>

            {/* ナビゲーションボタン */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginTop: '1.5rem', gap: '1rem',
            }}>
                <div>
                    {step > 1 && (
                        <button
                            onClick={handleBack}
                            className="btn btn-secondary"
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                                padding: '0.7rem 1.5rem', borderRadius: '8px', fontSize: '0.95rem',
                            }}
                        >
                            <ArrowLeft size={16} /> 戻る
                        </button>
                    )}
                </div>

                <div>
                    {step < TOTAL_STEPS ? (
                        <button
                            onClick={handleNext}
                            disabled={!canGoNext()}
                            className="btn btn-primary"
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                                padding: '0.7rem 2rem', borderRadius: '8px', fontSize: '0.95rem',
                            }}
                        >
                            次へ <ArrowRight size={16} />
                        </button>
                    ) : (
                        <button
                            onClick={handleComplete}
                            disabled={isCreating || !isStep3Valid}
                            className="btn btn-primary"
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                                padding: '0.7rem 2rem', borderRadius: '8px', fontSize: '0.95rem',
                            }}
                        >
                            {isCreating ? '作成中...' : '公演を作成する'} {!isCreating && <Check size={16} />}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
