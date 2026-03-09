'use client';

import { useState } from 'react';
import { addTicketTypeClient, updateTicketTypeClient, deleteTicketTypeClient } from '@/lib/client-firestore';
import { SmartNumberInput } from './SmartInputs';
import { useAuth } from './AuthProvider';
import { TicketType } from '@/types';

type Props = {
    productionId: string;
    ticketTypes: TicketType[];
};

export default function TicketTypeManager({ productionId, ticketTypes }: Props) {
    const { user } = useAuth();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const [error, setError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const handleDeleteClick = (id: string) => {
        setDeletingId(id);
    };

    const handleConfirmDelete = async () => {
        if (!deletingId || !user) return;

        setIsProcessing(true);
        const idToDelete = deletingId;
        setDeletingId(null); // Close modal first

        try {
            await deleteTicketTypeClient(productionId, idToDelete, user.uid);
        } catch (error: any) {
            console.error('Failed to delete ticket type:', error);
            setError(error.message || '削除に失敗しました。');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <section>
            <h3 className="heading-md">券種 (Ticket Types)</h3>

            {/* Delete Confirmation Modal */}
            {deletingId && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 2000,
                    padding: '1rem'
                }}>
                    <div className="card" style={{
                        width: '100%',
                        maxWidth: '400px',
                        padding: '2rem',
                        textAlign: 'center',
                        boxShadow: '0 15px 35px rgba(0,0,0,0.1)',
                        border: '2px solid var(--primary)',
                        backgroundColor: '#fff'
                    }}>
                        <div style={{ color: 'var(--primary)', fontSize: '3rem', marginBottom: '1rem' }}>❓</div>
                        <h4 style={{ marginBottom: '1rem', color: 'var(--text)' }}>削除の確認</h4>
                        <p style={{ marginBottom: '1.5rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                            この券種を削除してもよろしいですか？<br />
                            この操作は取り消せません。
                        </p>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button
                                onClick={() => setDeletingId(null)}
                                className="btn"
                                style={{ flex: 1, backgroundColor: 'var(--bg-muted)', color: 'var(--text)' }}
                                disabled={isProcessing}
                            >
                                キャンセル
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                className="btn"
                                style={{ flex: 1, backgroundColor: '#8b0000', color: '#fff' }}
                                disabled={isProcessing}
                            >
                                {isProcessing ? '削除中...' : '削除する'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Error Modal */}
            {error && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 2000,
                    padding: '1rem'
                }}>
                    <div className="card" style={{
                        width: '100%',
                        maxWidth: '400px',
                        padding: '2rem',
                        textAlign: 'center',
                        boxShadow: '0 15px 35px rgba(0,0,0,0.1)',
                        border: '2px solid var(--primary)',
                        backgroundColor: '#fff'
                    }}>
                        <div style={{ color: 'var(--primary)', fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
                        <h4 style={{ marginBottom: '1rem', color: 'var(--text)' }}>エラー</h4>
                        <p style={{ marginBottom: '1.5rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>{error}</p>
                        <button
                            onClick={() => setError(null)}
                            className="btn btn-primary"
                            style={{ width: '100%' }}
                        >
                            閉じる
                        </button>
                    </div>
                </div>
            )}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                    {ticketTypes.map(ticket => (
                        <li key={ticket.id} style={{ padding: '0.75rem 0', borderBottom: '1px solid var(--card-border)' }}>
                            {editingId === ticket.id ? (
                                <form onSubmit={async (e) => {
                                    e.preventDefault();
                                    if (!user) return;
                                    setIsProcessing(true);
                                    const formData = new FormData(e.currentTarget);
                                    const name = formData.get('name') as string;
                                    const advancePrice = parseInt(formData.get('advancePrice') as string);
                                    const doorPrice = parseInt(formData.get('doorPrice') as string);
                                    if (isNaN(advancePrice) || isNaN(doorPrice) || advancePrice < 0 || doorPrice < 0) {
                                        setError('料金は0以上の数値で入力してください');
                                        setIsProcessing(false);
                                        return;
                                    }
                                    try {
                                        await updateTicketTypeClient(productionId, ticket.id, name, advancePrice, doorPrice, user.uid);
                                        setEditingId(null);
                                    } catch (error: any) {
                                        console.error('Failed to update ticket type:', error);
                                        setError(error.message || '更新に失敗しました。');
                                    } finally {
                                        setIsProcessing(false);
                                    }
                                }} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end' }}>
                                    <input type="hidden" name="productionId" value={productionId} />
                                    <div className="form-group" style={{ margin: 0, flex: 2, minWidth: '150px' }}>
                                        <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>名称</label>
                                        <input
                                            type="text"
                                            name="name"
                                            defaultValue={ticket.name}
                                            required
                                            className="input"
                                            style={{ padding: '0 1rem', fontSize: '0.9rem', height: '50px', boxSizing: 'border-box', marginBottom: 0 }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', flex: 2 }}>
                                        <SmartNumberInput name="advancePrice" defaultValue={ticket.advancePrice ?? ticket.price} required label="前売" />
                                        <SmartNumberInput name="doorPrice" defaultValue={ticket.doorPrice ?? ticket.price} required label="当日" />
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.25rem', height: '50px', alignItems: 'center' }}>
                                        <button type="submit" className="btn btn-primary" style={{ padding: '0 1rem', fontSize: '0.85rem', height: '100%', borderRadius: '8px', background: '#8b0000', border: 'none' }} disabled={isProcessing}>
                                            保存
                                        </button>
                                        <button type="button" onClick={() => setEditingId(null)} className="btn" style={{ padding: '0 1rem', fontSize: '0.85rem', height: '100%', borderRadius: '8px', backgroundColor: 'var(--secondary)' }}>
                                            止める
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{ticket.name}</span>
                                        <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.9rem' }}>
                                            <span style={{ color: '#666' }}>前売: <span style={{ color: '#8b0000', fontWeight: 'bold' }}>¥{(ticket.advancePrice ?? ticket.price ?? 0).toLocaleString()}</span></span>
                                            <span style={{ color: '#666' }}>当日: <span style={{ color: '#8b0000', fontWeight: 'bold' }}>¥{(ticket.doorPrice ?? ticket.price ?? 0).toLocaleString()}</span></span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button
                                            onClick={() => setEditingId(ticket.id)}
                                            className="btn btn-secondary"
                                            style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}
                                        >
                                            編集
                                        </button>
                                        <button
                                            onClick={() => handleDeleteClick(ticket.id)}
                                            className="btn btn-danger-outline"
                                            style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}
                                            disabled={isProcessing}
                                        >
                                            削除
                                        </button>
                                    </div>
                                </div>
                            )}
                        </li>
                    ))}
                    {ticketTypes.length === 0 && (
                        <li style={{ color: 'var(--text-muted)', padding: '1rem 0' }}>券種がまだ登録されていません。</li>
                    )}
                </ul>
            </div>

            <div className="card">
                <h4 style={{
                    marginBottom: '1.5rem',
                    fontSize: '1.1rem',
                    color: '#8b0000',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    fontWeight: 'bold'
                }}>
                    <span style={{ fontSize: '1.4rem' }}>🎟️</span> 券種を追加
                </h4>
                <form onSubmit={async (e) => {
                    e.preventDefault();

                    if (!user) {
                        setError("ログイン状態が確認できません。再度ログインしてください。");
                        return;
                    }

                    setIsProcessing(true);
                    const formData = new FormData(e.currentTarget);
                    const name = formData.get('name') as string;
                    const advancePrice = parseInt(formData.get('advancePrice') as string);
                    const doorPrice = parseInt(formData.get('doorPrice') as string);

                    if (isNaN(advancePrice) || isNaN(doorPrice) || advancePrice < 0 || doorPrice < 0) {
                        setError('料金は0以上の数値で入力してください');
                        setIsProcessing(false);
                        return;
                    }

                    try {
                        await addTicketTypeClient(productionId, name, advancePrice, doorPrice, user.uid);
                        (e.target as HTMLFormElement).reset(); // フォームをクリア
                    } catch (error: any) {
                        console.error('Failed to add ticket type:', error);
                        setError(error.message || '追加に失敗しました。');
                    } finally {
                        setIsProcessing(false);
                    }
                }} style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'flex-end' }}>
                    <input type="hidden" name="productionId" value={productionId} />
                    <div className="form-group" style={{ margin: 0, flex: 2, minWidth: '200px' }}>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600, color: '#444', marginLeft: '4px' }}>名称</label>
                        <input
                            type="text"
                            name="name"
                            placeholder="例: 一般"
                            required
                            className="input"
                            style={{ height: '50px', padding: '0 1rem', marginBottom: 0, borderRadius: '10px', border: '2px solid #e0e0e0' }}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', flex: 2, minWidth: '240px' }}>
                        <SmartNumberInput name="advancePrice" defaultValue={3500} required label="前売料金" />
                        <SmartNumberInput name="doorPrice" defaultValue={4000} required label="当日料金" />
                    </div>
                    <button type="submit" className="btn btn-primary" style={{
                        height: '50px',
                        padding: '0 2.5rem',
                        fontWeight: 'bold',
                        borderRadius: '10px',
                        background: '#8b0000',
                        border: 'none'
                    }}>
                        追加
                    </button>
                </form>
            </div>
        </section>
    );
}
