import { useState } from 'react';
import { addPerformanceClient, updatePerformanceClient, deletePerformanceClient } from '@/lib/client-firestore';
import { formatDate, formatTime } from '@/lib/format';
import { SmartMaskedDatePicker, SmartMaskedTimeInput, SmartNumberInput } from './SmartInputs';
import { useAuth } from './AuthProvider';

type Props = {
    productionId: string;
    performances: any[];
};

export default function PerformanceManager({ productionId, performances }: Props) {
    const { user } = useAuth();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    // グループ化ロジック
    const groupedPerformances = performances.reduce((acc, perf) => {
        const d = new Date(perf.startTime);
        const dateKey = formatDate(d);
        if (!acc[dateKey]) acc[dateKey] = [];
        acc[dateKey].push(perf);
        return acc;
    }, {} as Record<string, any[]>);

    const sortedDateKeys = Object.keys(groupedPerformances).sort();

    const handleDeleteClick = (id: string) => {
        setDeletingId(id);
    };

    const handleConfirmDelete = async () => {
        if (!deletingId || !user) return;
        setIsProcessing(true);
        const idToDelete = deletingId;
        setDeletingId(null);
        try {
            await deletePerformanceClient(idToDelete, user.uid);
        } catch (error: any) {
            setError(error.message || '削除に失敗しました。');
        } finally {
            setIsProcessing(false);
        }
    };

    const getDayOfWeek = (dateStr: string) => {
        const days = ['日', '月', '火', '水', '木', '金', '土'];
        const d = new Date(dateStr.replace(/\//g, '-'));
        return days[d.getDay()];
    };

    return (
        <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h3 className="heading-md" style={{ margin: 0 }}>公演スケジュール</h3>
                <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="btn btn-primary"
                    style={{
                        background: '#8b0000',
                        border: 'none',
                        fontSize: '0.9rem',
                        padding: '0.75rem 1.5rem',
                        fontWeight: 'bold',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        boxShadow: '0 4px 10px rgba(139, 0, 0, 0.2)'
                    }}
                >
                    <span style={{ fontSize: '1.2rem' }}>+</span> 公演を新規追加
                </button>
            </div>

            {/* モーダル類 */}
            {deletingId && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 }}>
                    <div className="card" style={{ width: '90%', maxWidth: '400px', padding: '2rem', textAlign: 'center', background: '#fff' }}>
                        <h4 style={{ marginBottom: '1rem' }}>削除の確認</h4>
                        <p style={{ marginBottom: '1.5rem', color: '#666' }}>この公演回を削除してもよろしいですか？</p>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button onClick={() => setDeletingId(null)} className="btn btn-secondary" style={{ flex: 1 }} disabled={isProcessing}>キャンセル</button>
                            <button onClick={handleConfirmDelete} className="btn btn-danger" style={{ flex: 1, background: '#d32f2f' }} disabled={isProcessing}>{isProcessing ? '削除中...' : '削除する'}</button>
                        </div>
                    </div>
                </div>
            )}

            {error && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 }}>
                    <div className="card" style={{ width: '90%', maxWidth: '400px', padding: '2rem', textAlign: 'center', background: '#fff' }}>
                        <h4 style={{ marginBottom: '1rem', color: '#d32f2f' }}>エラー</h4>
                        <p style={{ marginBottom: '1.5rem' }}>{error}</p>
                        <button onClick={() => setError(null)} className="btn btn-primary" style={{ width: '100%' }}>閉じる</button>
                    </div>
                </div>
            )}

            {/* 新規登録モーダル (ポップアップ) */}
            {isAddModalOpen && (
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
                    zIndex: 2500,
                    backdropFilter: 'blur(4px)'
                }}>
                    <div className="card" style={{
                        width: '95%',
                        maxWidth: '500px',
                        padding: '2.5rem',
                        background: '#fff',
                        borderRadius: '24px',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <h4 style={{
                                fontSize: '1.4rem',
                                color: '#8b0000',
                                margin: 0,
                                fontWeight: 'bold',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem'
                            }}>
                                <span style={{ fontSize: '1.8rem' }}>📅</span> 公演回の新規登録
                            </h4>
                            <button
                                onClick={() => setIsAddModalOpen(false)}
                                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#999' }}
                            >
                                ×
                            </button>
                        </div>

                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            if (!user) return;
                            setIsProcessing(true);
                            const formData = new FormData(e.currentTarget);
                            const date = formData.get('date') as string;
                            const time = formData.get('time') as string;
                            const capacity = parseInt(formData.get('capacity') as string);
                            try {
                                const startTime = `${date}T${time}`;
                                await addPerformanceClient(productionId, startTime, capacity, user.uid);
                                setIsAddModalOpen(false);
                            } catch (e: any) {
                                setError(e.message || '登録に失敗しました。');
                            } finally {
                                setIsProcessing(false);
                            }
                        }} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <input type="hidden" name="productionId" value={productionId} />

                            <SmartMaskedDatePicker name="date" label="日付" required />

                            <div style={{ display: 'flex', gap: '1.5rem' }}>
                                <SmartMaskedTimeInput name="time" label="開始時間" required />
                                <SmartNumberInput name="capacity" defaultValue={100} required label="定員" width="120px" />
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button type="button" onClick={() => setIsAddModalOpen(false)} className="btn btn-secondary" style={{ flex: 1, height: '54px', borderRadius: '12px' }}>
                                    キャンセル
                                </button>
                                <button type="submit" className="btn btn-primary" style={{
                                    flex: 2,
                                    height: '54px',
                                    fontWeight: 'bold',
                                    borderRadius: '12px',
                                    background: '#8b0000',
                                    border: 'none',
                                    fontSize: '1.1rem'
                                }} disabled={isProcessing}>
                                    {isProcessing ? '登録中...' : 'スケジュールに追加'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 公演一覧（グループ化） */}
            <div style={{ marginBottom: '2rem' }}>
                {sortedDateKeys.map(dateKey => (
                    <div key={dateKey} style={{ marginBottom: '1.5rem' }}>
                        <div style={{
                            background: '#f8f9fa',
                            padding: '0.6rem 1rem',
                            borderRadius: '8px',
                            fontSize: '0.95rem',
                            fontWeight: 'bold',
                            color: '#333',
                            borderLeft: '4px solid #8b0000',
                            marginBottom: '0.75rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <span>{dateKey} ({getDayOfWeek(dateKey)})</span>
                            <span style={{ fontSize: '0.8rem', color: '#888', fontWeight: 'normal' }}>{groupedPerformances[dateKey].length} 公演</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {groupedPerformances[dateKey].map((perf: any) => (
                                <div key={perf.id} style={{
                                    background: '#fff',
                                    border: '1px solid #eee',
                                    borderRadius: '8px',
                                    padding: '0.75rem 1rem',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    transition: 'all 0.2s ease'
                                }}>
                                    {editingId === perf.id ? (
                                        <form onSubmit={async (e) => {
                                            e.preventDefault();
                                            if (!user) return;
                                            setIsProcessing(true);
                                            const formData = new FormData(e.currentTarget);
                                            const date = formData.get('date') as string;
                                            const time = formData.get('time') as string;
                                            const capacity = parseInt(formData.get('capacity') as string);
                                            try {
                                                const startTime = new Date(`${date}T${time}`);
                                                await updatePerformanceClient(perf.id, startTime, capacity, user.uid);
                                                setEditingId(null);
                                            } catch (error: any) {
                                                console.error('Failed to update performance:', error);
                                                setError(error.message || '更新に失敗しました。');
                                            } finally {
                                                setIsProcessing(false);
                                            }
                                        }} style={{ display: 'flex', flex: 1, gap: '1rem', alignItems: 'flex-end' }}>
                                            <input type="hidden" name="productionId" value={productionId} />

                                            <SmartMaskedDatePicker
                                                name="date"
                                                defaultValue={new Date(perf.startTime).toISOString()}
                                                required
                                                label="日付"
                                                style={{ flex: 2, minWidth: '180px' }}
                                            />
                                            <SmartMaskedTimeInput
                                                name="time"
                                                defaultValue={new Date(perf.startTime).toTimeString().slice(0, 5)}
                                                required
                                                label="時間"
                                                style={{ flex: 1, minWidth: '100px' }}
                                            />
                                            <SmartNumberInput
                                                name="capacity"
                                                defaultValue={perf.capacity}
                                                required
                                                label="定員"
                                                width="100px"
                                            />

                                            <div style={{ display: 'flex', gap: '0.4rem', height: '50px', alignItems: 'center' }}>
                                                <button type="submit" className="btn btn-primary" style={{ height: '100%', padding: '0 1.2rem', fontSize: '0.85rem', borderRadius: '8px', background: '#8b0000', border: 'none' }} disabled={isProcessing}>
                                                    保存
                                                </button>
                                                <button type="button" onClick={() => setEditingId(null)} className="btn btn-secondary" style={{ height: '100%', padding: '0 1.2rem', fontSize: '0.85rem', borderRadius: '8px' }}>
                                                    中止
                                                </button>
                                            </div>
                                        </form>
                                    ) : (
                                        <>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                                <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{formatTime(perf.startTime)}</div>
                                                <div style={{ fontSize: '0.85rem', color: '#666', background: '#f0f0f0', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>
                                                    定員: {perf.capacity}名
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button
                                                    onClick={() => setEditingId(perf.id)}
                                                    className="btn btn-secondary"
                                                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', borderRadius: '6px' }}
                                                >
                                                    編集
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteClick(perf.id)}
                                                    className="btn-danger-outline"
                                                    style={{
                                                        padding: '0.4rem 0.8rem',
                                                        fontSize: '0.8rem',
                                                        border: '1px solid #ffcdd2',
                                                        color: '#d32f2f',
                                                        background: 'transparent',
                                                        borderRadius: '6px',
                                                        cursor: 'pointer'
                                                    }}
                                                    disabled={isProcessing}
                                                >
                                                    削除
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
                {performances.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#999', background: '#fafafa', borderRadius: '12px', border: '2px dashed #eee' }}>
                        公演がまだ登録されていません。
                    </div>
                )}
            </div>
        </section>
    );
}
