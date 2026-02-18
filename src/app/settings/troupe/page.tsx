'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { db } from '@/lib/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

export default function TroupeSettingsPage() {
    const { user, profile, loading, refreshProfile } = useAuth();
    const router = useRouter();
    const [troupeName, setTroupeName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        if (profile) {
            setTroupeName(profile.troupeName);
        }
    }, [profile]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !troupeName.trim()) return;

        setIsSaving(true);
        setMessage(null);

        try {
            await updateDoc(doc(db, 'users', user.uid), {
                troupeName: troupeName.trim(),
                updatedAt: serverTimestamp()
            });

            await refreshProfile();
            setMessage({ type: 'success', text: '団体情報を更新しました。' });

            // 3秒後にメッセージを消す
            setTimeout(() => setMessage(null), 3000);
        } catch (err: any) {
            console.error('Failed to update troupe name:', err);
            setMessage({ type: 'error', text: '更新に失敗しました。' });
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) {
        return <div className="flex-center" style={{ height: '50vh' }}>読み込み中...</div>;
    }

    return (
        <div className="container" style={{ maxWidth: '600px', paddingTop: '2rem' }}>
            <div style={{ marginBottom: '2rem' }}>
                <Link href="/dashboard" style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '0.9rem' }}>
                    &larr; ダッシュボードに戻る
                </Link>
                <h1 className="heading-lg" style={{ marginTop: '1rem' }}>団体設定</h1>
            </div>

            <div className="card" style={{ padding: '2rem' }}>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="label">劇団名 / 団体名</label>
                        <input
                            type="text"
                            className="input"
                            value={troupeName}
                            onChange={(e) => setTroupeName(e.target.value)}
                            required
                        />
                        <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
                            この名前は管理画面のヘッダーや、予約フォーム等に表示されます。
                        </p>
                    </div>

                    {message && (
                        <div style={{
                            padding: '1rem',
                            borderRadius: '8px',
                            marginBottom: '1rem',
                            backgroundColor: message.type === 'success' ? 'rgba(46, 125, 50, 0.1)' : 'rgba(139, 0, 0, 0.1)',
                            color: message.type === 'success' ? '#2e7d32' : '#8b0000',
                            fontSize: '0.9rem'
                        }}>
                            {message.text}
                        </div>
                    )}

                    <div style={{ marginTop: '2rem' }}>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={isSaving || !troupeName.trim() || troupeName === profile?.troupeName}
                        >
                            {isSaving ? '保存中...' : '設定を保存する'}
                        </button>
                    </div>
                </form>
            </div>

            <div className="card" style={{ marginTop: '2rem', padding: '2rem', border: '1px solid #eee', backgroundColor: '#fdfdfd' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: '#666' }}>ログイン情報</h3>
                <div style={{ fontSize: '0.9rem', color: '#444' }}>
                    <p><strong>Googleアカウント:</strong> {user?.email}</p>
                    <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#999' }}>
                        ※ログイン用のアカウント変更は現在サポートされていません。
                    </p>
                </div>
            </div>
        </div>
    );
}

// 簡易的な Link コンポーネントがこのファイルで使われているため import が必要
import Link from 'next/link';
