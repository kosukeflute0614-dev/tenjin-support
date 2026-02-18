'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import Link from 'next/link';

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
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.95rem',
                        padding: '0.5rem 0'
                    }}
                >
                    {profile?.troupeName || '劇団未設定'}
                    <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>{isOpen ? '▲' : '▼'}</span>
                </button>

                {isOpen && (
                    <div style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        backgroundColor: 'var(--card-bg)',
                        border: '1px solid var(--card-border)',
                        borderRadius: '8px',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
                        width: '180px',
                        zIndex: 100,
                        overflow: 'hidden',
                        marginTop: '0.5rem',
                        animation: 'slideUp 0.2s ease-out'
                    }}>
                        <Link
                            href="/dashboard"
                            className="dropdown-item"
                            onClick={() => setIsOpen(false)}
                        >
                            ダッシュボード
                        </Link>
                        <Link
                            href="/productions"
                            className="dropdown-item"
                            onClick={() => setIsOpen(false)}
                        >
                            公演一覧
                        </Link>
                        <Link
                            href="/settings/troupe"
                            className="dropdown-item"
                            onClick={() => setIsOpen(false)}
                            style={{ borderTop: '1px solid var(--card-border)' }}
                        >
                            団体設定
                        </Link>
                        <button
                            onClick={() => { handleLogout(); setIsOpen(false); }}
                            className="dropdown-item"
                            style={{
                                width: '100%',
                                textAlign: 'left',
                                border: 'none',
                                background: 'none',
                                color: 'var(--error)',
                                borderTop: '1px solid var(--card-border)',
                                cursor: 'pointer'
                            }}
                        >
                            ログアウト
                        </button>
                    </div>
                )}

                <style jsx>{`
                    .dropdown-item {
                        display: block;
                        padding: 0.8rem 1.2rem;
                        fontSize: 0.9rem;
                        color: var(--foreground);
                        textDecoration: none;
                        transition: background 0.2s;
                    }
                    .dropdown-item:hover {
                        background-color: #f8f9fa;
                    }
                    @keyframes slideUp {
                        from { opacity: 0; transform: translateY(10px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                `}</style>
            </div>
        );
    }

    return (
        <button
            onClick={loginWithGoogle}
            className="btn btn-primary"
            style={{ padding: '0.5rem 1.2rem', fontSize: '0.9rem', borderRadius: '8px' }}
        >
            ログイン
        </button>
    );
}
