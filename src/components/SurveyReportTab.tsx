'use client';

import { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { SurveyQuestion } from '@/components/SurveyBuilder';

interface SurveyResponse {
    id: string;
    surveyTemplateId: string;
    productionId: string;
    answers: Record<string, any>;
    submittedAt: any;
}

interface SurveyTemplate {
    id: string;
    questions: SurveyQuestion[];
    [key: string]: any;
}

type ReportView = 'stats' | 'individual';

const COLORS = ['#4a4e69', '#9a8c98', '#c9ada7', '#f2e9e4', '#22223b', '#6c757d', '#adb5bd', '#dee2e6'];


export default function SurveyReportTab({ responses, template }: {
    responses: SurveyResponse[];
    template: SurveyTemplate;
}) {
    const [view, setView] = useState<ReportView>('stats');

    const totalCount = responses.length;

    return (
        <div>
            {/* KPIカード群 */}
            <KpiRow responses={responses} template={template} />

            {/* サブナビゲーション */}
            <div style={{
                display: 'flex', gap: '0.5rem', marginTop: '1rem', marginBottom: '1rem',
            }}>
                <SubNavButton active={view === 'stats'} onClick={() => setView('stats')}>
                    📊 全体統計
                </SubNavButton>
                <SubNavButton active={view === 'individual'} onClick={() => setView('individual')}>
                    📋 個別回答 ({totalCount})
                </SubNavButton>
            </div>

            {/* ビュー */}
            {view === 'stats' && <StatsView responses={responses} template={template} />}
            {view === 'individual' && <IndividualView responses={responses} template={template} />}
        </div>
    );
}

/* =========================================
   ── KPI行 ──
   ========================================= */

function KpiRow({ responses, template }: { responses: SurveyResponse[]; template: SurveyTemplate }) {
    const totalCount = responses.length;

    // newsletter opt-in rate
    const nlQs = template.questions.filter(q => q.type === 'newsletter_optin');
    let yesCount = 0, nlTotal = 0;
    for (const r of responses) {
        for (const nq of nlQs) {
            const v = r.answers?.[nq.id];
            if (v && typeof v === 'object' && v.optin) { nlTotal++; if (v.optin === 'yes') yesCount++; }
        }
    }
    const optinRate = nlTotal > 0 ? Math.round((yesCount / nlTotal) * 100) : null;

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <KpiCard icon="📨" label="総回答数" value={String(totalCount)} unit="件" accent="#4a4e69" />
            <KpiCard icon="💌" label="メルマガ希望" value={optinRate !== null ? String(optinRate) : '—'} unit={optinRate !== null ? '%' : ''} accent="#ec4899" />
        </div>
    );
}

function KpiCard({ icon, label, value, unit, accent }: {
    icon: string; label: string; value: string; unit: string; accent: string;
}) {
    return (
        <div className="card" style={{
            padding: '1rem', border: 'none',
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            borderTop: `3px solid ${accent}`,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '1rem' }}>{icon}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600' }}>{label}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
                <span style={{
                    fontSize: '1.8rem', fontWeight: 'bold', color: accent,
                    fontVariantNumeric: 'tabular-nums', transition: 'all 0.3s',
                }}>{value}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{unit}</span>
            </div>
        </div>
    );
}

/* =========================================
   ── 全体統計ビュー ──
   ========================================= */

function StatsView({ responses, template }: { responses: SurveyResponse[]; template: SurveyTemplate }) {
    const sortedQuestions = [...template.questions].sort((a, b) => a.order - b.order);

    if (responses.length === 0) {
        return (
            <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
                <p style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📭</p>
                <p className="text-muted">まだ回答が届いていません。</p>
            </div>
        );
    }

    return (
        <div style={{ display: 'grid', gap: '1rem' }}>
            {sortedQuestions.map((q, idx) => (
                <QuestionStats key={q.id} question={q} index={idx} responses={responses} />
            ))}
        </div>
    );
}

