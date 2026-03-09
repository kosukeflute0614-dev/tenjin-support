'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ShoppingCart, Check, Trash2, ChevronDown, ChevronUp, Minus, Plus, X, Calculator } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { createMerchandiseSaleClient, subscribeMerchandiseSales, cancelMerchandiseSaleClient, partialCancelMerchandiseSaleClient } from '@/lib/client-firestore/merchandise-sales';
import type { MerchandiseCancellationItem } from '@/types';
import { formatCurrency } from '@/lib/format';
import { formatTime } from '@/lib/format';
import type { MerchandiseProduct, MerchandiseSet, MerchandiseSale, MerchandiseSaleItem } from '@/types';
import styles from '@/components/merchandise-sales.module.css';

interface Props {
    productionId: string;
    performanceId: string;
    userId: string;
    products: MerchandiseProduct[];
    sets: MerchandiseSet[];
    soldBy: string;
    soldByType: 'ORGANIZER' | 'STAFF';
}

interface CartItem {
    productId: string;
    productName: string;
    variantId: string | null;
    variantName: string | null;
    unitPrice: number;
    quantity: number;
}

function calculateSetDiscounts(
    cartItems: CartItem[],
    sets: MerchandiseSet[],
): { setId: string; setName: string; discountAmount: number }[] {
    const discounts: { setId: string; setName: string; discountAmount: number }[] = [];
    if (!sets || sets.length === 0) return discounts;

    for (const set of sets) {
        if (!set.isActive) continue;

        // タイプ指定ありのキー別数量
        const variantQuantities = new Map<string, number>();
        // productId別の合計数量（タイプ指定なしのセットアイテム用）
        const productQuantities = new Map<string, number>();
        for (const item of cartItems) {
            const vKey = item.variantId ? `${item.productId}:${item.variantId}` : item.productId;
            variantQuantities.set(vKey, (variantQuantities.get(vKey) || 0) + item.quantity);
            productQuantities.set(item.productId, (productQuantities.get(item.productId) || 0) + item.quantity);
        }

        // セットが何回適用できるか計算（各アイテムの available / required の最小値）
        let timesApplicable = Infinity;
        let regularTotal = 0;
        for (const setItem of set.items) {
            let available: number;
            if (setItem.variantId) {
                const key = `${setItem.productId}:${setItem.variantId}`;
                available = variantQuantities.get(key) || 0;
            } else {
                available = productQuantities.get(setItem.productId) || 0;
            }

            timesApplicable = Math.min(timesApplicable, Math.floor(available / setItem.quantity));
            if (timesApplicable === 0) break;

            const cartItem = cartItems.find(i =>
                i.productId === setItem.productId &&
                (setItem.variantId ? i.variantId === setItem.variantId : true)
            );
            if (cartItem) {
                regularTotal += cartItem.unitPrice * setItem.quantity;
            }
        }

        const discountPerSet = regularTotal - set.setPrice;
        if (timesApplicable > 0 && discountPerSet > 0) {
            discounts.push({
                setId: set.id,
                setName: set.name,
                discountAmount: discountPerSet * timesApplicable,
            });
        }
    }

    return discounts;
}

