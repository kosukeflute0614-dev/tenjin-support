'use client';

import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from './AuthProvider';
import { useToast } from '@/components/Toast';
import { addActorClient, deleteActorClient } from '@/lib/client-firestore';
import { Production, Actor } from '@/types';
import { Link2, ChevronDown, ChevronUp, Copy, Trash2, UserPlus, Users } from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';

type Props = {
    production: Production;
};

export default function ActorUrlManager({ production }: Props) {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [newActorName, setNewActorName] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [actorReservations, setActorReservations] = useState<{ [actorId: string]: number }>({});
    const [baseUrl, setBaseUrl] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setBaseUrl(window.location.origin);
        }
    }, []);

    // 予約数のリアルタイム集計
    useEffect(() => {
        if (!production.id) return;

        const reservationsRef = collection(db, "reservations");
        const q = query(reservationsRef, where("productionId", "==", production.id));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const counts: { [actorId: string]: number } = {};
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                const promoterId = data.promoterId;
                const status = data.status;
                if (promoterId && status !== 'CANCELED') {
                    counts[promoterId] = (counts[promoterId] || 0) + 1;
                }
            });
            setActorReservations(counts);
        });

        return () => unsubscribe();
    }, [production.id]);

    const handleAddActor = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newActorName.trim() || !user) return;

        setIsProcessing(true);
        try {
            await addActorClient(production.id, newActorName.trim(), user.uid);
            setNewActorName('');
        } catch (err) {
            showToast('役者の追加に失敗しました。', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const confirmDeleteActor = (actorId: string) => {
        if (!user) return;
        setDeleteTargetId(actorId);
        setShowDeleteConfirm(true);
    };

    const handleDeleteActor = useCallback(async () => {
        if (!user || !deleteTargetId) return;

        setShowDeleteConfirm(false);
        setIsProcessing(true);
        try {
            await deleteActorClient(production.id, deleteTargetId, user.uid);
        } catch (err) {
            showToast('削除に失敗しました。', 'error');
        } finally {
            setIsProcessing(false);
            setDeleteTargetId(null);
        }
    }, [user, deleteTargetId, production.id, showToast]);

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        showToast('URLをコピーしました！', 'success');
    };

    const actors = production.actors || [];

    return (
        <div style={{ marginTop: '1.5rem' }}>
            {/* Accordion header */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '1rem 1.25rem',
                    background: isOpen ? 'rgba(139, 0, 0, 0.03)' : 'var(--secondary)',
                    border: '1px solid',
                    borderColor: isOpen ? 'var(--primary)' : '#e2e8f0',
                    borderRadius: isOpen ? '12px 12px 0 0' : '12px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Link2 size={18} style={{ color: 'var(--primary)' }} />
                    <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--foreground)' }}>
                            役者・窓口別URL
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            出演者ごとの専用予約URLを発行・管理
                        </div>
                    </div>
                </div>
                {isOpen
                    ? <ChevronUp size={18} style={{ color: 'var(--text-muted)' }} />
                    : <ChevronDown size={18} style={{ color: 'var(--text-muted)' }} />
                }
            </button>

            {/* Collapsible content */}
            <div style={{
                maxHeight: isOpen ? '2000px' : '0',
                overflow: 'hidden',
                transition: 'max-height 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                opacity: isOpen ? 1 : 0,
            }}>
                <div style={{
                    backgroundColor: 'var(--card-bg)',
                    padding: '1.5rem',
                    borderRadius: '0 0 12px 12px',
                    border: '1px solid var(--primary)',
                    borderTop: 'none',
                }}>
                    {/* Add form */}
                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{
                            display: 'block',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: 'var(--slate-600)',
                            marginBottom: '0.5rem',
                        }}>
                            <UserPlus size={14} style={{ verticalAlign: 'middle', marginRight: '0.35rem' }} />
                            新しい役者・窓口を追加
                        </label>
                        <form onSubmit={handleAddActor} style={{ display: 'flex', gap: '0.5rem' }}>
                            <input
                                type="text"
                                value={newActorName}
                                onChange={(e) => setNewActorName(e.target.value)}
                                placeholder="役者名または窓口名を入力"
                                className="input"
                                style={{ marginBottom: 0, flex: 1, fontSize: '0.9rem' }}
                                required
                            />
                            <button
                                type="submit"
                                disabled={isProcessing || !newActorName.trim()}
                                className="btn btn-primary"
                                style={{ whiteSpace: 'nowrap', padding: '0 1.2rem' }}
                            >
                                追加
                            </button>
                        </form>
                    </div>

                    {/* Actor cards */}
                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                        {actors.length === 0 ? (
                            <div style={{
                                textAlign: 'center',
                                padding: '2.5rem 1rem',
                                color: '#a0aec0',
                            }}>
                                <Users size={40} style={{ color: '#cbd5e0', marginBottom: '0.75rem' }} />
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                    役者・窓口がまだ登録されていません
                                </p>
                                <p style={{ fontSize: '0.8rem', color: '#a0aec0' }}>
                                    上のフォームから追加して、専用予約URLを発行しましょう
                                </p>
                            </div>
                        ) : (
                            actors.map((actor: Actor) => {
                                const dedicatedUrl = `${baseUrl}/book/${production.customId || production.id}?actor=${actor.id}`;
                                const count = actorReservations[actor.id] || 0;

                                return (
                                    <div
                                        key={actor.id}
                                        style={{
                                            padding: '1rem 1.25rem',
                                            backgroundColor: 'var(--card-bg)',
                                            borderRadius: '10px',
                                            border: '1px solid #e2e8f0',
                                            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                                        }}
                                    >
                                        {/* Actor name + badge */}
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            marginBottom: '0.6rem',
                                        }}>
                                            <div style={{
                                                fontWeight: 600,
                                                fontSize: '0.95rem',
                                                color: 'var(--foreground)',
                                            }}>
                                                {actor.name}
                                            </div>
                                            <span style={{
                                                display: 'inline-block',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                color: count > 0 ? 'var(--primary)' : '#a0aec0',
                                                backgroundColor: count > 0 ? '#fef2f2' : '#f7fafc',
                                                padding: '0.2rem 0.6rem',
                                                borderRadius: '999px',
                                                border: `1px solid ${count > 0 ? '#fecaca' : '#e2e8f0'}`,
                                            }}>
                                                {count}件
                                            </span>
                                        </div>

                                        {/* URL block */}
                                        <div style={{
                                            fontSize: '0.75rem',
                                            fontFamily: 'monospace',
                                            color: 'var(--text-muted)',
                                            backgroundColor: '#f7fafc',
                                            padding: '0.5rem 0.75rem',
                                            borderRadius: '6px',
                                            border: '1px solid var(--card-border)',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            marginBottom: '0.75rem',
                                        }}>
                                            {dedicatedUrl}
                                        </div>

                                        {/* Action buttons */}
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button
                                                onClick={() => copyToClipboard(dedicatedUrl)}
                                                className="btn btn-secondary"
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '0.35rem',
                                                    padding: '0.4rem 0.8rem',
                                                    fontSize: '0.8rem',
                                                    borderRadius: '6px',
                                                }}
                                            >
                                                <Copy size={13} />
                                                URLをコピー
                                            </button>
                                            <button
                                                onClick={() => confirmDeleteActor(actor.id)}
                                                className="btn"
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '0.3rem',
                                                    padding: '0.4rem 0.7rem',
                                                    color: 'var(--accent)',
                                                    fontSize: '0.8rem',
                                                    background: 'transparent',
                                                    border: '1px solid #fed7d7',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                }}
                                                title="削除"
                                            >
                                                <Trash2 size={13} />
                                                削除
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    <p style={{ fontSize: '0.75rem', color: '#a0aec0', marginTop: '1.5rem' }}>
                        ※専用URLから予約された場合のみ、カウントに反映されます。
                    </p>
                </div>
            </div>

            <ConfirmModal
                isOpen={showDeleteConfirm}
                title="役者・窓口の削除"
                message="この役者（窓口）を削除しますか？"
                confirmLabel="削除する"
                onConfirm={handleDeleteActor}
                onCancel={() => { setShowDeleteConfirm(false); setDeleteTargetId(null); }}
            />
        </div>
    );
}
