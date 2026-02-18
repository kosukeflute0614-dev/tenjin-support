'use client';

import { useEffect, useState } from 'react';
import { db } from "@/lib/firebase";
import {
    collection,
    getDocs,
    getDoc,
    doc,
    query,
    where,
    onSnapshot
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
        let unsubscribeReservations: () => void;
        let unsubscribeLogs: () => void;

        const fetchData = async () => {
            if (user) {
                const resolvedParams = await params;
                const { id: productionId, performanceId } = resolvedParams;

                try {
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

                    // 3. Set up Real-time listeners
                    const reservationsRef = collection(db, "reservations");
                    const qRes = query(
                        reservationsRef,
                        where("userId", "==", user.uid),
                        where("performanceId", "==", performanceId)
                    );

                    const logsRef = collection(db, "checkinLogs");
                    const qLogs = query(
                        logsRef,
                        where("userId", "==", user.uid),
                        where("performanceId", "==", performanceId)
                    );

                    let currentReservations: FirestoreReservation[] = [];
                    let currentLogs: any[] = [];

                    const updateData = (res: FirestoreReservation[], logs: any[]) => {
                        const logsByResId: { [key: string]: any[] } = {};
                        logs.forEach(log => {
                            if (!logsByResId[log.reservationId]) logsByResId[log.reservationId] = [];
                            logsByResId[log.reservationId].push(log);
                        });

                        const reservationsWithLogs = res.map(r => ({
                            ...r,
                            logs: (logsByResId[r.id] || []).sort((a, b) => {
                                const tA = a.createdAt?.seconds || 0;
                                const tB = b.createdAt?.seconds || 0;
                                return tB - tA;
                            })
                        }));

                        const bookedCount = res.reduce((sum, item) => {
                            return sum + (item.tickets || []).reduce((tSum: number, t: any) => tSum + (t.count || 0), 0);
                        }, 0);
                        const remainingCount = performance.capacity - bookedCount;

                        setData({
                            production,
                            performance,
                            reservations: reservationsWithLogs,
                            remainingCount
                        });
                        setIsInitialLoading(false);
                    };

                    unsubscribeReservations = onSnapshot(qRes, (snapshot) => {
                        const allRes = serializeDocs<FirestoreReservation>(snapshot.docs);
                        currentReservations = allRes
                            .filter(res => res.status !== 'CANCELED')
                            .map(res => ({
                                ...res,
                                tickets: (res.tickets || []).map((t: any) => ({
                                    ...t,
                                    ticketType: production.ticketTypes.find((tt: any) => tt.id === t.ticketTypeId) || { name: '不明な券種', price: t.price || 0 }
                                }))
                            }));
                        updateData(currentReservations, currentLogs);
                    }, (err) => {
                        console.error("Reservations Snapshot error:", err);
                        setIsInitialLoading(false);
                    });

                    unsubscribeLogs = onSnapshot(qLogs, (snapshot) => {
                        currentLogs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                        updateData(currentReservations, currentLogs);
                    }, (err) => {
                        console.error("Logs Snapshot error:", err);
                    });

                } catch (err) {
                    console.error("Fetch error:", err);
                    setIsInitialLoading(false);
                }
            } else if (!loading) {
                setIsInitialLoading(false);
            }
        };

        fetchData();

        return () => {
            if (unsubscribeReservations) unsubscribeReservations();
            if (unsubscribeLogs) unsubscribeLogs();
        };
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
                        nextNumber={reservations.filter(r => r.source === 'SAME_DAY').length + 1}
                    />
                </aside>
            </div>
        </div>
    );
}
