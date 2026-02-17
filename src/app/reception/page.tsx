'use client';

import { useEffect, useState } from 'react';
import { getActiveProductionId } from '@/app/actions/production-context';
import { getProductionDetails } from '@/app/actions/production-details';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatDateTime } from '@/lib/format';
import { useAuth } from '@/components/AuthProvider';
import { Production, Performance } from '@/types';

export default function ReceptionSelectionPage() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [details, setDetails] = useState<{ production: Production, performances: Performance[] } | null>(null);
    const [isInitialLoading, setIsInitialLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            if (user) {
                const activeId = await getActiveProductionId();
                if (!activeId) {
                    router.push('/productions');
                    return;
                }
                const data = await getProductionDetails(activeId, user.uid);
                setDetails(data);
            }
            setIsInitialLoading(false);
        };

        if (!loading) {
            fetchData();
        }
    }, [user, loading, router]);

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
                <Link href="/productions" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>公演一覧へ</Link>
            </div>
        );
    }

    const { production, performances } = details;

    return (
        <div className="container" style={{ maxWidth: '800px' }}>
            <header style={{ marginBottom: '2rem' }}>
                <Link href="/" className="btn btn-secondary" style={{ marginBottom: '1rem' }}>
                    &larr; ダッシュボードに戻る
                </Link>
                <h1 className="heading-lg">当日受付：公演回を選択</h1>
                <p className="text-muted">受付を行う公演回を選択してください。</p>
            </header>

            <div className="card" style={{ padding: 0 }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--card-border)', background: 'var(--secondary)' }}>
                    <h2 className="heading-md" style={{ marginBottom: 0 }}>{production.title}</h2>
                </div>
                <div style={{ display: 'grid' }}>
                    {performances.map((perf) => (
                        <Link
                            key={perf.id}
                            href={`/productions/${production.id}/checkin/${perf.id}`}
                            style={{
                                padding: '1.5rem',
                                borderBottom: '1px solid var(--card-border)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                transition: 'background 0.2s'
                            }}
                            className="performance-link"
                        >
                            <div>
                                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--foreground)' }}>
                                    {formatDateTime(perf.startTime)}
                                </div>
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                    定員: {perf.capacity}名
                                </div>
                            </div>
                            <div style={{ color: 'var(--primary)', fontWeight: 'bold' }}>
                                受付画面へ &rarr;
                            </div>
                        </Link>
                    ))}
                    {performances.length === 0 && (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            公演回が登録されていません。
                        </div>
                    )}
                </div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                .performance-link:hover {
                    background-color: #f8f9fa;
                }
                .performance-link:last-child {
                    border-bottom: none;
                }
            `}} />
        </div>
    );
}
