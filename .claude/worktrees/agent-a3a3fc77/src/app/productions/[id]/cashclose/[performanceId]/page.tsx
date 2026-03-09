'use client';

import { useEffect, useState } from 'react';
import { db } from "@/lib/firebase";
import { getDoc, doc } from "firebase/firestore";
import { notFound, useRouter } from 'next/navigation';
import { toDate } from '@/lib/firestore-utils';
import { serializeDoc } from '@/lib/firestore-utils';
import Link from 'next/link';
import { Production, Performance } from "@/types";
import { useAuth } from '@/components/AuthProvider';
import CashCloseForm from '@/components/CashCloseForm';

export default function CashClosePage({ params }: { params: any }) {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [data, setData] = useState<{
        production: Production;
        performance: Performance;
    } | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            if (user) {
                const resolvedParams = await params;
                const { id: productionId, performanceId } = resolvedParams;

                try {
                    const productionRef = doc(db, "productions", productionId);
                    const productionSnap = await getDoc(productionRef);
                    if (!productionSnap.exists()) {
                        setIsLoading(false);
                        return;
                    }
                    const production = serializeDoc<Production>(productionSnap);

                    if (production.userId !== user.uid) {
                        router.push('/productions');
                        return;
                    }

                    const performanceRef = doc(db, "performances", performanceId);
                    const performanceSnap = await getDoc(performanceRef);
                    if (!performanceSnap.exists()) {
                        setIsLoading(false);
                        return;
                    }
                    const performance = serializeDoc<Performance>(performanceSnap);

                    setData({ production, performance });
                } catch (err) {
                    console.error("Fetch error:", err);
                } finally {
                    setIsLoading(false);
                }
            } else if (!loading) {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [user, loading, params, router]);

    if (loading || isLoading) {
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

    if (!data) {
        return notFound();
    }

    const { production, performance } = data;
    const startDate = performance.startTime ? toDate(performance.startTime) : null;
    const perfDateStr = startDate ? startDate.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }) : '';
    const perfTimeStr = startDate ? startDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '';

    return (
        <div className="container" style={{ paddingBottom: '4rem', maxWidth: '700px' }}>
            <header style={{ marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid #eee' }}>
                <Link
                    href={`/productions/${production.id}/checkin/${performance.id}`}
                    className="btn btn-secondary"
                    style={{ marginBottom: '1rem', display: 'inline-block', fontSize: '0.85rem', borderRadius: '8px' }}
                >
                    &larr; チェックインに戻る
                </Link>
                <div style={{ marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.9rem', color: '#666' }}>公演：{production.title}</span>
                </div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: '900', margin: 0, color: 'var(--primary)' }}>
                    レジ締め - {perfDateStr} {perfTimeStr}
                </h1>
            </header>

            <CashCloseForm
                productionId={production.id}
                performanceId={performance.id}
                userId={user.uid}
                closedByType="ORGANIZER"
                closedBy={user.uid}
            />
        </div>
    );
}
