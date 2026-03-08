'use client';

import { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { db } from '@/lib/firebase';
import { doc, getDoc, getDocs, updateDoc, addDoc, collection, query, where, serverTimestamp } from 'firebase/firestore';
import { serializeDoc, serializeDocs } from '@/lib/firestore-utils';
import { Production, EmailTemplateData, FirestoreReservation } from '@/types';
import Breadcrumb from '@/components/Breadcrumb';
import EmailTemplateEditModal from '@/components/EmailTemplateEditModal';
import BroadcastRecipientModal, { type BroadcastRecipient } from '@/components/BroadcastRecipientModal';
import TemplateInlineEditor from '@/components/TemplateInlineEditor';
import ConfirmModal from '@/components/ConfirmModal';
import { sendBroadcastEmails } from '@/app/actions/broadcast';

type Tab = 'AUTO' | 'BROADCAST' | 'HISTORY';
type BroadcastMode = 'all' | 'custom';

const TARGET_LABELS: Record<string, string> = {
    all: '全予約者',
    custom: 'カスタム',
};

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

{{organizer_name}}

──────────────────
※ このメールは送信専用アドレスから配信しています。
※ ご不明な点がございましたら {{organizer_email}} までお問い合わせください。`,
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

{{organizer_name}}

──────────────────
※ このメールは送信専用アドレスから配信しています。
※ ご不明な点がございましたら {{organizer_email}} までお問い合わせください。`,
};

const REMINDER_TIMING_OPTIONS = [
    { value: 'day_before_10', label: '公演前日 10:00' },
    { value: 'day_before_12', label: '公演前日 12:00' },
    { value: 'day_before_18', label: '公演前日 18:00' },
    { value: 'day_before_20', label: '公演前日 20:00' },
    { value: 'two_days_before_18', label: '公演2日前 18:00' },
    { value: 'same_day_morning', label: '公演当日 9:00' },
];

const DEFAULT_BROADCAST_BODY = `{{customer_name}} 様

いつもお世話になっております。
「{{production_title}}」に関するお知らせです。



{{organizer_name}}

──────────────────
※ このメールは送信専用アドレスから配信しています。
※ ご不明な点がございましたら {{organizer_email}} までお問い合わせください。`;

function getTimingLabel(value: string): string {
    return REMINDER_TIMING_OPTIONS.find(o => o.value === value)?.label || value;
}

