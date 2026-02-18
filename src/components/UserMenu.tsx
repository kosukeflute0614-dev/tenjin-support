'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import Link from 'next/link';
import { Theater, Settings, LogOut, ChevronDown, ChevronUp, BookOpen, HelpCircle, Mail } from 'lucide-react';

export default function UserMenu() {
    const { user, profile, loginWithGoogle, logout } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [hoverItem, setHoverItem] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // 外部クリックでメニューを閉じる
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLogout = async () => {
        if (confirm('ログアウトしますか？')) {
            await logout();
        }
    };

    // 共通のスタイル定数
    const slate400 = '#94a3b8';
    const slate50 = '#f8fafc';
    const slate100 = '#f1f5f9';
    const slate600 = '#475569';
    const slate700 = '#334155';
    const slate900 = '#0f172a';
    const red50 = 'rgba(254, 242, 242, 0.5)';
    const red600 = '#dc2626';

    const itemStyle = (id: string) => ({
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.75rem 1rem',
        fontSize: '0.875rem',
        color: hoverItem === id ? (id === 'logout' ? red600 : slate900) : slate600,
        textDecoration: 'none',
        backgroundColor: hoverItem === id ? (id === 'logout' ? red50 : slate50) : 'transparent',
        transition: 'all 0.2s ease',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        border: 'none',
        width: '100%',
        textAlign: 'left' as const,
        cursor: 'pointer'
    });

    if (user) {
        return (
            <div style={{ position: 'relative' }} ref={menuRef}>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: slate700,
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        fontSize: '0.875rem',
                        padding: '0.5rem 0',
                        transition: 'opacity 0.2s',
                        fontFamily: 'system-ui, -apple-system, sans-serif'
                    }}
                >
                    <span>{profile?.troupeName || '劇団未設定'}</span>
                    {isOpen ? <ChevronUp size={14} strokeWidth={2} opacity={0.4} /> : <ChevronDown size={14} strokeWidth={2} opacity={0.4} />}
                </button>

                {isOpen && (
                    <div style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        backgroundColor: '#FFFFFF',
                        border: `1px solid ${slate100}`,
                        borderRadius: '12px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                        width: '240px',
                        zIndex: 100,
                        overflow: 'hidden',
                        marginTop: '0.75rem',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>
                        {/* ヘッダーセクション */}
                        <div style={{
                            padding: '1rem 1rem',
                            borderBottom: `1px solid ${slate100}`,
                            backgroundColor: 'rgba(248, 250, 252, 0.5)'
                        }}>
                            <div style={{
                                fontSize: '10px',
                                color: slate400,
                                textTransform: 'uppercase',
                                letterSpacing: '0.1em',
                                marginBottom: '0.25rem',
                                fontWeight: '700',
                                fontFamily: 'system-ui, -apple-system, sans-serif'
                            }}>
                                CURRENT TROUPE
                            </div>
                            <div style={{
                                fontSize: '0.875rem',
                                fontWeight: '600',
                                color: slate700,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                fontFamily: 'system-ui, -apple-system, sans-serif'
                            }}>
                                {profile?.troupeName || '劇団未設定'}
                            </div>
                        </div>

                        {/* メニュー項目 */}
                        <div style={{ padding: '0.25rem 0', display: 'flex', flexDirection: 'column' }}>
                            <Link
                                href="/productions"
                                style={itemStyle('productions')}
                                onMouseEnter={() => setHoverItem('productions')}
                                onMouseLeave={() => setHoverItem(null)}
                                onClick={() => setIsOpen(false)}
                            >
                                <Theater size={18} strokeWidth={1.5} color={hoverItem === 'productions' ? slate900 : slate400} />
                                <span>公演一覧</span>
                            </Link>
                            <Link
                                href="/settings/troupe"
                                style={itemStyle('settings')}
                                onMouseEnter={() => setHoverItem('settings')}
                                onMouseLeave={() => setHoverItem(null)}
                                onClick={() => setIsOpen(false)}
                            >
                                <Settings size={18} strokeWidth={1.5} color={hoverItem === 'settings' ? slate900 : slate400} />
                                <span>団体設定</span>
                            </Link>

                            <div style={{ borderTop: `1px solid ${slate100}`, margin: '0.25rem 0' }} />

                            <Link
                                href="/guide"
                                style={itemStyle('guide')}
                                onMouseEnter={() => setHoverItem('guide')}
                                onMouseLeave={() => setHoverItem(null)}
                                onClick={() => setIsOpen(false)}
                            >
                                <BookOpen size={18} strokeWidth={1.5} color={hoverItem === 'guide' ? slate900 : slate400} />
                                <span>使い方ガイド</span>
                            </Link>
                            <Link
                                href="/faq"
                                style={itemStyle('faq')}
                                onMouseEnter={() => setHoverItem('faq')}
                                onMouseLeave={() => setHoverItem(null)}
                                onClick={() => setIsOpen(false)}
                            >
                                <HelpCircle size={18} strokeWidth={1.5} color={hoverItem === 'faq' ? slate900 : slate400} />
                                <span>よくある質問 (FAQ)</span>
                            </Link>
                            <Link
                                href="/contact"
                                style={itemStyle('contact')}
                                onMouseEnter={() => setHoverItem('contact')}
                                onMouseLeave={() => setHoverItem(null)}
                                onClick={() => setIsOpen(false)}
                            >
                                <Mail size={18} strokeWidth={1.5} color={hoverItem === 'contact' ? slate900 : slate400} />
                                <span>お問い合わせ</span>
                            </Link>

                            {/* ログアウト項目 */}
                            <div style={{
                                borderTop: `1px solid ${slate100}`,
                                marginTop: '0.25rem'
                            }}>
                                <button
                                    onClick={() => { handleLogout(); setIsOpen(false); }}
                                    style={itemStyle('logout')}
                                    onMouseEnter={() => setHoverItem('logout')}
                                    onMouseLeave={() => setHoverItem(null)}
                                >
                                    <LogOut size={18} strokeWidth={1.5} color={hoverItem === 'logout' ? red600 : slate400} />
                                    <span>ログアウト</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <button
            onClick={loginWithGoogle}
            className="btn btn-primary"
            style={{
                padding: '0.6rem 1.4rem',
                fontSize: '0.875rem',
                borderRadius: '50px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                transition: 'all 0.3s ease',
                fontFamily: 'system-ui, -apple-system, sans-serif'
            }}
        >
            ログイン
        </button>
    );
}
