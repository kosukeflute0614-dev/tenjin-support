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
                        borderRadius: '12px', // More rounded
                        boxShadow: '0 15px 40px rgba(0,0,0,0.12)', // Deeper shadow
                        width: '200px', // Slightly wider
                        zIndex: 100,
                        overflow: 'hidden',
                        marginTop: '0.75rem',
                        animation: 'slideUp 0.2s ease-out'
                    }}>
                        <div style={{ padding: '0.8rem 1.2rem', borderBottom: '1px solid var(--card-border)', backgroundColor: '#fcfcfc' }}>
                            <div style={{ fontSize: '0.75rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>団体管理</div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {profile?.troupeName || '劇団'}
                            </div>
                        </div>

                        <Link
                            href="/productions"
                            className="dropdown-item"
                            onClick={() => setIsOpen(false)}
                        >
                            <span style={{ marginRight: '0.75rem', fontSize: '1.1rem' }}>🎭</span>
                            公演一覧
                        </Link>
                        <Link
                            href="/settings/troupe"
                            className="dropdown-item"
                            onClick={() => setIsOpen(false)}
                        >
                            <span style={{ marginRight: '0.75rem', fontSize: '1.1rem' }}>⚙️</span>
                            団体設定
                        </Link>

                        <div style={{ borderTop: '1px solid var(--card-border)', marginTop: '0.2rem' }}>
                            <button
                                onClick={() => { handleLogout(); setIsOpen(false); }}
                                className="dropdown-item"
                                style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    border: 'none',
                                    background: 'none',
                                    color: 'var(--error)',
                                    cursor: 'pointer',
                                    padding: '0.8rem 1.2rem'
                                }}
                            >
                                <span style={{ marginRight: '0.75rem', fontSize: '1.1rem' }}>🚪</span>
                                ログアウト
                            </button>
                        </div>
                    </div>
                )}

                <style jsx>{`
                    .dropdown-item {
                        display: flex;
                        alignItems: center;
                        padding: 0.8rem 1.2rem;
                        fontSize: 0.9rem;
                        color: var(--foreground);
                        textDecoration: none;
                        transition: all 0.2s;
                    }
                    .dropdown-item:hover {
                        background-color: #f5f7f9;
                        color: var(--primary);
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
