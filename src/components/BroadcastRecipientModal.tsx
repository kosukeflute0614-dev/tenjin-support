'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { serializeDocs } from '@/lib/firestore-utils';
import { toDate } from '@/lib/firestore-utils';
import { FirestoreReservation, Performance } from '@/types';

export interface BroadcastRecipient {
    email: string;
    customerName: string;
    reservationId: string;
    performanceId: string;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (recipients: BroadcastRecipient[]) => void;
    productionId: string;
}

interface PerformanceGroup {
    performance: Performance;
    recipients: BroadcastRecipient[];
}

export default function BroadcastRecipientModal({ isOpen, onClose, onConfirm, productionId }: Props) {
    const [reservations, setReservations] = useState<FirestoreReservation[]>([]);
    const [performances, setPerformances] = useState<Performance[]>([]);
    const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!isOpen) return;
        const fetch = async () => {
            setIsLoading(true);
            try {
                const [resSnap, perfSnap] = await Promise.all([
                    getDocs(query(collection(db, 'reservations'), where('productionId', '==', productionId))),
                    getDocs(query(collection(db, 'performances'), where('productionId', '==', productionId))),
                ]);
                setReservations(serializeDocs<FirestoreReservation>(resSnap.docs));
                setPerformances(serializeDocs<Performance>(perfSnap.docs));
            } catch (e) {
                console.error('Failed to fetch data:', e);
            } finally {
                setIsLoading(false);
            }
        };
        fetch();
    }, [isOpen, productionId]);

    // 公演回ごとにグルーピング（メールありのキャンセル以外のみ）
    const groups: PerformanceGroup[] = useMemo(() => {
        const perfMap = new Map(performances.map(p => [p.id, p]));
        const grouped = new Map<string, BroadcastRecipient[]>();

        for (const res of reservations) {
            if (res.status === 'CANCELED' || !res.customerEmail) continue;
            const perfId = res.performanceId;
            if (!grouped.has(perfId)) grouped.set(perfId, []);
            // 同じ公演回内でメール重複を除去
            const existing = grouped.get(perfId)!;
            if (!existing.some(r => r.email === res.customerEmail)) {
                existing.push({
                    email: res.customerEmail!,
                    customerName: res.customerName,
                    reservationId: res.id,
                    performanceId: perfId,
                });
            }
        }

        const result: PerformanceGroup[] = [];
        for (const [perfId, recipients] of grouped) {
            const perf = perfMap.get(perfId);
            if (perf) {
                result.push({ performance: perf, recipients });
            }
        }
        // 公演日時順にソート
        result.sort((a, b) => {
            const tA = a.performance.startTime ? toDate(a.performance.startTime).getTime() : 0;
            const tB = b.performance.startTime ? toDate(b.performance.startTime).getTime() : 0;
            return tA - tB;
        });
        return result;
    }, [reservations, performances]);

    // 全宛先のメール一覧（重複除去済み）
    const allEmails = useMemo(() => {
        const s = new Set<string>();
        for (const g of groups) {
            for (const r of g.recipients) s.add(r.email);
        }
        return s;
    }, [groups]);

    // 初期状態: モーダルを開いたときに全選択
    useEffect(() => {
        if (!isLoading && groups.length > 0 && selectedEmails.size === 0) {
            setSelectedEmails(new Set(allEmails));
        }
    }, [isLoading, groups, allEmails]);

    const toggleEmail = (email: string) => {
        setSelectedEmails(prev => {
            const next = new Set(prev);
            if (next.has(email)) next.delete(email);
            else next.add(email);
            return next;
        });
    };

    const togglePerformance = (perfRecipients: BroadcastRecipient[]) => {
        const perfEmails = perfRecipients.map(r => r.email);
        const allChecked = perfEmails.every(e => selectedEmails.has(e));
        setSelectedEmails(prev => {
            const next = new Set(prev);
            if (allChecked) {
                perfEmails.forEach(e => next.delete(e));
            } else {
                perfEmails.forEach(e => next.add(e));
            }
            return next;
        });
    };

    const handleConfirm = () => {
        // 選択されたメールに対応する宛先情報を構築
        const recipientMap = new Map<string, BroadcastRecipient>();
        for (const g of groups) {
            for (const r of g.recipients) {
                if (selectedEmails.has(r.email) && !recipientMap.has(r.email)) {
                    recipientMap.set(r.email, r);
                }
            }
        }
        onConfirm(Array.from(recipientMap.values()));
    };

    const formatPerformanceDate = (startTime: any) => {
        try {
            const d = toDate(startTime);
            return d.toLocaleDateString('ja-JP', {
                month: 'short', day: 'numeric', weekday: 'short',
            }) + ' ' + d.toLocaleTimeString('ja-JP', {
                hour: '2-digit', minute: '2-digit',
            });
        } catch {
            return '日時不明';
        }
    };

    if (!isOpen) return null;

    return (
        <div
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
            style={{
                position: 'fixed',
                top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: '1rem',
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title-recipients"
                style={{
                    background: 'var(--card-bg)',
                    borderRadius: '12px',
                    width: '100%',
                    maxWidth: '700px',
                    maxHeight: '85vh',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.2)',
                }}
            >
                {/* ヘッダー */}
                <div style={{
                    padding: '1.25rem 1.5rem',
                    borderBottom: '1px solid var(--card-border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}>
                    <div>
                        <h3 id="modal-title-recipients" style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold' }}>
                            📋 送信先を選択
                        </h3>
                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {selectedEmails.size} / {allEmails.size} 件選択中
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="閉じる"
                        style={{
                            border: 'none', background: 'none',
                            fontSize: '1.5rem', cursor: 'pointer', color: 'var(--slate-500)',
                            padding: '0.25rem', lineHeight: 1,
                        }}
                    >
                        &times;
                    </button>
                </div>

                {/* コンテンツ */}
                <div style={{ overflow: 'auto', padding: '1rem 1.5rem', flex: 1 }}>
                    {isLoading ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>読み込み中...</div>
                    ) : groups.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            メールアドレスが登録されている予約がありません。
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {groups.map(group => {
                                const perfEmails = group.recipients.map(r => r.email);
                                const allChecked = perfEmails.every(e => selectedEmails.has(e));
                                const someChecked = perfEmails.some(e => selectedEmails.has(e));

                                return (
                                    <div key={group.performance.id} style={{
                                        border: '1px solid #e0e0e0',
                                        borderRadius: '8px',
                                        overflow: 'hidden',
                                    }}>
                                        {/* 公演回ヘッダー（一括チェック） */}
                                        <label style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.75rem',
                                            padding: '0.75rem 1rem',
                                            background: '#f5f5f5',
                                            cursor: 'pointer',
                                            fontWeight: 'bold',
                                            fontSize: '0.9rem',
                                            borderBottom: '1px solid #e0e0e0',
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={allChecked}
                                                ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                                                onChange={() => togglePerformance(group.recipients)}
                                                style={{ accentColor: 'var(--primary)', width: '16px', height: '16px' }}
                                            />
                                            <span>
                                                {formatPerformanceDate(group.performance.startTime)}
                                            </span>
                                            <span style={{ fontWeight: 'normal', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                ({group.recipients.length}件)
                                            </span>
                                        </label>

                                        {/* 個別予約者リスト */}
                                        <div>
                                            {group.recipients.map(r => (
                                                <label
                                                    key={r.email + r.performanceId}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.75rem',
                                                        padding: '0.5rem 1rem 0.5rem 2.25rem',
                                                        cursor: 'pointer',
                                                        fontSize: '0.85rem',
                                                        borderBottom: '1px solid var(--card-border)',
                                                        background: selectedEmails.has(r.email) ? 'var(--card-bg)' : 'var(--secondary)',
                                                        transition: 'background 0.15s',
                                                    }}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedEmails.has(r.email)}
                                                        onChange={() => toggleEmail(r.email)}
                                                        style={{ accentColor: 'var(--primary)', width: '15px', height: '15px' }}
                                                    />
                                                    <span style={{ fontWeight: '600', minWidth: '80px' }}>
                                                        {r.customerName}
                                                    </span>
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                        {r.email}
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* フッター */}
                <div style={{
                    padding: '1rem 1.5rem',
                    borderTop: '1px solid var(--card-border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'var(--secondary)',
                }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        <strong style={{ color: 'var(--primary)' }}>{selectedEmails.size}</strong> 件の宛先が選択されています
                    </span>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button
                            className="btn btn-secondary"
                            onClick={onClose}
                            style={{ padding: '0.6rem 1.5rem' }}
                        >
                            キャンセル
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={handleConfirm}
                            disabled={selectedEmails.size === 0}
                            style={{ padding: '0.6rem 1.5rem' }}
                        >
                            {selectedEmails.size}件を送信先に設定
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
