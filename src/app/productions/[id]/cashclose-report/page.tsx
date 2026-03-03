'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import CashCloseReport from '@/components/CashCloseReport';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { serializeDoc, serializeDocs } from '@/lib/firestore-utils';
import { getCashClosingsByProductionClient } from '@/lib/client-firestore/cash-close';
import Breadcrumb from '@/components/Breadcrumb';
import { Production, Performance, CashClosing } from '@/types';

export default function CashCloseReportPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { user, loading } = useAuth();
    const [production, setProduction] = useState<Production | null>(null);
    const [performances, setPerformances] = useState<Performance[]>([]);
    const [cashClosings, setCashClosings] = useState<CashClosing[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            if (!user) return;
            try {
                // 公演情報取得
                const prodRef = doc(db, 'productions', id);
                const prodSnap = await getDoc(prodRef);
                if (!prodSnap.exists()) {
                    setIsLoading(false);
                    return;
                }
                const prod = serializeDoc<Production>(prodSnap);
                if (prod.userId !== user.uid) {
                    setIsLoading(false);
                    return;
                }
                setProduction(prod);

                // 公演回 + レジ締めデータを並列取得
                const performancesRef = collection(db, 'performances');
                const perfQuery = query(
                    performancesRef,
                    where('productionId', '==', id),
                    where('userId', '==', user.uid)
                );

                const [perfSnapshot, closings] = await Promise.all([
                    getDocs(perfQuery),
                    getCashClosingsByProductionClient(id, user.uid),
                ]);

                setPerformances(serializeDocs<Performance>(perfSnapshot.docs));
                setCashClosings(closings);
            } catch (error) {
                console.error('Failed to fetch data:', error);
            } finally {
                setIsLoading(false);
            }
        };

        if (!loading && user) {
            fetchData();
        } else if (!loading) {
            setIsLoading(false);
        }
    }, [id, user, loading]);

    if (loading || isLoading) {
        return <div className="flex-center" style={{ height: '50vh' }}>読み込み中...</div>;
    }

    if (!user || !production) {
        return (
            <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>
                <h2 className="heading-md">レポートが見つかりません</h2>
                <Link href="/dashboard" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>ダッシュボードに戻る</Link>
            </div>
        );
    }

    return (
        <div className="container" style={{ maxWidth: '1000px' }}>
            <Breadcrumb items={[
                { label: 'ダッシュボード', href: '/dashboard' },
                { label: production.title, href: `/productions/${id}` },
                { label: 'レジ締めレポート' }
            ]} />
            <div style={{ marginBottom: '1.25rem' }}>
                <Link href="/dashboard" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', borderRadius: '8px', fontSize: '0.9rem' }}>
                    <span>&larr;</span> ダッシュボードに戻る
                </Link>
            </div>
            <div style={{ marginBottom: '2rem' }}>
                <h2 className="heading-lg" style={{ marginBottom: '0.5rem' }}>
                    {production.title} — レジ締めレポート
                </h2>
                <p className="text-muted" style={{ fontSize: '0.9rem' }}>
                    各公演回のレジ締め結果を確認できます。
                </p>
            </div>

            <CashCloseReport
                productionId={production.id}
                productionTitle={production.title}
                performances={performances}
                cashClosings={cashClosings}
            />
        </div>
    );
}
