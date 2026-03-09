'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { serializeDoc, serializeDocs } from '@/lib/firestore-utils';
import { toDate } from '@/lib/firestore-utils';
import type { Production, Performance } from '@/types';

export default function MerchandiseSalesPage({ params }: { params: any }) {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [production, setProduction] = useState<Production | null>(null);
    const [performances, setPerformances] = useState<Performance[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            if (!user || loading) return;

            const resolvedParams = await params;
            const { id: productionId } = resolvedParams;

            try {
                const prodRef = doc(db, 'productions', productionId);
                const prodSnap = await getDoc(prodRef);
                if (!prodSnap.exists()) { setIsLoading(false); return; }

                const prod = serializeDoc<Production>(prodSnap);
                if (prod.userId !== user.uid) { router.push('/productions'); return; }

                setProduction(prod);

                const perfRef = collection(db, 'performances');
                const q = query(perfRef, where('productionId', '==', productionId), orderBy('startTime'));
                const perfSnap = await getDocs(q);
                setPerformances(serializeDocs<Performance>(perfSnap.docs));
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };

        if (!loading) fetchData();
    }, [user, loading, params, router]);

    if (loading || isLoading) {
        return <div className="flex-center" style={{ height: '50vh' }}>読み込み中...</div>;
    }

    if (!user || !production) {
        return <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>
            <p>公演が見つかりません</p>
        </div>;
    }

    return (
        <div className="container" style={{ maxWidth: '700px', padding: '2rem 1rem' }}>
            <Link href={`/productions/${production.id}/merchandise`} className="btn btn-secondary" style={{ marginBottom: '1.5rem', display: 'inline-block', fontSize: '0.85rem' }}>
                &larr; 物販管理に戻る
            </Link>

            <h1 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '0.5rem' }}>物販販売</h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>{production.title}</p>

            <h2 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem' }}>公演回を選択</h2>

            {performances.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', background: 'var(--card-bg)', border: '1px dashed var(--card-border)', borderRadius: 'var(--border-radius)', color: 'var(--text-muted)' }}>
                    公演回が登録されていません
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {performances.map(perf => {
                        const startDate = perf.startTime ? toDate(perf.startTime) : null;
                        const dateStr = startDate ? startDate.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }) : '';
                        const timeStr = startDate ? startDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '';

                        return (
                            <Link
                                key={perf.id}
                                href={`/productions/${production.id}/merchandise/sales/${perf.id}`}
                                className="card"
                                style={{
                                    padding: '1rem 1.25rem',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    textDecoration: 'none',
                                    transition: 'border-color 0.2s',
                                }}
                            >
                                <div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--foreground)' }}>
                                        {dateStr} {timeStr}
                                    </div>
                                </div>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>&rarr;</span>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
