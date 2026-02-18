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
                        boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
                        width: '220px', // Slightly wider for safer tapping
                        zIndex: 100,
                        overflow: 'hidden',
                        marginTop: '0.5rem',
                        animation: 'slideUp 0.15s ease-out'
                    }}>
                        <div style={{
                            padding: '1rem 1.25rem',
                            borderBottom: '1px solid var(--card-border)',
                            backgroundColor: '#f8f9fa'
                        }}>
                            <div style={{ fontSize: '0.7rem', color: '#717171', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
                                管理団体
                            </div>
                            <div style={{ fontSize: '1rem', fontWeight: 'bold', color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {profile?.troupeName || '劇団'}
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column' }}>
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
                            >
                                団体設定
                            </Link>

                            <div style={{ borderTop: '1px solid var(--card-border)' }}>
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
                                    ログアウト
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <style jsx>{`
                    .dropdown-item {
                        display: block;
                        padding: 1rem 1.25rem;
                        fontSize: 1rem;
                        color: var(--foreground);
                        textDecoration: none;
                        transition: background 0.2s;
                    }
                    .dropdown-item:hover {
                        background-color: #f1f3f5;
                    }
                    .logout-btn {
                        color: var(--error);
                    }
                    @keyframes slideUp {
                        from { opacity: 0; transform: translateY(8px); }
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
