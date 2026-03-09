'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { NumberStepper } from '@/components/TouchInputs';
import { formatCurrency } from '@/lib/format';
import { useToast } from '@/components/Toast';
import { getPerformancePaidTotalClient, saveCashClosingClient, getCashClosingsClient } from '@/lib/client-firestore/cash-close';
import { CashClosing } from '@/types';
import { toDate } from '@/lib/firestore-utils';
import { formatDateTime } from '@/lib/format';

const DENOMINATIONS = [
    { value: 10000, label: '1万円札' },
    { value: 5000, label: '5千円札' },
    { value: 1000, label: '千円札' },
    { value: 500, label: '500円玉' },
    { value: 100, label: '100円玉' },
    { value: 50, label: '50円玉' },
    { value: 10, label: '10円玉' },
    { value: 5, label: '5円玉' },
    { value: 1, label: '1円玉' },
] as const;

interface CashCloseFormProps {
    productionId: string;
    performanceId: string;
    userId: string;
    closedByType: 'ORGANIZER' | 'STAFF';
    closedBy: string;
    onComplete?: () => void;
    hideHistory?: boolean;
    expectedSalesOverride?: number;
}

export default function CashCloseForm({
    productionId,
    performanceId,
    userId,
    closedByType,
    closedBy,
    onComplete,
    hideHistory = false,
    expectedSalesOverride,
}: CashCloseFormProps) {
    const [changeFloat, setChangeFloat] = useState('');
    const [counts, setCounts] = useState<Record<number, number>>(
        Object.fromEntries(DENOMINATIONS.map(d => [d.value, 0]))
    );
    const [expectedSales, setExpectedSales] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [history, setHistory] = useState<CashClosing[]>([]);
    const [remarks, setRemarks] = useState('');
    const [saved, setSaved] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const { showToast } = useToast();

    useUnsavedChanges(isDirty);

    const changeFloatNum = useMemo(() => {
        const n = parseInt(changeFloat, 10);
        return isNaN(n) ? 0 : n;
    }, [changeFloat]);

    const cashTotal = useMemo(() =>
        DENOMINATIONS.reduce((sum, d) => sum + d.value * (counts[d.value] || 0), 0),
        [counts]
    );

    const actualSales = cashTotal - changeFloatNum;
    const discrepancy = actualSales - expectedSales;

    const loadData = useCallback(async () => {
        try {
            if (expectedSalesOverride !== undefined) {
                setExpectedSales(expectedSalesOverride);
                if (!hideHistory) {
                    const closings = await getCashClosingsClient(performanceId, productionId, userId);
                    setHistory(closings);
                }
            } else {
                const [paidTotal, closings] = await Promise.all([
                    getPerformancePaidTotalClient(performanceId, userId),
                    hideHistory ? Promise.resolve([]) : getCashClosingsClient(performanceId, productionId, userId),
                ]);
                setExpectedSales(paidTotal);
                setHistory(closings);
            }
        } catch (err: unknown) {
            console.error('データ取得エラー:', err);
            showToast('データの取得に失敗しました', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [performanceId, productionId, userId, expectedSalesOverride, hideHistory]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleSave = async () => {
        if (!confirm('レジ締めを確定しますか？')) return;

        setIsSaving(true);

        try {
            await saveCashClosingClient({
                productionId,
                performanceId,
                userId,
                closedBy,
                closedByType,
                changeFloat: changeFloatNum,
                denominations: DENOMINATIONS.map(d => ({
                    denomination: d.value,
                    count: counts[d.value] || 0,
                })),
                cashTotal,
                expectedSales,
                actualSales,
                discrepancy,
                remarks: remarks || null,
            });

            setSaved(true);
            setIsDirty(false);
            // 履歴を再取得（hideHistory でなければ）
            if (!hideHistory) {
                const closings = await getCashClosingsClient(performanceId, productionId, userId);
                setHistory(closings);
            }

            if (onComplete) onComplete();
        } catch (err: unknown) {
            console.error('保存エラー:', err);
            showToast('レジ締めの保存に失敗しました', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const updateCount = (denomination: number, value: number) => {
        setCounts(prev => ({ ...prev, [denomination]: value }));
        setIsDirty(true);
    };

    if (isLoading) {
        return <div className="flex-center" style={{ padding: '3rem' }}>読み込み中...</div>;
    }

    if (saved) {
        return (
            <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                <div className="card" style={{ padding: '3rem', textAlign: 'center', borderTop: '4px solid var(--success)' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>&#10003;</div>
                    <h2 style={{ fontSize: '1.3rem', fontWeight: 'bold', marginBottom: '1rem' }}>レジ締め完了</h2>
                    <div style={{ fontSize: '0.95rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: '1.8' }}>
                        <p>現金合計: {formatCurrency(cashTotal)}</p>
                        <p>差額: <span style={{ color: discrepancy === 0 ? 'var(--success)' : discrepancy > 0 ? '#1565c0' : 'var(--accent)', fontWeight: 'bold' }}>
                            {discrepancy === 0 ? '一致' : discrepancy > 0 ? `+${formatCurrency(discrepancy)}（多い）` : `${formatCurrency(discrepancy)}（不足）`}
                        </span></p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
                        <button
                            className="btn btn-secondary"
                            onClick={() => setSaved(false)}
                            style={{ padding: '0.75rem 2rem' }}
                        >
                            もう一度レジ締めする
                        </button>
                        {!hideHistory && (
                            <Link
                                href={`/productions/${productionId}/cashclose-report`}
                                style={{ fontSize: '0.9rem', color: 'var(--primary)', fontWeight: '500' }}
                            >
                                レジ締めレポートを見る
                            </Link>
                        )}
                    </div>
                </div>

                {!hideHistory && history.length > 0 && renderHistory()}
            </div>
        );
    }

    function renderHistory() {
        return (
            <div style={{ marginTop: '2rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '1rem', color: 'var(--text-muted)' }}>
                    精算履歴（{history.length}件）
                </h3>
                {history.map((h) => (
                    <div key={h.id} className="card" style={{
                        padding: '1rem 1.25rem',
                        marginBottom: '0.75rem',
                        fontSize: '0.9rem',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                {h.createdAt ? formatDateTime(h.createdAt) : ''}
                            </span>
                            <span style={{
                                fontWeight: 'bold',
                                color: h.discrepancy === 0 ? 'var(--success)' : h.discrepancy > 0 ? '#1565c0' : 'var(--accent)',
                            }}>
                                {h.discrepancy === 0 ? '一致' : h.discrepancy > 0 ? `+${formatCurrency(h.discrepancy)}` : formatCurrency(h.discrepancy)}
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.85rem', color: 'var(--slate-600)' }}>
                            <span>現金: {formatCurrency(h.cashTotal)}</span>
                            <span>準備金: {formatCurrency(h.changeFloat)}</span>
                            <span>売上: {formatCurrency(h.expectedSales)}</span>
                        </div>
                        {h.remarks && (
                            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                備考: {h.remarks}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            {/* 釣り銭準備金 */}
            <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.75rem' }}>釣り銭準備金</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>&yen;</span>
                    <input
                        type="text"
                        inputMode="numeric"
                        className="input"
                        placeholder="0"
                        value={changeFloat}
                        onChange={(e) => { setChangeFloat(e.target.value.replace(/[^0-9]/g, '')); setIsDirty(true); }}
                        style={{ fontSize: '1.2rem', textAlign: 'right', maxWidth: '200px' }}
                    />
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem', marginBottom: 0 }}>
                    レジに最初に入れていた釣り銭用の金額を入力してください
                </p>
            </div>

            {/* 金種別枚数入力 */}
            <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '1rem' }}>現金実数</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {DENOMINATIONS.map((d) => (
                        <div key={d.value} style={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(70px, 90px) 1fr minmax(70px, 100px)',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.25rem 0',
                        }}>
                            <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>{d.label}</span>
                            <NumberStepper
                                value={counts[d.value]}
                                min={0}
                                max={999}
                                onChange={(val) => updateCount(d.value, val)}
                                label="枚"
                            />
                            <span style={{ textAlign: 'right', fontSize: '0.9rem', color: 'var(--slate-600)', fontVariantNumeric: 'tabular-nums' }}>
                                {formatCurrency(d.value * (counts[d.value] || 0))}
                            </span>
                        </div>
                    ))}
                </div>
                <div style={{
                    marginTop: '1rem',
                    paddingTop: '1rem',
                    borderTop: '2px solid var(--primary)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}>
                    <span style={{ fontSize: '1rem', fontWeight: 'bold' }}>現金合計</span>
                    <span style={{ fontSize: '1.4rem', fontWeight: '900', color: 'var(--primary)' }}>
                        {formatCurrency(cashTotal)}
                    </span>
                </div>
            </div>

            {/* 精算結果 */}
            <div className="card" style={{
                padding: '1.25rem',
                marginBottom: '1rem',
                border: '2px solid var(--primary)',
            }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '1rem' }}>精算結果</h3>
                <table style={{ width: '100%', fontSize: '0.95rem' }}>
                    <tbody>
                        <tr>
                            <td style={{ padding: '0.5rem 0', color: 'var(--slate-600)' }}>チケット売上合計</td>
                            <td style={{ padding: '0.5rem 0', textAlign: 'right', fontWeight: '600' }}>
                                {formatCurrency(expectedSales)}
                            </td>
                        </tr>
                        <tr>
                            <td style={{ padding: '0.5rem 0', color: 'var(--slate-600)' }}>現金実数</td>
                            <td style={{ padding: '0.5rem 0', textAlign: 'right' }}>{formatCurrency(cashTotal)}</td>
                        </tr>
                        <tr>
                            <td style={{ padding: '0.5rem 0', color: 'var(--slate-600)' }}>釣り銭準備金</td>
                            <td style={{ padding: '0.5rem 0', textAlign: 'right' }}>-{formatCurrency(changeFloatNum)}</td>
                        </tr>
                        <tr style={{ borderTop: '1px solid var(--card-border)' }}>
                            <td style={{ padding: '0.5rem 0', fontWeight: '600' }}>実売上額</td>
                            <td style={{ padding: '0.5rem 0', textAlign: 'right', fontWeight: '600' }}>
                                {formatCurrency(actualSales)}
                            </td>
                        </tr>
                    </tbody>
                </table>

                <div style={{
                    marginTop: '1rem',
                    padding: '1rem',
                    borderRadius: '8px',
                    textAlign: 'center',
                    background: discrepancy === 0 ? '#e8f5e9' : discrepancy > 0 ? '#e3f2fd' : '#ffebee',
                }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--slate-600)', marginBottom: '0.25rem' }}>差額</div>
                    <div style={{
                        fontSize: '1.5rem',
                        fontWeight: '900',
                        color: discrepancy === 0 ? 'var(--success)' : discrepancy > 0 ? '#1565c0' : 'var(--accent)',
                    }}>
                        {discrepancy === 0
                            ? '一致'
                            : discrepancy > 0
                                ? `+${formatCurrency(discrepancy)}（多い）`
                                : `${formatCurrency(discrepancy)}（不足）`
                        }
                    </div>
                </div>
            </div>

            {/* 備考 */}
            <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
                <label style={{ fontSize: '0.9rem', fontWeight: '500', display: 'block', marginBottom: '0.5rem' }}>
                    備考（任意）
                </label>
                <textarea
                    className="input"
                    rows={2}
                    placeholder="メモがあれば入力..."
                    value={remarks}
                    onChange={(e) => { setRemarks(e.target.value); setIsDirty(true); }}
                    style={{ resize: 'vertical' }}
                />
            </div>

            {/* 確定ボタン */}
            <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={isSaving}
                style={{
                    width: '100%',
                    padding: '1rem',
                    fontSize: '1.1rem',
                    borderRadius: '12px',
                    marginBottom: '2rem',
                }}
            >
                {isSaving ? '保存中...' : 'レジ締めを確定する'}
            </button>

            {/* 精算履歴 */}
            {!hideHistory && history.length > 0 && renderHistory()}
        </div>
    );
}
