'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { serializeDoc, serializeDocs } from '@/lib/firestore-utils';
import { toDate } from '@/lib/firestore-utils';
import MerchandiseSalesForm from '@/components/MerchandiseSalesForm';
import type { Production, Performance, MerchandiseProduct } from '@/types';

export default function MerchandiseSalesPerformancePage({ params }: { params: any }) {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [production, setProduction] = useState<Production | null>(null);
    const [performance, setPerformance] = useState<Performance | null>(null);
    const [products, setProducts] = useState<MerchandiseProduct[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let unsubProducts: (() => void) | undefined;

        const fetchData = async () => {
            if (!user || loading) return;

            const resolvedParams = await params;
            const { id: productionId, performanceId } = resolvedParams;

            try {
                // Production
                const prodRef = doc(db, 'productions', productionId);
                const prodSnap = await getDoc(prodRef);
                if (!prodSnap.exists()) { setIsLoading(false); return; }
                const prod = serializeDoc<Production>(prodSnap);
                if (prod.userId !== user.uid) { router.push('/productions'); return; }
                setProduction(prod);

                // Performance
                const perfRef = doc(db, 'performances', performanceId);
                const perfSnap = await getDoc(perfRef);
                if (!perfSnap.exists()) { setIsLoading(false); return; }
                setPerformance(serializeDoc<Performance>(perfSnap));

                // Products (real-time)
                const productsQuery = query(
                    collection(db, 'merchandiseProducts'),
                    where('productionId', '==', productionId),
                    orderBy('sortOrder')
                );
                unsubProducts = onSnapshot(productsQuery, (snap) => {
                    setProducts(serializeDocs<MerchandiseProduct>(snap.docs));
                });

                setIsLoading(false);
            } catch (err) {
                console.error(err);
                setIsLoading(false);
            }
        };

        if (!loading) fetchData();

        return () => { if (unsubProducts) unsubProducts(); };
    }, [user, loading, params, router]);

    if (loading || isLoading) {
        return <div className="flex-center" style={{ height: '50vh' }}>読み込み中...</div>;
    }

    if (!user || !production || !performance) {
        return <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>
            <p>データが見つかりません</p>
        </div>;
    }

    const startDate = performance.startTime ? toDate(performance.startTime) : null;
    const dateStr = startDate ? startDate.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }) : '';
    const timeStr = startDate ? startDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '';

    return (
        <div className="container" style={{ maxWidth: '1200px', paddingBottom: '2rem' }}>
            <header style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1.5rem',
                paddingBottom: '1rem',
                borderBottom: '1px solid var(--card-border)',
                flexWrap: 'wrap',
                gap: '0.5rem',
            }}>
                <div>
                    <Link href={`/productions/${production.id}/merchandise/sales`} style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        &larr; 公演回の選択に戻る
                    </Link>
                    <h1 style={{ fontSize: '1.25rem', fontWeight: '700', margin: '0.25rem 0 0' }}>
                        物販販売 - {dateStr} {timeStr}
                    </h1>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>{production.title}</p>
                </div>
            </header>

            <MerchandiseSalesForm
                productionId={production.id}
                performanceId={performance.id}
                userId={user.uid}
                products={products}
                sets={production.merchandiseSets || []}
                soldBy={user.uid}
                soldByType="ORGANIZER"
                inventoryEnabled={production.merchandiseInventoryEnabled || false}
            />
        </div>
    );
}