function QuestionStats({ question: q, index, responses }: {
    question: SurveyQuestion; index: number; responses: SurveyResponse[];
}) {
    const label = q.type === 'newsletter_optin' ? q.label : `Q${index + 1}. ${q.label}`;

    return (
        <div className="card" style={{ padding: '1.25rem', border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '0.75rem', lineHeight: '1.4' }}>
                {label}
                <span style={{
                    marginLeft: '0.5rem', fontSize: '0.7rem', color: 'var(--text-muted)',
                    padding: '1px 6px', borderRadius: '3px', backgroundColor: '#f0f0f0',
                }}>
                    {typeLabel(q.type)}
                </span>
            </h4>
            {(q.type === 'single_choice' || q.type === 'multi_choice') && (
                <ChoiceChart question={q} responses={responses} />
            )}
            {q.type === 'free_text' && (
                <FreeTextList question={q} responses={responses} />
            )}
            {q.type === 'newsletter_optin' && (
                <NewsletterStats question={q} responses={responses} />
            )}
        </div>
    );
}

function ChoiceChart({ question: q, responses }: { question: SurveyQuestion; responses: SurveyResponse[] }) {
    const data = useMemo(() => {
        const counts: Record<string, number> = {};
        q.options.forEach(o => { counts[o.id] = 0; });
        for (const r of responses) {
            const ans = r.answers?.[q.id];
            if (q.type === 'single_choice') {
                if (typeof ans === 'string' && counts[ans] !== undefined) counts[ans]++;
            } else if (Array.isArray(ans)) {
                for (const a of ans) { if (counts[a] !== undefined) counts[a]++; }
            }
        }
        const total = responses.length;
        return q.options.map(o => ({
            name: o.label,
            count: counts[o.id],
            pct: total > 0 ? Math.round((counts[o.id] / total) * 100) : 0,
        }));
    }, [q, responses]);

    return (
        <div>
            <div style={{ width: '100%', height: Math.max(data.length * 40 + 20, 120) }}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} layout="vertical" margin={{ left: 0, right: 30, top: 5, bottom: 5 }}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(val: number | undefined) => [`${val ?? 0}件`, '回答数']} />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                            {data.map((_, i) => (
                                <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
            {/* テキスト集計 */}
            <div style={{ display: 'grid', gap: '0.25rem', marginTop: '0.5rem' }}>
                {data.map((d, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.2rem 0' }}>
                        <span>{d.name}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{d.count}件 ({d.pct}%)</span>
                    </div>
                ))}
            </div>
        </div>
    );
}


function FreeTextList({ question: q, responses }: { question: SurveyQuestion; responses: SurveyResponse[] }) {
    const texts = useMemo(() => {
        return responses
            .map(r => r.answers?.[q.id])
            .filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
    }, [q, responses]);

    const [showAll, setShowAll] = useState(false);
    const display = showAll ? texts : texts.slice(0, 10);

    if (texts.length === 0) {
        return <p className="text-muted" style={{ fontSize: '0.85rem', textAlign: 'center', padding: '0.5rem 0' }}>回答なし</p>;
    }

    return (
        <div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{texts.length}件の回答</p>
            <div style={{ display: 'grid', gap: '0.4rem', maxHeight: showAll ? 'none' : '300px', overflowY: 'auto' }}>
                {display.map((txt, i) => (
                    <div key={i} style={{
                        padding: '0.5rem 0.75rem', backgroundColor: '#fafafa',
                        borderRadius: '6px', fontSize: '0.85rem', lineHeight: '1.5',
                        borderLeft: '3px solid var(--primary)',
                    }}>
                        {txt}
                    </div>
                ))}
            </div>
            {texts.length > 10 && !showAll && (
                <button onClick={() => setShowAll(true)} style={{
                    display: 'block', margin: '0.5rem auto 0', background: 'none', border: 'none',
                    color: 'var(--primary)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600',
                }}>
                    すべて表示 ({texts.length}件)
                </button>
            )}
        </div>
    );
}

function NewsletterStats({ question: q, responses }: { question: SurveyQuestion; responses: SurveyResponse[] }) {
    const stats = useMemo(() => {
        let yes = 0, no = 0, unanswered = 0;
        for (const r of responses) {
            const v = r.answers?.[q.id];
            if (!v || typeof v !== 'object' || !v.optin) { unanswered++; continue; }
            if (v.optin === 'yes') yes++; else no++;
        }
        const total = yes + no;
        return { yes, no, unanswered, total, rate: total > 0 ? Math.round((yes / total) * 100) : null };
    }, [q, responses]);

    const data = [
        { name: '希望する', count: stats.yes },
        { name: '希望しない', count: stats.no },
    ];

    return (
        <div>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem' }}>✅ 希望: <strong>{stats.yes}</strong>件</span>
                <span style={{ fontSize: '0.85rem' }}>❌ 不要: <strong>{stats.no}</strong>件</span>
                {stats.rate !== null && (
                    <span style={{ fontSize: '0.85rem', color: '#ec4899' }}>({stats.rate}%)</span>
                )}
            </div>
            <div style={{ width: '100%', height: 80 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} layout="vertical" margin={{ left: 10, right: 30 }}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(val: number | undefined) => [`${val ?? 0}件`, '回答数']} />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={18}>
                            <Cell fill="#86efac" />
                            <Cell fill="#fca5a5" />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

/* =========================================
   ── 個別回答ビュー（スライド形式） ──
   ========================================= */

function IndividualView({ responses, template }: { responses: SurveyResponse[]; template: SurveyTemplate }) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null);

    const sorted = useMemo(() => {
        return [...responses].sort((a, b) => {
            const ta = a.submittedAt?.seconds || 0;
            const tb = b.submittedAt?.seconds || 0;
            return tb - ta;
        });
    }, [responses]);

    const sortedQuestions = useMemo(() => {
        return [...template.questions].sort((a, b) => a.order - b.order);
    }, [template.questions]);

    const total = sorted.length;

    const goTo = (dir: 'prev' | 'next') => {
        setSlideDir(dir === 'next' ? 'left' : 'right');
        setTimeout(() => {
            setCurrentIndex(i => dir === 'next' ? Math.min(total - 1, i + 1) : Math.max(0, i - 1));
            setSlideDir(null);
        }, 150);
    };

    if (total === 0) {
        return (
            <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
                <p style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📭</p>
                <p className="text-muted">まだ回答がありません。</p>
            </div>
        );
    }

    const current = sorted[currentIndex];
    const submittedDate = current.submittedAt?.seconds
        ? new Date(current.submittedAt.seconds * 1000).toLocaleString('ja-JP')
        : '—';

    return (
        <div>
            {/* ナビゲーション */}
            <div style={{
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                gap: '1rem', marginBottom: '0.75rem',
            }}>
                <button
                    onClick={() => goTo('prev')}
                    disabled={currentIndex === 0}
                    style={slideNavBtnStyle(currentIndex === 0)}
                >◀</button>
                <span style={{
                    fontSize: '0.95rem', fontWeight: 'bold',
                    fontVariantNumeric: 'tabular-nums', minWidth: '80px', textAlign: 'center',
                }}>
                    {currentIndex + 1} / {total}
                </span>
                <button
                    onClick={() => goTo('next')}
                    disabled={currentIndex === total - 1}
                    style={slideNavBtnStyle(currentIndex === total - 1)}
                >▶</button>
            </div>

            {/* 回答カード */}
            <div style={{ overflow: 'hidden' }}>
                <div
                    key={current.id}
                    className="card"
                    style={{
                        padding: '1.5rem', border: 'none',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
                        animation: slideDir ? `slideOut${slideDir === 'left' ? 'Left' : 'Right'} 0.15s ease` : 'slideIn 0.2s ease',
                    }}
                >
                    {/* 日時ヘッダー */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        marginBottom: '1rem', paddingBottom: '0.75rem',
                        borderBottom: '1px solid var(--card-border)',
                    }}>
                        <span style={{
                            width: '30px', height: '30px', borderRadius: '50%',
                            backgroundColor: '#4a4e69', color: '#fff',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.8rem', fontWeight: 'bold', flexShrink: 0,
                        }}>
                            {currentIndex + 1}
                        </span>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>送信: {submittedDate}</span>
                    </div>

                    {/* 全設問の回答 */}
                    <div style={{ display: 'grid', gap: '0.6rem' }}>
                        {sortedQuestions.map((q, qi) => {
                            const ans = current.answers?.[q.id];
                            return (
                                <div key={q.id} style={{
                                    padding: '0.65rem 0.85rem', backgroundColor: '#fafafa',
                                    borderRadius: '8px', fontSize: '0.85rem',
                                }}>
                                    <div style={{
                                        fontWeight: '600', fontSize: '0.78rem',
                                        color: 'var(--text-muted)', marginBottom: '0.25rem',
                                    }}>
                                        {q.type === 'newsletter_optin' ? q.label : `Q${qi + 1}. ${q.label}`}
                                    </div>
                                    <div style={{ lineHeight: '1.6' }}>
                                        {formatAnswer(q, ans)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* アニメーション定義 */}
            <style jsx>{`
                @keyframes slideIn {
                    from { opacity: 0; transform: translateX(0); }
                    to { opacity: 1; transform: translateX(0); }
                }
                @keyframes slideOutLeft {
                    from { opacity: 1; transform: translateX(0); }
                    to { opacity: 0; transform: translateX(-30px); }
                }
                @keyframes slideOutRight {
                    from { opacity: 1; transform: translateX(0); }
                    to { opacity: 0; transform: translateX(30px); }
                }
            `}</style>
        </div>
    );
}

/* =========================================
   ── ユーティリティ ──
   ========================================= */

function formatAnswer(q: SurveyQuestion, ans: any): string {
    if (ans === undefined || ans === null || ans === '') return '（未回答）';

    if (q.type === 'single_choice') {
        const opt = q.options.find(o => o.id === ans);
        return opt ? opt.label : String(ans);
    }
    if (q.type === 'multi_choice') {
        if (!Array.isArray(ans) || ans.length === 0) return '（未回答）';
        return ans.map((a: string) => {
            const opt = q.options.find(o => o.id === a);
            return opt ? opt.label : a;
        }).join('、');
    }
    if (q.type === 'free_text') {
        return String(ans);
    }
    if (q.type === 'newsletter_optin') {
        if (typeof ans !== 'object') return '（未回答）';
        const optin = ans.optin === 'yes' ? '希望する' : ans.optin === 'no' ? '希望しない' : '（未回答）';
        let result = optin;
        if (ans.optin === 'yes') {
            if (ans.name) result += ` ／ 名前: ${ans.name}`;
            if (ans.email) result += ` ／ Email: ${ans.email}`;
        }
        return result;
    }
    return String(ans);
}

function typeLabel(type: string): string {
    const map: Record<string, string> = {
        single_choice: '単一選択', multi_choice: '複数選択',
        free_text: '自由記述',
        newsletter_optin: 'メルマガ',
    };
    return map[type] || type;
}

function SubNavButton({ active, onClick, children }: {
    active: boolean; onClick: () => void; children: React.ReactNode;
}) {
    return (
        <button onClick={onClick} style={{
            flex: 1, padding: '0.6rem', borderRadius: '8px',
            border: active ? '2px solid var(--primary)' : '2px solid var(--card-border)',
            backgroundColor: active ? 'rgba(74,78,105,0.06)' : '#fff',
            color: active ? 'var(--text)' : 'var(--text-muted)',
            fontWeight: active ? 'bold' : 'normal',
            fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.15s',
        }}>
            {children}
        </button>
    );
}

const slideNavBtnStyle = (disabled: boolean): React.CSSProperties => ({
    width: '44px', height: '44px', borderRadius: '50%',
    border: '1px solid var(--card-border)', backgroundColor: '#fff',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.3 : 1,
    fontSize: '1.1rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: disabled ? 'none' : '0 2px 8px rgba(0,0,0,0.08)',
    transition: 'all 0.15s',
});
