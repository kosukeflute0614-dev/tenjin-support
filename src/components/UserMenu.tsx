'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import Link from 'next/link';
import { Theater, Settings, LogOut, ChevronDown, ChevronUp } from 'lucide-react';

export default function UserMenu() {
    const { user, profile, loginWithGoogle, logout } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
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

    if (user) {
        return (
            <div style={{ position: 'relative' }} ref={menuRef}>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: '#334155', // slate-700
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        fontSize: '0.875rem', // text-sm
                        padding: '0.5rem 0',
                        transition: 'opacity 0.2s',
                        fontFamily: 'system-ui, -apple-system, sans-serif'
                    }}
                    className="menu-trigger"
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
                        border: '1px solid #f1f5f9', // border-slate-100
                        borderRadius: '12px', // rounded-xl
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', // shadow-xl
                        width: '240px',
                        zIndex: 100,
                        overflow: 'hidden',
                        marginTop: '0.75rem',
                        animation: 'softFadeIn 0.2s ease-out'
                    }}>
                        {/* ヘッダーセクション */}
                        <div style={{
                            padding: '1rem 1rem',
                            borderBottom: '1px solid #f1f5f9', // border-slate-100
                            backgroundColor: 'rgba(248, 250, 252, 0.5)' // bg-slate-50/50
                        }}>
                            <div style={{
                                fontSize: '10px',
                                color: '#94a3b8', // text-slate-400
                                textTransform: 'uppercase',
                                letterSpacing: '0.1em',
                                marginBottom: '0.25rem',
                                fontWeight: '700',
                                fontFamily: 'system-ui, -apple-system, sans-serif'
                            }}>
                                CURRENT TROUPE
                            </div>
                            <div style={{
                                fontSize: '0.875rem', // text-sm
                                fontWeight: '600',
                                color: '#334155', // text-slate-700
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                fontFamily: 'system-ui, -apple-system, sans-serif'
                            }}>
                                {profile?.troupeName || '劇団未設定'}
                            </div>
                        </div>

                        {/* メニュー項目 */}
                        <div style={{ padding: '0.25rem 0' }}>
                            <Link
                                href="/productions"
                                className="dropdown-item"
                                onClick={() => setIsOpen(false)}
                            >
                                <Theater size={18} strokeWidth={1.5} color="#94a3b8" />
                                <span>公演一覧</span>
                            </Link>
                            <Link
                                href="/settings/troupe"
                                className="dropdown-item"
                                onClick={() => setIsOpen(false)}
                            >
                                <Settings size={18} strokeWidth={1.5} color="#94a3b8" />
                                <span>団体設定</span>
                            </Link>

                            {/* ログアウト項目 */}
                            <div style={{
                                borderTop: '1px solid #f1f5f9', // border-slate-100
                                marginTop: '0.25rem'
                            }}>
                                <button
                                    onClick={() => { handleLogout(); setIsOpen(false); }}
                                    className="dropdown-item logout-link"
                                    style={{
                                        width: '100%',
                                        textAlign: 'left',
                                        border: 'none',
                                        background: 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <LogOut size={18} strokeWidth={1.5} color="#94a3b8" className="logout-icon" />
                                    <span>ログアウト</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <style jsx>{`
                    .dropdown-item {
                        display: flex;
                        align-items: center;
                        gap: 0.75rem; /* gap-3 */
                        padding: 0.75rem 1rem; /* py-3 px-4 */
                        font-size: 0.875rem; /* text-sm */
                        color: #475569; /* text-slate-600 */
                        text-decoration: none;
                        transition: all 0.2s ease;
                        font-family: system-ui, -apple-system, sans-serif;
                    }
                    .dropdown-item:hover {
                        background-color: #f8fafc; /* bg-slate-50 */
                        color: #0f172a; /* text-slate-900 */
                    }
                    .logout-link:hover {
                        background-color: rgba(254, 242, 242, 0.5); /* bg-red-50/50 */
                        color: #dc2626;
                    }
                    :global(.logout-link:hover .logout-icon) {
                        color: #dc2626 !important;
                    }
                    @keyframes softFadeIn {
                        from { opacity: 0; transform: translateY(8px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    .menu-trigger:hover {
                        opacity: 0.7;
                    }
                `}</style>
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
