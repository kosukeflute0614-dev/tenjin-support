'use client';

import { useState } from 'react';
import PerformanceManager from './PerformanceManager';
import TicketTypeManager from './TicketTypeManager';

type TabType = 'schedule' | 'tickets' | 'basic';

export default function ProductionSettingsTabs({
    production,
    performances,
    ticketTypes
}: {
    production: any;
    performances: any[];
    ticketTypes: any[];
}) {
    const [activeTab, setActiveTab] = useState<TabType>('schedule');

    const tabs = [
        { id: 'schedule', label: '公演スケジュール', icon: '📅' },
        { id: 'tickets', label: '券種・価格', icon: '🎫' },
        { id: 'basic', label: '基本情報', icon: '⚙️' },
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
                        <span style={{ fontSize: '1.2rem' }}>{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* コンテンツエリア */}
            <div style={{ animation: 'fadeIn 0.3s ease-in-out' }}>
                {activeTab === 'schedule' && (
                    <div className="card" style={{ padding: '2rem', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                        <PerformanceManager productionId={production.id} performances={performances} />
                    </div>
                )}

                {activeTab === 'tickets' && (
                    <div className="card" style={{ padding: '2rem', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                        <TicketTypeManager productionId={production.id} ticketTypes={ticketTypes} />
                    </div>
                )}

                {activeTab === 'basic' && (
                    <div className="card" style={{ padding: '2rem', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
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
                                <label className="label">公演ID</label>
                                <code style={{ fontSize: '0.9rem', color: '#666' }}>{production.id}</code>
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
