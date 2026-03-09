'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { db } from '@/lib/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

export default function TroupeSettingsPage() {
    const { user, profile, loading, refreshProfile } = useAuth();
    const router = useRouter();
    const { showToast } = useToast();
    const [troupeName, setTroupeName] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const isDirty = !!profile && troupeName !== profile.troupeName;
    useUnsavedChanges(isDirty);

    useEffect(() => {
        if (profile) {
            setTroupeName(profile.troupeName);
        }
    }, [profile]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !troupeName.trim()) return;

        setIsSaving(true);

        try {
            await updateDoc(doc(db, 'users', user.uid), {
                troupeName: troupeName.trim(),
                updatedAt: serverTimestamp()
            });

            await refreshProfile();
            showToast('団体情報を更新しました。', 'success');
        } catch (err: any) {
            console.error('Failed to update troupe name:', err);
            showToast('更新に失敗しました。', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) {
        return <div className="flex-center" style={{ height: '50vh' }}>読み込み中...</div>;
    }

    return (
        <div className="container" style={{ maxWidth: '1000px', paddingTop: '2rem' }}>
            <div style={{ marginBottom: '1.25rem' }}>
                <Link href="/dashboard" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', borderRadius: '8px', fontSize: '0.9rem' }}>
                    <span>&larr;</span> ダッシュボードに戻る
                </Link>
            </div>
            <div className="page-header" style={{ marginBottom: '2rem' }}>
                <h2 className="heading-lg" style={{ marginBottom: '0.5rem' }}>団体設定</h2>
            </div>

            <div className="card" style={{ padding: '2rem' }}>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="troupeNameSetting" className="label">劇団名 / 団体名</label>
                        <input
                            type="text"
                            id="troupeNameSetting"
                            className="input"
                            value={troupeName}
                            onChange={(e) => setTroupeName(e.target.value)}
                            required
                            aria-required="true"
                        />
                        <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
                            この名前は管理画面のヘッダーや、予約フォーム等に表示されます。
                        </p>
                    </div>

                    <div style={{ marginTop: '2rem' }}>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={isSaving || !troupeName.trim() || troupeName === profile?.troupeName}
                            style={{ width: '100%', maxWidth: '300px' }}
                        >
                            {isSaving ? '保存中...' : '設定を保存する'}
                        </button>
                    </div>
                </form>
            </div>

            <div className="card" style={{ marginTop: '2rem', padding: '2rem', border: '1px solid var(--card-border)', backgroundColor: '#fdfdfd' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: 'var(--text-muted)' }}>ログイン情報</h3>
                <div style={{ fontSize: '0.9rem', color: 'var(--foreground)' }}>
                    <p><strong>Googleアカウント:</strong> {user?.email}</p>
                    <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--slate-500)' }}>
                        ※ログイン用のアカウント変更は現在サポートされていません。
                    </p>
                </div>
            </div>
        </div>
    );
}

