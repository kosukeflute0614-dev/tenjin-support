'use client';

import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Edit2, Check, X, ToggleLeft, ToggleRight } from 'lucide-react';
import { useToast } from '@/components/Toast';
import type { MerchandiseSet, MerchandiseSetItem, MerchandiseProduct } from '@/types';

interface Props {
    productionId: string;
    sets: MerchandiseSet[];
    products: MerchandiseProduct[];
    onSetsChanged: (sets: MerchandiseSet[]) => void;
}

interface SetFormState {
    name: string;
    setPrice: number;
    items: MerchandiseSetItem[];
    isActive: boolean;
}

const emptyForm: SetFormState = {
    name: '',
    setPrice: 0,
    items: [],
    isActive: true,
};

export default function MerchandiseSetManager({ sets, products, onSetsChanged }: Props) {
    const { showToast } = useToast();
    const [addingNew, setAddingNew] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<SetFormState>(emptyForm);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    const productMap = useMemo(() => {
        const map = new Map<string, MerchandiseProduct>();
        for (const p of products) {
            map.set(p.id, p);
        }
        return map;
    }, [products]);

    function calcRegularTotal(items: MerchandiseSetItem[]): number {
        let total = 0;
        for (const item of items) {
            const product = productMap.get(item.productId);
            if (!product) continue;
            if (item.variantId && product.hasVariants) {
                const variant = product.variants.find(v => v.id === item.variantId);
                total += (variant?.price ?? product.price) * item.quantity;
            } else {
                total += product.price * item.quantity;
            }
        }
        return total;
    }

    function getProductName(productId: string): string {
        return productMap.get(productId)?.name ?? '不明な商品';
    }

    function getVariantName(productId: string, variantId?: string): string | null {
        if (!variantId) return null;
        const product = productMap.get(productId);
        if (!product) return null;
        return product.variants.find(v => v.id === variantId)?.name ?? null;
    }

    function startAdd() {
        setAddingNew(true);
        setEditingId(null);
        setForm({ ...emptyForm });
    }

    function startEdit(set: MerchandiseSet) {
        setEditingId(set.id);
        setAddingNew(false);
        setForm({
            name: set.name,
            setPrice: set.setPrice,
            items: set.items.map(i => ({ ...i })),
            isActive: set.isActive,
        });
    }

    function cancelForm() {
        setAddingNew(false);
        setEditingId(null);
        setForm({ ...emptyForm });
    }

    function addItemToForm() {
        if (products.length === 0) {
            showToast('追加可能な商品がありません', 'warning');
            return;
        }
        const firstProduct = products[0];
        setForm(prev => ({
            ...prev,
            items: [
                ...prev.items,
                {
                    productId: firstProduct.id,
                    variantId: undefined,
                    quantity: 1,
                },
            ],
        }));
    }

    function removeItemFromForm(index: number) {
        setForm(prev => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== index),
        }));
    }

    function updateItem(index: number, updates: Partial<MerchandiseSetItem>) {
        setForm(prev => ({
            ...prev,
            items: prev.items.map((item, i) => {
                if (i !== index) return item;
                const updated = { ...item, ...updates };
                // Reset variantId when product changes
                if (updates.productId && updates.productId !== item.productId) {
                    updated.variantId = undefined;
                }
                return updated;
            }),
        }));
    }

    function saveNew() {
        if (!form.name.trim()) {
            showToast('セット名を入力してください', 'error');
            return;
        }
        if (form.setPrice <= 0) {
            showToast('セット価格を入力してください', 'error');
            return;
        }
        if (form.items.length === 0) {
            showToast('構成商品を1つ以上追加してください', 'error');
            return;
        }

        const newSet: MerchandiseSet = {
            id: crypto.randomUUID(),
            name: form.name.trim(),
            setPrice: form.setPrice,
            items: form.items,
            isActive: form.isActive,
        };

        onSetsChanged([...sets, newSet]);
        showToast('セットを追加しました', 'success');
        cancelForm();
    }

    function saveEdit() {
        if (!editingId) return;
        if (!form.name.trim()) {
            showToast('セット名を入力してください', 'error');
            return;
        }
        if (form.setPrice <= 0) {
            showToast('セット価格を入力してください', 'error');
            return;
        }
        if (form.items.length === 0) {
            showToast('構成商品を1つ以上追加してください', 'error');
            return;
        }

        const updated = sets.map(s =>
            s.id === editingId
                ? { ...s, name: form.name.trim(), setPrice: form.setPrice, items: form.items, isActive: form.isActive }
                : s
        );
        onSetsChanged(updated);
        showToast('セットを更新しました', 'success');
        cancelForm();
    }

    function toggleActive(setId: string) {
        const updated = sets.map(s =>
            s.id === setId ? { ...s, isActive: !s.isActive } : s
        );
        onSetsChanged(updated);
    }

    function deleteSet(setId: string) {
        const updated = sets.filter(s => s.id !== setId);
        onSetsChanged(updated);
        showToast('セットを削除しました', 'success');
        setDeleteConfirmId(null);
    }

    function renderPriceSummary(items: MerchandiseSetItem[], setPrice: number) {
        const regularTotal = calcRegularTotal(items);
        const savings = regularTotal - setPrice;
        return (
            <span style={{ fontSize: '0.85rem', color: '#666' }}>
                通常合計: ¥{regularTotal.toLocaleString()} → セット価格: ¥{setPrice.toLocaleString()}
                {savings > 0 && (
                    <span style={{ color: '#8b0000', fontWeight: 600, marginLeft: 4 }}>
                        (¥{savings.toLocaleString()} お得)
                    </span>
                )}
            </span>
        );
    }

    function renderItemLabel(item: MerchandiseSetItem) {
        const name = getProductName(item.productId);
        const variantName = getVariantName(item.productId, item.variantId);
        return `${name}${variantName ? ` (${variantName})` : ''} × ${item.quantity}`;
    }

    function renderForm(isNew: boolean) {
        return (
            <div
                className="set-form"
                style={{
                    border: '1px solid #ddd',
                    borderRadius: 8,
                    padding: 16,
                    marginTop: 12,
                    background: '#fafafa',
                }}
            >
                <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: 4, fontSize: '0.9rem' }}>
                        セット名 <span style={{ color: '#8b0000' }}>*</span>
                    </label>
                    <input
                        type="text"
                        className="input"
                        value={form.name}
                        onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="例: Tシャツ＋ステッカーセット"
                        style={{ width: '100%' }}
                    />
                </div>

                <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: 4, fontSize: '0.9rem' }}>
                        セット価格 (¥) <span style={{ color: '#8b0000' }}>*</span>
                    </label>
                    <input
                        type="number"
                        className="input"
                        value={form.setPrice || ''}
                        onChange={e => setForm(prev => ({ ...prev, setPrice: Number(e.target.value) || 0 }))}
                        placeholder="例: 2500"
                        min={0}
                        style={{ width: 200 }}
                    />
                </div>

                <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                            構成商品 <span style={{ color: '#8b0000' }}>*</span>
                        </label>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={addItemToForm}
                            style={{ fontSize: '0.85rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                            <Plus size={14} /> 商品を追加
                        </button>
                    </div>

                    {form.items.length === 0 && (
                        <p style={{ color: '#999', fontSize: '0.85rem', margin: '8px 0' }}>
                            商品がまだ追加されていません。
                        </p>
                    )}

                    {form.items.map((item, index) => {
                        const product = productMap.get(item.productId);
                        return (
                            <div
                                key={index}
                                style={{
                                    display: 'flex',
                                    gap: 8,
                                    alignItems: 'center',
                                    marginBottom: 8,
                                    flexWrap: 'wrap',
                                }}
                            >
                                <select
                                    className="input"
                                    value={item.productId}
                                    onChange={e => updateItem(index, { productId: e.target.value })}
                                    style={{ flex: '1 1 180px', minWidth: 120 }}
                                >
                                    {products.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>

                                {product?.hasVariants && product.variants.length > 0 && (
                                    <select
                                        className="input"
                                        value={item.variantId ?? ''}
                                        onChange={e => updateItem(index, { variantId: e.target.value || undefined })}
                                        style={{ flex: '0 1 140px', minWidth: 100 }}
                                    >
                                        <option value="">タイプ指定なし</option>
                                        {product.variants.map(v => (
                                            <option key={v.id} value={v.id}>{v.name}</option>
                                        ))}
                                    </select>
                                )}

                                <input
                                    type="number"
                                    className="input"
                                    value={item.quantity}
                                    onChange={e => updateItem(index, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                                    min={1}
                                    style={{ width: 70, textAlign: 'center' }}
                                />

                                <button
                                    type="button"
                                    onClick={() => removeItemFromForm(index)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: '#999',
                                        padding: 4,
                                    }}
                                    title="削除"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        );
                    })}

                    {form.items.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                            {renderPriceSummary(form.items, form.setPrice)}
                        </div>
                    )}
                </div>

                <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>有効/無効:</label>
                    <button
                        type="button"
                        onClick={() => setForm(prev => ({ ...prev, isActive: !prev.isActive }))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                        {form.isActive ? (
                            <>
                                <ToggleRight size={24} color="#8b0000" />
                                <span style={{ color: '#8b0000', fontSize: '0.85rem' }}>有効</span>
                            </>
                        ) : (
                            <>
                                <ToggleLeft size={24} color="#999" />
                                <span style={{ color: '#999', fontSize: '0.85rem' }}>無効</span>
                            </>
                        )}
                    </button>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={isNew ? saveNew : saveEdit}
                        style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                        <Check size={16} /> {isNew ? '追加' : '保存'}
                    </button>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={cancelForm}
                    >
                        キャンセル
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="set-manager">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>セット販売</h3>
                {!addingNew && !editingId && (
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={startAdd}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.9rem' }}
                    >
                        <Plus size={16} /> セットを追加
                    </button>
                )}
            </div>

            {sets.length === 0 && !addingNew && (
                <p style={{ color: '#999', textAlign: 'center', padding: '24px 0' }}>
                    セット販売がまだ設定されていません。
                </p>
            )}

            {sets.map(set => (
                <div
                    key={set.id}
                    className="set-card"
                    style={{
                        border: '1px solid #ddd',
                        borderRadius: 8,
                        padding: 14,
                        marginBottom: 10,
                        opacity: set.isActive ? 1 : 0.6,
                        background: set.isActive ? '#fff' : '#f5f5f5',
                    }}
                >
                    {editingId === set.id ? (
                        renderForm(false)
                    ) : (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                        <strong>{set.name}</strong>
                                        {!set.isActive && (
                                            <span style={{
                                                fontSize: '0.75rem',
                                                background: '#eee',
                                                color: '#999',
                                                padding: '1px 6px',
                                                borderRadius: 4,
                                            }}>
                                                無効
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '1rem', fontWeight: 600, color: '#8b0000', marginBottom: 6 }}>
                                        ¥{set.setPrice.toLocaleString()}
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: '#555', marginBottom: 4 }}>
                                        {set.items.map((item, i) => (
                                            <span key={i}>
                                                {i > 0 && '、'}
                                                {renderItemLabel(item)}
                                            </span>
                                        ))}
                                    </div>
                                    {renderPriceSummary(set.items, set.setPrice)}
                                </div>

                                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                    <button
                                        type="button"
                                        onClick={() => toggleActive(set.id)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                                        title={set.isActive ? '無効にする' : '有効にする'}
                                    >
                                        {set.isActive
                                            ? <ToggleRight size={22} color="#8b0000" />
                                            : <ToggleLeft size={22} color="#999" />
                                        }
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => startEdit(set)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#555' }}
                                        title="編集"
                                    >
                                        <Edit2 size={18} />
                                    </button>
                                    {deleteConfirmId === set.id ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <button
                                                type="button"
                                                className="btn btn-danger-outline"
                                                onClick={() => deleteSet(set.id)}
                                                style={{ fontSize: '0.8rem', padding: '2px 8px' }}
                                            >
                                                削除する
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDeleteConfirmId(null)}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', padding: 4 }}
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => setDeleteConfirmId(set.id)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#999' }}
                                            title="削除"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            ))}

            {addingNew && renderForm(true)}
        </div>
    );
}
