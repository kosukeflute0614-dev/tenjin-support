'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { NumberStepper } from '@/components/TouchInputs';
import { formatCurrency } from '@/lib/format';
import { useToast } from '@/components/Toast';
import {
    getPerformancePaidTotalClient,
    saveCashClosingClient,
    getCashClosingsClient,
    getLatestInventoryCheckClient,
    LatestInventoryCheck,
} from '@/lib/client-firestore/cash-close';
import {
    getMerchandiseSoldQuantitiesAllClient,
    getMerchandiseSoldQuantitiesSinceClient,
    SoldQuantityItem,
} from '@/lib/client-firestore/merchandise-sales';
import { CashClosing, MerchandiseProduct, InventoryCheckItem } from '@/types';
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
    ticketSales?: number;      // チケット売上
    merchandiseSales?: number; // 物販売上
    inventoryEnabled?: boolean;
    merchProducts?: MerchandiseProduct[];
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
    ticketSales,
    merchandiseSales,
    inventoryEnabled = false,
    merchProducts = [],
}: CashCloseFormProps) {
    // Tab state
    const [activeSubTab, setActiveSubTab] = useState<'CASH' | 'INVENTORY'>('CASH');

    // Cash close state
    const [changeFloat, setChangeFloat] = useState('');
    const [counts, setCounts] = useState<Record<number, number>>(
        Object.fromEntries(DENOMINATIONS.map(d => [d.value, 0]))
    );
    const [expectedSales, setExpectedSales] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [history, setHistory] = useState<CashClosing[]>([]);
    const [remarks, setRemarks] = useState('');
    const [cashSaved, setCashSaved] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    // Inventory state
    const [soldQuantities, setSoldQuantities] = useState<SoldQuantityItem[]>([]);
    const [latestCheck, setLatestCheck] = useState<LatestInventoryCheck | null>(null);
    const [inventoryActuals, setInventoryActuals] = useState<Record<string, number>>({});
    const [inventoryLoading, setInventoryLoading] = useState(false);
    const [inventorySaved, setInventorySaved] = useState(false);
    const [inventoryRemarks, setInventoryRemarks] = useState('');
    const [isInventorySaving, setIsInventorySaving] = useState(false);

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

    const getInventoryKey = (productId: string, variantId: string | null) =>
        variantId ? `${productId}:${variantId}` : productId;

    // Build inventory check items: chain from latest check or initial stock
    const inventoryItems = useMemo(() => {
        if (!inventoryEnabled || merchProducts.length === 0) return [];

        // Build a lookup from previous check's actual values
        const prevActualMap = new Map<string, number>();
        if (latestCheck) {
            for (const item of latestCheck.checkItems) {
                const key = getInventoryKey(item.productId, item.variantId);
                prevActualMap.set(key, item.actualRemaining);
            }
        }

        // Build a lookup from sold quantities
        const soldMap = new Map<string, number>();
        for (const sq of soldQuantities) {
            const key = getInventoryKey(sq.productId, sq.variantId);
            soldMap.set(key, sq.totalSold);
        }

        const items: {
            productId: string;
            productName: string;
            variantId: string | null;
            variantName: string | null;
            initialStock: number;
            baseStock: number;
            baseSource: 'INITIAL' | 'PREVIOUS_CHECK';
            soldSinceBase: number;
            expectedRemaining: number;
        }[] = [];

        for (const product of merchProducts) {
            if (!product.isActive) continue;

            if (product.hasVariants && product.variants.length > 0) {
                for (const variant of product.variants) {
                    if (!variant.isActive) continue;
                    const key = getInventoryKey(product.id, variant.id);
                    const prevActual = prevActualMap.get(key);
                    const sold = soldMap.get(key) || 0;

                    const hasPrevCheck = prevActual !== undefined;
                    const baseStock = hasPrevCheck ? prevActual : variant.stock;
                    const baseSource = hasPrevCheck ? 'PREVIOUS_CHECK' as const : 'INITIAL' as const;

                    items.push({
                        productId: product.id,
                        productName: product.name,
                        variantId: variant.id,
                        variantName: variant.name,
                        initialStock: variant.stock,
                        baseStock,
                        baseSource,
                        soldSinceBase: sold,
                        expectedRemaining: baseStock - sold,
                    });
                }
            } else {
                const key = getInventoryKey(product.id, null);
                const prevActual = prevActualMap.get(key);
                const sold = soldMap.get(key) || 0;

                const hasPrevCheck = prevActual !== undefined;
                const baseStock = hasPrevCheck ? prevActual : product.stock;
                const baseSource = hasPrevCheck ? 'PREVIOUS_CHECK' as const : 'INITIAL' as const;

                items.push({
                    productId: product.id,
                    productName: product.name,
                    variantId: null,
                    variantName: null,
                    initialStock: product.stock,
                    baseStock,
                    baseSource,
                    soldSinceBase: sold,
                    expectedRemaining: baseStock - sold,
                });
            }
        }

        return items;
    }, [inventoryEnabled, merchProducts, soldQuantities, latestCheck]);

    const updateActualCount = (key: string, value: number) => {
        setInventoryActuals(prev => ({ ...prev, [key]: value }));
        setIsDirty(true);
    };

    const buildInventoryCheckData = (): InventoryCheckItem[] => {
        return inventoryItems.map(item => {
            const key = getInventoryKey(item.productId, item.variantId);
            const actual = inventoryActuals[key] ?? item.expectedRemaining;
            return {
                productId: item.productId,
                productName: item.productName,
                variantId: item.variantId,
                variantName: item.variantName,
                expectedRemaining: item.expectedRemaining,
                actualRemaining: actual,
                discrepancy: actual - item.expectedRemaining,
                baseStock: item.baseStock,
                baseSource: item.baseSource,
                soldSinceBase: item.soldSinceBase,
            };
        });
    };

    // Load inventory data with chain logic
    const loadInventoryData = useCallback(async () => {
        if (!inventoryEnabled || merchProducts.length === 0) return;

        setInventoryLoading(true);
        try {
            // 1. Get the latest inventory check across all performances
            const latest = await getLatestInventoryCheckClient(productionId, userId);
            setLatestCheck(latest);

            // 2. Get sold quantities based on whether we have a previous check
            let sold: SoldQuantityItem[];
            if (latest) {
                // Get sales SINCE the last check
                sold = await getMerchandiseSoldQuantitiesSinceClient(productionId, userId, latest.checkedAt);
            } else {
                // No previous check: get ALL sales across ALL performances
                sold = await getMerchandiseSoldQuantitiesAllClient(productionId, userId);
            }
            setSoldQuantities(sold);
        } catch (err) {
            console.error('在庫データ取得エラー:', err);
        } finally {
            setInventoryLoading(false);
        }
    }, [productionId, userId, inventoryEnabled, merchProducts.length]);

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

            // Load inventory data with chain logic
            await loadInventoryData();
        } catch (err: unknown) {
            console.error('データ取得エラー:', err);
            showToast('データの取得に失敗しました', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [performanceId, productionId, userId, expectedSalesOverride, hideHistory, loadInventoryData]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Save cash close (金額精算のみ)
    const handleCashSave = async () => {
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

            setCashSaved(true);
            setIsDirty(false);
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

    // Save inventory check (在庫チェックのみ)
    const handleInventorySave = async () => {
        if (!confirm('在庫チェックを確定しますか？')) return;

        setIsInventorySaving(true);
        try {
            const inventoryCheck = buildInventoryCheckData();

            await saveCashClosingClient({
                productionId,
                performanceId,
                userId,
                closedBy,
                closedByType,
                changeFloat: 0,
                denominations: [],
                cashTotal: 0,
                expectedSales: 0,
                actualSales: 0,
                discrepancy: 0,
                inventoryCheck,
                remarks: inventoryRemarks ? `【在庫チェック】${inventoryRemarks}` : '【在庫チェック】',
            });

            setInventorySaved(true);
            setIsDirty(false);
            showToast('在庫チェックを保存しました', 'success');
        } catch (err: unknown) {
            console.error('保存エラー:', err);
            showToast('在庫チェックの保存に失敗しました', 'error');
        } finally {
            setIsInventorySaving(false);
        }
    };

    const updateCount = (denomination: number, value: number) => {
        setCounts(prev => ({ ...prev, [denomination]: value }));
        setIsDirty(true);
    };

    // Inventory summary stats (must be before early returns)
    const inventorySummary = useMemo(() => {
        if (inventoryItems.length === 0) return null;
        let totalDiscrepancy = 0;
        let itemsWithDiscrepancy = 0;
        for (const item of inventoryItems) {
            const key = getInventoryKey(item.productId, item.variantId);
            const actual = inventoryActuals[key] ?? item.expectedRemaining;
            const diff = actual - item.expectedRemaining;
            totalDiscrepancy += diff;
            if (diff !== 0) itemsWithDiscrepancy++;
        }
        return { totalDiscrepancy, itemsWithDiscrepancy };
    }, [inventoryItems, inventoryActuals]);

    if (isLoading) {
        return <div className="flex-center" style={{ padding: '3rem' }}>読み込み中...</div>;
    }

    const showInventoryTab = inventoryEnabled && inventoryItems.length > 0;

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
                        {h.inventoryCheck && h.inventoryCheck.length > 0 && (
                            <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                在庫チェック済み（{h.inventoryCheck.length}品目）
                            </div>
                        )}
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

    // ── Cash saved view ──
    if (cashSaved && activeSubTab === 'CASH') {
        return (
            <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                {/* Sub tabs */}
                {showInventoryTab && renderSubTabs()}

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
                            onClick={() => setCashSaved(false)}
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

    // ── Inventory saved view ──
    if (inventorySaved && activeSubTab === 'INVENTORY') {
        return (
            <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                {showInventoryTab && renderSubTabs()}

                <div className="card" style={{ padding: '3rem', textAlign: 'center', borderTop: '4px solid var(--success)' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>&#10003;</div>
                    <h2 style={{ fontSize: '1.3rem', fontWeight: 'bold', marginBottom: '1rem' }}>在庫チェック完了</h2>
                    <div style={{ fontSize: '0.95rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: '1.8' }}>
                        <p>{inventoryItems.length}品目の在庫チェックを保存しました</p>
                    </div>
                    <button
                        className="btn btn-secondary"
                        onClick={() => {
                            setInventorySaved(false);
                            setInventoryActuals({});
                            setInventoryRemarks('');
                            // Reload with chain logic
                            loadInventoryData();
                        }}
                        style={{ padding: '0.75rem 2rem' }}
                    >
                        もう一度在庫チェックする
                    </button>
                </div>
            </div>
        );
    }

    function renderSubTabs() {
        return (
            <div style={{
                display: 'flex',
                gap: '0',
                marginBottom: '1.5rem',
                borderRadius: '10px',
                overflow: 'hidden',
                border: '1px solid var(--card-border)',
            }}>
                <button
                    type="button"
                    onClick={() => setActiveSubTab('CASH')}
                    style={{
                        flex: 1,
                        padding: '0.75rem',
                        border: 'none',
                        background: activeSubTab === 'CASH' ? 'var(--primary)' : 'var(--card-bg)',
                        color: activeSubTab === 'CASH' ? '#fff' : 'var(--foreground)',
                        fontWeight: activeSubTab === 'CASH' ? '700' : '500',
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        position: 'relative',
                    }}
                >
                    金額精算
                    {cashSaved && (
                        <span style={{ marginLeft: '0.35rem', fontSize: '0.75rem', color: activeSubTab === 'CASH' ? '#90ee90' : 'var(--success)' }}>&#10003;</span>
                    )}
                </button>
                <button
                    type="button"
                    onClick={() => setActiveSubTab('INVENTORY')}
                    style={{
                        flex: 1,
                        padding: '0.75rem',
                        border: 'none',
                        borderLeft: '1px solid var(--card-border)',
                        background: activeSubTab === 'INVENTORY' ? 'var(--primary)' : 'var(--card-bg)',
                        color: activeSubTab === 'INVENTORY' ? '#fff' : 'var(--foreground)',
                        fontWeight: activeSubTab === 'INVENTORY' ? '700' : '500',
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                    }}
                >
                    在庫チェック
                    {inventorySaved && (
                        <span style={{ marginLeft: '0.35rem', fontSize: '0.75rem', color: activeSubTab === 'INVENTORY' ? '#90ee90' : 'var(--success)' }}>&#10003;</span>
                    )}
                </button>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            {/* Sub tabs (only if inventory enabled) */}
            {showInventoryTab && renderSubTabs()}

            {/* ====== CASH TAB ====== */}
            {activeSubTab === 'CASH' && (
                <>
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
                                {ticketSales !== undefined && merchandiseSales !== undefined ? (
                                    <>
                                        {ticketSales > 0 && (
                                            <tr>
                                                <td style={{ padding: '0.35rem 0', color: 'var(--slate-600)', fontSize: '0.9rem' }}>チケット売上</td>
                                                <td style={{ padding: '0.35rem 0', textAlign: 'right', fontSize: '0.9rem' }}>
                                                    {formatCurrency(ticketSales)}
                                                </td>
                                            </tr>
                                        )}
                                        <tr>
                                            <td style={{ padding: '0.35rem 0', color: 'var(--slate-600)', fontSize: '0.9rem' }}>物販売上</td>
                                            <td style={{ padding: '0.35rem 0', textAlign: 'right', fontSize: '0.9rem' }}>
                                                {formatCurrency(merchandiseSales)}
                                            </td>
                                        </tr>
                                        {ticketSales > 0 && (
                                            <tr style={{ borderTop: '1px solid var(--card-border)' }}>
                                                <td style={{ padding: '0.5rem 0', fontWeight: '600' }}>売上合計</td>
                                                <td style={{ padding: '0.5rem 0', textAlign: 'right', fontWeight: '600' }}>
                                                    {formatCurrency(expectedSales)}
                                                </td>
                                            </tr>
                                        )}
                                    </>
                                ) : (
                                    <tr>
                                        <td style={{ padding: '0.5rem 0', color: 'var(--slate-600)' }}>売上合計</td>
                                        <td style={{ padding: '0.5rem 0', textAlign: 'right', fontWeight: '600' }}>
                                            {formatCurrency(expectedSales)}
                                        </td>
                                    </tr>
                                )}
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
                        onClick={handleCashSave}
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
                </>
            )}

            {/* ====== INVENTORY TAB ====== */}
            {activeSubTab === 'INVENTORY' && showInventoryTab && (
                <>
                    <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>在庫チェック</h3>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem', marginTop: 0 }}>
                            各商品の実際の残数を入力してください。金額精算とは独立して保存できます。
                        </p>

                        {/* 基準情報 */}
                        <div style={{
                            padding: '0.75rem 1rem',
                            borderRadius: '8px',
                            background: latestCheck ? '#e3f2fd' : '#f5f5f5',
                            marginBottom: '1rem',
                            fontSize: '0.8rem',
                            color: 'var(--slate-600)',
                        }}>
                            {latestCheck ? (
                                <>
                                    <span style={{ fontWeight: '600' }}>前回チェック:</span>{' '}
                                    {formatDateTime(latestCheck.checkedAt.toISOString())}
                                    <br />
                                    <span style={{ fontSize: '0.75rem' }}>前回の実数を基準に、それ以降の販売数を差し引いて予想残数を計算しています</span>
                                </>
                            ) : (
                                <>
                                    <span style={{ fontWeight: '600' }}>初回チェック</span>
                                    <br />
                                    <span style={{ fontSize: '0.75rem' }}>初期在庫から全公演の累計販売数を差し引いて予想残数を計算しています</span>
                                </>
                            )}
                        </div>

                        {/* 差異サマリー */}
                        {inventorySummary && (
                            <div style={{
                                padding: '0.75rem 1rem',
                                borderRadius: '8px',
                                background: inventorySummary.totalDiscrepancy === 0 ? '#e8f5e9' : inventorySummary.totalDiscrepancy > 0 ? '#e3f2fd' : '#ffebee',
                                marginBottom: '1rem',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: '500' }}>差異合計</span>
                                <span style={{
                                    fontSize: '1.1rem',
                                    fontWeight: '900',
                                    color: inventorySummary.totalDiscrepancy === 0 ? 'var(--success)' : inventorySummary.totalDiscrepancy > 0 ? '#1565c0' : 'var(--accent)',
                                }}>
                                    {inventorySummary.totalDiscrepancy === 0
                                        ? '全品一致'
                                        : `${inventorySummary.totalDiscrepancy > 0 ? '+' : ''}${inventorySummary.totalDiscrepancy}個（${inventorySummary.itemsWithDiscrepancy}品目）`
                                    }
                                </span>
                            </div>
                        )}

                        {inventoryLoading ? (
                            <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>販売データ読み込み中...</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {inventoryItems.map((item) => {
                                    const key = getInventoryKey(item.productId, item.variantId);
                                    const actual = inventoryActuals[key] ?? item.expectedRemaining;
                                    const diff = actual - item.expectedRemaining;
                                    return (
                                        <div key={key} style={{
                                            display: 'grid',
                                            gridTemplateColumns: '1fr auto auto',
                                            alignItems: 'center',
                                            gap: '0.75rem',
                                            padding: '0.5rem 0',
                                            borderBottom: '1px solid var(--card-border)',
                                        }}>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontSize: '0.9rem', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {item.productName}
                                                    {item.variantName && (
                                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.25rem' }}>
                                                            ({item.variantName})
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                                                    {item.baseSource === 'PREVIOUS_CHECK'
                                                        ? `前回実数: ${item.baseStock}`
                                                        : `初期在庫: ${item.baseStock}`
                                                    }
                                                    {' → '}販売: {item.soldSinceBase}{' → '}予想残: {item.expectedRemaining}
                                                </div>
                                            </div>
                                            <NumberStepper
                                                value={actual}
                                                min={0}
                                                max={9999}
                                                onChange={(val) => updateActualCount(key, val)}
                                                label="個"
                                            />
                                            <div style={{
                                                minWidth: '50px',
                                                textAlign: 'right',
                                                fontSize: '0.85rem',
                                                fontWeight: 'bold',
                                                color: diff === 0 ? 'var(--success)' : diff > 0 ? '#1565c0' : 'var(--accent)',
                                            }}>
                                                {diff === 0 ? '一致' : diff > 0 ? `+${diff}` : `${diff}`}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* 在庫チェック備考 */}
                    <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
                        <label style={{ fontSize: '0.9rem', fontWeight: '500', display: 'block', marginBottom: '0.5rem' }}>
                            備考（任意）
                        </label>
                        <textarea
                            className="input"
                            rows={2}
                            placeholder="在庫に関するメモがあれば入力..."
                            value={inventoryRemarks}
                            onChange={(e) => { setInventoryRemarks(e.target.value); setIsDirty(true); }}
                            style={{ resize: 'vertical' }}
                        />
                    </div>

                    {/* 在庫チェック確定ボタン */}
                    <button
                        className="btn btn-primary"
                        onClick={handleInventorySave}
                        disabled={isInventorySaving}
                        style={{
                            width: '100%',
                            padding: '1rem',
                            fontSize: '1.1rem',
                            borderRadius: '12px',
                            marginBottom: '2rem',
                        }}
                    >
                        {isInventorySaving ? '保存中...' : '在庫チェックを確定する'}
                    </button>
                </>
            )}
        </div>
    );
}
