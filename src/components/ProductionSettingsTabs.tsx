'use client';

import React, { useState, useEffect } from 'react';
import PerformanceManager from './PerformanceManager';
import TicketTypeManager from './TicketTypeManager';

import { updateProductionCustomIdClient, checkCustomIdDuplicateClient } from '@/lib/client-firestore';
import { Production, Performance, TicketType } from '@/types';
import { Calendar, Ticket, Settings } from 'lucide-react';
import { useToast } from '@/components/Toast';

type TabType = 'schedule' | 'tickets' | 'basic';

export default function ProductionSettingsTabs({
    production,
    performances,
    ticketTypes
}: {
    production: Production;
    performances: Performance[];
    ticketTypes: TicketType[];
}) {
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState<TabType>('schedule');
    const [customId, setCustomId] = useState(production.customId || '');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [baseUrl, setBaseUrl] = useState('');

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setBaseUrl(window.location.origin);
        }
    }, []);

    const handleSaveCustomId = async () => {
        if (!/^[a-zA-Z0-9-]*$/.test(customId)) {
            setError('カスタムIDは半角英数字とハイフンのみ使用できます。');
            return;
        }

        setIsSaving(true);
        setError(null);
        setSuccess(null);

        try {
            if (customId) {
                const isDuplicate = await checkCustomIdDuplicateClient(customId, production.id);
                if (isDuplicate) {
                    setError('このカスタムIDは既に他の公演で使用されています。');
                    setIsSaving(false);
                    return;
                }
            }

            await updateProductionCustomIdClient(production.id, customId);
            setSuccess('カスタムIDを更新しました。');
        } catch (err) {
            console.error('Failed to update customId:', err);
            setError('更新に失敗しました。');
        } finally {
            setIsSaving(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        showToast('URLをクリップボードにコピーしました。', 'success');
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
                paddingBottom: '2px'
            }}>
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as TabType)}
                        style={{
                            padding: '1rem 1.5rem',
                            fontSize: '1rem',
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
                    <div className="card" style={{ padding: '2rem', border: 'none', boxShadow: 'var(--shadow-md)' }}>
                        <h3 className="heading-md">公演基本情報</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1.5rem' }}>
                            <div className="form-group">
                                <label className="label">公演タイトル</label>
                                <input
                                    type="text"
                                    className="input"
                                    defaultValue={production.title}
                                    disabled
                                    style={{ backgroundColor: '#f9f9f9' }}
                                />
                                <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.5rem' }}>※タイトルの変更は現在サポートされていません。</p>
                            </div>
                            <div className="form-group">
                                <label className="label">公演ID (システム管理用)</label>
                                <code style={{ fontSize: '0.9rem', color: '#666' }}>{production.id}</code>
                            </div>
                            <div className="form-group" style={{ borderTop: '1px solid #eee', paddingTop: '1.5rem', marginTop: '0.5rem' }}>
                                <label className="label">予約フォームのカスタムID (URLスラッグ)</label>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <input
                                        type="text"
                                        className="input"
                                        value={customId}
                                        onChange={(e) => setCustomId(e.target.value)}
                                        placeholder="例: winter-performance-2026"
                                        style={{ flex: 1, marginBottom: 0 }}
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
                                <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.5rem' }}>
                                    半角英数字とハイフンが使用できます。設定すると、分かりやすいURLで予約フォームを共有できます。
                                </p>
                                {error && <p style={{ color: 'var(--accent)', fontSize: '0.85rem', marginTop: '0.5rem' }}>⚠️ {error}</p>}
                                {success && <p style={{ color: 'green', fontSize: '0.85rem', marginTop: '0.5rem' }}>✅ {success}</p>}
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
