'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getReservations, getBookingOptions } from '@/app/actions/reservation';
import { getActiveProductionId } from '@/app/actions/production-context';
import ReservationList from '@/components/ReservationList';
import { useAuth } from '@/components/AuthProvider';
import { FirestoreReservation } from '@/types';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { serializeDocs, toDate } from '@/lib/firestore-utils';

export default function ReservationsPage() {
    const { user, loading } = useAuth();
    const [reservations, setReservations] = useState<FirestoreReservation[]>([]);
    const [bookingOptions, setBookingOptions] = useState<any[]>([]);
    const [isInitialLoading, setIsInitialLoading] = useState(true);

    useEffect(() => {
        let unsubscribe: () => void = () => { };

        const setupRealtimeListener = async () => {
            if (user) {
                try {
                    const activeProductionId = await getActiveProductionId();

                    // 1. Fetch booking options (productions info) - static for now
                    const options = activeProductionId
                        ? await getBookingOptions(activeProductionId, user.uid)
                        : await getBookingOptions(undefined, user.uid);
                    setBookingOptions(options);

                    // 2. Set up listener for reservations (filter by active production)
                    const reservationsRef = collection(db, "reservations");
                    const constraints = [where("userId", "==", user.uid)];
                    if (activeProductionId) {
                        constraints.push(where("productionId", "==", activeProductionId));
                    }
                    const q = query(reservationsRef, ...constraints);

                    unsubscribe = onSnapshot(q, (snapshot) => {
                        const res = serializeDocs<FirestoreReservation>(snapshot.docs);
                        // Manual sort by createdAt descending
                        const sortedRes = res.sort((a, b) => {
                            const timeA = a.createdAt ? toDate(a.createdAt!).getTime() : 0;
                            const timeB = b.createdAt ? toDate(b.createdAt!).getTime() : 0;
                            return timeB - timeA;
                        });
                        setReservations(sortedRes);
                        setIsInitialLoading(false);
                    }, (error) => {
                        console.error("Reservations snapshot error:", error);
                        setIsInitialLoading(false);
                    });
                } catch (error) {
                    console.error("Error setting up reservations listener:", error);
                    setIsInitialLoading(false);
                }
            } else {
                setIsInitialLoading(false);
            }
        };

        if (!loading) {
            setupRealtimeListener();
        }

        return () => unsubscribe();
    }, [user, loading]);

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

    return (
        <div className="reservations-page container">
            <div className="page-header" style={{ marginBottom: '2.5rem' }}>
                <div style={{ marginBottom: '1.5rem' }}>
                    <Link href="/dashboard" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', borderRadius: '8px', fontSize: '0.9rem' }}>
                        <span>&larr;</span> ダッシュボードに戻る
                    </Link>
                </div>

                <div className="flex-center" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                        <h2 className="heading-lg" style={{ margin: 0 }}>予約管理</h2>
                        <p className="text-muted" style={{ marginTop: '0.5rem' }}>
                            全 {reservations.filter(r => r.status !== 'CANCELED').length} 件の予約があります。
                        </p>
                    </div>
                    <Link href="/reservations/new" className="btn btn-primary" style={{ padding: '0.8rem 2rem', fontSize: '1.1rem', fontWeight: 'bold' }}>
                        + 新規予約登録
                    </Link>
                </div>
            </div>

            <ReservationList reservations={reservations} bookingOptions={bookingOptions} />
        </div>
    );
}
