'use client';

import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/components/Toast';
import {
    createMerchandiseProductClient,
    updateMerchandiseProductClient,
} from '@/lib/client-firestore/merchandise';
import type { MerchandiseProduct, MerchandiseVariant } from '@/types';
import styles from '@/components/merchandise.module.css';

interface Props {
    productionId: string;
    userId: string;
    inventoryEnabled: boolean;
    existingProduct?: MerchandiseProduct | null;
    nextSortOrder: number;
    onSaved: () => void;
    onCancel: () => void;
}

function emptyVariant(): MerchandiseVariant {
    return {
        id: crypto.randomUUID(),
        name: '',
        price: 0,
        stock: 0,
        isActive: true,
    };
}

export default function MerchandiseProductForm({
    productionId,
    userId,
    inventoryEnabled,
    existingProduct,
    nextSortOrder,
    onSaved,
    onCancel,
}: Props) {
    const { showToast } = useToast();
    const isEdit = !!existingProduct;

    // 基本情報
    const [name, setName] = useState('');
    const [category, setCategory] = useState('');
    const [price, setPrice] = useState<number>(0);

    // 単品販売
    const [isSellableAlone, setIsSellableAlone] = useState(true);

    // タイプ
    const [hasVariants, setHasVariants] = useState(false);
    const [variants, setVariants] = useState<MerchandiseVariant[]>([]);

    // 在庫
    const [stock, setStock] = useState<number>(0);

    const [saving, setSaving] = useState(false);

    // 編集時の初期値セット
    useEffect(() => {
        if (existingProduct) {
            setName(existingProduct.name);
            setCategory(existingProduct.category ?? '');
            setPrice(existingProduct.price);
            setIsSellableAlone(existingProduct.isSellableAlone);
            setHasVariants(existingProduct.hasVariants);
            setVariants(
                existingProduct.variants.length > 0
                    ? existingProduct.variants
                    : []
            );
            setStock(existingProduct.stock);
        }
    }, [existingProduct]);

    // ── タイプ操作 ──

    function addVariant() {
        setVariants((prev) => [...prev, emptyVariant()]);
    }

    function updateVariant(id: string, patch: Partial<MerchandiseVariant>) {
        setVariants((prev) =>
            prev.map((v) => (v.id === id ? { ...v, ...patch } : v))
        );
    }

    function removeVariant(id: string) {
        setVariants((prev) => prev.filter((v) => v.id !== id));
    }

    // ── バリデーション ──

    function validate(): string | null {
        if (!name.trim()) return '商品名を入力してください';
        if (price < 0) return '基本価格は0以上で入力してください';
        if (hasVariants) {
            if (variants.length === 0) return 'タイプを1つ以上追加してください';
            for (const v of variants) {
                if (!v.name.trim()) return 'タイプ名を入力してください';
            }
        }
        return null;
    }

    // ── 送信 ──

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        const error = validate();
        if (error) {
            showToast(error, 'error');
            return;
        }

        const data = {
            productionId,
            userId,
            name: name.trim(),
            category: category.trim() || null,
            price,
            isSellableAlone,
            hasVariants,
            variants: hasVariants ? variants.map(v => ({ ...v, price })) : [],
            stock: hasVariants ? 0 : stock,
            bulkDiscount: null,
            sortOrder: existingProduct?.sortOrder ?? nextSortOrder,
            isActive: existingProduct?.isActive ?? true,
        };

        setSaving(true);
        try {
            if (isEdit && existingProduct) {
                await updateMerchandiseProductClient(existingProduct.id, data);
                showToast('商品を更新しました', 'success');
            } else {
                await createMerchandiseProductClient(data);
                showToast('商品を作成しました', 'success');
            }
            onSaved();
        } catch (err) {
            console.error(err);
            showToast('保存に失敗しました', 'error');
        } finally {
            setSaving(false);
        }
    }

    // ── UI ──

    return (
        <div className={styles.modalBackdrop} onClick={onCancel}>
            <div
                className={styles.modalCard}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={styles.modalHeader}>
                    <h2>{isEdit ? '商品を編集' : '商品を追加'}</h2>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className={styles.modalBody}>
                        {/* 基本情報 */}
                        <div className={styles.formSection}>
                            <h3 className={styles.formSectionTitle}>基本情報</h3>
                            <div className={styles.formGroup}>
                                <label htmlFor="mpf-name">商品名 *</label>
                                <input
                                    id="mpf-name"
                                    className="input"
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="例: パンフレット"
                                    required
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="mpf-category">カテゴリ</label>
                                <input
                                    id="mpf-category"
                                    className="input"
                                    type="text"
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value)}
                                    placeholder="例: グッズ"
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="mpf-price">基本価格 *</label>
                                <input
                                    id="mpf-price"
                                    className="input"
                                    type="number"
                                    min={0}
                                    value={price}
                                    onChange={(e) => setPrice(Number(e.target.value))}
                                    required
                                />
                            </div>
                        </div>

                        {/* 単品販売 */}
                        <div className={styles.formSection}>
                            <h3 className={styles.formSectionTitle}>販売設定</h3>
                            <div className={styles.checkboxRow}>
                                <input
                                    id="mpf-sellable-alone"
                                    type="checkbox"
                                    checked={isSellableAlone}
                                    onChange={(e) => setIsSellableAlone(e.target.checked)}
                                />
                                <label htmlFor="mpf-sellable-alone">
                                    単品販売可（オフにするとセット専用商品になります）
                                </label>
                            </div>
                        </div>

                        {/* タイプ */}
                        <div className={styles.formSection}>
                            <h3 className={styles.formSectionTitle}>タイプ</h3>
                            <div className={styles.checkboxRow}>
                                <input
                                    id="mpf-has-variants"
                                    type="checkbox"
                                    checked={hasVariants}
                                    onChange={(e) => {
                                        setHasVariants(e.target.checked);
                                        if (e.target.checked && variants.length === 0) {
                                            setVariants([emptyVariant()]);
                                        }
                                    }}
                                />
                                <label htmlFor="mpf-has-variants">タイプあり</label>
                            </div>

                            {hasVariants && (
                                <div className={styles.variantList}>
                                    {variants.map((v) => (
                                        <div key={v.id} className={styles.variantRow}>
                                            <div className={styles.variantField}>
                                                <input
                                                    className="input"
                                                    type="text"
                                                    placeholder="タイプ名（例: S, M, L）"
                                                    value={v.name}
                                                    onChange={(e) =>
                                                        updateVariant(v.id, { name: e.target.value })
                                                    }
                                                />
                                            </div>
                                            {inventoryEnabled && (
                                                <div className={styles.variantFieldNarrow}>
                                                    <input
                                                        className="input"
                                                        type="number"
                                                        min={0}
                                                        placeholder="在庫"
                                                        value={v.stock}
                                                        onChange={(e) =>
                                                            updateVariant(v.id, {
                                                                stock: Number(e.target.value),
                                                            })
                                                        }
                                                    />
                                                </div>
                                            )}
                                            <div className={styles.variantActiveToggle}>
                                                <input
                                                    type="checkbox"
                                                    checked={v.isActive}
                                                    title="有効"
                                                    onChange={(e) =>
                                                        updateVariant(v.id, {
                                                            isActive: e.target.checked,
                                                        })
                                                    }
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                className={styles.variantRemoveBtn}
                                                onClick={() => removeVariant(v.id)}
                                                title="削除"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                    <button
                                        type="button"
                                        className={`btn btn-secondary ${styles.addVariantBtn}`}
                                        onClick={addVariant}
                                    >
                                        <Plus size={14} /> タイプ追加
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* 在庫（タイプなし＆在庫管理有効時のみ） */}
                        {inventoryEnabled && !hasVariants && (
                            <div className={styles.formSection}>
                                <h3 className={styles.formSectionTitle}>在庫</h3>
                                <div className={styles.formGroup}>
                                    <label htmlFor="mpf-stock">在庫数</label>
                                    <input
                                        id="mpf-stock"
                                        className="input"
                                        type="number"
                                        min={0}
                                        value={stock}
                                        onChange={(e) => setStock(Number(e.target.value))}
                                    />
                                </div>
                            </div>
                        )}

                    </div>

                    <div className={styles.modalFooter}>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={onCancel}
                            disabled={saving}
                        >
                            キャンセル
                        </button>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={saving}
                        >
                            {saving ? '保存中...' : isEdit ? '更新' : '作成'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
