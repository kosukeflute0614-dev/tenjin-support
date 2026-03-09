'use client';

import React, { useState } from 'react';
import { BookOpen, Users, Zap, CheckCircle, Mail, ChevronRight, Menu, X, Landmark, CalendarDays, ClipboardList, ScanLine } from 'lucide-react';

const sections = [
    {
        id: 'start',
        title: 'スタートガイド',
        icon: <Landmark size={20} />,
        content: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <p>Tenjin-Supportへようこそ。まずは劇団情報の登録から始めましょう。</p>
                <div style={{ background: '#f8f9fa', padding: '1.5rem', borderRadius: '12px' }}>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 'bold' }}>1. 団体・劇団名の設定</h3>
                    <p style={{ fontSize: '0.95rem', lineHeight: '1.6' }}>
                        ログイン後のオンボーディング画面、または「団体設定」メニューから、あなたの団体名を入力してください。
                        この名前は予約フォームのヘッダーなどに表示されます。
                    </p>
                </div>
            </div>
        )
    },
    {
        id: 'production',
        title: '公演の作成と管理',
        icon: <CalendarDays size={20} />,
        content: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <p>公演ごとに、日時やチケットの種類を個別に設定できます。</p>
                <div style={{ background: '#f8f9fa', padding: '1.5rem', borderRadius: '12px' }}>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 'bold' }}>2. 公演回の追加</h3>
                    <p style={{ fontSize: '0.95rem', lineHeight: '1.6' }}>
                        「公演一覧」から新しい公演を作成し、各ステージ（日時）を追加します。
                        会場のキャパシティに合わせて、各回の定員を設定してください。
                    </p>
                </div>
                <div style={{ background: '#f8f9fa', padding: '1.5rem', borderRadius: '12px' }}>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 'bold' }}>3. 券種（チケット）の設定</h3>
                    <p style={{ fontSize: '0.95rem', lineHeight: '1.6' }}>
                        「前売り」「当日」「一般」「学生」など、必要な券種を定義します。
                        それぞれに対して料金（前売り価格・当日価格）を設定可能です。
                    </p>
                </div>
            </div>
        )
    },
    {
        id: 'reservation',
        title: '予約受付とフォーム',
        icon: <ClipboardList size={20} />,
        content: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <p>スムーズな予約受付のための機能が揃っています。</p>
                <div style={{ background: '#f8f9fa', padding: '1.5rem', borderRadius: '12px' }}>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 'bold' }}>4. 予約フォームの公開</h3>
                    <p style={{ fontSize: '0.95rem', lineHeight: '1.6' }}>
                        専用の予約ページURLをコピーして、劇団のHPやSNSで公開しましょう。
                        フォームからの予約は自動的にシステムへ反映されます。
                    </p>
                </div>
                <div style={{ background: '#f8f9fa', padding: '1.5rem', borderRadius: '12px' }}>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 'bold' }}>5. 手動予約の登録</h3>
                    <p style={{ fontSize: '0.95rem', lineHeight: '1.6' }}>
                        関係者席やメールでの直接申し込みがあった場合は、管理画面から手動で予約を追加できます。
                    </p>
                </div>
            </div>
        )
    },
    {
        id: 'checkin',
        title: '当日の受付業務',
        icon: <ScanLine size={20} />,
        content: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <p>劇場ロビーでの混雑を解消し、迅速な受付を実現します。</p>
                <div style={{ background: '#f8f9fa', padding: '1.5rem', borderRadius: '12px' }}>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 'bold' }}>6. スピード受付（当日受付）</h3>
                    <p style={{ fontSize: '0.95rem', lineHeight: '1.6' }}>
                        お客様の名前を検索し、タップするだけで入場処理が完了します。
                        一度に複数名での受付や、一部の人数のみの入場にも対応しています。
                    </p>
                </div>
                <div style={{ background: '#f8f9fa', padding: '1.5rem', borderRadius: '12px' }}>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 'bold' }}>7. 当日券の即時発行</h3>
                    <p style={{ fontSize: '0.95rem', lineHeight: '1.6' }}>
                        当日ふらっと来場されたお客様も、その場で名前を入れるだけで即座にチケットを発行し、売上にカウントできます。
                    </p>
                </div>
            </div>
        )
    }
];

