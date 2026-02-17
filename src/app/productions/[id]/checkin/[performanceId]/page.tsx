'use client';

import { useEffect, useState } from 'react';
import { db } from "@/lib/firebase";
import {
    collection,
    getDocs,
    getDoc,
    doc,
    query,
    where
} from "firebase/firestore";
import { notFound, useRouter } from 'next/navigation';
import { formatDateTime } from '@/lib/format';
import CheckinList from '@/components/CheckinList';
import SameDayTicketForm from '@/components/SameDayTicketForm';
import GlobalReservationSearch from '@/components/GlobalReservationSearch';
import Link from 'next/link';
import { Production, Performance, FirestoreReservation } from "@/types";
import { useAuth } from '@/components/AuthProvider';
import { serializeDoc, serializeDocs } from '@/lib/firestore-utils';

export default function CheckinPage({ params }: { params: any }) {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [data, setData] = useState<{
        production: Production,
        performance: Performance,
        reservations: FirestoreReservation[],
        remainingCount: number
    } | null>(null);
    const [isInitialLoading, setIsInitialLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            if (user) {
                // Unwrap params (Next.js 15 behavior if using async params, though for client components it's usually passed)
                const resolvedParams = await params;
                const { id: productionId, performanceId } = resolvedParams;

                // 1. Get Production
                const productionRef = doc(db, "productions", productionId);
                const productionSnap = await getDoc(productionRef);
                if (!productionSnap.exists()) {
                    setIsInitialLoading(false);
                    return;
                }
                const production = serializeDoc<Production>(productionSnap);

                // Check Ownership
                if (production.userId !== user.uid) {
                    router.push('/productions');
                    return;
                }

                // 2. Get Performance
                const performanceRef = doc(db, "performances", performanceId);
                const performanceSnap = await getDoc(performanceRef);
                if (!performanceSnap.exists()) {
                    setIsInitialLoading(false);
                    return;
                }
                const performance = serializeDoc<Performance>(performanceSnap);

                // 3. Get Reservations
                const reservationsRef = collection(db, "reservations");
                const qRes = query(
                    reservationsRef,
                    where("userId", "==", user.uid)
                );
                const resSnapshot = await getDocs(qRes);
                const allRes = serializeDocs<FirestoreReservation>(resSnapshot.docs);

                // Filter by performanceId, exclude canceled, and map ticket types in memory
                const reservations = allRes
                    .filter(res => res.performanceId === performanceId && res.status !== 'CANCELED')
                    .map(res => ({
                        ...res,
                        tickets: (res.tickets || []).map((t: any) => ({
                            ...t,
                            ticketType: production.ticketTypes.find((tt: any) => tt.id === t.ticketTypeId)
                        }))
                    }));

                const bookedCount = reservations.reduce((sum, res) => {
                    return sum + (res.tickets || []).reduce((tSum, t) => tSum + (t.count || 0), 0);
                }, 0);
                const remainingCount = performance.capacity - bookedCount;

                setData({ production, performance, reservations, remainingCount });
            }
            setIsInitialLoading(false);
        };

        if (!loading) {
            fetchData();
        }
    }, [user, loading, params, router]);

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

    if (!data) {
        return notFound();
    }

    const { production, performance, reservations, remainingCount } = data;

    return (
        <div className="container" style={{ paddingBottom: '4rem' }}>
            <header style={{ marginBottom: '2rem', borderBottom: '1px solid var(--card-border)', paddingBottom: '1rem' }}>
                <Link href="/reception" className="btn btn-secondary" style={{ marginBottom: '1rem', display: 'inline-block', fontSize: '0.85rem' }}>
                    &larr; 公演回の選択に戻る
                </Link>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <h1 className="heading-lg" style={{ marginBottom: '0.25rem' }}>当日受付：{production.title}</h1>
                        <p style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
                            {formatDateTime(performance.startTime)} 開演
                        </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div className="card" style={{ padding: '0.75rem 1.5rem', background: 'var(--secondary)', border: '2px solid var(--primary)' }}>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>当日券 残数</p>
                            <p style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--primary)' }}>{remainingCount} <span style={{ fontSize: '1rem' }}>枚</span></p>
                        </div>
                    </div>
                </div>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '2rem', alignItems: 'start' }}>
                {/* 左ペイン：予約一覧 */}
                <div>
                    <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2 className="heading-md" style={{ marginBottom: 0 }}>予約者名簿 ({reservations.length}組)</h2>
                        <GlobalReservationSearch productionId={production.id} />
                    </div>
                    <CheckinList
                        reservations={reservations as any}
                        performanceId={performance.id}
                        productionId={production.id}
                    />
                </div>

                {/* 右ペイン：当日券発行 */}
                <aside style={{ position: 'sticky', top: '2rem' }}>
                    <h2 className="heading-md">当日券発行</h2>
                    <SameDayTicketForm
                        productionId={production.id}
                        performanceId={performance.id}
                        ticketTypes={production.ticketTypes}
                        remainingCount={remainingCount}
                    />
                </aside>
            </div>
        </div>
    );
}