export default function MerchandiseSalesForm({
    productionId,
    performanceId,
    userId,
    products,
    sets,
    soldBy,
    soldByType,
}: Props) {
    const { showToast } = useToast();

    const [cart, setCart] = useState<CartItem[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [variantProduct, setVariantProduct] = useState<MerchandiseProduct | null>(null);
    const [variantQuantity, setVariantQuantity] = useState(1);
    const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
    const [showSuccessFlash, setShowSuccessFlash] = useState(false);
    const [salesHistory, setSalesHistory] = useState<MerchandiseSale[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [showCalc, setShowCalc] = useState(false);
    const [calcInput, setCalcInput] = useState('');
    const [cancelTarget, setCancelTarget] = useState<MerchandiseSale | null>(null);
    const [cancelQuantities, setCancelQuantities] = useState<Record<string, number>>({});
    const [cancelSubmitting, setCancelSubmitting] = useState(false);
    const cartRef = useRef<HTMLDivElement>(null);
    const calcPopoverRef = useRef<HTMLDivElement>(null);
    const [calcPos, setCalcPos] = useState<{ top: number; right: number } | null>(null);
    const calcInputNum = useMemo(() => {
        const n = parseInt(calcInput, 10);
        return isNaN(n) ? 0 : n;
    }, [calcInput]);

    // Desktop: position calculator to the left of the cart sidebar
    useEffect(() => {
        if (!showCalc || !cartRef.current) return;
        const updatePos = () => {
            if (!cartRef.current) return;
            const rect = cartRef.current.getBoundingClientRect();
            // Place popover to the left of the cart, vertically centered with cart top
            const popoverWidth = 290;
            const top = Math.max(8, rect.top);
            const right = window.innerWidth - rect.left + 12;
            setCalcPos({ top, right });
        };
        updatePos();
        window.addEventListener('scroll', updatePos, true);
        window.addEventListener('resize', updatePos);
        return () => {
            window.removeEventListener('scroll', updatePos, true);
            window.removeEventListener('resize', updatePos);
        };
    }, [showCalc]);

    // Desktop only: close on click outside
    useEffect(() => {
        if (!showCalc) return;
        // Only attach on desktop (mobile uses overlay backdrop)
        if (window.innerWidth <= 768) return;
        const handler = (e: MouseEvent) => {
            if (calcPopoverRef.current && !calcPopoverRef.current.contains(e.target as Node)) {
                setShowCalc(false);
            }
        };
        // Use setTimeout to avoid closing immediately on the same click that opened it
        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handler);
        }, 0);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('mousedown', handler);
        };
    }, [showCalc]);

    // Desktop: accept keyboard numpad/number input while calc is open
    useEffect(() => {
        if (!showCalc) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key >= '0' && e.key <= '9') {
                e.preventDefault();
                setCalcInput(prev => {
                    if (prev === '0') return e.key;
                    return prev + e.key;
                });
            } else if (e.key === 'Backspace') {
                e.preventDefault();
                setCalcInput(prev => prev.slice(0, -1));
            } else if (e.key === 'Delete' || e.key === 'Escape') {
                e.preventDefault();
                if (e.key === 'Escape') setShowCalc(false);
                else setCalcInput('');
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [showCalc]);

    // Subscribe to sales history
    useEffect(() => {
        const unsub = subscribeMerchandiseSales(performanceId, productionId, userId, (sales) => {
            setSalesHistory(sales);
        }, 10);
        return unsub;
    }, [performanceId, productionId, userId]);

    // Category extraction
    const categories = useMemo(() => {
        const cats = new Set<string>();
        products.filter(p => p.isActive).forEach(p => {
            if (p.category) cats.add(p.category);
        });
        return Array.from(cats);
    }, [products]);

    // Filtered products
    const filteredProducts = useMemo(() => {
        return products
            .filter(p => p.isActive)
            .filter(p => !selectedCategory || p.category === selectedCategory);
    }, [products, selectedCategory]);

    // Cart calculations
    const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const setDiscounts = calculateSetDiscounts(cart, sets);
    const totalDiscount = setDiscounts.reduce((sum, d) => sum + d.discountAmount, 0);
    const totalAmount = subtotal - totalDiscount;
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

    // Add product to cart (no variants)
    const addToCart = useCallback((product: MerchandiseProduct) => {
        if (!product.isSellableAlone) {
            showToast('この商品はセット専用です', 'warning');
            return;
        }

        if (product.hasVariants && product.variants.length > 0) {
            setVariantProduct(product);
            setVariantQuantity(1);
            setSelectedVariantId(null);
            return;
        }

        setCart(prev => {
            const existing = prev.find(
                item => item.productId === product.id && item.variantId === null
            );
            if (existing) {
                return prev.map(item =>
                    item.productId === product.id && item.variantId === null
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            }
            return [
                ...prev,
                {
                    productId: product.id,
                    productName: product.name,
                    variantId: null,
                    variantName: null,
                    unitPrice: product.price,
                    quantity: 1,
                },
            ];
        });
    }, [showToast]);

    // Add variant to cart
    const addVariantToCart = useCallback(() => {
        if (!variantProduct || !selectedVariantId) return;

        const variant = variantProduct.variants.find(v => v.id === selectedVariantId);
        if (!variant) return;

        setCart(prev => {
            const existing = prev.find(
                item => item.productId === variantProduct.id && item.variantId === variant.id
            );
            if (existing) {
                return prev.map(item =>
                    item.productId === variantProduct.id && item.variantId === variant.id
                        ? { ...item, quantity: item.quantity + variantQuantity }
                        : item
                );
            }
            return [
                ...prev,
                {
                    productId: variantProduct.id,
                    productName: variantProduct.name,
                    variantId: variant.id,
                    variantName: variant.name,
                    unitPrice: variant.price,
                    quantity: variantQuantity,
                },
            ];
        });

        setVariantProduct(null);
        setSelectedVariantId(null);
        setVariantQuantity(1);
    }, [variantProduct, selectedVariantId, variantQuantity]);

    // Update cart item quantity
    const updateQuantity = useCallback((productId: string, variantId: string | null, delta: number) => {
        setCart(prev => {
            return prev
                .map(item => {
                    if (item.productId === productId && item.variantId === variantId) {
                        return { ...item, quantity: item.quantity + delta };
                    }
                    return item;
                })
                .filter(item => item.quantity > 0);
        });
    }, []);

    // Remove item from cart
    const removeFromCart = useCallback((productId: string, variantId: string | null) => {
        setCart(prev => prev.filter(
            item => !(item.productId === productId && item.variantId === variantId)
        ));
    }, []);

    // Submit sale
    const handleSubmit = useCallback(async () => {
        if (cart.length === 0 || submitting) return;

        setSubmitting(true);
        try {
            const items: MerchandiseSaleItem[] = cart.map(item => ({
                productId: item.productId,
                productName: item.productName,
                variantId: item.variantId,
                variantName: item.variantName,
                quantity: item.quantity,
                canceledQuantity: 0,
                unitPrice: item.unitPrice,
                subtotal: item.unitPrice * item.quantity,
            }));

            await createMerchandiseSaleClient({
                productionId,
                performanceId,
                userId,
                items,
                sets,
                soldBy,
                soldByType,
            });

            // Success flash
            setShowSuccessFlash(true);
            setTimeout(() => setShowSuccessFlash(false), 800);

            setCart([]);
            setCalcInput('');
            setShowCalc(false);
            showToast('販売を記録しました', 'success');
        } catch (err) {
            console.error('Sale submission failed:', err);
            showToast('販売の記録に失敗しました', 'error');
        } finally {
            setSubmitting(false);
        }
    }, [cart, submitting, productionId, performanceId, userId, sets, soldBy, soldByType, showToast]);

    // Open cancel dialog
    const openCancelDialog = useCallback((sale: MerchandiseSale) => {
        // Initialize cancel quantities: default to max cancelable for each item
        const initQty: Record<string, number> = {};
        for (const item of sale.items) {
            const cancelable = item.quantity - (item.canceledQuantity || 0);
            if (cancelable > 0) {
                const key = item.variantId ? `${item.productId}:${item.variantId}` : item.productId;
                initQty[key] = cancelable;
            }
        }
        setCancelQuantities(initQty);
        setCancelTarget(sale);
    }, []);

    // Full cancel (all items)
    const handleFullCancel = useCallback(async (saleId: string) => {
        try {
            await cancelMerchandiseSaleClient(saleId, soldBy, soldByType);
            showToast('全額キャンセルしました', 'success');
            setCancelTarget(null);
        } catch (err) {
            console.error('Sale cancellation failed:', err);
            showToast('キャンセルに失敗しました', 'error');
        }
    }, [soldBy, soldByType, showToast]);

    // Partial cancel (selected items/quantities)
    const handlePartialCancel = useCallback(async () => {
        if (!cancelTarget || cancelSubmitting) return;

        const cancelItems: MerchandiseCancellationItem[] = [];
        for (const item of cancelTarget.items) {
            const key = item.variantId ? `${item.productId}:${item.variantId}` : item.productId;
            const qty = cancelQuantities[key] || 0;
            if (qty > 0) {
                cancelItems.push({
                    productId: item.productId,
                    variantId: item.variantId,
                    quantity: qty,
                });
            }
        }

        if (cancelItems.length === 0) {
            showToast('キャンセルする商品を選択してください', 'warning');
            return;
        }

        // 全品・全数キャンセルなら全額キャンセル扱い
        const isFullCancel = cancelTarget.items.every(item => {
            const key = item.variantId ? `${item.productId}:${item.variantId}` : item.productId;
            const cancelQty = cancelQuantities[key] || 0;
            return cancelQty >= (item.quantity - (item.canceledQuantity || 0));
        });

        setCancelSubmitting(true);
        try {
            if (isFullCancel && !cancelTarget.cancellations?.length) {
                // まだ一度も部分キャンセルしていない + 全品 → シンプルな全額キャンセル
                await cancelMerchandiseSaleClient(cancelTarget.id, soldBy, soldByType);
            } else {
                await partialCancelMerchandiseSaleClient({
                    saleId: cancelTarget.id,
                    cancelItems,
                    canceledBy: soldBy,
                    canceledByType: soldByType,
                    sets,
                });
            }
            showToast(isFullCancel ? '全額キャンセルしました' : '部分キャンセルしました', 'success');
            setCancelTarget(null);
        } catch (err) {
            console.error('Cancellation failed:', err);
            showToast('キャンセルに失敗しました', 'error');
        } finally {
            setCancelSubmitting(false);
        }
    }, [cancelTarget, cancelQuantities, cancelSubmitting, soldBy, soldByType, sets, showToast]);

    // Format sale time
    const formatSaleTime = (sale: MerchandiseSale): string => {
        if (!sale.createdAt) return '';
        return formatTime(sale.createdAt);
    };

    // Format sale items summary
    const formatSaleItems = (sale: MerchandiseSale): string => {
        return sale.items
            .map(item => {
                const name = item.variantName
                    ? `${item.productName}(${item.variantName})`
                    : item.productName;
                const canceled = item.canceledQuantity || 0;
                const qty = item.quantity;
                if (canceled > 0 && canceled < qty) {
                    return `${name} x${qty}(${canceled}取消)`;
                }
                if (canceled >= qty) {
                    return `${name} x${qty}(全取消)`;
                }
                return qty > 1 ? `${name} x${qty}` : name;
            })
            .join(', ');
    };

    // Render cart items list (shared between desktop sidebar and mobile inline)
    const renderCartItems = () => (
        <>
            {cart.length === 0 ? (
                <div className={styles.cartEmpty}>
                    <ShoppingCart size={32} />
                    <p>カートは空です</p>
                </div>
            ) : (
                <>
                    <div className={styles.cartItems}>
                        {cart.map(item => {
                            const itemKey = `${item.productId}:${item.variantId ?? 'none'}`;
                            return (
                                <div key={itemKey} className={styles.cartItem}>
                                    <div className={styles.cartItemInfo}>
                                        <span className={styles.cartItemName}>
                                            {item.productName}
                                            {item.variantName && (
                                                <span className={styles.cartItemVariant}>
                                                    {item.variantName}
                                                </span>
                                            )}
                                        </span>
                                        <span className={styles.cartItemPrice}>
                                            {formatCurrency(item.unitPrice)}
                                        </span>
                                    </div>
                                    <div className={styles.cartItemActions}>
                                        <div className={styles.quantityStepper}>
                                            <button
                                                type="button"
                                                className={styles.stepperBtn}
                                                onClick={() => updateQuantity(item.productId, item.variantId, -1)}
                                                aria-label="数量を減らす"
                                            >
                                                <Minus size={14} />
                                            </button>
                                            <span className={styles.stepperValue}>{item.quantity}</span>
                                            <button
                                                type="button"
                                                className={styles.stepperBtn}
                                                onClick={() => updateQuantity(item.productId, item.variantId, 1)}
                                                aria-label="数量を増やす"
                                            >
                                                <Plus size={14} />
                                            </button>
                                        </div>
                                        <span className={styles.cartItemSubtotal}>
                                            {formatCurrency(item.unitPrice * item.quantity)}
                                        </span>
                                        <button
                                            type="button"
                                            className={styles.cartItemRemove}
                                            onClick={() => removeFromCart(item.productId, item.variantId)}
                                            aria-label="削除"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Set discounts */}
                    {setDiscounts.length > 0 && (
                        <div className={styles.discountSection}>
                            {setDiscounts.map(d => (
                                <div key={d.setId} className={styles.discountLine}>
                                    <span>{d.setName} 割引</span>
                                    <span>-{formatCurrency(d.discountAmount)}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Totals */}
                    <div className={styles.cartTotals}>
                        {totalDiscount > 0 && (
                            <div className={styles.cartSubtotalLine}>
                                <span>小計</span>
                                <span>{formatCurrency(subtotal)}</span>
                            </div>
                        )}
                        <div className={styles.cartTotalLine}>
                            <span>合計</span>
                            <span>{formatCurrency(totalAmount)}</span>
                        </div>
                    </div>

                    {/* Submit + Calculator */}
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', alignItems: 'stretch' }}>
                        <button
                            type="button"
                            className={styles.submitBtn}
                            onClick={handleSubmit}
                            disabled={submitting || cart.length === 0}
                            style={{ flex: 1, margin: 0 }}
                        >
                            {submitting ? '処理中...' : `販売確定 ${formatCurrency(totalAmount)}`}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setCalcInput(''); setShowCalc(!showCalc); }}
                            style={{
                                padding: '0 0.75rem',
                                background: 'var(--card-bg)',
                                border: '1px solid var(--primary)',
                                borderRadius: 'var(--border-radius)',
                                color: 'var(--primary)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                fontWeight: 'bold',
                                fontSize: '0.85rem',
                                whiteSpace: 'nowrap',
                            }}
                            title="お釣り計算"
                        >
                            <Calculator size={16} />
                        </button>
                    </div>
                </>
            )}
        </>
    );

    // Render sales history
    const renderSalesHistory = () => (
        <div className={styles.historySection}>
            <button
                type="button"
                className={styles.historyToggle}
                onClick={() => setShowHistory(!showHistory)}
            >
                <span>販売履歴</span>
                {showHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {showHistory && (
                <div className={styles.historyList}>
                    {salesHistory.length === 0 ? (
                        <p className={styles.historyEmpty}>まだ販売履歴がありません</p>
                    ) : (
                        salesHistory.map(sale => {
                            const isCanceled = sale.status === 'CANCELED';
                            const isPartial = sale.status === 'PARTIALLY_CANCELED';
                            const hasRemainingItems = sale.items.some(
                                item => (item.quantity - (item.canceledQuantity || 0)) > 0
                            );
                            return (
                                <div
                                    key={sale.id}
                                    className={`${styles.historyItem} ${isCanceled ? styles.historyItemCanceled : ''}`}
                                >
                                    <div className={styles.historyItemHeader}>
                                        <span className={styles.historyTime}>
                                            {formatSaleTime(sale)}
                                        </span>
                                        <div style={{ textAlign: 'right' }}>
                                            {isPartial ? (
                                                <>
                                                    <span className={styles.historyAmount} style={{ textDecoration: 'line-through', color: 'var(--text-muted)', fontSize: '0.75rem', marginRight: '0.35rem' }}>
                                                        {formatCurrency(sale.totalAmount)}
                                                    </span>
                                                    <span className={styles.historyAmount}>
                                                        {formatCurrency(sale.effectiveAmount)}
                                                    </span>
                                                </>
                                            ) : (
                                                <span className={styles.historyAmount}>
                                                    {formatCurrency(sale.totalAmount)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <p className={styles.historyItemSummary}>
                                        {formatSaleItems(sale)}
                                    </p>
                                    {isCanceled && (
                                        <span className={styles.historyCanceledLabel}>キャンセル済み</span>
                                    )}
                                    {isPartial && (
                                        <span className={styles.historyCanceledLabel} style={{ background: '#fff3cd', color: '#856404' }}>
                                            一部キャンセル（返金 {formatCurrency(sale.refundedAmount || 0)}）
                                        </span>
                                    )}
                                    {!isCanceled && hasRemainingItems && (
                                        <button
                                            type="button"
                                            className={styles.historyCancelBtn}
                                            onClick={() => openCancelDialog(sale)}
                                        >
                                            {isPartial ? '追加キャンセル' : 'キャンセル'}
                                        </button>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );

    // Shared calculator content (used by both desktop popover and mobile overlay)
    const renderCalcContent = () => {
        const change = calcInputNum - totalAmount;
        return (
            <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>お釣り計算</span>
                    <button
                        type="button"
                        onClick={() => setShowCalc(false)}
                        style={{
                            background: '#f5f5f5', border: 'none', fontSize: '1.25rem', cursor: 'pointer',
                            color: 'var(--text-muted)', width: '28px', height: '28px', display: 'flex',
                            alignItems: 'center', justifyContent: 'center', borderRadius: '50%', lineHeight: 1, padding: 0,
                        }}
                    >
                        &times;
                    </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.35rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>合計</span>
                    <span style={{ fontWeight: '700', color: 'var(--primary)' }}>{formatCurrency(totalAmount)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--slate-500)' }}>預かり</span>
                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
                        {calcInputNum > 0 ? calcInputNum.toLocaleString() : '0'} <span style={{ fontSize: '0.8rem', fontWeight: 'normal' }}>円</span>
                    </div>
                </div>
                {calcInputNum > 0 && (
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        borderTop: '1px solid var(--card-border)', paddingTop: '0.5rem', marginBottom: '0.75rem',
                    }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--slate-500)' }}>{change >= 0 ? 'お釣り' : '不足'}</span>
                        <div style={{ fontSize: '1.3rem', fontWeight: '900', color: change >= 0 ? 'var(--success)' : 'var(--accent)' }}>
                            &yen;{Math.abs(change).toLocaleString()}
                        </div>
                    </div>
                )}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '0.5rem' }}>
                    {[1000, 5000, 10000].map(amt => (
                        <button
                            key={amt}
                            type="button"
                            className="btn btn-secondary"
                            style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem', background: 'var(--card-bg)' }}
                            onClick={() => setCalcInput(prev => String((parseInt(prev) || 0) + amt))}
                        >
                            +{(amt / 1000).toLocaleString()}千
                        </button>
                    ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                    {['1','2','3','4','5','6','7','8','9','0','00','C'].map(key => (
                        <button
                            key={key}
                            type="button"
                            className="btn btn-secondary"
                            style={{
                                height: '3.2rem', fontSize: '1.15rem', fontWeight: 'bold',
                                background: key === 'C' ? 'rgba(139,0,0,0.05)' : 'var(--card-bg)',
                                color: key === 'C' ? '#d93025' : '#333',
                                border: '1px solid #ddd', borderRadius: '8px',
                            }}
                            onClick={() => {
                                if (key === 'C') { setCalcInput(''); return; }
                                setCalcInput(prev => {
                                    if (key === '00' && (prev === '' || prev === '0')) return '0';
                                    if (prev === '0' && key !== '00') return key;
                                    return prev + key;
                                });
                            }}
                        >
                            {key}
                        </button>
                    ))}
                </div>
            </>
        );
    };

    // Mobile-only calculator overlay (bottom sheet)
    const renderMobileCalculator = () => {
        if (!showCalc || totalAmount <= 0) return null;
        const handleBackdropClick = (e: React.MouseEvent | React.TouchEvent) => {
            // Only close if tapping directly on the backdrop, not on children
            if (e.target === e.currentTarget) {
                setShowCalc(false);
            }
        };
        return (
            <div
                className={styles.calcOverlay}
                onClick={handleBackdropClick}
            >
                <div className={styles.calcPanel}>
                    {renderCalcContent()}
                </div>
            </div>
        );
    };

    return (
        <div className={styles.salesLayout}>
            {/* Left: Product Grid */}
            <div className={styles.productSection}>
                {/* Category pills */}
                {categories.length > 0 && (
                    <div className={styles.categoryFilter}>
                        <button
                            type="button"
                            className={`${styles.categoryPill} ${!selectedCategory ? styles.categoryPillActive : ''}`}
                            onClick={() => setSelectedCategory(null)}
                        >
                            すべて
                        </button>
                        {categories.map(cat => (
                            <button
                                key={cat}
                                type="button"
                                className={`${styles.categoryPill} ${selectedCategory === cat ? styles.categoryPillActive : ''}`}
                                onClick={() => setSelectedCategory(cat)}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                )}

                {/* Product grid */}
                <div className={styles.productGrid}>
                    {filteredProducts.map(product => {
                        const isSetOnly = !product.isSellableAlone;
                        const cartQty = cart
                            .filter(item => item.productId === product.id)
                            .reduce((sum, item) => sum + item.quantity, 0);

                        return (
                            <button
                                key={product.id}
                                type="button"
                                className={`${styles.productCard} ${isSetOnly ? styles.productCardSetOnly : ''}`}
                                onClick={() => addToCart(product)}
                            >
                                <span className={styles.productName}>{product.name}</span>
                                <span className={styles.productPrice}>
                                    {formatCurrency(product.price)}
                                </span>
                                {isSetOnly && (
                                    <span className={styles.setOnlyLabel}>セット専用</span>
                                )}
                                {cartQty > 0 && (
                                    <span className={styles.productBadge}>{cartQty}</span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Mobile inline cart (below product grid) */}
                <div className={styles.mobileCartSection}>
                    <h3 className={styles.cartTitle}>
                        <ShoppingCart size={18} />
                        カート
                        {totalItems > 0 && (
                            <span className={styles.cartCount}>{totalItems}</span>
                        )}
                    </h3>
                    {renderCartItems()}
                    {renderSalesHistory()}
                </div>
            </div>

            {/* Right: Cart (desktop sidebar) */}
            <div className={styles.cart} ref={cartRef}>
                <h3 className={styles.cartTitle}>
                    <ShoppingCart size={18} />
                    カート
                    {totalItems > 0 && (
                        <span className={styles.cartCount}>{totalItems}</span>
                    )}
                </h3>
                {renderCartItems()}
                {renderSalesHistory()}
            </div>

            {/* Variant selection sheet */}
            {variantProduct && (
                <div
                    className={styles.sheetBackdrop}
                    onClick={() => {
                        setVariantProduct(null);
                        setSelectedVariantId(null);
                        setVariantQuantity(1);
                    }}
                >
                    <div
                        className={styles.sheetPanel}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={styles.sheetHeader}>
                            <h3 className={styles.sheetTitle}>{variantProduct.name}</h3>
                            <button
                                type="button"
                                className={styles.sheetClose}
                                onClick={() => {
                                    setVariantProduct(null);
                                    setSelectedVariantId(null);
                                    setVariantQuantity(1);
                                }}
                                aria-label="閉じる"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className={styles.variantGrid}>
                            {variantProduct.variants
                                .filter(v => v.isActive)
                                .map(variant => (
                                    <button
                                        key={variant.id}
                                        type="button"
                                        className={`${styles.variantBtn} ${selectedVariantId === variant.id ? styles.variantBtnActive : ''}`}
                                        onClick={() => setSelectedVariantId(variant.id)}
                                    >
                                        <span className={styles.variantName}>{variant.name}</span>
                                    </button>
                                ))}
                        </div>

                        <div className={styles.variantFooter}>
                            <div className={styles.quantityStepper}>
                                <button
                                    type="button"
                                    className={styles.stepperBtn}
                                    onClick={() => setVariantQuantity(Math.max(1, variantQuantity - 1))}
                                    disabled={variantQuantity <= 1}
                                    aria-label="数量を減らす"
                                >
                                    <Minus size={14} />
                                </button>
                                <span className={styles.stepperValue}>{variantQuantity}</span>
                                <button
                                    type="button"
                                    className={styles.stepperBtn}
                                    onClick={() => setVariantQuantity(variantQuantity + 1)}
                                    aria-label="数量を増やす"
                                >
                                    <Plus size={14} />
                                </button>
                            </div>
                            <button
                                type="button"
                                className={styles.variantAddBtn}
                                onClick={addVariantToCart}
                                disabled={!selectedVariantId}
                            >
                                カートに追加
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Desktop calculator popover (fixed, to the left of cart) */}
            {showCalc && totalAmount > 0 && calcPos && (
                <div
                    ref={calcPopoverRef}
                    className={styles.calcPopover}
                    style={{ top: calcPos.top, right: calcPos.right }}
                >
                    {renderCalcContent()}
                </div>
            )}

            {/* Mobile calculator overlay (bottom sheet, hidden on desktop via CSS) */}
            {renderMobileCalculator()}

            {/* Cancel dialog (bottom sheet) */}
            {cancelTarget && (
                <div
                    className={styles.sheetBackdrop}
                    onClick={() => !cancelSubmitting && setCancelTarget(null)}
                >
                    <div
                        className={styles.sheetPanel}
                        onClick={(e) => e.stopPropagation()}
                        style={{ maxHeight: '80vh', overflow: 'auto' }}
                    >
                        <div className={styles.sheetHeader}>
                            <h3 className={styles.sheetTitle}>キャンセル</h3>
                            <button
                                type="button"
                                className={styles.sheetClose}
                                onClick={() => setCancelTarget(null)}
                                disabled={cancelSubmitting}
                                aria-label="閉じる"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 1rem 0' }}>
                            キャンセルする数量を選択してください
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
                            {cancelTarget.items.map(item => {
                                const key = item.variantId ? `${item.productId}:${item.variantId}` : item.productId;
                                const cancelable = item.quantity - (item.canceledQuantity || 0);
                                if (cancelable <= 0) return null;
                                const cancelQty = cancelQuantities[key] || 0;

                                return (
                                    <div key={key} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '0.5rem 0', borderBottom: '1px solid var(--card-border)',
                                    }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.9rem', fontWeight: '500' }}>
                                                {item.productName}
                                                {item.variantName && (
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.25rem' }}>
                                                        ({item.variantName})
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                {formatCurrency(item.unitPrice)} × 残{cancelable}点
                                            </div>
                                        </div>
                                        <div className={styles.quantityStepper}>
                                            <button
                                                type="button"
                                                className={styles.stepperBtn}
                                                onClick={() => setCancelQuantities(prev => ({
                                                    ...prev, [key]: Math.max(0, (prev[key] || 0) - 1)
                                                }))}
                                                disabled={cancelQty <= 0}
                                            >
                                                <Minus size={14} />
                                            </button>
                                            <span className={styles.stepperValue}>{cancelQty}</span>
                                            <button
                                                type="button"
                                                className={styles.stepperBtn}
                                                onClick={() => setCancelQuantities(prev => ({
                                                    ...prev, [key]: Math.min(cancelable, (prev[key] || 0) + 1)
                                                }))}
                                                disabled={cancelQty >= cancelable}
                                            >
                                                <Plus size={14} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Refund estimate */}
                        {(() => {
                            const totalCancelQty = Object.values(cancelQuantities).reduce((s, q) => s + q, 0);
                            const itemRefund = cancelTarget.items.reduce((sum, item) => {
                                const key = item.variantId ? `${item.productId}:${item.variantId}` : item.productId;
                                return sum + item.unitPrice * (cancelQuantities[key] || 0);
                            }, 0);
                            return totalCancelQty > 0 ? (
                                <div style={{
                                    padding: '0.75rem 1rem', borderRadius: '8px',
                                    background: '#fff3e0', marginBottom: '1rem',
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                        <span style={{ color: 'var(--text-muted)' }}>取消商品合計</span>
                                        <span style={{ fontWeight: '600' }}>{formatCurrency(itemRefund)}</span>
                                    </div>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>
                                        ※セット割引の再計算により、実際の返金額は変動する場合があります
                                    </p>
                                </div>
                            ) : null;
                        })()}

                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setCancelTarget(null)}
                                disabled={cancelSubmitting}
                                style={{ flex: 1, padding: '0.75rem' }}
                            >
                                戻る
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handlePartialCancel}
                                disabled={cancelSubmitting || Object.values(cancelQuantities).every(q => q === 0)}
                                style={{
                                    flex: 1, padding: '0.75rem',
                                    background: '#d32f2f', borderColor: '#d32f2f',
                                }}
                            >
                                {cancelSubmitting ? '処理中...' : 'キャンセル確定'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Success flash */}
            {showSuccessFlash && (
                <div className={styles.successFlash}>
                    <div className={styles.successFlashIcon}>
                        <Check size={40} color="#22c55e" />
                    </div>
                </div>
            )}
        </div>
    );
}