export default function EmailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { user, loading } = useAuth();
    const { showToast } = useToast();
    const [production, setProduction] = useState<Production | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<Tab>('AUTO');

    // 自動メール設定
    const [confirmationEnabled, setConfirmationEnabled] = useState(true);
    const [reminderEnabled, setReminderEnabled] = useState(false);
    const [confirmationTemplate, setConfirmationTemplate] = useState<EmailTemplateData>(DEFAULT_CONFIRMATION_TEMPLATE);
    const [reminderTemplate, setReminderTemplate] = useState<EmailTemplateData>(DEFAULT_REMINDER_TEMPLATE);

    // モーダル状態
    const [editingType, setEditingType] = useState<'confirmation' | 'reminder' | null>(null);

    // 一斉送信フォーム
    const [broadcastMode, setBroadcastMode] = useState<BroadcastMode>('all');
    const [broadcastSubject, setBroadcastSubject] = useState('');
    const [broadcastBody, setBroadcastBody] = useState(DEFAULT_BROADCAST_BODY);
    const [allTargetCount, setAllTargetCount] = useState<number | null>(null);
    const [customRecipients, setCustomRecipients] = useState<BroadcastRecipient[]>([]);
    const [showRecipientModal, setShowRecipientModal] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [confirmSend, setConfirmSend] = useState(false);
    const [broadcastEditorKey, setBroadcastEditorKey] = useState(0);
    const [showBroadcastResetConfirm, setShowBroadcastResetConfirm] = useState(false);

    // 送信履歴
    const [history, setHistory] = useState<{
        id: string;
        subject: string;
        target: string;
        totalTargets: number;
        sentCount: number;
        errorCount: number;
        sentAt: string | null;
    }[]>([]);

    const [isSaving, setIsSaving] = useState(false);

    // Firestore は undefined 値を受け付けないため除去する
    const removeUndefined = (obj: any): any => {
        if (obj === null || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(removeUndefined);
        const cleaned: any = {};
        for (const [key, value] of Object.entries(obj)) {
            if (value !== undefined) cleaned[key] = removeUndefined(value);
        }
        return cleaned;
    };

    const saveEmailTemplates = async (updates: Partial<{
        confirmation: EmailTemplateData;
        confirmationEnabled: boolean;
        reminder: EmailTemplateData;
        reminderEnabled: boolean;
    }>) => {
        if (!user || !production) return;
        setIsSaving(true);
        try {
            const docRef = doc(db, 'productions', id);
            const current = production.emailTemplates || {};
            const merged = removeUndefined({ ...current, ...updates });
            await updateDoc(docRef, {
                emailTemplates: merged,
                updatedAt: serverTimestamp(),
            });
            setProduction({ ...production, emailTemplates: merged });
        } catch (error) {
            console.error('Failed to save email templates:', error);
        } finally {
            setIsSaving(false);
        }
    };

    // 全予約者の件数を取得（クライアント側 Firestore）
    const fetchAllTargetCount = useCallback(async () => {
        if (!user) return;
        try {
            const q = query(collection(db, 'reservations'), where('productionId', '==', id));
            const snapshot = await getDocs(q);
            const reservations = serializeDocs<FirestoreReservation>(snapshot.docs);
            // キャンセル除外、メールあり、重複除去
            const uniqueEmails = new Set<string>();
            for (const res of reservations) {
                if (res.status !== 'CANCELED' && res.customerEmail) {
                    uniqueEmails.add(res.customerEmail);
                }
            }
            setAllTargetCount(uniqueEmails.size);
        } catch (error) {
            console.error('Failed to fetch target count:', error);
            setAllTargetCount(null);
        }
    }, [id, user]);

    // 送信履歴を取得（クライアント側 Firestore）
    const fetchHistory = useCallback(async () => {
        if (!user) return;
        try {
            const q = query(collection(db, 'broadcastLogs'), where('productionId', '==', id));
            const snapshot = await getDocs(q);
            const logs = snapshot.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    subject: data.subject || '',
                    target: data.target || 'all',
                    totalTargets: data.totalTargets || 0,
                    sentCount: data.sentCount || 0,
                    errorCount: data.errorCount || 0,
                    sentAt: data.sentAt?.toDate?.()?.toISOString() || null,
                };
            });
            logs.sort((a, b) => {
                const tA = a.sentAt ? new Date(a.sentAt).getTime() : 0;
                const tB = b.sentAt ? new Date(b.sentAt).getTime() : 0;
                return tB - tA;
            });
            setHistory(logs);
        } catch (error) {
            console.error('Failed to fetch history:', error);
        }
    }, [id, user]);

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
                        if (data.emailTemplates?.confirmation) {
                            setConfirmationTemplate(data.emailTemplates.confirmation);
                        }
                        if (data.emailTemplates?.confirmationEnabled !== undefined) {
                            setConfirmationEnabled(data.emailTemplates.confirmationEnabled);
                        }
                        if (data.emailTemplates?.reminder) {
                            setReminderTemplate(data.emailTemplates.reminder);
                        }
                        if (data.emailTemplates?.reminderEnabled !== undefined) {
                            setReminderEnabled(data.emailTemplates.reminderEnabled);
                        }
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

    // タブ切り替え時にデータ取得
    useEffect(() => {
        if (activeTab === 'BROADCAST') fetchAllTargetCount();
        if (activeTab === 'HISTORY') fetchHistory();
    }, [activeTab, fetchAllTargetCount, fetchHistory]);

    // 実際の送信対象件数
    const currentTargetCount = broadcastMode === 'all' ? allTargetCount : customRecipients.length;

    const handleSendBroadcast = async () => {
        if (!user || !production) return;
        if (!broadcastSubject.trim()) {
            showToast('件名が設定されていません。', 'warning');
            return;
        }
        if (!broadcastBody.trim()) return;
        const combined = broadcastSubject + broadcastBody;
        if (combined.includes('{{venue}}') && !production.venue?.trim()) {
            showToast('会場名が設定されていません。公演設定の基本情報から会場名を設定してください。', 'warning');
            return;
        }
        if (combined.includes('{{organizer_email}}') && !production.organizerEmail?.trim()) {
            showToast('主催者メールアドレスが設定されていません。公演設定の基本情報から設定してください。', 'warning');
            return;
        }
        setIsSending(true);
        try {
            let recipients: { email: string; customerName: string }[];

            if (broadcastMode === 'all') {
                // 全予約者: クライアント側で宛先リストを構築
                const q = query(collection(db, 'reservations'), where('productionId', '==', id));
                const snapshot = await getDocs(q);
                const reservations = serializeDocs<FirestoreReservation>(snapshot.docs);
                const emailMap = new Map<string, { email: string; customerName: string }>();
                for (const res of reservations) {
                    if (res.status !== 'CANCELED' && res.customerEmail && !emailMap.has(res.customerEmail)) {
                        emailMap.set(res.customerEmail, { email: res.customerEmail, customerName: res.customerName });
                    }
                }
                recipients = Array.from(emailMap.values());
            } else {
                // カスタム: 選択済みリストを使用
                recipients = customRecipients.map(r => ({ email: r.email, customerName: r.customerName }));
            }

            if (recipients.length === 0) {
                showToast('送信対象がありません。', 'warning');
                setIsSending(false);
                return;
            }

            // サーバーアクションで Resend API 送信のみ実行
            const result = await sendBroadcastEmails(
                recipients, broadcastSubject, broadcastBody,
                production.title, '', production.organizerEmail || '',
            );

            // 送信履歴をクライアント側で Firestore に保存
            try {
                await addDoc(collection(db, 'broadcastLogs'), {
                    productionId: id,
                    userId: user.uid,
                    subject: broadcastSubject,
                    target: broadcastMode,
                    totalTargets: result.totalTargets,
                    sentCount: result.sentCount,
                    errorCount: result.errorCount,
                    sentAt: serverTimestamp(),
                });
            } catch (e) {
                console.error('送信履歴の保存に失敗:', e);
            }

            if (result.success) {
                showToast(`${result.sentCount}件のメールを送信しました。`, 'success');
            } else {
                showToast(`${result.sentCount}件送信、${result.errorCount}件エラー。`, 'warning');
            }
            setBroadcastSubject('');
            setBroadcastBody(DEFAULT_BROADCAST_BODY);
            setConfirmSend(false);
            setCustomRecipients([]);
            fetchAllTargetCount();
        } catch (error: any) {
            console.error('Broadcast error:', error);
            showToast('送信に失敗しました。', 'error');
        } finally {
            setIsSending(false);
        }
    };

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
            '{{organizer_email}}': '主催者メールアドレス',
        };
        return text.replace(/{{[^}]+}}/g, (match) => variableMap[match] || match);
    };

    /** 本文の最初の数行を抽出 */
    const getBodySummary = (body: string, lines: number = 3) => {
        const allLines = body.split('\n').filter(l => l.trim());
        return allLines.slice(0, lines).map(l => highlightVariables(l)).join('\n');
    };

    const formatSentAt = (iso: string | null) => {
        if (!iso) return '—';
        const d = new Date(iso);
        return d.toLocaleDateString('ja-JP', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        });
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
                                    予約完了時に自動送信されるメールです。（プレーンテキスト形式）
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    const newVal = !confirmationEnabled;
                                    setConfirmationEnabled(newVal);
                                    saveEmailTemplates({ confirmationEnabled: newVal });
                                }}
                                style={{
                                    width: '52px', height: '28px', borderRadius: '14px',
                                    border: 'none', cursor: 'pointer',
                                    background: confirmationEnabled ? 'var(--primary)' : '#ccc',
                                    position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                                }}
                                title={confirmationEnabled ? 'ON' : 'OFF'}
                            >
                                <div style={{
                                    width: '22px', height: '22px', borderRadius: '50%', background: '#fff',
                                    position: 'absolute', top: '3px',
                                    left: confirmationEnabled ? '27px' : '3px',
                                    transition: 'left 0.2s',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                }} />
                            </button>
                        </div>
                        <div style={{
                            background: '#f8f9fa', borderRadius: '8px', padding: '1rem 1.25rem',
                            fontSize: '0.85rem', color: '#555', lineHeight: '1.7', border: '1px solid #eee',
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <span style={{ fontWeight: 'bold', color: '#333' }}>テンプレート内容</span>
                                <button
                                    onClick={() => setEditingType('confirmation')}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                        padding: '0.35rem 0.75rem', border: '1px solid var(--primary)',
                                        borderRadius: '6px', background: '#fff', cursor: 'pointer',
                                        fontSize: '0.8rem', color: 'var(--primary)', fontWeight: '600',
                                        transition: 'all 0.15s',
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--primary)'; e.currentTarget.style.color = '#fff'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = 'var(--primary)'; }}
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
                                onClick={() => {
                                    const newVal = !reminderEnabled;
                                    setReminderEnabled(newVal);
                                    saveEmailTemplates({ reminderEnabled: newVal });
                                }}
                                style={{
                                    width: '52px', height: '28px', borderRadius: '14px',
                                    border: 'none', cursor: 'pointer',
                                    background: reminderEnabled ? 'var(--primary)' : '#ccc',
                                    position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                                }}
                                title={reminderEnabled ? 'ON' : 'OFF'}
                            >
                                <div style={{
                                    width: '22px', height: '22px', borderRadius: '50%', background: '#fff',
                                    position: 'absolute', top: '3px',
                                    left: reminderEnabled ? '27px' : '3px',
                                    transition: 'left 0.2s',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                }} />
                            </button>
                        </div>
                        <div style={{
                            background: '#f8f9fa', borderRadius: '8px', padding: '1rem 1.25rem',
                            fontSize: '0.85rem', color: '#555', lineHeight: '1.7', border: '1px solid #eee',
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <span style={{ fontWeight: 'bold', color: '#333' }}>テンプレート内容</span>
                                <button
                                    onClick={() => setEditingType('reminder')}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                        padding: '0.35rem 0.75rem', border: '1px solid var(--primary)',
                                        borderRadius: '6px', background: '#fff', cursor: 'pointer',
                                        fontSize: '0.8rem', color: 'var(--primary)', fontWeight: '600',
                                        transition: 'all 0.15s',
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--primary)'; e.currentTarget.style.color = '#fff'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = 'var(--primary)'; }}
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
                    {/* 送信対象 */}
                    <div className="card" style={{ padding: '1.5rem' }}>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: 'bold', marginBottom: '1rem' }}>📋 送信対象</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {/* 全予約者 */}
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.95rem' }}>
                                <input
                                    type="radio"
                                    name="broadcastMode"
                                    checked={broadcastMode === 'all'}
                                    onChange={() => { setBroadcastMode('all'); setCustomRecipients([]); setConfirmSend(false); }}
                                    style={{ accentColor: 'var(--primary)' }}
                                />
                                全予約者（キャンセル除く）
                                {allTargetCount !== null && (
                                    <span style={{ fontSize: '0.8rem', color: '#888' }}>— {allTargetCount}件</span>
                                )}
                            </label>

                            {/* カスタム */}
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.95rem' }}>
                                <input
                                    type="radio"
                                    name="broadcastMode"
                                    checked={broadcastMode === 'custom'}
                                    onChange={() => { setBroadcastMode('custom'); setConfirmSend(false); }}
                                    style={{ accentColor: 'var(--primary)' }}
                                />
                                カスタム（送信先を選択）
                            </label>
                        </div>

                        {/* カスタム選択時の詳細 */}
                        {broadcastMode === 'custom' && (
                            <div style={{ marginTop: '1rem' }}>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => setShowRecipientModal(true)}
                                    style={{
                                        padding: '0.6rem 1.25rem',
                                        fontSize: '0.9rem',
                                        borderRadius: '8px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                    }}
                                >
                                    📋 送信先を選択する
                                </button>

                                {customRecipients.length > 0 && (
                                    <div style={{ marginTop: '0.75rem' }}>
                                        <div style={{
                                            padding: '0.75rem 1rem',
                                            background: '#e8f5e9',
                                            borderRadius: '6px',
                                            fontSize: '0.85rem',
                                            color: '#2e7d32',
                                            marginBottom: '0.5rem',
                                        }}>
                                            <strong>{customRecipients.length}件</strong> の宛先が選択されています
                                        </div>
                                        <div style={{
                                            maxHeight: '150px',
                                            overflow: 'auto',
                                            border: '1px solid #e0e0e0',
                                            borderRadius: '6px',
                                            fontSize: '0.8rem',
                                        }}>
                                            {customRecipients.map(r => (
                                                <div key={r.email} style={{
                                                    padding: '0.4rem 0.75rem',
                                                    borderBottom: '1px solid #f0f0f0',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                }}>
                                                    <span style={{ fontWeight: '600' }}>{r.customerName}</span>
                                                    <span style={{ color: '#888' }}>{r.email}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 全予約者時のサマリー */}
                        {broadcastMode === 'all' && (
                            <div style={{
                                marginTop: '1rem',
                                padding: '0.5rem 0.75rem',
                                background: allTargetCount !== null && allTargetCount > 0 ? '#e8f5e9' : '#f0f0f0',
                                borderRadius: '6px',
                                fontSize: '0.85rem',
                                color: allTargetCount !== null && allTargetCount > 0 ? '#2e7d32' : '#666',
                            }}>
                                送信対象: <strong>{allTargetCount !== null ? `${allTargetCount} 件` : '取得中...'}</strong>
                                {allTargetCount !== null && allTargetCount > 0 && (
                                    <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: '#888' }}>
                                        （メールアドレスが登録されている予約者のみ、重複除外済み）
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* メール内容 */}
                    <div className="card" style={{ padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ fontSize: '1.05rem', fontWeight: 'bold', margin: 0 }}>✏️ メール内容</h3>
                            <button
                                onClick={() => setShowBroadcastResetConfirm(true)}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                    padding: '0.35rem 0.75rem', border: '1px solid #ccc',
                                    borderRadius: '6px', background: '#fff', cursor: 'pointer',
                                    fontSize: '0.8rem', color: '#888', fontWeight: '500',
                                    transition: 'all 0.15s',
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#999'; e.currentTarget.style.color = '#555'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#ccc'; e.currentTarget.style.color = '#888'; }}
                            >
                                デフォルトに戻す
                            </button>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 1rem' }}>
                            プレーンテキスト形式で送信されます。変数は送信時に各宛先の値に置換されます。
                        </p>
                        <TemplateInlineEditor
                            key={broadcastEditorKey}
                            subject={broadcastSubject}
                            body={broadcastBody}
                            onSubjectChange={setBroadcastSubject}
                            onBodyChange={setBroadcastBody}
                            subjectPlaceholder="例: 【公演名】公演に関するお知らせ"
                            bodyPlaceholder="お客様名 様&#10;&#10;いつもお世話になっております。&#10;「公演名」に関するお知らせです。"
                            bodyMinHeight="250px"
                        />
                    </div>

                    {/* 送信ボタン */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                        {!confirmSend ? (
                            <button
                                className="btn btn-primary"
                                disabled={
                                    !broadcastBody.trim() ||
                                    (broadcastMode === 'all' && (allTargetCount === null || allTargetCount === 0)) ||
                                    (broadcastMode === 'custom' && customRecipients.length === 0)
                                }
                                onClick={() => setConfirmSend(true)}
                                style={{ padding: '0.75rem 2rem', fontSize: '1rem', borderRadius: '8px' }}
                            >
                                📨 送信内容を確認
                            </button>
                        ) : (
                            <>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => setConfirmSend(false)}
                                    disabled={isSending}
                                    style={{ padding: '0.75rem 1.5rem', borderRadius: '8px' }}
                                >
                                    戻る
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleSendBroadcast}
                                    disabled={isSending}
                                    style={{
                                        padding: '0.75rem 2rem', fontSize: '1rem',
                                        borderRadius: '8px', background: '#d32f2f',
                                    }}
                                >
                                    {isSending ? '送信中...' : `${currentTargetCount}件に送信する`}
                                </button>
                            </>
                        )}
                    </div>

                    {/* 確認パネル */}
                    {confirmSend && (
                        <div className="card" style={{
                            padding: '1.5rem',
                            border: '2px solid #ffcc80',
                            background: '#fff8e1',
                        }}>
                            <h4 style={{ margin: '0 0 0.75rem', color: '#e65100' }}>⚠️ 送信内容の確認</h4>
                            <div style={{ fontSize: '0.9rem', lineHeight: '1.8' }}>
                                <p style={{ margin: '0 0 0.5rem' }}>
                                    <strong>対象:</strong>{' '}
                                    {broadcastMode === 'all'
                                        ? `全予約者（${currentTargetCount}件）`
                                        : `カスタム（${currentTargetCount}件）`
                                    }
                                </p>
                                <p style={{ margin: '0 0 0.5rem' }}>
                                    <strong>件名:</strong> {highlightVariables(broadcastSubject)}
                                </p>
                                <div style={{
                                    background: '#fff', border: '1px solid #ddd',
                                    borderRadius: '6px', padding: '1rem',
                                    whiteSpace: 'pre-wrap', fontSize: '0.85rem',
                                    marginTop: '0.5rem', maxHeight: '200px', overflow: 'auto',
                                }}>
                                    {highlightVariables(broadcastBody)}
                                </div>
                            </div>
                        </div>
                    )}
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
                                {history.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📭</div>
                                            <p style={{ margin: 0 }}>まだ送信履歴はありません</p>
                                            <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem' }}>
                                                「一斉送信」タブからメールを送信すると、ここに履歴が表示されます。
                                            </p>
                                        </td>
                                    </tr>
                                ) : (
                                    history.map(log => (
                                        <tr key={log.id} style={{ borderBottom: '1px solid #eee' }}>
                                            <td style={{ padding: '0.75rem 1rem' }}>{formatSentAt(log.sentAt)}</td>
                                            <td style={{ padding: '0.75rem 1rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {log.subject}
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem' }}>
                                                {TARGET_LABELS[log.target] || log.target}
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem' }}>{log.sentCount} / {log.totalTargets}</td>
                                            <td style={{ padding: '0.75rem 1rem' }}>
                                                {log.errorCount === 0 ? (
                                                    <span style={{ color: '#2e7d32', fontWeight: '600' }}>完了</span>
                                                ) : (
                                                    <span style={{ color: '#e65100', fontWeight: '600' }}>一部エラー ({log.errorCount}件)</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
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
                        if ((data.subject + data.body).includes('{{venue}}') && !production.venue?.trim()) {
                            showToast('会場名が設定されていません。公演設定の基本情報から会場名を設定してください。', 'warning');
                            return;
                        }
                        setConfirmationTemplate(data);
                        saveEmailTemplates({ confirmation: data });
                        setEditingType(null);
                    }}
                    onReset={() => {
                        setConfirmationTemplate(DEFAULT_CONFIRMATION_TEMPLATE);
                        saveEmailTemplates({ confirmation: DEFAULT_CONFIRMATION_TEMPLATE });
                        setEditingType(null);
                        showToast('予約確認メールをデフォルトに戻しました。', 'success');
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
                        if ((data.subject + data.body).includes('{{venue}}') && !production.venue?.trim()) {
                            showToast('会場名が設定されていません。公演設定の基本情報から会場名を設定してください。', 'warning');
                            return;
                        }
                        setReminderTemplate(data);
                        saveEmailTemplates({ reminder: data });
                        setEditingType(null);
                    }}
                    onReset={() => {
                        setReminderTemplate(DEFAULT_REMINDER_TEMPLATE);
                        saveEmailTemplates({ reminder: DEFAULT_REMINDER_TEMPLATE });
                        setEditingType(null);
                        showToast('リマインドメールをデフォルトに戻しました。', 'success');
                    }}
                    title="リマインドメール"
                    icon="🔔"
                    template={reminderTemplate}
                    showTiming
                    timingOptions={REMINDER_TIMING_OPTIONS}
                />
            )}

            {/* 宛先選択モーダル */}
            <BroadcastRecipientModal
                isOpen={showRecipientModal}
                onClose={() => setShowRecipientModal(false)}
                onConfirm={(recipients) => {
                    setCustomRecipients(recipients);
                    setShowRecipientModal(false);
                    setConfirmSend(false);
                }}
                productionId={id}
            />

            {/* 一斉送信デフォルトリセット確認モーダル */}
            <ConfirmModal
                isOpen={showBroadcastResetConfirm}
                title="デフォルトに戻す"
                message="現在の文章は保存されずに削除されます。デフォルトの内容に戻してもよろしいですか？"
                confirmLabel="デフォルトに戻す"
                cancelLabel="キャンセル"
                onConfirm={() => {
                    setBroadcastSubject('');
                    setBroadcastBody(DEFAULT_BROADCAST_BODY);
                    setBroadcastEditorKey(k => k + 1);
                    setConfirmSend(false);
                    setShowBroadcastResetConfirm(false);
                    showToast('メール内容をデフォルトに戻しました。', 'success');
                }}
                onCancel={() => setShowBroadcastResetConfirm(false)}
            />
        </div>
    );
}
