'use client';

import { useEffect, useState, use } from 'react';
import { getProductionDetails } from '@/app/actions/production-details';
import Link from 'next/link';
import ProductionSettingsTabs from '@/components/ProductionSettingsTabs';
import { useAuth } from '@/components/AuthProvider';
import { Production, Performance } from '@/types';

export default function ProductionDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { user, loading } = useAuth();
    const [details, setDetails] = useState<{ production: Production, performances: Performance[] } | null>(null);
    const [isInitialLoading, setIsInitialLoading] = useState(true);

    useEffect(() => {
        const fetchDetails = async () => {
            if (user) {
                const data = await getProductionDetails(id, user.uid);
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
        return (
            <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>
                <h2 className="heading-md">公演が見つかりません</h2>
                <p className="text-muted">権限がないか、存在しない公演です。</p>
                <Link href="/productions" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>一覧に戻る</Link>
            </div>
        );
    }

    return (
        <div className="container" style={{ maxWidth: '1000px' }}>
            <div className="page-header" style={{ marginBottom: '2rem' }}>
                <div style={{ marginBottom: '1.25rem' }}>
                    <Link href="/" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', borderRadius: '8px', fontSize: '0.9rem' }}>
                        <span>&larr;</span> ダッシュボードに戻る
                    </Link>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h2 className="heading-lg" style={{ marginBottom: '0.5rem' }}>{details.production.title}</h2>
                        <p className="text-muted" style={{ fontSize: '0.95rem' }}>公演のスケジュールとチケット設定を管理します。</p>
                    </div>
                </div>
            </div>

            <ProductionSettingsTabs
                production={details.production}
                performances={details.performances}
                ticketTypes={details.production.ticketTypes}
            />
        </div>
    );
}
