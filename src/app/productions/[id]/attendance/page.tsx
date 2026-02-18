'use client';

import { useEffect, useState, use } from 'react';
import { fetchProductionDetailsClient } from '@/lib/client-firestore';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import AttendanceStatus from '@/components/AttendanceStatus';
import { useAuth } from '@/components/AuthProvider';
import { Production, Performance } from '@/types';

export default function AttendancePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { user, loading } = useAuth();
    const [details, setDetails] = useState<{ production: Production, performances: Performance[] } | null>(null);
    const [isInitialLoading, setIsInitialLoading] = useState(true);

    useEffect(() => {
        const fetchDetails = async () => {
            if (user) {
                const data = await fetchProductionDetailsClient(id, user.uid);
                setDetails(data);
            }
            setIsInitialLoading(false);
        };

        if (!loading) {
            fetchDetails();
        }
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

    if (!details || !details.production) {
        return notFound();
    }

    const { production, performances } = details;

    return (
        <div className="container" style={{ maxWidth: '1000px' }}>
            <div className="page-header" style={{ marginBottom: '2.5rem' }}>
                <div style={{ marginBottom: '1.5rem' }}>
                    <Link href="/" className="btn btn-secondary" style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.75rem 1.5rem',
                        fontWeight: 'bold'
                    }}>
                        <span>&larr;</span> ダッシュボードに戻る
                    </Link>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <h2 className="heading-lg" style={{ borderLeft: '4px solid var(--primary)', paddingLeft: '1rem', margin: 0 }}>
                            来場状況モニタリング: {production.title}
                        </h2>
                        <p className="text-muted" style={{ marginTop: '0.5rem' }}>
                            現在の来場状況をリアルタイムで確認できます。
                        </p>
                    </div>
                </div>
            </div>

            <AttendanceStatus
                productionId={production.id}
                performances={performances}
            />
        </div>
    );
}
