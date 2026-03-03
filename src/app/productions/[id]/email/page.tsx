'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { serializeDoc } from '@/lib/firestore-utils';
import { Production } from '@/types';
import Breadcrumb from '@/components/Breadcrumb';
import EmailTemplateEditModal, { EmailTemplateData } from '@/components/EmailTemplateEditModal';

type Tab = 'AUTO' | 'BROADCAST' | 'HISTORY';

const DEFAULT_CONFIRMATION_TEMPLATE: EmailTemplateData = {
    subject: 'ご予約完了のお知らせ — {{production_title}}',
    body: `{{customer_name}} 様

この度は「{{production_title}}」にご予約いただき、誠にありがとうございます。

以下の内容でご予約を承りました。

━━━━━━━━━━━━━━━━━━
公演名: {{production_title}}
公演日時: {{performance_date}}
会場: {{venue}}

{{ticket_details}}

合計金額: {{total_amount}}
━━━━━━━━━━━━━━━━━━

【ご来場時のお願い】
・開演の10分前までにご来場ください。

ご不明な点がございましたら、お気軽にお問い合わせください。

{{organizer_name}}`,
};

const DEFAULT_REMINDER_TEMPLATE: EmailTemplateData = {
    subject: '【明日公演】{{production_title}} ご来場のご案内',
    timing: 'day_before_18',
    body: `{{customer_name}} 様

いつもありがとうございます。
明日の「{{production_title}}」公演についてご案内いたします。

━━━━━━━━━━━━━━━━━━
公演日時: {{performance_date}}
会場: {{venue}}
お席: {{ticket_count}}枚
━━━━━━━━━━━━━━━━━━

【ご来場についてのお願い】
・開演の10分前までに受付をお済ませください。
・受付にてご予約のお名前をお伝えください。

皆さまのご来場を心よりお待ちしております。

{{organizer_name}}`,
};

const REMINDER_TIMING_OPTIONS = [
    { value: 'day_before_10', label: '公演前日 10:00' },
    { value: 'day_before_12', label: '公演前日 12:00' },
    { value: 'day_before_18', label: '公演前日 18:00' },
    { value: 'day_before_20', label: '公演前日 20:00' },
    { value: 'two_days_before_18', label: '公演2日前 18:00' },
    { value: 'same_day_morning', label: '公演当日 9:00' },
];

function getTimingLabel(value: string): string {
    return REMINDER_TIMING_OPTIONS.find(o => o.value === value)?.label || value;
}

