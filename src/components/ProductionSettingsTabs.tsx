'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import PerformanceManager from './PerformanceManager';
import TicketTypeManager from './TicketTypeManager';

import { updateProductionCustomIdClient, checkCustomIdDuplicateClient, updateProductionBasicInfoClient } from '@/lib/client-firestore';
import { Production, Performance, TicketType } from '@/types';
import { Calendar, Ticket, Settings } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';

type TabType = 'schedule' | 'tickets' | 'basic';

export default function ProductionSettingsTabs({
    production,
    performances,
    ticketTypes,
    userEmail,
}: {
    production: Production;
    performances: Performance[];
    ticketTypes: TicketType[];
    userEmail: string;
}) {
    const { showToast } = useToast();
    const searchParams = useSearchParams();
    const [activeTab, setActiveTab] = useState<TabType>(() => {
        const tab = searchParams.get('tab');
        if (tab === 'tickets' || tab === 'basic' || tab === 'schedule') return tab;
        return 'schedule';
    });
    const [customId, setCustomId] = useState(production.customId || '');
    const [isSaving, setIsSaving] = useState(false);
    const [baseUrl, setBaseUrl] = useState('');

    // 基本情報フォーム
    const [title, setTitle] = useState(production.title);
    const [venue, setVenue] = useState(production.venue || '');
    const [organizerEmail, setOrganizerEmail] = useState(production.organizerEmail || userEmail);
    const [isSavingBasic, setIsSavingBasic] = useState(false);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setBaseUrl(window.location.origin);
        }
    }, []);

    const handleSaveCustomId = async () => {
        if (!/^[a-zA-Z0-9-]*$/.test(customId)) {
            showToast('カスタムIDは半角英数字とハイフンのみ使用できます。', 'error');
            return;
        }

        setIsSaving(true);

        try {
            if (customId) {
                const isDuplicate = await checkCustomIdDuplicateClient(customId, production.id);
                if (isDuplicate) {
                    showToast('このカスタムIDは既に他の公演で使用されています。', 'error');
                    setIsSaving(false);
                    return;
                }
            }

            await updateProductionCustomIdClient(production.id, customId);
            showToast('カスタムIDを更新しました。', 'success');
        } catch (err) {
            console.error('Failed to update customId:', err);
            showToast('更新に失敗しました。', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        showToast('URLをクリップボードにコピーしました。', 'success');
    };

    const hasCustomIdChanges = customId !== (production.customId || '');
    const hasBasicChanges =
        title !== production.title ||
        venue !== (production.venue || '') ||
        organizerEmail !== (production.organizerEmail || userEmail);

    useUnsavedChanges(hasBasicChanges || hasCustomIdChanges);

    const handleSaveBasicInfo = async () => {
        if (!title.trim()) {
            showToast('公演タイトルは必須です。', 'warning');
            return;
        }
        setIsSavingBasic(true);
        try {
            await updateProductionBasicInfoClient(production.id, {
                title: title.trim(),
                venue: venue.trim(),
                organizerEmail: organizerEmail.trim(),
            });
            showToast('基本情報を保存しました。', 'success');
        } catch (err) {
            console.error('Failed to save basic info:', err);
            showToast('保存に失敗しました。', 'error');
        } finally {
            setIsSavingBasic(false);
        }
    };

    const tabIcons: Record<string, React.ReactNode> = {
        schedule: <Calendar size={20} />,
        tickets: <Ticket size={20} />,
        basic: <Settings size={20} />,
    };

    const tabs = [
        { id: 'schedule', label: '公演スケジュール' },
        { id: 'tickets', label: '券種・価格' },
        { id: 'basic', label: '基本情報' },
    ];

    return (
        <div>
            {/* タブナビゲーション */}
            <div style={{
                display: 'flex',
                gap: '0.5rem',
                marginBottom: '2rem',
                borderBottom: '1px solid #e0e0e0',
                paddingBottom: '2px',
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
            }}>
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as TabType)}
                        style={{
                            padding: '0.75rem 1rem',
                            fontSize: '0.95rem',
                            whiteSpace: 'nowrap',
                            fontWeight: activeTab === tab.id ? 'bold' : 'normal',
                            color: activeTab === tab.id ? 'var(--primary)' : '#666',
                            background: 'none',
                            border: 'none',
                            borderBottom: activeTab === tab.id ? '3px solid var(--primary)' : '3px solid transparent',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.6rem',
                            transition: 'all 0.2s ease',
                            outline: 'none',
                            marginBottom: '-2px'
                        }}
                    >
                        <span style={{ display: 'flex', alignItems: 'center' }}>{tabIcons[tab.id]}</span>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* コンテンツエリア */}
            <div style={{ animation: 'fadeIn 0.3s ease-in-out' }}>
                {activeTab === 'schedule' && (
                    <div className="card" style={{ padding: '2rem', border: 'none', boxShadow: 'var(--shadow-md)' }}>
                        <PerformanceManager productionId={production.id} performances={performances} />
                    </div>
                )}

                {activeTab === 'tickets' && (
                    <div className="card" style={{ padding: '2rem', border: 'none', boxShadow: 'var(--shadow-md)' }}>
                        <TicketTypeManager productionId={production.id} ticketTypes={ticketTypes} />
                    </div>
                )}

                {activeTab === 'basic' && (
                    <div className="card" style={{ padding: 'clamp(1rem, 3vw, 2rem)', border: 'none', boxShadow: 'var(--shadow-md)' }}>
                        <h3 className="heading-md">公演基本情報</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1.5rem' }}>
                            <div className="form-group">
                                <label className="label">公演タイトル</label>
                                <input
                                    type="text"
                                    className="input"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="公演タイトルを入力"
                                    style={{ marginBottom: 0 }}
                                />
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                    メールテンプレートの「公演名」変数に使用されます。
                                </p>
                            </div>
                            <div className="form-group">
                                <label className="label">会場名</label>
                                <input
                                    type="text"
                                    className="input"
                                    value={venue}
                                    onChange={(e) => setVenue(e.target.value)}
                                    placeholder="例: 新宿シアターモリエール"
                                    style={{ marginBottom: 0 }}
                                />
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                    メールテンプレートの「会場名」変数に使用されます。
                                </p>
                            </div>
                            <div className="form-group">
                                <label className="label">主催者メールアドレス</label>
                                <input
                                    type="email"
                                    className="input"
                                    value={organizerEmail}
                                    onChange={(e) => setOrganizerEmail(e.target.value)}
                                    placeholder="example@gmail.com"
                                    style={{ marginBottom: 0 }}
                                />
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                    メールテンプレートの「主催者メールアドレス」変数に使用されます。お客様からの問い合わせ先として表示されます。
                                </p>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button
                                    onClick={handleSaveBasicInfo}
                                    disabled={isSavingBasic || !hasBasicChanges || !title.trim()}
                                    className="btn btn-primary"
                                    style={{ padding: '0.6rem 2rem', width: '100%', maxWidth: '300px' }}
                                >
                                    {isSavingBasic ? '保存中...' : '基本情報を保存'}
                                </button>
                            </div>

                            <div className="form-group" style={{ borderTop: '1px solid var(--card-border)', paddingTop: '1.5rem', marginTop: '0.5rem' }}>
                                <label className="label">公演ID (システム管理用)</label>
                                <code style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{production.id}</code>
                            </div>
                            <div className="form-group" style={{ borderTop: '1px solid var(--card-border)', paddingTop: '1.5rem', marginTop: '0.5rem' }}>
                                <label className="label">予約フォームのカスタムID (URLスラッグ)</label>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <input
                                        type="text"
                                        className="input"
                                        value={customId}
                                        onChange={(e) => setCustomId(e.target.value)}
                                        placeholder="例: winter-performance-2026"
                                        style={{ flex: '1 1 200px', marginBottom: 0 }}
                                    />
                                    <button
                                        onClick={handleSaveCustomId}
                                        disabled={isSaving || customId === production.customId}
                                        className="btn btn-primary"
                                        style={{ whiteSpace: 'nowrap' }}
                                    >
                                        {isSaving ? '保存中...' : '保存'}
                                    </button>
                                </div>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                    半角英数字とハイフンが使用できます。設定すると、分かりやすいURLで予約フォームを共有できます。
                                </p>
                            </div>
                        </div>
                    </div>
                )}

            </div>

            <style jsx>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
