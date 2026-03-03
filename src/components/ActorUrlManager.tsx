'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from './AuthProvider';
import { useToast } from '@/components/Toast';
import { addActorClient, deleteActorClient } from '@/lib/client-firestore';
import { Production, Actor } from '@/types';

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

    const handleDeleteActor = async (actorId: string) => {
        if (!user || !confirm('この役者（窓口）を削除しますか？')) return;

        setIsProcessing(true);
        try {
            await deleteActorClient(production.id, actorId, user.uid);
        } catch (err) {
            showToast('削除に失敗しました。', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        showToast('URLをコピーしました！', 'success');
    };

    const actors = production.actors || [];

    return (
        <div style={{ marginTop: '1.5rem', borderTop: '1px solid #f0f0f0', paddingTop: '1.5rem' }}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="btn btn-secondary"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.85rem',
                    padding: '0.5rem 1rem',
                    color: '#666',
                    background: '#f8f9fa',
                    border: '1px solid #e9ecef',
                    borderRadius: '20px',
                    transition: 'all 0.3s ease'
                }}
            >
                <span style={{
                    transition: 'transform 0.3s ease',
                    transform: isOpen ? 'rotate(90deg)' : 'rotate(0)'
                }}>▶</span>
                役者・窓口別のURLを管理
            </button>

            <div style={{
                maxHeight: isOpen ? '2000px' : '0',
                overflow: 'hidden',
                transition: 'max-height 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                opacity: isOpen ? 1 : 0,
                marginTop: isOpen ? '1.5rem' : '0'
            }}>
                <div style={{
                    backgroundColor: '#fff',
                    padding: '1.5rem',
                    borderRadius: '12px',
                    border: '1px solid #edf2f7',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
                }}>
                    <h4 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '1rem', color: '#2d3748' }}>役者・紹介者別URLの発行</h4>

                    <form onSubmit={handleAddActor} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
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

                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                        {actors.length === 0 ? (
                            <p style={{ textAlign: 'center', color: '#a0aec0', fontSize: '0.85rem', padding: '1rem' }}>
                                役者が登録されていません。上のフォームから追加してください。
                            </p>
                        ) : (
                            actors.map((actor: Actor) => {
                                const dedicatedUrl = `${baseUrl}/book/${production.customId || production.id}?actor=${actor.id}`;
                                const count = actorReservations[actor.id] || 0;

                                return (
                                    <div
                                        key={actor.id}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '0.75rem 1rem',
                                            backgroundColor: '#f8fafc',
                                            borderRadius: '8px',
                                            border: '1px solid #edf2f7'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                                            <div style={{ fontWeight: 'bold', color: '#2d3748', minWidth: '80px' }}>{actor.name}</div>
                                            <div style={{
                                                fontSize: '0.75rem',
                                                color: '#718096',
                                                backgroundColor: '#fff',
                                                padding: '0.2rem 0.5rem',
                                                borderRadius: '4px',
                                                border: '1px solid #e2e8f0',
                                                maxWidth: '250px',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap'
                                            }}>
                                                {dedicatedUrl}
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: '0.7rem', color: '#a0aec0', lineHeight: 1 }}>予約数</div>
                                                <div style={{ fontWeight: 'bold', color: 'var(--primary)', fontSize: '1.1rem' }}>{count}</div>
                                            </div>

                                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                                                <button
                                                    onClick={() => copyToClipboard(dedicatedUrl)}
                                                    className="btn btn-secondary"
                                                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', borderRadius: '6px' }}
                                                >
                                                    URLをコピー
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteActor(actor.id)}
                                                    className="btn"
                                                    style={{
                                                        padding: '0.4rem',
                                                        color: '#e53e3e',
                                                        fontSize: '0.8rem',
                                                        background: 'transparent',
                                                        border: 'none',
                                                        cursor: 'pointer'
                                                    }}
                                                    title="削除"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
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
        </div>
    );
}
