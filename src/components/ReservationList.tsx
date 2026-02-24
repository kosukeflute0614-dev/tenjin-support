'use client';

import { useState } from 'react';
import { cancelReservationClient, updateReservationFullClient } from '@/lib/client-firestore';
import { useAuth } from './AuthProvider';
import { STATUS_LABELS, PAYMENT_STATUS_LABELS } from '@/lib/constants';
import { formatDateTime, formatDate, formatTime } from '@/lib/format';
import { exportToCSV } from '@/lib/export-utils';
import { ReservationTicket } from '@/types';

type Props = {
    reservations: any[];
    bookingOptions: any[];
};

export default function ReservationList({ reservations, bookingOptions }: Props) {
    const { user } = useAuth();
    const [editingReservation, setEditingReservation] = useState<any | null>(null);
    const [cancellingReservation, setCancellingReservation] = useState<any | null>(null);
    const [showCancelled, setShowCancelled] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedPerformanceId, setSelectedPerformanceId] = useState('all');

    const handleEdit = (res: any) => {
        setEditingReservation(res);
    };

    const handleOpenCancelConfirm = (res: any) => {
        setCancellingReservation(res);
        setEditingReservation(null); // Close edit modal if open
    };

    const handleConfirmCancel = async () => {
        if (!cancellingReservation || !user) return;
        setIsProcessing(true);
        try {
            await cancelReservationClient(cancellingReservation.id, user.uid);
            setCancellingReservation(null);
        } catch (error: any) {
            alert(error.message || '操作に失敗しました。');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleConfirm = async (id: string) => {
        if (!user) return;
        setIsProcessing(true);
        try {
            await updateReservationFullClient(id, { status: 'CONFIRMED' }, user.uid);
        } catch (error: any) {
            alert(error.message || '操作に失敗しました。');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleRestore = async (id: string) => {
        if (!user) return;
        setIsProcessing(true);
        try {
            await updateReservationFullClient(id, { status: 'CONFIRMED' }, user.uid);
        } catch (error: any) {
            alert(error.message || '操作に失敗しました。');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCloseModal = () => {
        setEditingReservation(null);
        setCancellingReservation(null);
    };

    const handleExportCSV = () => {
        if (filteredReservations.length === 0) return;

        const csvData = filteredReservations.map(res => {
            const ticketSummary = res.tickets.map((t: any) => {
                const tt = res.performance?.ticketTypes?.find((tt: any) => tt.id === t.ticketTypeId);
                return `${tt?.name || '不明'}x${t.count}`;
            }).join(' / ');

            const totalCount = res.tickets.reduce((sum: number, t: any) => sum + (t.count || 0), 0);
            const totalPrice = res.tickets.reduce((sum: number, t: any) => sum + (t.count * (t.price || 0)), 0);

            return {
                '氏名': res.customerName,
                'ふりがな': res.customerNameKana || '',
                'メール': res.customerEmail || '',
                '公演名': res.performance?.productionTitle || '',
                '公演日': res.performance?.startTime ? formatDate(res.performance.startTime) : '',
                '開演時間': res.performance?.startTime ? formatTime(res.performance.startTime) : '',
                '内訳': ticketSummary,
                '合計枚数': totalCount,
                '合計金額': totalPrice,
                'ステータス': STATUS_LABELS[res.status as keyof typeof STATUS_LABELS] || res.status,
                '支払い': PAYMENT_STATUS_LABELS[res.paymentStatus as keyof typeof PAYMENT_STATUS_LABELS] || res.paymentStatus,
                'チェックイン': res.checkinStatus === 'CHECKED_IN' ? '済み' : '未',
                '備考': (res.remarks || '').replace(/\n/g, ' ')
            };
        });

        exportToCSV(csvData, `reservations-export-${new Date().getTime()}.csv`, [
            { key: '氏名', label: '氏名' },
            { key: 'ふりがな', label: 'ふりがな' },
            { key: 'メール', label: 'メール' },
            { key: '公演名', label: '公演名' },
            { key: '公演日', label: '公演日' },
            { key: '開演時間', label: '開演時間' },
            { key: '内訳', label: '内訳' },
            { key: '合計枚数', label: '合計枚数' },
            { key: '合計金額', label: '合計金額' },
            { key: 'ステータス', label: 'ステータス' },
            { key: '支払い', label: '支払い' },
            { key: 'チェックイン', label: 'チェックイン' },
            { key: '備考', label: '備考' }
        ]);
    };

    const allPerformances = bookingOptions.flatMap(prod =>
        (prod.performances || []).map((perf: any) => ({
            ...perf,
            productionTitle: prod.title,
            ticketTypes: prod.ticketTypes
        }))
    );

    // Join reservations with performance data
    const joinedReservations = reservations.map(res => {
        const performance = allPerformances.find(p => p.id === res.performanceId);
        return {
            ...res,
            performance: performance || null
        };
    });

    // Combine all filters
    const filteredReservations = joinedReservations.filter(res => {
        // Status filter
        if (!showCancelled && res.status === 'CANCELED') return false;

        // Performance filter
        if (selectedPerformanceId !== 'all' && res.performanceId !== selectedPerformanceId) return false;

        // Search filter (name or email)
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const nameMatch = res.customerName.toLowerCase().includes(query);
            const emailMatch = res.customerEmail?.toLowerCase().includes(query);
            if (!nameMatch && !emailMatch) return false;
        }

        return true;
    });

    return (
        <div className="reservation-list-container">
            {/* Filters Row */}
            <div className="flex-center" style={{
                justifyContent: 'space-between',
                marginBottom: '1.5rem',
                gap: '1rem',
                flexWrap: 'wrap',
                backgroundColor: 'var(--background-light)',
                padding: '1rem',
                borderRadius: '8px',
                border: '1px solid var(--card-border)'
            }}>
                <div style={{ display: 'flex', gap: '1rem', flex: 1, minWidth: '300px' }}>
                    <div style={{ flex: 1 }}>
                        <input
                            type="text"
                            placeholder="名前またはメールで検索..."
                            className="input"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ width: '100%' }}
                        />
                    </div>
                    <div style={{ flex: 1 }}>
                        <select
                            className="input"
                            value={selectedPerformanceId}
                            onChange={(e) => setSelectedPerformanceId(e.target.value)}
                            style={{ width: '100%' }}
                        >
                            <option value="all">すべての公演回</option>
                            {allPerformances.map(perf => (
                                <option key={perf.id} value={perf.id}>
                                    【{perf.productionTitle}】 {formatDateTime(perf.startTime)}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                        onClick={handleExportCSV}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.85rem' }}
                        disabled={filteredReservations.length === 0}
                    >
                        📥 CSVエクスポート
                    </button>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        <input
                            type="checkbox"
                            checked={showCancelled}
                            onChange={(e) => setShowCancelled(e.target.checked)}
                            style={{ width: '1.1rem', height: '1.1rem' }}
                        />
                        キャンセル済みを表示
                    </label>
                </div>
            </div>

            <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead style={{ backgroundColor: 'var(--secondary)', color: 'var(--text-muted)' }}>
                        <tr>
                            <th style={{ padding: '1rem' }}>氏名</th>
                            <th style={{ padding: '1rem' }}>公演回</th>
                            <th style={{ padding: '1rem' }}>内訳</th>
                            <th style={{ padding: '1rem', textAlign: 'center' }}>合計枚数</th>
                            <th style={{ padding: '1rem' }}>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredReservations.map((res) => {
                            const totalCount = res.tickets.reduce((sum: number, t: any) => sum + (t.count || 0), 0);
                            const isCanceled = res.status === 'CANCELED';

                            // Client-side Join
                            const performance = allPerformances.find(p => p.id === res.performanceId);
                            const productionTitle = performance?.productionTitle || '不明な公演';
                            const startTime = performance?.startTime;

                            return (
                                <tr key={res.id} style={{
                                    borderBottom: '1px solid var(--card-border)',
                                    opacity: isCanceled ? 0.6 : 1,
                                    backgroundColor: isCanceled ? 'rgba(0,0,0,0.05)' : 'transparent'
                                }}>
                                    <td style={{ padding: '1rem' }}>
                                        <div style={{ fontWeight: 'bold' }}>{res.customerName}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{res.customerEmail}</div>
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        <div style={{ fontSize: '0.9rem' }}>
                                            {res.performance?.productionTitle || '不明な公演'}
                                        </div>
                                        {res.performance?.startTime && (
                                            <div style={{ fontSize: '0.8rem', color: 'var(--primary)' }}>
                                                {formatDateTime(res.performance.startTime)}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        {res.tickets.map((t: any, idx: number) => {
                                            const ticketType = res.performance?.ticketTypes?.find((tt: any) => tt.id === t.ticketTypeId);
                                            return (
                                                <div key={idx} style={{ fontSize: '0.9rem' }}>
                                                    {ticketType?.name || '不明な券種'} x {t.count}
                                                </div>
                                            );
                                        })}
                                        {res.tickets.length === 0 && <span className="text-muted">-</span>}
                                    </td>
                                    <td style={{ padding: '1rem', textAlign: 'center', fontWeight: 'bold' }}>
                                        {totalCount}
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            {!isCanceled ? (
                                                <button
                                                    onClick={() => handleEdit(res)}
                                                    className="btn btn-secondary"
                                                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                                                >
                                                    詳細・取消
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => handleRestore(res.id)}
                                                    className="btn btn-primary"
                                                    style={{
                                                        padding: '0.4rem 0.8rem',
                                                        fontSize: '0.85rem',
                                                        backgroundColor: 'var(--success)',
                                                        border: 'none',
                                                        opacity: isProcessing ? 0.7 : 1
                                                    }}
                                                    disabled={isProcessing}
                                                >
                                                    {isProcessing ? '処理中' : '予約を復元'}
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {filteredReservations.length === 0 && (
                            <tr>
                                <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    表示可能な予約データがありません。
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>

                {/* Edit Modal */}
                {editingReservation && (
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
                        zIndex: 1000,
                        padding: '1rem'
                    }}>
                        <div className="card" style={{
                            width: '100%',
                            maxWidth: '600px',
                            maxHeight: '90vh',
                            overflowY: 'auto',
                            position: 'relative'
                        }}>
                            <button
                                onClick={handleCloseModal}
                                style={{
                                    position: 'absolute',
                                    top: '1rem',
                                    right: '1rem',
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer',
                                    fontSize: '1.5rem'
                                }}
                            >
                                &times;
                            </button>

                            <h3 className="heading-md" style={{ marginBottom: '1.5rem' }}>予約内容の変更</h3>

                            <form onSubmit={async (e) => {
                                e.preventDefault();
                                if (!user) return;
                                setIsProcessing(true);
                                const formData = new FormData(e.currentTarget);

                                const tickets = Array.from(formData.entries())
                                    .filter(([key]) => key.startsWith('ticket_'))
                                    .map(([key, value]) => {
                                        const ticketTypeId = key.replace('ticket_', '');
                                        const count = parseInt(value as string) || 0;
                                        const performance = allPerformances.find(p => p.id === formData.get('performanceId'));
                                        const type = performance?.ticketTypes?.find((tt: any) => tt.id === ticketTypeId);
                                        return {
                                            ticketTypeId,
                                            count,
                                            price: type?.price || 0
                                        };
                                    }).filter(t => t.count > 0);

                                try {
                                    await updateReservationFullClient(editingReservation.id, {
                                        customerName: formData.get('customerName') as string,
                                        customerEmail: formData.get('customerEmail') as string,
                                        performanceId: formData.get('performanceId') as string,
                                        tickets: tickets as any,
                                        remarks: formData.get('remarks') as string,
                                    }, user.uid);
                                    handleCloseModal();
                                } catch (error: any) {
                                    alert(error.message || '更新に失敗しました。');
                                } finally {
                                    setIsProcessing(false);
                                }
                            }}>
                                <div className="form-group" style={{ marginBottom: '1rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 'bold' }}>氏名</label>
                                    <input name="customerName" defaultValue={editingReservation.customerName} required className="input" />
                                </div>

                                <div className="form-group" style={{ marginBottom: '1rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 'bold' }}>メールアドレス</label>
                                    <input name="customerEmail" defaultValue={editingReservation.customerEmail} className="input" />
                                </div>

                                <div className="form-group" style={{ marginBottom: '1rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 'bold' }}>公演回</label>
                                    <select name="performanceId" defaultValue={editingReservation.performanceId} className="input" required>
                                        {allPerformances.map(perf => (
                                            <option key={perf.id} value={perf.id}>
                                                【{perf.productionTitle}】 {formatDateTime(perf.startTime)}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div style={{
                                    padding: '1rem',
                                    border: '1px solid var(--card-border)',
                                    borderRadius: '8px',
                                    marginBottom: '1rem',
                                    backgroundColor: 'var(--background-light)'
                                }}>
                                    <label style={{ display: 'block', marginBottom: '1rem', fontWeight: 'bold' }}>券種・枚数</label>
                                    {(allPerformances.find(p => p.id === editingReservation.performanceId)?.ticketTypes || []).map((tt: any) => {
                                        const existing = editingReservation.tickets.find((t: any) => t.ticketTypeId === tt.id);
                                        return (
                                            <div key={tt.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                <span style={{ fontSize: '0.9rem' }}>{tt.name} (¥{tt.price?.toLocaleString()})</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <input
                                                        type="number"
                                                        name={`ticket_${tt.id}`}
                                                        defaultValue={existing ? existing.count : 0}
                                                        min="0"
                                                        className="input"
                                                        style={{ width: '70px', textAlign: 'right' }}
                                                    />
                                                    <span style={{ fontSize: '0.9rem' }}>枚</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 'bold' }}>備考</label>
                                    <textarea name="remarks" defaultValue={editingReservation.remarks} className="input" rows={3} />
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                                    <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>
                                        変更を保存
                                    </button>
                                    <button type="button" onClick={handleCloseModal} className="btn" style={{ flex: 1, backgroundColor: 'var(--secondary)' }}>
                                        閉じる
                                    </button>
                                </div>

                                <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: '1rem', marginTop: '1rem', textAlign: 'center' }}>
                                    <button
                                        type="button"
                                        onClick={() => handleOpenCancelConfirm(editingReservation)}
                                        className="btn"
                                        style={{
                                            backgroundColor: 'rgba(255, 75, 75, 0.1)',
                                            color: 'var(--accent)',
                                            border: '1px solid var(--accent)',
                                            width: '100%'
                                        }}
                                    >
                                        予約をキャンセルする
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Cancel Confirmation Modal */}
                {cancellingReservation && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        zIndex: 1101,
                        padding: '1rem'
                    }}>
                        <div className="card" style={{
                            width: '100%',
                            maxWidth: '450px',
                            padding: '2rem',
                            textAlign: 'center'
                        }}>
                            <h3 className="heading-md" style={{ color: 'var(--accent)', marginBottom: '1.5rem' }}>予約のキャンセル</h3>

                            <p style={{ marginBottom: '1.5rem' }}>以下の予約をキャンセルしてもよろしいですか？</p>

                            <div style={{
                                textAlign: 'left',
                                backgroundColor: 'var(--secondary)',
                                padding: '1.5rem',
                                borderRadius: '8px',
                                marginBottom: '2rem',
                                fontSize: '0.95rem',
                                lineHeight: '1.6'
                            }}>
                                <div><strong>お名前:</strong> {cancellingReservation.customerName} 様</div>
                                {cancellingReservation.performance?.startTime && (
                                    <div><strong>公演日時:</strong> {formatDateTime(cancellingReservation.performance.startTime)}</div>
                                )}
                                <div><strong>合計枚数:</strong> {cancellingReservation.tickets.reduce((sum: number, t: any) => sum + (t.count || 0), 0)} 枚</div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                    {cancellingReservation.tickets.map((t: any) => {
                                        const tt = cancellingReservation.performance?.ticketTypes?.find((tt: any) => tt.id === t.ticketTypeId);
                                        return `${tt?.name || '不明な券種'} x ${t.count}`;
                                    }).join(', ')}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <button
                                    onClick={handleCloseModal}
                                    className="btn"
                                    style={{ flex: 1, backgroundColor: 'var(--secondary)' }}
                                    disabled={isProcessing}
                                >
                                    戻る
                                </button>
                                <button
                                    onClick={handleConfirmCancel}
                                    className="btn btn-primary"
                                    style={{ flex: 1, backgroundColor: 'var(--accent)' }}
                                    disabled={isProcessing}
                                >
                                    {isProcessing ? '処理中...' : '確定する'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