export default function GuidePage() {
    const [activeSection, setActiveSection] = useState('start');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    return (
        <div style={{ display: 'flex', minHeight: 'calc(100vh - 150px)', background: '#fff' }}>
            {/* サイドバーナビゲーション */}
            <aside style={{
                width: '280px',
                borderRight: '1px solid #eee',
                padding: '2rem 1.5rem',
                display: isSidebarOpen ? 'block' : 'none',
                position: 'fixed',
                top: '0',
                left: '0',
                height: '100%',
                zIndex: '50',
                background: '#fff',
            }} className="guide-sidebar">
                <h2 style={{ fontSize: '0.75rem', color: '#999', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1.5rem', fontWeight: 'bold' }}>
                    Guide Contents
                </h2>
                <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {sections.map(s => (
                        <button
                            key={s.id}
                            onClick={() => { setActiveSection(s.id); setIsSidebarOpen(false); }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                padding: '0.75rem 1rem',
                                borderRadius: '8px',
                                border: 'none',
                                cursor: 'pointer',
                                textAlign: 'left',
                                fontSize: '0.9rem',
                                fontWeight: activeSection === s.id ? 'bold' : 'normal',
                                backgroundColor: activeSection === s.id ? 'var(--secondary)' : 'transparent',
                                color: activeSection === s.id ? 'var(--primary)' : '#666',
                                transition: 'all 0.2s'
                            }}
                        >
                            {s.icon}
                            {s.title}
                        </button>
                    ))}
                </nav>
            </aside>

            {/* モバイル用メニューボタン */}
            <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                style={{
                    position: 'fixed',
                    bottom: '2rem',
                    right: '2rem',
                    width: '56px',
                    height: '56px',
                    borderRadius: '28px',
                    background: 'var(--primary)',
                    color: '#fff',
                    border: 'none',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    zIndex: '100',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
                className="mobile-only"
            >
                {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            {/* メインコンテンツ */}
            <main style={{ flex: 1, padding: '3rem 4rem', maxWidth: '1000px' }} className="guide-main">
                <header style={{ marginBottom: '3rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                        <BookOpen size={16} />
                        Tenjin-Support 使い方ガイド
                    </div>
                    <h1 style={{ fontSize: '2.4rem', fontWeight: '200', marginBottom: '1rem' }}>
                        {sections.find(s => s.id === activeSection)?.title}
                    </h1>
                </header>

                <div style={{ lineHeight: '1.8', fontSize: '1.05rem', color: '#333' }}>
                    {sections.find(s => s.id === activeSection)?.content}
                </div>

                <div style={{ marginTop: '5rem', paddingTop: '3rem', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
                    {/* ナビゲーションボタン */}
                    {sections.findIndex(s => s.id === activeSection) > 0 && (
                        <button
                            onClick={() => setActiveSection(sections[sections.findIndex(s => s.id === activeSection) - 1].id)}
                            style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            &larr; 前へ
                        </button>
                    )}
                    <div style={{ flex: 1 }} />
                    {sections.findIndex(s => s.id === activeSection) < sections.length - 1 && (
                        <button
                            onClick={() => setActiveSection(sections[sections.findIndex(s => s.id === activeSection) + 1].id)}
                            style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '0.6rem 1.5rem', borderRadius: '50px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            次へ &rarr;
                        </button>
                    )}
                </div>
            </main>

            <style jsx>{`
                .guide-sidebar {
                    display: block !important;
                    position: sticky !important;
                    height: calc(100vh - 150px) !important;
                    top: 0;
                }
                .mobile-only {
                    display: none !important;
                }
                @media (max-width: 768px) {
                    .guide-sidebar {
                        display: ${isSidebarOpen ? 'block' : 'none'} !important;
                        position: fixed !important;
                        height: 100% !important;
                        width: 100% !important;
                    }
                    .guide-main {
                        padding: 2rem 1.5rem !important;
                    }
                    .mobile-only {
                        display: flex !important;
                    }
                }
            `}</style>
        </div>
    );
}
