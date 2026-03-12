'use client';

import { useEffect, useState, use } from 'react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, collection, query, where, orderBy } from 'firebase/firestore';
import { serializeDoc, serializeDocs } from '@/lib/firestore-utils';
import Link from 'next/link';
import MerchandiseSettingsTabs from '@/components/MerchandiseSettingsTabs';
import { useAuth } from '@/components/AuthProvider';
import { Production, MerchandiseProduct } from '@/types';
import { ShoppingBag } from 'lucide-react';

export default function MerchandisePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { user, loading } = useAuth();
    const [production, setProduction] = useState<Production | null>(null);
    const [products, setProducts] = useState<MerchandiseProduct[]>([]);
    const [isInitialLoading, setIsInitialLoading] = useState(true);

    useEffect(() => {
        let unsubProd: () => void;
        let unsubProducts: () => void;

        if (user && !loading) {
            // Production listener
            const prodRef = doc(db, 'productions', id);
            unsubProd = onSnapshot(prodRef, (snap) => {
                if (snap.exists()) {
                    const data = serializeDoc<Production>(snap);
                    if (data.userId !== user.uid) {
                        setProduction(null);
                        setIsInitialLoading(false);
                        return;
                    }
                    setProduction(data);
                    setIsInitialLoading(false);
                }
            });

            // Products listener
            const productsRef = collection(db, 'merchandiseProducts');
            const q = query(productsRef, where('productionId', '==', id), orderBy('sortOrder', 'asc'));
            unsubProducts = onSnapshot(q, (snap) => {
                setProducts(serializeDocs<MerchandiseProduct>(snap.docs));
            });
        } else if (!loading) {
            setIsInitialLoading(false);
        }

        return () => {
            if (unsubProd) unsubProd();
            if (unsubProducts) unsubProducts();
        };
    }, [id, user, loading]);

    if (loading || isInitialLoading) {
        return <div className="flex-center" style={{ height: '50vh' }}>読み込み中...</div>;
    }

    if (!user) {
        return (
            <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>
                <h2 className="heading-md">ログインが必要です</h2>
                <Link href="/" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>ホームに戻る</Link>
            </div>
        );
    }

    if (!production) {
        return (
            <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>
                <h2 className="heading-md">公演が見つかりません</h2>
                <Link href="/productions" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>一覧に戻る</Link>
            </div>
        );
    }

    return (
        <div className="container" style={{ maxWidth: '1000px' }}>
            <div className="page-header" style={{ marginBottom: '2rem' }}>
                <div style={{ marginBottom: '1.25rem' }}>
                    <Link
                        href="/dashboard"
                        className="btn btn-secondary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', borderRadius: '8px', fontSize: '0.9rem' }}
                    >
                        <span>&larr;</span> ダッシュボードに戻る
                    </Link>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <ShoppingBag size={28} color="var(--primary)" />
                    <h2 className="heading-lg" style={{ margin: 0 }}>物販管理</h2>
                </div>
                <p className="text-muted" style={{ fontSize: '0.95rem' }}>
                    {production.title} の物販設定・商品管理
                </p>
            </div>

            <MerchandiseSettingsTabs production={production} products={products} />
        </div>
    );
}