export default function EmailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { user, loading } = useAuth();
    const [production, setProduction] = useState<Production | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<Tab>('AUTO');

    // 自動メール設定（UIのみ）
    const [confirmationEnabled, setConfirmationEnabled] = useState(true);
    const [reminderEnabled, setReminderEnabled] = useState(false);
    const [confirmationTemplate, setConfirmationTemplate] = useState<EmailTemplateData>(DEFAULT_CONFIRMATION_TEMPLATE);
    const [reminderTemplate, setReminderTemplate] = useState<EmailTemplateData>(DEFAULT_REMINDER_TEMPLATE);

    // モーダル状態
    const [editingType, setEditingType] = useState<'confirmation' | 'reminder' | null>(null);

    // 一斉送信フォーム（UIのみ）
    const [broadcastTarget, setBroadcastTarget] = useState('all');
    const [broadcastSubject, setBroadcastSubject] = useState('');
    const [broadcastBody, setBroadcastBody] = useState('');

    useEffect(() => {
        const fetchProduction = async () => {
            if (!user) return;
            try {
                const docRef = doc(db, 'productions', id);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = serializeDoc<Production>(docSnap);
                    if (data.userId === user.uid) {
                        setProduction(data);
                    }
                }
            } catch (error) {
                console.error('Failed to fetch production:', error);
            } finally {
                setIsLoading(false);
            }
        };

        if (!loading && user) {
            fetchProduction();
        } else if (!loading) {
            setIsLoading(false);
        }
    }, [id, user, loading]);

    if (loading || isLoading) {
        return <div className="flex-center" style={{ height: '50vh' }}>読み込み中...</div>;
    }

    if (!user || !production) {
        return (
            <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>
                <h2 className="heading-md">アクセス権限がありません</h2>
                <Link href="/dashboard" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>ダッシュボードに戻る</Link>
            </div>
        );
    }

    const tabs: { id: Tab; label: string; icon: string }[] = [
        { id: 'AUTO', label: '自動メール', icon: '⚡' },
        { id: 'BROADCAST', label: '一斉送信', icon: '📨' },
        { id: 'HISTORY', label: '送信履歴', icon: '📋' },
    ];

    /** プレビュー表示用: テンプレート変数部分をハイライト */
    const highlightVariables = (text: string) => {
        const variableMap: Record<string, string> = {
            '{{customer_name}}': 'お客様名',
            '{{production_title}}': '公演名',
            '{{performance_date}}': '公演日時',
            '{{venue}}': '会場名',
            '{{ticket_details}}': 'チケット詳細',
            '{{total_amount}}': '合計金額',
            '{{ticket_count}}': 'チケット枚数',
            '{{organizer_name}}': '主催者名',
        };
        return text.replace(/{{[^}]+}}/g, (match) => variableMap[match] || match);
    };

    /** 本文の最初の数行を抽出 */
    const getBodySummary = (body: string, lines: number = 3) => {
        const allLines = body.split('\n').filter(l => l.trim());
        return allLines.slice(0, lines).map(l => highlightVariables(l)).join('\n');
    };

    return (
        <div className="container" style={{ maxWidth: '1000px' }}>
            <Breadcrumb items={[
                { label: 'ダッシュボード', href: '/dashboard' },
                { label: production.title, href: `/productions/${id}` },
                { label: 'メール設定' }
            ]} />
            <div style={{ marginBottom: '1.25rem' }}>
                <Link href="/dashboard" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', borderRadius: '8px', fontSize: '0.9rem' }}>
                    <span>&larr;</span> ダッシュボードに戻る
                </Link>
            </div>
            <div style={{ marginBottom: '2rem' }}>
                <h2 className="heading-lg" style={{ marginBottom: '0.5rem' }}>✉️ {production.title} — メール管理</h2>
                <p className="text-muted" style={{ fontSize: '0.9rem' }}>自動メールの設定や、予約者への一斉送信を管理できます。</p>
            </div>

            {/* 未認証バナー */}
            <div style={{
                background: '#fff8e1',
                border: '1px solid #ffe082',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                marginBottom: '1.5rem',
                fontSize: '0.9rem',
                color: '#795548',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
            }}>
                <span style={{ fontSize: '1.1rem' }}>⚠️</span>
                Resendドメイン認証が完了していないため、メール送信機能は現在利用できません。認証完了後に有効になります。
            </div>

            {/* タブナビゲーション */}
            <div style={{
                display: 'flex',
                gap: '0.5rem',
                marginBottom: '2rem',
                borderBottom: '1px solid #e0e0e0',
                paddingBottom: '2px',
            }}>
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            padding: '0.75rem 1.25rem',
                            border: 'none',
                            background: 'none',
                            cursor: 'pointer',
                            fontSize: '0.95rem',
                            fontWeight: activeTab === tab.id ? '700' : '500',
                            color: activeTab === tab.id ? 'var(--primary)' : '#666',
                            borderBottom: activeTab === tab.id ? '3px solid var(--primary)' : '3px solid transparent',
                            transition: 'all 0.2s',
                        }}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {/* 自動メールタブ */}
            {activeTab === 'AUTO' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* 予約確認メール */}
                    <div className="card" style={{ padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <div>
                                <h3 style={{ fontSize: '1.05rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>📩 予約確認メール</h3>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                                    予約完了時に自動送信されるメールです。
                                </p>
                            </div>
                            <button
                                onClick={() => setConfirmationEnabled(!confirmationEnabled)}
                                style={{
                                    width: '52px',
                                    height: '28px',
                                    borderRadius: '14px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    background: confirmationEnabled ? 'var(--primary)' : '#ccc',
                                    position: 'relative',
                                    transition: 'background 0.2s',
                                    flexShrink: 0,
                                }}
                                title={confirmationEnabled ? 'ON' : 'OFF'}
                            >
                                <div style={{
                                    width: '22px',
                                    height: '22px',
                                    borderRadius: '50%',
                                    background: '#fff',
                                    position: 'absolute',
                                    top: '3px',
                                    left: confirmationEnabled ? '27px' : '3px',
                                    transition: 'left 0.2s',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                }} />
                            </button>
                        </div>
                        <div style={{
                            background: '#f8f9fa',
                            borderRadius: '8px',
                            padding: '1rem 1.25rem',
                            fontSize: '0.85rem',
                            color: '#555',
                            lineHeight: '1.7',
                            border: '1px solid #eee',
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <span style={{ fontWeight: 'bold', color: '#333' }}>テンプレート内容</span>
                                <button
                                    onClick={() => setEditingType('confirmation')}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.3rem',
                                        padding: '0.35rem 0.75rem',
                                        border: '1px solid var(--primary)',
                                        borderRadius: '6px',
                                        background: '#fff',
                                        cursor: 'pointer',
                                        fontSize: '0.8rem',
                                        color: 'var(--primary)',
                                        fontWeight: '600',
                                        transition: 'all 0.15s',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'var(--primary)';
                                        e.currentTarget.style.color = '#fff';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = '#fff';
                                        e.currentTarget.style.color = 'var(--primary)';
                                    }}
                                >
                                    ✏️ 編集
                                </button>
                            </div>
                            <div style={{ borderLeft: '3px solid var(--primary)', paddingLeft: '0.75rem' }}>
                                <p style={{ margin: '0 0 0.25rem' }}>
                                    <span style={{ color: '#999', fontSize: '0.8rem' }}>件名:</span>{' '}
                                    {highlightVariables(confirmationTemplate.subject)}
                                </p>
                                <p style={{ margin: '0 0 0.25rem' }}>
                                    <span style={{ color: '#999', fontSize: '0.8rem' }}>送信元:</span>{' '}
                                    Tenjin-Support &lt;no-reply@tenjin-support.com&gt;
                                </p>
                                <p style={{ margin: '0', whiteSpace: 'pre-line' }}>
                                    <span style={{ color: '#999', fontSize: '0.8rem' }}>本文:</span>{' '}
                                    {getBodySummary(confirmationTemplate.body)}...
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* リマインドメール */}
                    <div className="card" style={{ padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <div>
                                <h3 style={{ fontSize: '1.05rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>🔔 リマインドメール</h3>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                                    公演前に予約者へ自動送信されるリマインダーです。
                                </p>
                            </div>
                            <button
                                onClick={() => setReminderEnabled(!reminderEnabled)}
                                style={{
                                    width: '52px',
                                    height: '28px',
                                    borderRadius: '14px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    background: reminderEnabled ? 'var(--primary)' : '#ccc',
                                    position: 'relative',
                                    transition: 'background 0.2s',
                                    flexShrink: 0,
                                }}
                                title={reminderEnabled ? 'ON' : 'OFF'}
                            >
                                <div style={{
                                    width: '22px',
                                    height: '22px',
                                    borderRadius: '50%',
                                    background: '#fff',
                                    position: 'absolute',
                                    top: '3px',
                                    left: reminderEnabled ? '27px' : '3px',
                                    transition: 'left 0.2s',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                }} />
                            </button>
                        </div>
                        <div style={{
                            background: '#f8f9fa',
                            borderRadius: '8px',
                            padding: '1rem 1.25rem',
                            fontSize: '0.85rem',
                            color: '#555',
                            lineHeight: '1.7',
                            border: '1px solid #eee',
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <span style={{ fontWeight: 'bold', color: '#333' }}>テンプレート内容</span>
                                <button
                                    onClick={() => setEditingType('reminder')}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.3rem',
                                        padding: '0.35rem 0.75rem',
                                        border: '1px solid var(--primary)',
                                        borderRadius: '6px',
                                        background: '#fff',
                                        cursor: 'pointer',
                                        fontSize: '0.8rem',
                                        color: 'var(--primary)',
                                        fontWeight: '600',
                                        transition: 'all 0.15s',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'var(--primary)';
                                        e.currentTarget.style.color = '#fff';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = '#fff';
                                        e.currentTarget.style.color = 'var(--primary)';
                                    }}
                                >
                                    ✏️ 編集
                                </button>
                            </div>
                            <div style={{ borderLeft: '3px solid var(--primary)', paddingLeft: '0.75rem' }}>
                                <p style={{ margin: '0 0 0.25rem' }}>
                                    <span style={{ color: '#999', fontSize: '0.8rem' }}>件名:</span>{' '}
                                    {highlightVariables(reminderTemplate.subject)}
                                </p>
                                <p style={{ margin: '0 0 0.25rem' }}>
                                    <span style={{ color: '#999', fontSize: '0.8rem' }}>送信タイミング:</span>{' '}
                                    {getTimingLabel(reminderTemplate.timing || '')}
                                </p>
                                <p style={{ margin: '0', whiteSpace: 'pre-line' }}>
                                    <span style={{ color: '#999', fontSize: '0.8rem' }}>本文:</span>{' '}
                                    {getBodySummary(reminderTemplate.body)}...
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 一斉送信タブ */}
            {activeTab === 'BROADCAST' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="card" style={{ padding: '1.5rem' }}>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: 'bold', marginBottom: '1rem' }}>📋 送信対象</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {[
                                { value: 'all', label: '全予約者' },
                                { value: 'confirmed', label: '確定済みの予約者のみ' },
                                { value: 'unpaid', label: '未払いの予約者のみ' },
                                { value: 'checkedin', label: '来場済みの予約者のみ' },
                            ].map(opt => (
                                <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.95rem' }}>
                                    <input
                                        type="radio"
                                        name="target"
                                        value={opt.value}
                                        checked={broadcastTarget === opt.value}
                                        onChange={(e) => setBroadcastTarget(e.target.value)}
                                        style={{ accentColor: 'var(--primary)' }}
                                    />
                                    {opt.label}
                                </label>
                            ))}
                        </div>
                        <div style={{
                            marginTop: '1rem',
                            padding: '0.5rem 0.75rem',
                            background: '#f0f0f0',
                            borderRadius: '6px',
                            fontSize: '0.85rem',
                            color: '#666',
                        }}>
                            送信対象: <strong>— 件</strong>（Resend認証後に件数が表示されます）
                        </div>
                    </div>

                    <div className="card" style={{ padding: '1.5rem' }}>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: 'bold', marginBottom: '1rem' }}>✏️ メール内容</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                                    件名
                                </label>
                                <input
                                    type="text"
                                    className="input"
                                    placeholder="例: 公演に関する重要なお知らせ"
                                    value={broadcastSubject}
                                    onChange={(e) => setBroadcastSubject(e.target.value)}
                                    style={{ width: '100%' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                                    本文
                                </label>
                                <textarea
                                    className="input"
                                    rows={8}
                                    placeholder="メール本文を入力してください..."
                                    value={broadcastBody}
                                    onChange={(e) => setBroadcastBody(e.target.value)}
                                    style={{ width: '100%', resize: 'vertical' }}
                                />
                            </div>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                                ※ メール本文には予約者名が自動的に挿入されます。
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            className="btn btn-primary"
                            disabled
                            title="Resendドメイン認証後に利用可能になります"
                            style={{
                                padding: '0.75rem 2rem',
                                fontSize: '1rem',
                                borderRadius: '8px',
                                opacity: 0.5,
                                cursor: 'not-allowed',
                            }}
                        >
                            📨 送信する（認証後に有効）
                        </button>
                    </div>
                </div>
            )}

            {/* 送信履歴タブ */}
            {activeTab === 'HISTORY' && (
                <div className="card" style={{ padding: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 'bold', marginBottom: '1rem' }}>📋 送信履歴</h3>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem', minWidth: '600px' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--card-border)', background: '#f8f9fa' }}>
                                    <th style={{ padding: '0.75rem 1rem', color: '#666', fontWeight: 'bold', fontSize: '0.8rem' }}>送信日時</th>
                                    <th style={{ padding: '0.75rem 1rem', color: '#666', fontWeight: 'bold', fontSize: '0.8rem' }}>件名</th>
                                    <th style={{ padding: '0.75rem 1rem', color: '#666', fontWeight: 'bold', fontSize: '0.8rem' }}>送信対象</th>
                                    <th style={{ padding: '0.75rem 1rem', color: '#666', fontWeight: 'bold', fontSize: '0.8rem' }}>送信件数</th>
                                    <th style={{ padding: '0.75rem 1rem', color: '#666', fontWeight: 'bold', fontSize: '0.8rem' }}>ステータス</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📭</div>
                                        <p style={{ margin: 0 }}>まだ送信履歴はありません</p>
                                        <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem' }}>
                                            Resendドメイン認証完了後、メールの送信履歴がここに表示されます。
                                        </p>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* テンプレート編集モーダル */}
            {editingType === 'confirmation' && (
                <EmailTemplateEditModal
                    isOpen={true}
                    onClose={() => setEditingType(null)}
                    onSave={(data) => {
                        setConfirmationTemplate(data);
                        setEditingType(null);
                    }}
                    title="予約確認メール"
                    icon="📩"
                    template={confirmationTemplate}
                />
            )}
            {editingType === 'reminder' && (
                <EmailTemplateEditModal
                    isOpen={true}
                    onClose={() => setEditingType(null)}
                    onSave={(data) => {
                        setReminderTemplate(data);
                        setEditingType(null);
                    }}
                    title="リマインドメール"
                    icon="🔔"
                    template={reminderTemplate}
                    showTiming
                    timingOptions={REMINDER_TIMING_OPTIONS}
                />
            )}
        </div>
    );
}
