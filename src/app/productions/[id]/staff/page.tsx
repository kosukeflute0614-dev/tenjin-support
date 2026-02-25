'use client';

import { useEffect, useState, use } from 'react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { serializeDoc } from '@/lib/firestore-utils';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { Production } from '@/types';
import { useRouter } from 'next/navigation';
import { generateStaffTokenClient, revokeStaffTokenClient, updateStaffTokenPasscodeClient } from '@/lib/client-firestore';

export default function StaffManagementPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { user, loading } = useAuth();
    const router = useRouter();
    const [production, setProduction] = useState<Production | null>(null);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [newRole, setNewRole] = useState<'reception' | 'monitor'>('reception');
    const [baseUrl, setBaseUrl] = useState('');

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setBaseUrl(window.location.origin);
        }
    }, []);

    useEffect(() => {
        let unsubscribeProd: () => void;

        if (user) {
            const prodRef = doc(db, "productions", id);
            unsubscribeProd = onSnapshot(prodRef, (docSnap) => {
                if (docSnap.exists()) {
                    const prodData = serializeDoc<Production>(docSnap);
                    if (prodData.userId !== user.uid) {
                        setProduction(null);
                    } else {
                        setProduction(prodData);
                    }
                } else {
                    setProduction(null);
                }
                setIsInitialLoading(false);
            }, (err) => {
                console.error("Listener error:", err);
                setIsInitialLoading(false);
            });
        } else if (!loading) {
            setIsInitialLoading(false);
        }

        return () => {
            if (unsubscribeProd) unsubscribeProd();
        };
    }, [id, user, loading]);

    const handleGenerateToken = async () => {
        if (!user || !production) return;
        setIsProcessing(true);
        try {
            const { token, passcode } = await generateStaffTokenClient(production.id, newRole);
            const message = passcode
                ? `新しいスタッフ用URLを発行しました。\n\n【重要】4桁のパスコードが設定されました：${passcode}\nスタッフに入場チェック画面で入力するよう伝えてください。`
                : '新しいスタッフ用URLを発行しました。';
            alert(message);
        } catch (error: any) {
            alert(`発行に失敗しました: ${error.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleRevokeToken = async (token: string) => {
        if (!user || !production) return;
        if (!confirm('このスタッフ用URLを無効化しますか？以降、このURLからはアクセスできなくなります。')) return;

        setIsProcessing(true);
        try {
            await revokeStaffTokenClient(production.id, token);
            alert('URLを無効化しました。');
        } catch (error: any) {
            alert(`無効化に失敗しました: ${error.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleUpdatePasscode = async (token: string, currentPasscode: string) => {
        if (!production) return; // Added null check
        const newPasscode = prompt(`新しい4桁のパスコードを入力してください（現在の値: ${currentPasscode}）`, currentPasscode);
        if (!newPasscode || newPasscode === currentPasscode) return;

        if (!/^\d{4}$/.test(newPasscode)) {
            alert('パスコードは数字4桁で入力してください。');
            return;
        }

        setIsProcessing(true);
        try {
            await updateStaffTokenPasscodeClient(production.id, token, newPasscode);
            alert('パスコードを更新しました。');
        } catch (error: any) {
            alert(`更新に失敗しました: ${error.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        alert('招待URLをクリップボードにコピーしました。');
    };

    if (loading || isInitialLoading) {
        return <div className="flex-center" style={{ height: '50vh' }}>読み込み中...</div>;
    }

    if (!user || !production) {
        return (
            <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>
                <h2 className="heading-md">アクセス権限がありません</h2>
                <p className="text-muted">公演のオーナーのみがこのページを表示できます。</p>
                <Link href="/dashboard" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>ダッシュボードに戻る</Link>
            </div>
        );
    }

    // Sort tokens by role name
    const tokens = Object.entries(production.staffTokens || {}).sort((a, b) => {
        const roleA = typeof a[1] === 'string' ? a[1] : a[1].role;
        const roleB = typeof b[1] === 'string' ? b[1] : b[1].role;
        return roleA.localeCompare(roleB);
    });

    return (
        <div className="container" style={{ maxWidth: '800px' }}>
            <div className="page-header" style={{ marginBottom: '2rem' }}>
                <div style={{ marginBottom: '1.25rem' }}>
                    <Link href="/dashboard" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', borderRadius: '8px', fontSize: '0.9rem' }}>
                        <span>&larr;</span> ダッシュボードに戻る
                    </Link>
                </div>
                <h2 className="heading-lg" style={{ marginBottom: '0.5rem' }}>🔑 スタッフ招待・管理</h2>
                <p className="text-muted">ログイン不要でアクセスできる「合鍵（スタッフ用URL）」を発行・管理します。</p>
            </div>

            <div className="card" style={{ padding: '2rem', marginBottom: '2rem', border: '1px solid #ffd70033', backgroundColor: '#fffdf0' }}>
                <h3 className="heading-md" style={{ marginBottom: '1.5rem' }}>新規URLの発行</h3>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                        <label className="label">役割（ロール）</label>
                        <select
                            className="input"
                            value={newRole}
                            onChange={(e) => setNewRole(e.target.value as any)}
                            disabled={isProcessing}
                        >
                            <option value="reception">受付スタッフ（reception）</option>
                            <option value="monitor">来場状況確認・モニター（monitor）</option>
                        </select>
                        <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.5rem' }}>
                            {newRole === 'reception' ? '※来場チェックインと当日券発行が可能です。' : '※来場状況の確認のみ可能です（読み取り専用）。'}
                        </p>
                    </div>
                    <button
                        className="btn btn-primary"
                        onClick={handleGenerateToken}
                        disabled={isProcessing}
                        style={{ padding: '0.8rem 1.5rem', height: 'fit-content' }}
                    >
                        {isProcessing ? '発行中...' : '招待URLを発行'}
                    </button>
                </div>
            </div>

            <div className="card" style={{ padding: '2rem' }}>
                <h3 className="heading-md" style={{ marginBottom: '1.5rem' }}>発行済みURL（合鍵）一覧</h3>
                {tokens.length === 0 ? (
                    <p className="text-muted" style={{ textAlign: 'center', padding: '2rem' }}>発行済みのURLはありません。</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {tokens.map(([token, data]) => {
                            const inviteUrl = `${baseUrl}/staff/${production.id}?token=${token}`;
                            const role = typeof data === 'string' ? data : data.role;
                            const passcode = typeof data === 'string' ? '要再発行' : data.passcode;

                            return (
                                <div key={token} style={{ border: '1px solid #eee', borderRadius: '12px', padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '0.5rem' }}>
                                            <span style={{
                                                fontSize: '0.75rem',
                                                fontWeight: 'bold',
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                backgroundColor: role === 'monitor' ? '#f3e8ff' : '#f5f5f5',
                                                color: role === 'monitor' ? '#7c3aed' : '#616161'
                                            }}>
                                                {role.toUpperCase()}
                                            </span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{ fontSize: '0.85rem', color: '#666' }}>
                                                    パスコード: <strong style={{ fontSize: '1rem', color: '#333', backgroundColor: '#eee', padding: '1px 6px', borderRadius: '4px' }}>{passcode}</strong>
                                                </span>
                                                {typeof data !== 'string' && (
                                                    <button
                                                        className="btn btn-secondary"
                                                        style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}
                                                        onClick={() => handleUpdatePasscode(token, passcode)}
                                                        disabled={isProcessing}
                                                    >
                                                        変更
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                            <input
                                                readOnly
                                                value={inviteUrl}
                                                className="input"
                                                style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem', backgroundColor: '#f9f9f9' }}
                                                onClick={(e) => (e.target as HTMLInputElement).select()}
                                            />
                                            <button
                                                className="btn btn-secondary"
                                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                                                onClick={() => copyToClipboard(inviteUrl)}
                                            >
                                                コピー
                                            </button>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleRevokeToken(token)}
                                        disabled={isProcessing}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            fontSize: '1.2rem',
                                            padding: '0.5rem',
                                            color: '#ff4d4f',
                                            opacity: isProcessing ? 0.5 : 1
                                        }}
                                        title="無効化"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div style={{ marginTop: '2.5rem', padding: '1.5rem', backgroundColor: '#f8f9fa', borderRadius: '12px', border: '1px solid #eee' }}>
                <h4 style={{ marginBottom: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>💡</span> 招待URLの使い方
                </h4>
                <ul style={{ fontSize: '0.9rem', color: '#555', lineHeight: '1.6', paddingLeft: '1.2rem' }}>
                    <li>発行したURLをコピーして、現場スタッフのLINEやメールに送ってください。</li>
                    <li>スタッフはログイン不要で、即座に受付や制作管理画面にアクセスできます。</li>
                    <li>万が一URLが漏洩したり、公演が終了した場合は、ゴミ箱アイコンからURLを無効化してください。</li>
                </ul>
            </div>
        </div>
    );
}
