'use client';

/** 文字数カウントユーティリティ (全角=2, 半角=1) */
const getVisualLength = (str: string) => {
    return [...str].reduce((acc, char) => acc + (char.match(/[ -~]/) ? 1 : 2), 0);
};

const OPTION_LABEL_MAX_LENGTH = 30; // 表示長30 (全角15文字相当)

import { useState } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';

export interface SurveyQuestion {
    id: string;
    order: number;
    label: string;
    type: 'single_choice' | 'multi_choice' | 'free_text' | 'newsletter_optin';
    required: boolean;
    options: { id: string; label: string }[];
    category: 'demographic' | 'behavior' | 'satisfaction' | 'custom';
    layout: null;
    /** rating_scale 用：最小値/最大値のラベル */
    minLabel?: string;
    maxLabel?: string;
    subFields?: {
        name: { id: string; label: string; required: boolean };
        email: { id: string; label: string; required: boolean };
    };
}

const QUESTION_TYPES = [
    { type: 'single_choice' as const, label: '単一選択', icon: '⭕', description: 'ひとつだけ選ぶ設問' },
    { type: 'multi_choice' as const, label: '複数選択', icon: '☑️', description: '複数選べる設問' },
    { type: 'free_text' as const, label: '自由記述', icon: '✏️', description: 'テキスト入力' },
];

function getTypeLabel(type: string) {
    if (type === 'newsletter_optin') return 'メルマガ・お知らせ希望';
    return QUESTION_TYPES.find(t => t.type === type)?.label || type;
}
function getTypeIcon(type: string) {
    if (type === 'newsletter_optin') return '📩';
    return QUESTION_TYPES.find(t => t.type === type)?.icon || '❓';
}

const hasOptions = (type: string) => type === 'single_choice' || type === 'multi_choice';

interface Props {
    questions: SurveyQuestion[];
    onChange: (questions: SurveyQuestion[]) => void;
}

