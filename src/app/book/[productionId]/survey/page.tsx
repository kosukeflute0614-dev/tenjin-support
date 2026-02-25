'use client';

import { useEffect, useState, use } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';

interface SurveyOption { id: string; label: string }
interface SubFields {
    name: { id: string; label: string; required: boolean };
    email: { id: string; label: string; required: boolean };
}
interface SurveyQuestion {
    id: string; order: number; label: string;
    type: 'single_choice' | 'multi_choice' | 'free_text' | 'newsletter_optin';
    required: boolean; options: SurveyOption[];
    minLabel?: string; maxLabel?: string;
    subFields?: SubFields;
}
interface SurveyTemplate {
    id: string; productionId: string; userId: string;
    title: string; status: string; questions: SurveyQuestion[];
}

export default function PublicSurveyPage({ params }: { params: Promise<{ productionId: string }> }) {
    const { productionId } = use(params);
    const [template, setTemplate] = useState<SurveyTemplate | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [answers, setAnswers] = useState<Record<string, any>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitError, setSubmitError] = useState<string | null>(null);

    useEffect(() => {
        const fetchTemplate = async () => {
            try {
                const q = query(
                    collection(db, 'surveyTemplates'),
                    where('productionId', '==', productionId),
                    where('status', '==', 'active')
                );
                const snap = await getDocs(q);
                if (snap.empty) { setNotFound(true); return; }
                const doc = snap.docs[0];
                const data = { id: doc.id, ...doc.data() } as SurveyTemplate;
                // newsletter_optin は常に最後
                data.questions.sort((a, b) => {
                    if (a.type === 'newsletter_optin') return 1;
                    if (b.type === 'newsletter_optin') return -1;
                    return a.order - b.order;
                });
                setTemplate(data);
            } catch (error) {
                console.error('Failed to load survey:', error);
                setNotFound(true);
            } finally {
                setIsLoading(false);
            }
        };
        fetchTemplate();
    }, [productionId]);

    const setAnswer = (questionId: string, value: any) => {
        setAnswers(prev => ({ ...prev, [questionId]: value }));
        // 入力時にそのフィールドのエラーをクリア
        if (errors[questionId]) {
            setErrors(prev => { const n = { ...prev }; delete n[questionId]; return n; });
        }
    };

    // ── バリデーション ──
    const validate = (): boolean => {
        if (!template) return false;
        const newErrors: Record<string, string> = {};

        for (const q of template.questions) {
            const ans = answers[q.id];

            if (q.type === 'newsletter_optin') {
                const data = ans || {};
                // optin 自体は任意（required フラグに関わらず）
                if (data.optin === 'yes') {
                    if (!data.name?.trim()) newErrors[`${q.id}_name`] = 'お名前を入力してください';
                    if (!data.email?.trim()) {
                        newErrors[`${q.id}_email`] = 'メールアドレスを入力してください';
                    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) {
                        newErrors[`${q.id}_email`] = '正しいメールアドレス形式で入力してください';
                    }
                }
                continue;
            }

            if (!q.required) continue;

            if (q.type === 'single_choice') {
                if (!ans) newErrors[q.id] = 'この設問は必須です';
            } else if (q.type === 'multi_choice') {
                if (!Array.isArray(ans) || ans.length === 0) newErrors[q.id] = 'この設問は必須です';
            } else if (q.type === 'free_text') {
                if (!ans?.trim()) newErrors[q.id] = 'この設問は必須です';
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    // ── 送信 ──
    const handleSubmit = async () => {
        if (!template || isSubmitting) return;
        setSubmitError(null);

        if (!validate()) {
            // 最初のエラーまでスクロール
            const firstKey = Object.keys(errors)[0] || '';
            const el = document.getElementById(`q-${firstKey.replace('_name', '').replace('_email', '')}`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        setIsSubmitting(true);
        try {
            await addDoc(collection(db, 'surveyResponses'), {
                surveyTemplateId: template.id,
                productionId,
                source: 'web',
                answers,
                submittedAt: serverTimestamp(),
            });
            setIsSubmitted(true);
            window.scrollTo(0, 0);
        } catch (err: any) {
            console.error('Survey submit error:', err);
            setSubmitError('送信に失敗しました。しばらく時間を置いてから再度お試しください。');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return <div className="flex-center" style={{ height: '50vh' }}>読み込み中...</div>;
    }

    if (notFound || !template) {
        return (
            <div className="container" style={{ maxWidth: '600px', textAlign: 'center', paddingTop: '4rem' }}>
                <div className="card" style={{ padding: '3rem', borderTop: '4px solid var(--accent)' }}>
                    <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>📝</div>
                    <h2 className="heading-lg" style={{ color: 'var(--accent)', marginBottom: '1rem' }}>
                        アンケートが見つかりません
                    </h2>
                    <p style={{ color: 'var(--text-muted)', lineHeight: '1.8' }}>
                        このアンケートは終了したか、<br />URLが正しくない可能性があります。
                    </p>
                </div>
            </div>
        );
    }

    // ── 送信完了画面 ──
    if (isSubmitted) {
        return (
            <div className="container" style={{ maxWidth: '600px', paddingBottom: '4rem' }}>
                <header style={{ textAlign: 'center', margin: '3rem 0' }}>
                    <p style={{ letterSpacing: '0.2em', color: 'var(--primary)', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                        AUDIENCE SURVEY
                    </p>
                    <h1 className="heading-lg" style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>
                        {template.title}
                    </h1>
                    <div style={{ width: '40px', height: '2px', backgroundColor: 'var(--primary)', margin: '0 auto' }}></div>
                </header>
                <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎉</div>
                    <h2 className="heading-md" style={{ color: 'var(--success)', marginBottom: '1rem' }}>
                        ご回答ありがとうございました！
                    </h2>
                    <p style={{ marginBottom: '2rem', lineHeight: '1.8' }}>
                        いただいたご意見は、今後の公演づくりに<br />大切に活用させていただきます。
                    </p>
                    <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: '1.5rem' }}>
                        <p className="text-muted" style={{ fontSize: '0.9rem' }}>
                            本日は素敵な時間をお過ごしいただき、ありがとうございました。
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    const hasErrors = Object.keys(errors).length > 0;

    return (
        <div className="container" style={{ maxWidth: '600px', paddingBottom: '4rem' }}>
            <header style={{ textAlign: 'center', margin: '3rem 0' }}>
                <p style={{ letterSpacing: '0.2em', color: 'var(--primary)', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                    AUDIENCE SURVEY
                </p>
                <h1 className="heading-lg" style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>
                    {template.title}
                </h1>
                <div style={{ width: '40px', height: '2px', backgroundColor: 'var(--primary)', margin: '0 auto' }}></div>
            </header>

            <div className="card" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '2rem', lineHeight: '1.6' }}>
                    本日はご来場ありがとうございました。<br />よろしければアンケートのご回答をお願いいたします。
                </p>

                <div style={{ display: 'grid', gap: '1.5rem' }}>
                    {template.questions.map((q, index) => (
                        <QuestionBlock key={q.id} question={q} index={index}
                            answer={answers[q.id]} onAnswer={(val) => setAnswer(q.id, val)}
                            error={errors[q.id]}
                            subErrors={{ name: errors[`${q.id}_name`], email: errors[`${q.id}_email`] }}
                        />
                    ))}
                </div>

                {/* エラーサマリー */}
                {hasErrors && (
                    <div style={{
                        padding: '0.8rem 1rem', marginTop: '1.5rem',
                        backgroundColor: '#fff5f5', border: '1px solid #feb2b2',
                        borderRadius: '8px', color: '#c53030', fontSize: '0.85rem',
                    }}>
                        ⚠ 未回答の必須項目があります。赤く表示された設問をご確認ください。
                    </div>
                )}

                {submitError && (
                    <div style={{
                        padding: '0.8rem 1rem', marginTop: '1rem',
                        backgroundColor: '#fff5f5', border: '1px solid #feb2b2',
                        borderRadius: '8px', color: '#c53030', fontSize: '0.85rem',
                    }}>
                        {submitError}
                    </div>
                )}

                <button
                    className="btn btn-primary"
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    style={{
                        width: '100%', padding: '1.2rem', fontWeight: 'bold', fontSize: '1.2rem',
                        marginTop: '2rem', opacity: isSubmitting ? 0.6 : 1,
                    }}
                >
                    {isSubmitting ? '送信中...' : '回答を送信する'}
                </button>
                <p style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '1rem' }}>
                    ※回答は匿名で処理されます。
                </p>
            </div>
        </div>
    );
}

/* =========================================
   設問ブロック
   ========================================= */

function QuestionBlock({ question: q, index, answer, onAnswer, error, subErrors }: {
    question: SurveyQuestion; index: number; answer: any;
    onAnswer: (val: any) => void;
    error?: string;
    subErrors?: { name?: string; email?: string };
}) {
    const isNewsletter = q.type === 'newsletter_optin';
    const hasError = !!error || !!subErrors?.name || !!subErrors?.email;

    return (
        <div id={`q-${q.id}`} className="form-group" style={{
            marginBottom: 0,
            borderLeft: hasError ? '3px solid #e53e3e' : '3px solid transparent',
            paddingLeft: hasError ? '0.75rem' : '0.75rem',
            transition: 'border-color 0.2s',
        }}>
            {/* ラベル */}
            {!isNewsletter && (
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    Q{index + 1}. {q.label}
                    {q.required && (
                        <span style={{ color: 'var(--primary)', fontSize: '0.8rem', marginLeft: '0.4rem' }}>(必須)</span>
                    )}
                </label>
            )}

            {q.type === 'single_choice' && <SingleChoiceInput options={q.options} value={answer} onChange={onAnswer} />}
            {q.type === 'multi_choice' && <MultiChoiceInput options={q.options} value={answer} onChange={onAnswer} />}
            {q.type === 'free_text' && <FreeTextInput value={answer} onChange={onAnswer} />}
            {isNewsletter && <NewsletterInput question={q} index={index} value={answer} onChange={onAnswer} subErrors={subErrors} />}

            {error && (
                <p style={{ color: '#e53e3e', fontSize: '0.8rem', marginTop: '0.3rem' }}>{error}</p>
            )}
        </div>
    );
}

/* ── 単一選択 ── */
function SingleChoiceInput({ options, value, onChange }: {
    options: SurveyOption[]; value: any; onChange: (v: string) => void;
}) {
    return (
        <div style={{ display: 'grid', gap: '0.5rem' }}>
            {options.map(opt => {
                const selected = value === opt.id;
                return (
                    <label key={opt.id} onClick={() => onChange(opt.id)} style={choiceLabelStyle(selected)}>
                        <span style={radioStyle(selected)}>
                            {selected && <span style={radioDotStyle} />}
                        </span>
                        <span>{opt.label}</span>
                    </label>
                );
            })}
        </div>
    );
}

/* ── 複数選択 ── */
function MultiChoiceInput({ options, value, onChange }: {
    options: SurveyOption[]; value: any; onChange: (v: string[]) => void;
}) {
    const selected: string[] = Array.isArray(value) ? value : [];
    return (
        <div style={{ display: 'grid', gap: '0.5rem' }}>
            {options.map(opt => {
                const isSelected = selected.includes(opt.id);
                return (
                    <label key={opt.id}
                        onClick={() => onChange(isSelected ? selected.filter(v => v !== opt.id) : [...selected, opt.id])}
                        style={choiceLabelStyle(isSelected)}>
                        <span style={checkboxStyle(isSelected)}>
                            {isSelected && <span style={{ fontSize: '0.7rem', color: '#fff', lineHeight: 1 }}>✓</span>}
                        </span>
                        <span>{opt.label}</span>
                    </label>
                );
            })}
        </div>
    );
}

/* ── 自由記述 ── */
function FreeTextInput({ value, onChange }: { value: any; onChange: (v: string) => void }) {
    return (
        <textarea
            className="input"
            rows={3}
            placeholder="こちらにご記入ください"
            value={value || ''}
            onChange={e => onChange(e.target.value)}
        />
    );
}


/* ── メルマガ複合ブロック ── */
function NewsletterInput({ question: q, index, value, onChange, subErrors }: {
    question: SurveyQuestion; index: number; value: any; onChange: (v: any) => void;
    subErrors?: { name?: string; email?: string };
}) {
    const data = value || { optin: null, name: '', email: '' };
    const update = (patch: any) => onChange({ ...data, ...patch });
    const sf = q.subFields!;
    const opted = data.optin === 'yes';

    return (
        <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Q{index + 1}. {q.label}
            </label>

            {/* はい・いいえ */}
            <div style={{ display: 'grid', gap: '0.5rem', marginBottom: opted ? '1rem' : 0 }}>
                {q.options.map(opt => {
                    const selected = data.optin === opt.id;
                    return (
                        <label key={opt.id} onClick={() => update({ optin: opt.id })} style={choiceLabelStyle(selected)}>
                            <span style={radioStyle(selected)}>
                                {selected && <span style={radioDotStyle} />}
                            </span>
                            <span>{opt.label}</span>
                        </label>
                    );
                })}
            </div>

            {/* 連動入力欄 */}
            {opted && (
                <div style={{
                    padding: '1rem', border: '1px solid var(--card-border)',
                    borderRadius: '8px', background: '#fcfcfc',
                    display: 'grid', gap: '0.75rem',
                }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 'bold', fontSize: '0.9rem' }}>
                            {sf.name.label}
                            <span style={{ color: 'var(--primary)', fontSize: '0.8rem', marginLeft: '0.4rem' }}>(必須)</span>
                        </label>
                        <input type="text" className="input" placeholder="お名前"
                            value={data.name} onChange={e => update({ name: e.target.value })}
                            style={{ marginBottom: 0, borderColor: subErrors?.name ? '#e53e3e' : undefined }} />
                        {subErrors?.name && (
                            <p style={{ color: '#e53e3e', fontSize: '0.75rem', marginTop: '0.2rem' }}>{subErrors.name}</p>
                        )}
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 'bold', fontSize: '0.9rem' }}>
                            {sf.email.label}
                            <span style={{ color: 'var(--primary)', fontSize: '0.8rem', marginLeft: '0.4rem' }}>(必須)</span>
                        </label>
                        <input type="email" className="input" placeholder="example@mail.com"
                            value={data.email} onChange={e => update({ email: e.target.value })}
                            style={{ marginBottom: 0, borderColor: subErrors?.email ? '#e53e3e' : undefined }} />
                        {subErrors?.email && (
                            <p style={{ color: '#e53e3e', fontSize: '0.75rem', marginTop: '0.2rem' }}>{subErrors.email}</p>
                        )}
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                            ※配信のご連絡にのみ使用いたします。
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

/* =========================================
   共通スタイル定数
   ========================================= */

const choiceLabelStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: '0.6rem',
    padding: '0.75rem 1rem', borderRadius: '8px',
    border: `1.5px solid ${active ? 'var(--primary)' : 'var(--card-border)'}`,
    backgroundColor: active ? 'rgba(var(--primary-rgb, 74,78,105), 0.05)' : '#fff',
    cursor: 'pointer', transition: 'all 0.15s', userSelect: 'none',
});

const radioStyle = (active: boolean): React.CSSProperties => ({
    width: '18px', height: '18px', borderRadius: '50%',
    border: `2px solid ${active ? 'var(--primary)' : '#ccc'}`,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, transition: 'border-color 0.15s',
});

const radioDotStyle: React.CSSProperties = {
    width: '8px', height: '8px', borderRadius: '50%',
    backgroundColor: 'var(--primary)',
};

const checkboxStyle = (active: boolean): React.CSSProperties => ({
    width: '18px', height: '18px', borderRadius: '4px',
    border: `2px solid ${active ? 'var(--primary)' : '#ccc'}`,
    backgroundColor: active ? 'var(--primary)' : '#fff',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, transition: 'all 0.15s',
});
