'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { serializeDoc, serializeDocs } from '@/lib/firestore-utils';
import { formatDateTime } from '@/lib/format';
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
        <div className="container" style={{ maxWidth: '1000px' }}>
            <div style={{ marginBottom: '1.25rem' }}>
                <Link href="/dashboard" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', borderRadius: '8px', fontSize: '0.9rem' }}>
                    <span>&larr;</span> ダッシュボードに戻る
                </Link>
            </div>
            <div className="page-header" style={{ marginBottom: '2rem' }}>
                <h2 className="heading-lg" style={{ marginBottom: '0.5rem' }}>物販販売</h2>
                <p className="text-muted">販売を行う公演回を選択してください。</p>
            </div>

            <div className="card" style={{ padding: 0 }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--card-border)', background: 'var(--secondary)' }}>
                    <h2 className="heading-md" style={{ marginBottom: 0 }}>{production.title}</h2>
                </div>
                <div style={{ display: 'grid' }}>
                    {performances.map((perf) => (
                        <Link
                            key={perf.id}
                            href={`/productions/${production.id}/merchandise/sales/${perf.id}`}
                            style={{
                                padding: '1.5rem',
                                borderBottom: '1px solid var(--card-border)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                transition: 'background 0.2s',
                            }}
                            className="performance-link"
                        >
                            <div>
                                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--foreground)' }}>
                                    {formatDateTime(perf.startTime)}
                                </div>
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                    定員: {perf.capacity}名
                                </div>
                            </div>
                            <div style={{ color: 'var(--primary)', fontWeight: 'bold' }}>
                                販売画面へ &rarr;
                            </div>
                        </Link>
                    ))}
                    {performances.length === 0 && (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            公演回が登録されていません。
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                .performance-link:hover {
                    background-color: #f8f9fa;
                }
                .performance-link:last-child {
                    border-bottom: none;
                }
            `}</style>
        </div>
    );
}
