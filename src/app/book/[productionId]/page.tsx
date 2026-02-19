'use client';

import { useEffect, useState, use } from 'react';
import { fetchProductionDetailsClient } from '@/lib/client-firestore';
import PublicReservationForm from '@/components/PublicReservationForm';
import { notFound } from 'next/navigation';
import { Production, Performance } from '@/types';
import { isReceptionOpen } from '@/lib/production';

export default function PublicBookPage({ params }: { params: Promise<{ productionId: string }> }) {
    const { productionId: routeId } = use(params);
    const [details, setDetails] = useState<{ production: Production, performances: Performance[] } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // routeId は docId か customId のいずれか。fetchProductionDetailsClient 内で解決される。
                const data = await fetchProductionDetailsClient(routeId);
                if (!data) {
                    setError("指定された公演が見つかりません。URLが正しいかご確認ください。");
                } else {
                    setDetails(data);
                }
            } catch (err: any) {
                console.error("Error fetching public production details:", err);
                setError("データの取得中に予期せぬエラーが発生しました。しばらく時間を置いてから再度お試しください。");
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [routeId]);

    if (loading) {
        return <div className="flex-center" style={{ height: '50vh' }}>読み込み中...</div>;
    }

    if (error) {
        return (
            <div className="container" style={{ maxWidth: '600px', textAlign: 'center', paddingTop: '4rem' }}>
                <div className="card" style={{ padding: '3rem', borderTop: '4px solid var(--accent)' }}>
                    <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>⚠️</div>
                    <h2 className="heading-lg" style={{ color: 'var(--accent)', marginBottom: '1rem' }}>エラーが発生しました</h2>
                    <p style={{ color: 'var(--text-muted)', lineHeight: '1.8' }}>
                        {error}
                    </p>
                    <div style={{ marginTop: '2rem' }}>
                        <a href="/" className="btn btn-secondary">ホームに戻る</a>
                    </div>
                </div>
            </div>
        );
    }

    if (!details || !details.production) {
        return notFound();
    }

    const { production, performances } = details;

    // 受付可否判定のために公演回情報を含める
    const productionWithContext = {
        ...production,
        performances: performances
    };

    if (!isReceptionOpen(productionWithContext)) {
        return (
            <div className="container" style={{ maxWidth: '600px', textAlign: 'center', paddingTop: '4rem' }}>
                <div className="card" style={{ padding: '3rem' }}>
                    <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>🪞</div>
                    <h2 className="heading-lg" style={{ color: 'var(--primary)', marginBottom: '1rem' }}>受付停止中</h2>
                    <p style={{ color: 'var(--text-muted)', lineHeight: '1.8' }}>
                        申し訳ございません。<br />
                        「{production.title}」のチケット予約は現在受け付けておりません。<br />
                        受付開始まで今しばらくお待ちください。
                    </p>
                </div>
            </div>
        );
    }

    // UI expects production to have performances for the selection
    const productionWithPerformances = {
        ...production,
        performances: performances
    };

    return (
        <div className="container" style={{ maxWidth: '600px', paddingBottom: '4rem' }}>
            <header style={{ textAlign: 'center', margin: '3rem 0' }}>
                <p style={{ letterSpacing: '0.2em', color: 'var(--primary)', fontWeight: 'bold', marginBottom: '0.5rem' }}>TICKET RESERVATION</p>
                <h1 className="heading-lg" style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>{production.title}</h1>
                <div style={{ width: '40px', height: '2px', backgroundColor: 'var(--primary)', margin: '0 auto' }}></div>
            </header>

            <PublicReservationForm production={productionWithPerformances as any} />
        </div>
    );
}
