'use client';

import { useState } from 'react';
import { DuplicateGroup } from '@/app/actions/dashboard';
import { cancelReservation } from '@/app/actions/reservation';
import { formatDate, formatTime } from '@/lib/format';

type Props = {
    groups: DuplicateGroup[];
};

export default function DuplicateNotification({ groups }: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState<DuplicateGroup | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [confirmReservationId, setConfirmReservationId] = useState<string | null>(null);

    if (groups.length === 0) return null;

    const handleOpenGroup = (group: DuplicateGroup) => {
        setSelectedGroup(group);
        setIsOpen(true);
    };

    const handleCancelClick = (reservationId: string) => {
        setConfirmReservationId(reservationId);
    };

    const handleExecuteCancel = async () => {
        if (!confirmReservationId) return;

        setIsProcessing(true);
        try {
            await cancelReservation(confirmReservationId);
            // Re-filtering will be handled by server component revalidation
            if (selectedGroup) {
                const updatedReservations = selectedGroup.reservations.filter(r => r.id !== confirmReservationId);
                if (updatedReservations.length <= 1) {
                    setIsOpen(false);
                } else {
                    setSelectedGroup({ ...selectedGroup, reservations: updatedReservations });
                }
            }
            setConfirmReservationId(null);
        } catch (error) {
            console.error('Failed to cancel reservation:', error);
            alert('キャンセルの実行に失敗しました。');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div style={{ marginBottom: '2rem' }}>
            <div
                onClick={() => handleOpenGroup(groups[0])} // For now, open first group. In real use, might want a list if many groups.
                style={{
                    background: '#fff4e5',
                    border: '1px solid #ffcc80',
                    borderRadius: '12px',
                    padding: '1rem 1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(255, 167, 38, 0.15)',
                    transition: 'transform 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>⚠️</span>
                    <div>
                        <div style={{ fontWeight: 'bold', color: '#e65100' }}>重複の可能性がある予約が {groups.length} 件見つかりました</div>
                        <div style={{ fontSize: '0.85rem', color: '#666' }}>クリックして詳細を確認し、必要に応じてキャンセルしてください。</div>
                    </div>
                </div>
                <span style={{ fontSize: '1.2rem', color: '#ffb74d' }}>❯</span>
            </div>

            {/* Modal */}
            {isOpen && selectedGroup && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    backgroundColor: 'rgba(0,0,0,0.6)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 3000,
                    backdropFilter: 'blur(4px)'
                }}>
                    <div style={{
                        background: '#fff',
                        borderRadius: '24px',
                        width: '95%',
                        maxWidth: '800px',
                        maxHeight: '90vh',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                        position: 'relative'
                    }}>
                        <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#333' }}>重複予約の比較確認</h3>
                            <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#999' }}>×</button>
                        </div>

                        <div style={{ padding: '2rem', overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                            {selectedGroup.reservations.map((res) => (
                                <div key={res.id} style={{
                                    border: '1px solid #eee',
                                    borderRadius: '16px',
                                    padding: '1.5rem',
                                    background: '#fcfcfc',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '1rem'
                                }}>
                                    <div>
                                        <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '0.2rem' }}>予約ID</div>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 'mono' }}>{res.id.slice(0, 8)}...</div>
                                    </div>

                                    <div>
                                        <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '0.2rem' }}>顧客情報</div>
                                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{res.customerName} 様</div>
                                        <div style={{ fontSize: '0.9rem', color: '#666' }}>{res.customerEmail || 'メール登録なし'}</div>
                                    </div>

                                    <div>
                                        <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '0.2rem' }}>公演回</div>
                                        <div style={{ fontSize: '0.95rem' }}>
                                            {formatDate(res.performance.startTime)} {formatTime(res.performance.startTime)}
                                        </div>
                                    </div>

                                    <div>
                                        <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '0.2rem' }}>予約内容</div>
                                        {res.tickets.map((t: any) => (
                                            <div key={t.id} style={{ fontSize: '0.9rem' }}>
                                                {t.ticketType.name}: {t.count} 枚
                                            </div>
                                        ))}
                                    </div>

                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '0.2rem' }}>備考</div>
                                        <div style={{ fontSize: '0.85rem', color: '#444', fontStyle: res.remarks ? 'normal' : 'italic' }}>
                                            {res.remarks || '備考なし'}
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => handleCancelClick(res.id)}
                                        disabled={isProcessing}
                                        style={{
                                            marginTop: '1rem',
                                            padding: '0.8rem',
                                            borderRadius: '10px',
                                            border: '1px solid #ffcdd2',
                                            background: '#fff',
                                            color: '#d32f2f',
                                            fontWeight: 'bold',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseOver={(e) => {
                                            if (!isProcessing) {
                                                e.currentTarget.style.background = '#ffebee';
                                                e.currentTarget.style.borderColor = '#d32f2f';
                                            }
                                        }}
                                        onMouseOut={(e) => {
                                            if (!isProcessing) {
                                                e.currentTarget.style.background = '#fff';
                                                e.currentTarget.style.borderColor = '#ffcdd2';
                                            }
                                        }}
                                    >
                                        キャンセルする
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div style={{ padding: '1.5rem 2rem', borderTop: '1px solid #eee', background: '#f9f9f9', textAlign: 'center' }}>
                            <button onClick={() => setIsOpen(false)} className="btn btn-secondary" style={{ padding: '0.8rem 2.5rem', borderRadius: '12px' }}>
                                閉じる
                            </button>
                        </div>

                        {/* Custom Confirmation Dialog within Modal */}
                        {confirmReservationId && (
                            <div style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                background: 'rgba(255, 255, 255, 0.95)',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                zIndex: 3100,
                                animation: 'fadeIn 0.2s'
                            }}>
                                <div style={{ textAlign: 'center', padding: '2rem', maxWidth: '400px' }}>
                                    <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem' }}>予約をキャンセルしますか？</h4>
                                    <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '2rem' }}>この操作は取り消せません。本当によろしいですか？</p>
                                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                                        <button
                                            onClick={() => setConfirmReservationId(null)}
                                            style={{ padding: '0.8rem 1.5rem', borderRadius: '12px', border: '1px solid #ddd', background: '#fff', cursor: 'pointer' }}
                                        >
                                            戻る
                                        </button>
                                        <button
                                            onClick={handleExecuteCancel}
                                            disabled={isProcessing}
                                            style={{ padding: '0.8rem 1.5rem', borderRadius: '12px', border: 'none', background: '#d32f2f', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}
                                        >
                                            {isProcessing ? '処理中...' : 'はい、キャンセルします'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
            <style jsx>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `}</style>
        </div>
    );
}
