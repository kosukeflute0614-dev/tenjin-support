'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { initializeTroupeAndMembership } from '@/lib/platform';
import { createProductionClient, addPerformanceClient } from '@/lib/client-firestore';
import { validateInvitationCode } from '@/app/actions/invitation';
import { SmartMaskedDatePicker, SmartMaskedTimeInput } from '@/components/SmartInputs';
import { Trash2, Plus, ArrowRight, ArrowLeft, Check } from 'lucide-react';

const TOTAL_STEPS = 3;

const STEP_LABELS = ['劇団名', '公演タイトル', '公演日時'];

interface PerformanceEntry {
    id: string;
    date: string;
    time: string;
    capacity: number;
}

export default function OnboardingPage() {
    const { user, profile, loading, isNewUser, refreshProfile } = useAuth();
    const router = useRouter();
    const { showToast } = useToast();

    const [step, setStep] = useState(1);
    const [isSaving, setIsSaving] = useState(false);

    // Step 1: 劇団名 + 招待コード
    const [troupeName, setTroupeName] = useState('');
    const [invitationCode, setInvitationCode] = useState('');
    const [invitationError, setInvitationError] = useState('');

    // Step 2: 公演タイトル + 会場名
    const [title, setTitle] = useState('');
    const [venue, setVenue] = useState('');

    // Step 3: 公演日時
    const [performances, setPerformances] = useState<PerformanceEntry[]>([
        { id: '1', date: '', time: '', capacity: 50 },
    ]);

    // すでに登録済みの場合はダッシュボードへ（保存中はリダイレクトしない）
    useEffect(() => {
        if (isSaving) return;
        if (!loading && user && profile) {
            router.push('/dashboard');
        } else if (!loading && !user) {
            router.push('/');
        }
    }, [user, profile, loading, router, isSaving]);

    // --- Performance helpers ---
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

    const isDirty = troupeName.trim().length > 0 ||
        title.trim().length > 0 ||
        performances.some(p => p.date || p.time);
    useUnsavedChanges(isDirty);

    // --- Validation ---
    const isStep1Valid = troupeName.trim().length > 0 && invitationCode.trim().length > 0;
    const isStep2Valid = title.trim().length > 0;
    const isStep3Valid = performances.length > 0 && performances.every(p =>
        p.date && p.date.length === 10 && p.time && p.time.length === 5 && p.capacity > 0
    );

    const canGoNext = () => {
        switch (step) {
            case 1: return isStep1Valid;
            case 2: return isStep2Valid;
            case 3: return isStep3Valid;
            default: return false;
        }
    };

    const [isValidating, setIsValidating] = useState(false);

    const handleNext = async () => {
        if (step === 1) {
            // 招待コードをサーバーサイドで検証
            setIsValidating(true);
            setInvitationError('');
            try {
                const isValid = await validateInvitationCode(invitationCode.trim());
                if (!isValid) {
                    setInvitationError('招待コードが正しくありません');
                    setIsValidating(false);
                    return;
                }
            } catch {
                setInvitationError('検証に失敗しました。もう一度お試しください。');
                setIsValidating(false);
                return;
            }
            setIsValidating(false);
        }
        if (step < TOTAL_STEPS) setStep(step + 1);
    };

    const handleBack = () => {
        if (step > 1) setStep(step - 1);
    };

    // --- Final submit ---
    const handleComplete = async () => {
        if (!user) return;
        setIsSaving(true);

        try {
            // 1. 劇団・所属・ユーザーを作成（既に存在する場合はスキップされる）
            await initializeTroupeAndMembership(user, troupeName.trim());

            // 2. 公演を作成
            const productionId = await createProductionClient(title.trim(), user.uid);

            // 3. アクティブ公演に設定
            const { setActiveProductionId } = await import('@/app/actions/production-context');
            await setActiveProductionId(productionId);

            // 4. 公演日時を登録
            for (const perf of performances) {
                const startTime = `${perf.date}T${perf.time}`;
                await addPerformanceClient(productionId, startTime, perf.capacity, user.uid);
            }

            // 5. 主催者メールアドレス・会場名をデフォルト設定
            {
                const { updateProductionBasicInfoClient } = await import('@/lib/client-firestore');
                const basicInfo: { organizerEmail?: string; venue?: string } = {};
                if (user.email) basicInfo.organizerEmail = user.email;
                if (venue.trim()) basicInfo.venue = venue.trim();
                if (Object.keys(basicInfo).length > 0) {
                    await updateProductionBasicInfoClient(productionId, basicInfo);
                }
            }

            // 6. プロフィールをリフレッシュしてからリダイレクト
            await refreshProfile();
            router.push('/dashboard');
        } catch (err: any) {
            console.error('Onboarding failed:', err);
            const detail = err.code ? ` (${err.code}: ${err.message})` : '';
            showToast(`セットアップに失敗しました。${detail}`, 'error');
            setIsSaving(false);
        }
    };

    if (loading) {
        return <div className="flex-center" style={{ height: '80vh' }}>読み込み中...</div>;
    }

    // エンダウド・プログレス効果: Googleログイン完了分を15%として反映
    const progressPercent = 15 + ((step - 1) / (TOTAL_STEPS - 1)) * 85;

    return (
        <div className="container" style={{
            maxWidth: '1000px',
            paddingTop: '8vh',
            paddingBottom: '3rem',
            animation: 'fadeIn 0.8s ease-out',
        }}>
            {/* ヘッダー */}
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.75rem' }}>🎭</span>
                <h1 className="heading-lg" style={{ fontWeight: '300', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
                    Tenjin-Support へようこそ
                </h1>
                <p className="text-muted" style={{ fontSize: '0.9rem' }}>
                    あと {TOTAL_STEPS - step + 1} ステップで準備完了です
                </p>
            </div>

            {/* プログレスバー */}
            <div style={{ marginBottom: '2rem' }}>
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
                                    background: isDone || isActive ? 'var(--primary)' : '#e0e0e0',
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
                        width: `${progressPercent}%`,
                        transition: 'width 0.4s ease',
                    }} />
                </div>
            </div>

            {/* ステップコンテンツ */}
            <div className="card" style={{
                padding: 'clamp(1rem, 3vw, 2rem)', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                minHeight: '250px',
            }}>
                {/* Step 1: 劇団名 */}
                {step === 1 && (
                    <div>
                        <h3 style={{ fontSize: '1.15rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                            劇団の名前を教えてください
                        </h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                            あなたの劇団の名前です。後から変更できます。
                        </p>
                        <input
                            type="text"
                            id="troupeName"
                            className="input"
                            value={troupeName}
                            onChange={(e) => setTroupeName(e.target.value)}
                            placeholder="例: 劇団てんじん"
                            required
                            autoFocus
                            style={{ fontSize: '1.1rem', padding: '0.85rem 1rem', marginBottom: '1.5rem' }}
                        />

                        <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--foreground)', display: 'block', marginBottom: '0.4rem' }}>
                            招待コード
                        </label>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                            ご利用には招待コードが必要です。
                        </p>
                        <input
                            type="text"
                            className="input"
                            value={invitationCode}
                            onChange={(e) => { setInvitationCode(e.target.value); setInvitationError(''); }}
                            placeholder="招待コードを入力"
                            required
                            style={{ fontSize: '1.1rem', padding: '0.85rem 1rem' }}
                        />
                        {invitationError && (
                            <p style={{ color: 'var(--accent)', fontSize: '0.85rem', marginTop: '0.5rem', fontWeight: '500' }}>
                                {invitationError}
                            </p>
                        )}
                    </div>
                )}

                {/* Step 2: 公演タイトル */}
                {step === 2 && (
                    <div>
                        <h3 style={{ fontSize: '1.15rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                            最初の公演を作成しましょう
                        </h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
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

                        <div style={{ marginTop: '2rem' }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--foreground)', display: 'block', marginBottom: '0.4rem' }}>
                                会場名 <span style={{ color: 'var(--text-muted)', fontWeight: '400', fontSize: '0.8rem' }}>(任意)</span>
                            </label>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                                未定の場合はスキップできます。後から設定・変更もできます。
                            </p>
                            <input
                                type="text"
                                className="input"
                                value={venue}
                                onChange={(e) => setVenue(e.target.value)}
                                placeholder='例: 天神ホール'
                                style={{ fontSize: '1.1rem', padding: '0.85rem 1rem' }}
                            />
                        </div>
                    </div>
                )}

                {/* Step 3: 公演日時 */}
                {step === 3 && (
                    <div>
                        <h3 style={{ fontSize: '1.15rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                            公演日時を登録してください
                        </h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                            最低1つの公演回が必要です。後から追加・変更もできます。
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {performances.map((perf, idx) => (
                                <div key={perf.id} style={{
                                    padding: '1.25rem', background: 'var(--secondary)', borderRadius: '10px',
                                    border: '1px solid var(--card-border)', position: 'relative',
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
                                            <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--foreground)', display: 'block', marginBottom: '6px', marginLeft: '4px' }}>
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
                                background: 'transparent', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-muted)',
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
            </div>

            {/* ナビゲーションボタン */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginTop: '1.5rem', gap: '1rem', flexWrap: 'wrap',
            }}>
                <div style={{ flex: '1 1 auto' }}>
                    {step > 1 && (
                        <button
                            onClick={handleBack}
                            className="btn btn-secondary"
                            disabled={isSaving}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                                padding: '0.7rem 1.5rem', borderRadius: '8px', fontSize: '0.95rem',
                                width: '100%', justifyContent: 'center',
                            }}
                        >
                            <ArrowLeft size={16} /> 戻る
                        </button>
                    )}
                </div>

                <div style={{ flex: '1 1 auto' }}>
                    {step < TOTAL_STEPS ? (
                        <button
                            onClick={handleNext}
                            disabled={!canGoNext() || isValidating}
                            className="btn btn-primary"
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                                padding: '0.7rem 2rem', borderRadius: '8px', fontSize: '0.95rem',
                                width: '100%', justifyContent: 'center',
                            }}
                        >
                            {isValidating ? '確認中...' : '次へ'} {!isValidating && <ArrowRight size={16} />}
                        </button>
                    ) : (
                        <button
                            onClick={handleComplete}
                            disabled={isSaving || !isStep3Valid}
                            className="btn btn-primary"
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                                padding: '0.7rem 2rem', borderRadius: '8px', fontSize: '0.95rem',
                                width: '100%', justifyContent: 'center',
                            }}
                        >
                            {isSaving ? 'セットアップ中...' : 'はじめる'} {!isSaving && <Check size={16} />}
                        </button>
                    )}
                </div>
            </div>

            <style jsx>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
