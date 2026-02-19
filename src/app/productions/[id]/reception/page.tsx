'use client';

import { useEffect, useState, use } from 'react';
import { fetchProductionDetailsClient } from '@/lib/client-firestore';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReceptionLinkManager from '@/components/ReceptionLinkManager';
import { useAuth } from '@/components/AuthProvider';
import { Production, Performance } from '@/types';

export default function ReceptionPage({ params }: { params: Promise<{ id: string }> }) {
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
        <div className="container" style={{ maxWidth: '800px' }}>
            <div className="page-header" style={{ marginBottom: '2.5rem' }}>
                <div style={{ marginBottom: '1.5rem' }}>
                    <Link href="/dashboard" className="btn btn-secondary" style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.75rem 1.5rem',
                        fontWeight: 'bold'
                    }}>
                        <span>&larr;</span> ダッシュボードに戻る
                    </Link>
                </div>

                <h2 className="heading-lg" style={{ borderLeft: '4px solid var(--primary)', paddingLeft: '1rem', margin: 0 }}>
                    予約受付管理: {production.title}
                </h2>
                <p className="text-muted" style={{ marginTop: '0.5rem' }}>
                    一般のお客様向けの予約フォームの公開と共有設定を行います。
                </p>
            </div>

            <div style={{ display: 'grid', gap: '2rem' }}>
                <ReceptionLinkManager
                    productionId={production.id}
                    initialStatus={production.receptionStatus}
                    initialStart={production.receptionStart}
                    initialEnd={production.receptionEnd}
                    initialEndMode={(production as any).receptionEndMode || 'MANUAL'}
                    initialEndMinutes={(production as any).receptionEndMinutes || 0}
                    performances={performances}
                    customId={production.customId}
                />
            </div>
        </div>
    );
}
