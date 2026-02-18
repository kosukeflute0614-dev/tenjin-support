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
                        color: 'var(--foreground)',
                        fontWeight: '500',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        fontSize: '0.95rem',
                        padding: '0.5rem 0',
                        letterSpacing: '0.02em',
                        transition: 'opacity 0.2s'
                    }}
                    className="menu-trigger"
                >
                    <span style={{
                        fontFamily: 'var(--font-serif)',
                        fontSize: '1.05rem',
                        color: 'var(--primary)',
                        fontWeight: '600'
                    }}>
                        {profile?.troupeName || '劇団未設定'}
                    </span>
                    {isOpen ? <ChevronUp size={16} strokeWidth={1.5} opacity={0.5} /> : <ChevronDown size={16} strokeWidth={1.5} opacity={0.5} />}
                </button>

                {isOpen && (
                    <div style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        backgroundColor: 'var(--card-bg)',
                        border: '1px solid rgba(0,0,0,0.03)',
                        borderRadius: '12px',
                        boxShadow: '0 20px 40px -15px rgba(0,0,0,0.12)',
                        width: '240px',
                        zIndex: 100,
                        overflow: 'hidden',
                        marginTop: '0.75rem',
                        animation: 'softFadeIn 0.2s ease-out'
                    }}>
                        <div style={{
                            padding: '1.25rem 1.5rem',
                            borderBottom: '1px solid rgba(0,0,0,0.04)',
                            backgroundColor: 'rgba(0,0,0,0.01)'
                        }}>
                            <div style={{
                                fontSize: '0.65rem',
                                color: '#999',
                                textTransform: 'uppercase',
                                letterSpacing: '0.1em',
                                marginBottom: '0.4rem',
                                fontWeight: '600'
                            }}>
                                Current Troupe
                            </div>
                            <div style={{
                                fontSize: '1.1rem',
                                fontWeight: '600',
                                color: 'var(--foreground)',
                                fontFamily: 'var(--font-serif)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                letterSpacing: '0.02em'
                            }}>
                                {profile?.troupeName || '劇団未設定'}
                            </div>
                        </div>

                        <div style={{ padding: '0.4rem 0' }}>
                            <Link
                                href="/productions"
                                className="dropdown-item"
                                onClick={() => setIsOpen(false)}
                            >
                                <Theater size={18} strokeWidth={1.5} />
                                <span>公演一覧</span>
                            </Link>
                            <Link
                                href="/settings/troupe"
                                className="dropdown-item"
                                onClick={() => setIsOpen(false)}
                            >
                                <Settings size={18} strokeWidth={1.5} />
                                <span>団体設定</span>
                            </Link>

                            <div style={{
                                borderTop: '1px solid rgba(0,0,0,0.04)',
                                marginTop: '0.4rem',
                                paddingTop: '0.4rem'
                            }}>
                                <button
                                    onClick={() => { handleLogout(); setIsOpen(false); }}
                                    className="dropdown-item logout-btn"
                                    style={{
                                        width: '100%',
                                        textAlign: 'left',
                                        border: 'none',
                                        background: 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <LogOut size={18} strokeWidth={1.5} />
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
                        gap: 1rem;
                        padding: 0.9rem 1.5rem;
                        font-size: 0.95rem;
                        color: #444;
                        text-decoration: none;
                        transition: all 0.2s ease;
                        letter-spacing: 0.03em;
                    }
                    .dropdown-item:hover {
                        background-color: rgba(0, 0, 0, 0.03);
                        color: var(--primary);
                        padding-left: 1.7rem;
                    }
                    .logout-btn:hover {
                        background-color: rgba(220, 38, 38, 0.04);
                        color: #dc2626;
                    }
                    @keyframes softFadeIn {
                        from { opacity: 0; transform: translateY(12px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    .menu-trigger:hover {
                        opacity: 0.8;
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
                fontSize: '0.9rem',
                borderRadius: '50px',
                boxShadow: '0 4px 15px rgba(var(--primary-rgb), 0.2)',
                transition: 'all 0.3s ease'
            }}
        >
            ログイン
        </button>
    );
}