export default function SurveyBuilder({ questions, onChange }: Props) {
    const [showTypeMenu, setShowTypeMenu] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [highlightId, setHighlightId] = useState<string | null>(null);
    const [newsletterPreview, setNewsletterPreview] = useState<Record<string, boolean>>({});

    const reorder = (updated: SurveyQuestion[]) => {
        const others = updated.filter(q => q.type !== 'newsletter_optin');
        const news = updated.filter(q => q.type === 'newsletter_optin');
        return [...others, ...news].map((q, i) => ({ ...q, order: i + 1 }));
    };

    const updateQuestion = (id: string, patch: Partial<SurveyQuestion>) => {
        onChange(questions.map(q => q.id === id ? { ...q, ...patch } : q));
    };

    const addQuestion = (type: SurveyQuestion['type']) => {
        const newId = `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const newQuestion: SurveyQuestion = {
            id: newId, order: 0, label: '', type,
            required: false,
            options: hasOptions(type) ? [{ id: `opt_${Date.now()}_1`, label: '' }] : [],
            category: 'custom', layout: null,
        };
        const updated = [...questions];
        const newsIndex = updated.findIndex(q => q.type === 'newsletter_optin');
        if (newsIndex !== -1) {
            updated.splice(newsIndex, 0, newQuestion);
        } else {
            updated.push(newQuestion);
        }
        onChange(reorder(updated));
        setExpandedId(newId);
        setShowTypeMenu(false);
    };

    const addNewsletterBlock = () => {
        const newQuestion: SurveyQuestion = {
            id: 'q_newsletter_optin', order: questions.length + 1,
            label: '今後の公演情報やお知らせの配信を希望しますか？',
            type: 'newsletter_optin', required: false,
            options: [{ id: 'yes', label: '希望する' }, { id: 'no', label: '希望しない' }],
            category: 'behavior', layout: null,
            subFields: {
                name: { id: 'q_name', label: 'お名前', required: true },
                email: { id: 'q_email', label: 'メールアドレス', required: true },
            },
        };
        onChange(reorder([...questions, newQuestion]));
        setExpandedId('q_newsletter_optin');
        setShowTypeMenu(false);
    };

    const removeQuestion = (id: string) => {
        onChange(reorder(questions.filter(q => q.id !== id)));
        if (expandedId === id) setExpandedId(null);
    };

    const moveQuestion = (index: number, direction: -1 | 1) => {
        const target = index + direction;
        if (target < 0 || target >= questions.length) return;

        const currentQ = questions[index];
        const targetQ = questions[target];
        // ニュースレター自体は移動不可
        if (currentQ.type === 'newsletter_optin') return;
        // ニュースレターより下（後ろ）への移動は不可
        if (direction === 1 && targetQ.type === 'newsletter_optin') return;

        const updated = [...questions];
        const movedId = updated[index].id;
        [updated[index], updated[target]] = [updated[target], updated[index]];
        onChange(reorder(updated));
        // ハイライト
        setHighlightId(movedId);
        setTimeout(() => setHighlightId(null), 350);
    };

    const addOption = (questionId: string) => {
        const q = questions.find(q => q.id === questionId);
        if (!q) return;
        updateQuestion(questionId, { options: [...q.options, { id: `opt_${Date.now()}_${q.options.length + 1}`, label: '' }] });
    };

    const updateOptionLabel = (questionId: string, optIndex: number, label: string) => {
        const q = questions.find(q => q.id === questionId);
        if (!q) return;

        // 文字数制限チェック（全角・半角混在対応）
        let finalLabel = label;
        if (getVisualLength(label) > OPTION_LABEL_MAX_LENGTH) {
            // 文字列を切り詰めるロジック
            let currentLen = 0;
            let truncated = '';
            for (const char of label) {
                const charLen = char.match(/[ -~]/) ? 1 : 2;
                if (currentLen + charLen <= OPTION_LABEL_MAX_LENGTH) {
                    truncated += char;
                    currentLen += charLen;
                } else {
                    break;
                }
            }
            finalLabel = truncated;
        }

        updateQuestion(questionId, { options: q.options.map((opt, i) => i === optIndex ? { ...opt, label: finalLabel } : opt) });
    };

    const removeOption = (questionId: string, optIndex: number) => {
        const q = questions.find(q => q.id === questionId);
        if (!q) return;
        updateQuestion(questionId, { options: q.options.filter((_, i) => i !== optIndex) });
    };

    const hasNewsletter = questions.some(q => q.type === 'newsletter_optin');

    return (
        <div>
            <LayoutGroup>
                {questions.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                        <AnimatePresence mode="popLayout">
                            {questions.map((q, index) => {
                                const isExpanded = expandedId === q.id;
                                const isNewsletter = q.type === 'newsletter_optin';
                                const isHighlighted = highlightId === q.id;
                                return (
                                    <motion.div
                                        key={q.id}
                                        layout
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0, transition: { duration: 0.15 } }}
                                        transition={{
                                            layout: { type: 'spring', stiffness: 1200, damping: 80 },
                                            opacity: { duration: 0.15 },
                                        }}
                                        style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch', borderRadius: '12px' }}
                                    >
                                        <div style={{
                                            display: 'flex', flexDirection: 'column', gap: '4px',
                                            justifyContent: 'center', flexShrink: 0,
                                            visibility: isNewsletter ? 'hidden' : 'visible', // ニュースレターはボタン非表示
                                        }}>
                                            <button onClick={() => moveQuestion(index, -1)} disabled={index === 0}
                                                style={reorderBtnStyle(index > 0)} aria-label="上に移動">▲</button>
                                            <button onClick={() => moveQuestion(index, 1)}
                                                disabled={index === questions.length - 1 - (hasNewsletter ? 1 : 0)}
                                                style={reorderBtnStyle(index < questions.length - 1 - (hasNewsletter ? 1 : 0))}
                                                aria-label="下に移動">▼</button>
                                        </div>

                                        {/* カード */}
                                        <motion.div
                                            layout="position"
                                            style={{
                                                flex: 1,
                                                backgroundColor: isNewsletter ? '#fffbf0' : 'var(--card-bg)',
                                                borderRadius: 'var(--border-radius)',
                                                border: isHighlighted
                                                    ? '2px solid var(--primary)'
                                                    : isExpanded
                                                        ? '2px solid var(--primary)'
                                                        : `1px solid ${isNewsletter ? '#f0e6cc' : 'var(--card-border)'}`,
                                                boxShadow: isHighlighted
                                                    ? '0 4px 12px rgba(0,0,0,0.1)'
                                                    : isExpanded
                                                        ? '0 4px 16px rgba(0,0,0,0.08)'
                                                        : '0 2px 8px rgba(0,0,0,0.04)',
                                                overflow: 'hidden',
                                                transition: 'border-color 0.3s, box-shadow 0.3s',
                                            }}
                                        >
                                            {/* ヘッダー */}
                                            <div
                                                onClick={() => setExpandedId(isExpanded ? null : q.id)}
                                                style={{
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                    padding: '0.9rem 1.25rem', cursor: 'pointer',
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: 0 }}>
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                        width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
                                                        backgroundColor: '#f0f0f0', fontSize: '0.75rem', fontWeight: 'bold', color: '#666'
                                                    }}>{index + 1}</span>
                                                    <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{getTypeIcon(q.type)}</span>
                                                    <span style={{
                                                        fontSize: '0.9rem', fontWeight: '600',
                                                        color: q.label ? 'var(--foreground)' : '#bbb',
                                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                                    }}>
                                                        {q.label || '質問文を入力…'}
                                                        {q.required && <span style={{ color: '#e53e3e', marginLeft: '3px' }}>*</span>}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                                                    <motion.span
                                                        animate={{ rotate: isExpanded ? 180 : 0 }}
                                                        transition={{ duration: 0.2 }}
                                                        style={{ fontSize: '0.7rem', color: '#aaa', display: 'inline-block' }}
                                                    >▼</motion.span>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); removeQuestion(q.id); }}
                                                        style={{
                                                            background: 'none', border: '1px solid #e8e8e8', borderRadius: '6px',
                                                            padding: '0.2rem 0.5rem', fontSize: '0.7rem', color: '#bbb',
                                                            cursor: 'pointer', transition: 'all 0.15s'
                                                        }}
                                                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#e53e3e'; e.currentTarget.style.color = '#e53e3e'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#e8e8e8'; e.currentTarget.style.color = '#bbb'; }}
                                                    >削除</button>
                                                </div>
                                            </div>

                                            {/* 展開エリア */}
                                            <AnimatePresence initial={false}>
                                                {isExpanded && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        transition={{ duration: 0.18, ease: 'easeInOut' }}
                                                        style={{ overflow: 'hidden' }}
                                                    >
                                                        <div style={{ padding: '0 1.25rem 1.25rem', borderTop: '1px solid #f0f0f0' }}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                                                                {!isNewsletter && (
                                                                    <>
                                                                        <input type="text" className="input"
                                                                            placeholder="質問文を入力してください"
                                                                            value={q.label}
                                                                            onChange={e => updateQuestion(q.id, { label: e.target.value })}
                                                                            style={{ fontSize: '1rem', fontWeight: '600' }}
                                                                            autoFocus />
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                            <span style={{ fontSize: '0.8rem', color: '#888' }}>
                                                                                タイプ: {getTypeIcon(q.type)} {getTypeLabel(q.type)}
                                                                            </span>
                                                                            <ToggleSwitch checked={q.required}
                                                                                onChange={val => updateQuestion(q.id, { required: val })} label="必須回答" />
                                                                        </div>
                                                                        {hasOptions(q.type) && (
                                                                            <OptionsEditor type={q.type} options={q.options} questionId={q.id}
                                                                                onUpdate={updateOptionLabel} onRemove={removeOption} onAdd={addOption} />
                                                                        )}
                                                                        {q.type === 'free_text' && <FreeTextPreview />}
                                                                    </>
                                                                )}
                                                                {isNewsletter && (
                                                                    <NewsletterBlockEditor question={q}
                                                                        onUpdate={patch => updateQuestion(q.id, patch)}
                                                                        previewYes={!!newsletterPreview[q.id]}
                                                                        onTogglePreview={() => setNewsletterPreview(p => ({ ...p, [q.id]: !p[q.id] }))} />
                                                                )}
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </motion.div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                )}
            </LayoutGroup>

            {/* 追加ボタン */}
            <div style={{ position: 'relative' }}>
                <button onClick={() => setShowTypeMenu(!showTypeMenu)} className="btn btn-primary"
                    style={{ width: '100%', padding: '0.85rem', fontSize: '0.9rem', borderRadius: '12px' }}>
                    ＋ 設問を追加
                </button>
                {showTypeMenu && (
                    <>
                        <div onClick={() => setShowTypeMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 9 }} />
                        <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.15 }}
                            style={{
                                position: 'absolute', top: '100%', left: 0, right: 0,
                                marginTop: '0.5rem', zIndex: 10,
                                backgroundColor: 'var(--card-bg)', borderRadius: 'var(--border-radius)',
                                border: '1px solid var(--card-border)', boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
                                overflow: 'hidden'
                            }}>
                            {QUESTION_TYPES.map(qt => (
                                <button key={qt.type} onClick={() => addQuestion(qt.type)}
                                    style={menuItemStyle}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                    <span style={{ fontSize: '1.2rem' }}>{qt.icon}</span>
                                    <div>
                                        <div style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>{qt.label}</div>
                                        <div style={{ fontSize: '0.7rem', color: '#999' }}>{qt.description}</div>
                                    </div>
                                </button>
                            ))}
                            <div style={{ borderTop: '2px solid #eee' }} />
                            <button onClick={addNewsletterBlock} disabled={hasNewsletter}
                                style={{
                                    ...menuItemStyle, backgroundColor: hasNewsletter ? '#f5f5f5' : '#fffbf0',
                                    opacity: hasNewsletter ? 0.5 : 1, cursor: hasNewsletter ? 'not-allowed' : 'pointer',
                                }}
                                onMouseEnter={e => { if (!hasNewsletter) e.currentTarget.style.backgroundColor = '#fff5e0'; }}
                                onMouseLeave={e => { if (!hasNewsletter) e.currentTarget.style.backgroundColor = '#fffbf0'; }}>
                                <span style={{ fontSize: '1.2rem' }}>📩</span>
                                <div>
                                    <div style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>
                                        メルマガ・お知らせ希望
                                        {hasNewsletter && <span style={{ fontSize: '0.7rem', color: '#999', marginLeft: '0.5rem' }}>（追加済み）</span>}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: '#999' }}>氏名・メール・配信希望を1ブロックで</div>
                                </div>
                            </button>
                        </motion.div>
                    </>
                )}
            </div>
        </div>
    );
}

/* =========================================
   サブコンポーネント
   ========================================= */

function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}>
            <span style={{ fontSize: '0.8rem', color: '#666' }}>{label}</span>
            <span onClick={() => onChange(!checked)} style={{
                position: 'relative', display: 'inline-block',
                width: '40px', height: '22px', borderRadius: '11px',
                backgroundColor: checked ? 'var(--primary)' : '#ddd',
                cursor: 'pointer', transition: 'background-color 0.25s',
            }}>
                <motion.span
                    animate={{ left: checked ? 21 : 3 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    style={{
                        position: 'absolute', width: '16px', height: '16px', borderRadius: '50%',
                        backgroundColor: '#fff', top: '3px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                    }} />
            </span>
        </label>
    );
}

function OptionsEditor({ type, options, questionId, onUpdate, onRemove, onAdd }: {
    type: string; options: { id: string; label: string }[]; questionId: string;
    onUpdate: (qId: string, idx: number, label: string) => void;
    onRemove: (qId: string, idx: number) => void;
    onAdd: (qId: string) => void;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <AnimatePresence initial={false}>
                {options.map((opt, i) => {
                    const currentLen = getVisualLength(opt.label);
                    const isOver = currentLen >= OPTION_LABEL_MAX_LENGTH;
                    return (
                        <motion.div key={opt.id}
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.8rem', color: '#ccc', width: '18px', textAlign: 'center', flexShrink: 0 }}>
                                    {type === 'single_choice' ? '○' : '☐'}
                                </span>
                                <input type="text" className="input" placeholder={`選択肢 ${i + 1}`}
                                    value={opt.label} onChange={e => onUpdate(questionId, i, e.target.value)}
                                    style={{
                                        flex: 1, fontSize: '0.9rem',
                                        borderColor: isOver ? 'var(--primary)' : undefined,
                                        backgroundColor: isOver ? 'rgba(var(--primary-rgb), 0.02)' : undefined
                                    }} />
                                {options.length > 1 && (
                                    <button onClick={() => onRemove(questionId, i)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ddd', fontSize: '1rem', padding: '0 2px', transition: 'color 0.15s' }}
                                        onMouseEnter={e => e.currentTarget.style.color = '#e53e3e'}
                                        onMouseLeave={e => e.currentTarget.style.color = '#ddd'}>✕</button>
                                )}
                            </div>
                            <div style={{
                                display: 'flex', justifyContent: 'flex-end', paddingRight: '2rem',
                                fontSize: '0.7rem', color: isOver ? 'var(--primary)' : '#bbb',
                            }}>
                                {isOver && <span style={{ marginRight: 'auto', fontWeight: 'bold' }}>⚠️ 選択肢は全角15文字以内で簡潔に</span>}
                                {currentLen} / {OPTION_LABEL_MAX_LENGTH}
                            </div>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
            <button onClick={() => onAdd(questionId)}
                style={{ background: 'none', border: '1px dashed #ddd', borderRadius: '8px', padding: '0.45rem', cursor: 'pointer', color: '#aaa', fontSize: '0.8rem', transition: 'all 0.15s', marginTop: '0.2rem' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#ddd'; e.currentTarget.style.color = '#aaa'; }}>
                ＋ 選択肢を追加
            </button>
        </div>
    );
}


function FreeTextPreview() {
    return (
        <div style={{ border: '1px dashed #e0e0e0', borderRadius: '8px', padding: '0.8rem', color: '#ccc', fontSize: '0.8rem', minHeight: '50px' }}>
            回答者がここに自由記述します…
        </div>
    );
}

function NewsletterBlockEditor({ question, onUpdate, previewYes, onTogglePreview }: {
    question: SurveyQuestion; onUpdate: (patch: Partial<SurveyQuestion>) => void;
    previewYes: boolean; onTogglePreview: () => void;
}) {
    const sf = question.subFields!;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input type="text" className="input"
                placeholder="質問文（例: 今後の公演情報の配信を希望しますか？）"
                value={question.label} onChange={e => onUpdate({ label: e.target.value })}
                style={{ fontSize: '1rem', fontWeight: '600' }} autoFocus />

            <div style={{
                backgroundColor: '#fff', border: '1px solid #e8e0cc', borderRadius: '10px',
                padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem',
            }}>
                <div style={{ fontSize: '0.75rem', color: '#b8a070', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                    📩 回答者に表示されるイメージ
                </div>
                <div style={{ display: 'flex', gap: '1.5rem' }}>
                    {question.options.map(opt => (
                        <label key={opt.id}
                            onClick={opt.id === 'yes' && !previewYes ? onTogglePreview : opt.id === 'no' && previewYes ? onTogglePreview : undefined}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                            <span style={{
                                width: '16px', height: '16px', borderRadius: '50%',
                                border: `2px solid ${(opt.id === 'yes' && previewYes) || (opt.id === 'no' && !previewYes) ? 'var(--primary)' : '#ccc'}`,
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                {((opt.id === 'yes' && previewYes) || (opt.id === 'no' && !previewYes)) && (
                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--primary)' }} />
                                )}
                            </span>
                            {opt.label}
                        </label>
                    ))}
                </div>
                <motion.div
                    animate={{ height: previewYes ? 'auto' : 0, opacity: previewYes ? 1 : 0 }}
                    transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                    style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div>
                        <label style={{ fontSize: '0.75rem', color: '#888', display: 'block', marginBottom: '2px' }}>
                            {sf.name.label} <span style={{ color: '#e53e3e' }}>*</span>
                        </label>
                        <div style={{ border: '1px solid #e0e0e0', borderRadius: '6px', padding: '0.5rem 0.75rem', fontSize: '0.85rem', color: '#ccc', backgroundColor: '#fafafa' }}>
                            回答者が入力
                        </div>
                    </div>
                    <div>
                        <label style={{ fontSize: '0.75rem', color: '#888', display: 'block', marginBottom: '2px' }}>
                            {sf.email.label} <span style={{ color: '#e53e3e' }}>*</span>
                        </label>
                        <div style={{ border: '1px solid #e0e0e0', borderRadius: '6px', padding: '0.5rem 0.75rem', fontSize: '0.85rem', color: '#ccc', backgroundColor: '#fafafa' }}>
                            回答者が入力
                        </div>
                    </div>
                </motion.div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.75rem', color: '#888', display: 'block', marginBottom: '2px' }}>名前欄のラベル</label>
                    <input type="text" className="input" value={sf.name.label}
                        onChange={e => onUpdate({ subFields: { ...sf, name: { ...sf.name, label: e.target.value } } })}
                        style={{ fontSize: '0.85rem' }} />
                </div>
                <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.75rem', color: '#888', display: 'block', marginBottom: '2px' }}>メール欄のラベル</label>
                    <input type="text" className="input" value={sf.email.label}
                        onChange={e => onUpdate({ subFields: { ...sf, email: { ...sf.email, label: e.target.value } } })}
                        style={{ fontSize: '0.85rem' }} />
                </div>
            </div>
        </div>
    );
}

/* =========================================
   スタイル定数
   ========================================= */

const reorderBtnStyle = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: '36px', height: '36px', borderRadius: '8px',
    border: `1px solid ${active ? '#ddd' : '#f0f0f0'}`,
    background: active ? '#fff' : '#fafafa',
    fontSize: '0.75rem',
    cursor: active ? 'pointer' : 'default',
    color: active ? '#666' : '#ddd',
    transition: 'all 0.15s',
    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
});

const menuItemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '0.75rem',
    width: '100%', padding: '0.9rem 1.25rem',
    background: 'none', border: 'none', borderBottom: '1px solid #f0f0f0',
    cursor: 'pointer', textAlign: 'left', transition: 'background-color 0.15s',
};
