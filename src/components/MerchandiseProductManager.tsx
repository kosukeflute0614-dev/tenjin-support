'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { serializeDocs } from '@/lib/firestore-utils';
import { MerchandiseProduct } from '@/types';
import { fetchMerchandiseProductsClient, deleteMerchandiseProductClient, updateMerchandiseProductClient } from '@/lib/client-firestore';
import MerchandiseProductForm from './MerchandiseProductForm';
import { useToast } from '@/components/Toast';
import styles from '@/components/merchandise.module.css';

interface Props {
    productionId: string;
    userId: string;
    inventoryEnabled: boolean;
}

export default function MerchandiseProductManager({ productionId, userId, inventoryEnabled }: Props) {
    const [products, setProducts] = useState<MerchandiseProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingProduct, setEditingProduct] = useState<MerchandiseProduct | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const { showToast } = useToast();

    // Initial fetch + real-time listener
    useEffect(() => {
        let unsubscribe: (() => void) | undefined;

        const init = async () => {
            try {
                const initial = await fetchMerchandiseProductsClient(productionId);
                setProducts(initial);
            } catch {
                // Real-time listener will provide data
            } finally {
                setLoading(false);
            }

            // Set up real-time listener
            const q = query(
                collection(db, 'merchandiseProducts'),
                where('productionId', '==', productionId),
                orderBy('sortOrder')
            );

            unsubscribe = onSnapshot(q, (snapshot) => {
                const docs = serializeDocs<MerchandiseProduct>(snapshot.docs);
                setProducts(docs);
                setLoading(false);
            });
        };

        init();

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [productionId]);

    const handleDelete = async (product: MerchandiseProduct) => {
        if (!confirm(`「${product.name}」を削除してもよろしいですか？`)) return;

        setDeletingId(product.id);
        try {
            await deleteMerchandiseProductClient(product.id);
            showToast('商品を削除しました', 'success');
        } catch {
            showToast('商品の削除に失敗しました', 'error');
        } finally {
            setDeletingId(null);
        }
    };

    const handleToggleActive = async (product: MerchandiseProduct) => {
        try {
            await updateMerchandiseProductClient(product.id, {
                isActive: !product.isActive,
            });
            showToast(
                product.isActive ? '商品を非公開にしました' : '商品を公開しました',
                'success'
            );
        } catch {
            showToast('ステータスの変更に失敗しました', 'error');
        }
    };

    const handleEdit = (product: MerchandiseProduct) => {
        setEditingProduct(product);
        setShowForm(true);
    };

    const handleCreate = () => {
        setEditingProduct(null);
        setShowForm(true);
    };

    const handleFormClose = () => {
        setShowForm(false);
        setEditingProduct(null);
    };

    const getTotalStock = (product: MerchandiseProduct): number => {
        if (product.hasVariants && product.variants.length > 0) {
            return product.variants.reduce((sum, v) => sum + v.stock, 0);
        }
        return product.stock;
    };

    const getVariantSummary = (product: MerchandiseProduct): string | null => {
        if (!product.hasVariants || product.variants.length === 0) return null;
        const names = product.variants.map((v) => v.name).join(' / ');
        return `${names} (${product.variants.length}種)`;
    };

    if (showForm) {
        return (
            <MerchandiseProductForm
                productionId={productionId}
                userId={userId}
                inventoryEnabled={inventoryEnabled}
                existingProduct={editingProduct}
                nextSortOrder={products.length}
                onSaved={handleFormClose}
                onCancel={handleFormClose}
            />
        );
    }

    if (loading) {
        return (
            <div className={styles.loading}>
                <p>読み込み中...</p>
            </div>
        );
    }

    return (
        <div className={styles.productManager}>
            <div className={styles.productManagerHeader}>
                <h2 className={styles.productManagerTitle}>商品一覧</h2>
                <button
                    className="btn btn-primary"
                    onClick={handleCreate}
                >
                    商品を追加
                </button>
            </div>

            {products.length === 0 ? (
                <div className={styles.emptyState}>
                    <p>商品がまだ登録されていません。「商品を追加」ボタンから最初の商品を登録しましょう。</p>
                </div>
            ) : (
                <div className={styles.productList}>
                    {products.map((product) => {
                        const variantSummary = getVariantSummary(product);
                        const totalStock = getTotalStock(product);

                        return (
                            <div
                                key={product.id}
                                className={`${styles.productCard} ${!product.isActive ? styles.productCardInactive : ''}`}
                            >
                                <div className={styles.productCardBody}>
                                    <div className={styles.productCardTop}>
                                        <span className={styles.productName}>{product.name}</span>
                                        <div className={styles.productBadges}>
                                            {product.category && (
                                                <span className={styles.categoryBadge}>
                                                    {product.category}
                                                </span>
                                            )}
                                            {!product.isActive && (
                                                <span className={styles.inactiveBadge}>
                                                    非公開
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className={styles.productCardMiddle}>
                                        <span className={styles.productPrice}>
                                            ¥{product.price.toLocaleString('ja-JP')}
                                        </span>
                                        {variantSummary && (
                                            <span className={styles.productVariants}>
                                                {variantSummary}
                                            </span>
                                        )}
                                        {inventoryEnabled && (
                                            <span className={styles.productStock}>
                                                在庫: 合計{totalStock}
                                            </span>
                                        )}
                                    </div>

                                    <div className={styles.productCardActions}>
                                        <button
                                            className={`btn btn-secondary ${styles.actionBtn}`}
                                            onClick={() => handleToggleActive(product)}
                                        >
                                            {product.isActive ? '非公開にする' : '公開する'}
                                        </button>
                                        <button
                                            className={`btn btn-secondary ${styles.actionBtn}`}
                                            onClick={() => handleEdit(product)}
                                        >
                                            編集
                                        </button>
                                        <button
                                            className={`btn btn-danger-outline ${styles.actionBtn}`}
                                            onClick={() => handleDelete(product)}
                                            disabled={deletingId === product.id}
                                        >
                                            {deletingId === product.id ? '削除中...' : '削除'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
