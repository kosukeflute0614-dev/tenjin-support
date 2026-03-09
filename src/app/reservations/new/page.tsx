'use client';

import { useEffect, useState } from 'react';
import { fetchBookingOptionsClient, ensureInvitationTicket } from '@/lib/client-firestore';
import ReservationForm from '@/components/ReservationForm';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';

export default function NewReservationPage() {
    const { user, loading: authLoading } = useAuth();
    const [productions, setProductions] = useState<any[]>([]);
    const [isDataLoading, setIsDataLoading] = useState(true);

    useEffect(() => {
        const fetchProductions = async () => {
            if (user) {
                const data = await fetchBookingOptionsClient(undefined, user.uid);
                // 既存公演に招待チケットが無ければ自動追加
                await Promise.all(data.map((prod: any) => ensureInvitationTicket(prod.id, user.uid)));
                setProductions(data);
            }
            setIsDataLoading(false);
        };

        if (!authLoading) {
            fetchProductions();
        }
    }, [user, authLoading]);

    if (authLoading || isDataLoading) {
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
        <div className="container" style={{ maxWidth: '1000px' }}>
            <div style={{ marginBottom: '1.5rem' }}>
                <Link href="/reservations" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', borderRadius: '8px', fontSize: '0.9rem' }}>
                    <span>&larr;</span> 予約一覧に戻る
                </Link>
            </div>
            <h2 className="heading-lg" style={{ marginBottom: '1.5rem' }}>新規予約登録</h2>

            <ReservationForm productions={productions} />
        </div>
    );
}
