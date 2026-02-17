'use client';

import React from 'react';
import { useAuth } from './AuthProvider';
import Image from 'next/image';

export default function UserMenu() {
    const { user, loginWithGoogle, logout } = useAuth();

    if (user) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>{user.displayName}</div>
                    <div style={{ fontSize: '0.75rem', color: '#666' }}>{user.email}</div>
                </div>
                {user.photoURL && (
                    <Image
                        src={user.photoURL}
                        alt={user.displayName || "User"}
                        width={32}
                        height={32}
                        style={{ borderRadius: '50%' }}
                    />
                )}
                <button
                    onClick={logout}
                    className="btn btn-secondary"
                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                >
                    ログアウト
                </button>
            </div>
        );
    }

    return (
        <button
            onClick={loginWithGoogle}
            className="btn btn-primary"
            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
        >
            Googleでログイン
        </button>
    );
}
