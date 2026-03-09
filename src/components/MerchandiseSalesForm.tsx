'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ShoppingCart, Check, Trash2, ChevronDown, ChevronUp, Minus, Plus, X } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { createMerchandiseSaleClient, subscribeMerchandiseSales, cancelMerchandiseSaleClient } from '@/lib/client-firestore/merchandise-sales';
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
    inventoryEnabled: boolean;
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

        const itemQuantities = new Map<string, number>();
        for (const item of cartItems) {
            const key = item.variantId ? `${item.productId}:${item.variantId}` : item.productId;
            itemQuantities.set(key, (itemQuantities.get(key) || 0) + item.quantity);
        }

        let canApply = true;
        let regularTotal = 0;
        for (const setItem of set.items) {
            const key = setItem.variantId ? `${setItem.productId}:${setItem.variantId}` : setItem.productId;
            const available = itemQuantities.get(key) || 0;
            if (available < setItem.quantity) {
                canApply = false;
                break;
            }
            const cartItem = cartItems.find(i =>
                i.productId === setItem.productId &&
                (setItem.variantId ? i.variantId === setItem.variantId : true)
            );
            if (cartItem) {
                regularTotal += cartItem.unitPrice * setItem.quantity;
            }
        }

        if (canApply && regularTotal > set.setPrice) {
            discounts.push({
                setId: set.id,
                setName: set.name,
                discountAmount: regularTotal - set.setPrice,
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
    inventoryEnabled,
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
    const [showMobileCart, setShowMobileCart] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [cashReceived, setCashReceived] = useState('');
    const cashReceivedNum = useMemo(() => {
        const n = parseInt(cashReceived, 10);
        return isNaN(n) ? 0 : n;
    }, [cashReceived]);

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
                        const newQty = item.quantity + delta;
                        return { ...item, quantity: newQty };
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
            setCashReceived('');
            setShowMobileCart(false);
            showToast('販売を記録しました', 'success');
        } catch (err) {
            console.error('Sale submission failed:', err);
            showToast('販売の記録に失敗しました', 'error');
        } finally {
            setSubmitting(false);
        }
    }, [cart, submitting, productionId, performanceId, userId, sets, soldBy, soldByType, showToast]);

    // Cancel sale
    const handleCancelSale = useCallback(async (saleId: string) => {
        try {
            await cancelMerchandiseSaleClient(saleId, soldBy, soldByType);
            showToast('販売をキャンセルしました', 'success');
        } catch (err) {
            console.error('Sale cancellation failed:', err);
            showToast('キャンセルに失敗しました', 'error');
        }
    }, [soldBy, soldByType, showToast]);

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
                return item.quantity > 1 ? `${name} x${item.quantity}` : name;
            })
            .join(', ');
    };

    // Cart content (shared between desktop and mobile)
    const renderCartContent = () => (
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

                    {/* Submit button */}
                    <button
                        type="button"
                        className={styles.submitBtn}
                        onClick={() => { setCashReceived(''); setShowConfirmDialog(true); }}
                        disabled={submitting || cart.length === 0}
                    >
                        {submitting ? '処理中...' : `販売確定 ${formatCurrency(totalAmount)}`}
                    </button>
                </>
            )}

            {/* Sales history */}
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
                                return (
                                    <div
                                        key={sale.id}
                                        className={`${styles.historyItem} ${isCanceled ? styles.historyItemCanceled : ''}`}
                                    >
                                        <div className={styles.historyItemHeader}>
                                            <span className={styles.historyTime}>
                                                {formatSaleTime(sale)}
                                            </span>
                                            <span className={styles.historyAmount}>
                                                {formatCurrency(sale.totalAmount)}
                                            </span>
                                        </div>
                                        <p className={styles.historyItemSummary}>
                                            {formatSaleItems(sale)}
                                        </p>
                                        {isCanceled && (
                                            <span className={styles.historyCanceledLabel}>キャンセル済み</span>
                                        )}
                                        {!isCanceled && (
                                            <button
                                                type="button"
                                                className={styles.historyCancelBtn}
                                                onClick={() => handleCancelSale(sale.id)}
                                            >
                                                キャンセル
                                            </button>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>
        </>
    );

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
                                {inventoryEnabled && !product.hasVariants && (
                                    <span className={styles.productStock}>
                                        在庫: {product.stock}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Right: Cart (desktop) */}
            <div className={styles.cart}>
                <h3 className={styles.cartTitle}>
                    <ShoppingCart size={18} />
                    カート
                    {totalItems > 0 && (
                        <span className={styles.cartCount}>{totalItems}</span>
                    )}
                </h3>
                {renderCartContent()}
            </div>

            {/* Mobile floating cart bar */}
            {totalItems > 0 && (
                <div className={styles.floatingCartBar}>
                    <div className={styles.floatingCartInfo}>
                        <span className={styles.floatingCartTotal}>
                            {formatCurrency(totalAmount)}
                        </span>
                        <span className={styles.floatingCartCount}>
                            {totalItems}点
                        </span>
                    </div>
                    <button
                        type="button"
                        className={styles.floatingCartBtn}
                        onClick={() => setShowMobileCart(true)}
                    >
                        カートを見る
                    </button>
                </div>
            )}

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
                                        {inventoryEnabled && (
                                            <span className={styles.variantStock}>
                                                在庫: {variant.stock}
                                            </span>
                                        )}
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

            {/* Mobile cart sheet */}
            {showMobileCart && (
                <div
                    className={styles.sheetBackdrop}
                    onClick={() => setShowMobileCart(false)}
                >
                    <div
                        className={styles.sheetPanel}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={styles.sheetHeader}>
                            <h3 className={styles.sheetTitle}>
                                <ShoppingCart size={18} />
                                カート
                                {totalItems > 0 && (
                                    <span className={styles.cartCount}>{totalItems}</span>
                                )}
                            </h3>
                            <button
                                type="button"
                                className={styles.sheetClose}
                                onClick={() => setShowMobileCart(false)}
                                aria-label="閉じる"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        {renderCartContent()}
                    </div>
                </div>
            )}

            {/* Confirmation Dialog */}
            {showConfirmDialog && (
                <div className={styles.sheetBackdrop} onClick={() => setShowConfirmDialog(false)}>
                    <div className={styles.sheetPanel} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
                        <div className={styles.sheetHeader}>
                            <h3 className={styles.sheetTitle}>販売内容の確認</h3>
                            <button
                                type="button"
                                className={styles.sheetClose}
                                onClick={() => setShowConfirmDialog(false)}
                                aria-label="閉じる"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Items summary */}
                        <div style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
                            {cart.map(item => {
                                const key = `${item.productId}:${item.variantId ?? 'none'}`;
                                return (
                                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid var(--card-border)' }}>
                                        <span>
                                            {item.productName}
                                            {item.variantName && <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}> ({item.variantName})</span>}
                                            {item.quantity > 1 && <span style={{ color: 'var(--text-muted)' }}> x{item.quantity}</span>}
                                        </span>
                                        <span style={{ fontWeight: '500' }}>{formatCurrency(item.unitPrice * item.quantity)}</span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Discounts */}
                        {setDiscounts.length > 0 && (
                            <div style={{ marginBottom: '0.75rem' }}>
                                {setDiscounts.map(d => (
                                    <div key={d.setId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#059669', padding: '0.2rem 0' }}>
                                        <span>{d.setName} 割引</span>
                                        <span>-{formatCurrency(d.discountAmount)}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Total */}
                        <div style={{ textAlign: 'center', padding: '1rem 0', borderTop: '2px solid var(--card-border)', borderBottom: '2px solid var(--card-border)', marginBottom: '1rem' }}>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>合計金額</div>
                            <div style={{ fontSize: '2rem', fontWeight: '900', color: 'var(--primary)' }}>
                                {formatCurrency(totalAmount)}
                            </div>
                        </div>

                        {/* Cash received input */}
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: '500', display: 'block', marginBottom: '0.5rem' }}>お預かり金額</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>¥</span>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    className="input"
                                    placeholder="0"
                                    value={cashReceived}
                                    onChange={(e) => setCashReceived(e.target.value.replace(/[^0-9]/g, ''))}
                                    style={{ fontSize: '1.5rem', textAlign: 'right', fontWeight: '700' }}
                                    autoFocus
                                />
                            </div>
                            {cashReceivedNum > 0 && (
                                <div style={{ marginTop: '0.5rem', textAlign: 'right', fontSize: '1.1rem' }}>
                                    {cashReceivedNum >= totalAmount ? (
                                        <span style={{ color: '#059669', fontWeight: '700' }}>
                                            お釣り: {formatCurrency(cashReceivedNum - totalAmount)}
                                        </span>
                                    ) : (
                                        <span style={{ color: '#dc3545', fontWeight: '600' }}>
                                            不足: {formatCurrency(totalAmount - cashReceivedNum)}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Quick amount buttons */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                            {[totalAmount, 1000, 2000, 3000, 5000, 10000].filter((v, i, arr) => arr.indexOf(v) === i).map(amount => (
                                <button
                                    key={amount}
                                    type="button"
                                    onClick={() => setCashReceived(String(amount))}
                                    style={{
                                        padding: '0.4rem 0.75rem',
                                        border: '1px solid var(--card-border)',
                                        borderRadius: 'var(--border-radius)',
                                        background: cashReceivedNum === amount ? 'var(--primary)' : 'var(--card-bg)',
                                        color: cashReceivedNum === amount ? '#fff' : 'var(--foreground)',
                                        cursor: 'pointer',
                                        fontSize: '0.85rem',
                                        fontWeight: '500',
                                    }}
                                >
                                    {amount === totalAmount ? 'ぴったり' : `¥${amount.toLocaleString()}`}
                                </button>
                            ))}
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setShowConfirmDialog(false)}
                                style={{ flex: 1 }}
                            >
                                戻る
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => {
                                    setShowConfirmDialog(false);
                                    handleSubmit();
                                }}
                                disabled={submitting}
                                style={{ flex: 2, fontSize: '1.05rem', fontWeight: '700' }}
                            >
                                {submitting ? '処理中...' : '確定'}
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
