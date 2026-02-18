'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

export default function OnboardingPage() {
    const { user, profile, loading, isNewUser, refreshProfile } = useAuth();
    const router = useRouter();
    const [troupeName, setTroupeName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // すでに登録済みの場合はダッシュボードへ
    useEffect(() => {
        if (!loading && user && profile) {
            router.push('/dashboard');
        } else if (!loading && !user) {
            router.push('/');
        }
    }, [user, profile, loading, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !troupeName.trim()) return;

        setIsSaving(true);
        setError(null);

        try {
            await setDoc(doc(db, 'users', user.uid), {
                uid: user.uid,
                email: user.email,
                troupeName: troupeName.trim(),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            // プロファイルをリフレッシュして最新状態にする
            await refreshProfile();
            router.push('/dashboard');
        } catch (err: any) {
            console.error('Failed to save troupe name:', err);
            setError('送信に失敗しました。もう一度お試しください。');
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) {
        return <div className="flex-center" style={{ height: '80vh' }}>読み込み中...</div>;
    }

    return (
        <div className="container" style={{
            maxWidth: '500px',
            paddingTop: '15vh',
            animation: 'fadeIn 0.8s ease-out'
        }}>
            <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>🎭</span>
                <h1 className="heading-lg" style={{ fontWeight: '300', letterSpacing: '0.05em' }}>「Tenjin-Support」へ</h1>
                <p className="text-muted" style={{ marginTop: '0.5rem' }}>最後の一歩。これから共に歩む劇団の名前を教えてください。</p>
            </div>

            <div className="card" style={{ padding: '2.5rem', boxShadow: '0 10px 40px rgba(0,0,0,0.05)', border: 'none' }}>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="label" style={{ fontSize: '0.85rem', color: '#999', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                            劇団名 / Troupe Name
                        </label>
                        <input
                            type="text"
                            className="input"
                            value={troupeName}
                            onChange={(e) => setTroupeName(e.target.value)}
                            placeholder="例：劇団てんじん"
                            required
                            autoFocus
                            style={{
                                fontSize: '1.2rem',
                                padding: '1rem 0',
                                border: 'none',
                                borderBottom: '1.5px solid #eee',
                                borderRadius: '0',
                                outline: 'none',
                                transition: 'border-color 0.3s'
                            }}
                            onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                            onBlur={(e) => e.target.style.borderColor = '#eee'}
                        />
                    </div>

                    {error && (
                        <div style={{ color: 'var(--error)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                            {error}
                        </div>
                    )}

                    <div style={{ marginTop: '2.5rem' }}>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={isSaving || !troupeName.trim()}
                            style={{
                                width: '100%',
                                padding: '1rem',
                                fontSize: '1rem',
                                letterSpacing: '0.2em',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            {isSaving ? '登録中...' : 'はじめる'}
                            {!isSaving && <span>&rarr;</span>}
                        </button>
                    </div>
                </form>
            </div>

            <style jsx>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
