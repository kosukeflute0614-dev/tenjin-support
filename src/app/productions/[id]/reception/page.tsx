'use client';

import { useEffect, useState, use } from 'react';
import { fetchProductionDetailsClient } from '@/lib/client-firestore';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReceptionLinkManager from '@/components/ReceptionLinkManager';
import ActorUrlManager from '@/components/ActorUrlManager';
import { useAuth } from '@/components/AuthProvider';
import { Production, Performance } from '@/types';
import { toDate } from '@/lib/firestore-utils';

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
        <div className="container" style={{ maxWidth: '1000px' }}>
            <div className="page-header" style={{ marginBottom: '2.5rem' }}>
                <div style={{ marginBottom: '1.5rem' }}>
                    <Link href="/dashboard" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', borderRadius: '8px', fontSize: '0.9rem' }}>
                        <span>&larr;</span> ダッシュボードに戻る
                    </Link>
                </div>
                <h2 className="heading-lg" style={{ margin: 0 }}>
                    受付設定
                </h2>
                <p className="text-muted" style={{ marginTop: '0.5rem' }}>
                    一般のお客様向けの予約フォームの公開と共有設定を行います。
                </p>
            </div>

            <ReceptionLinkManager
                productionId={production.id}
                initialStatus={production.receptionStatus}
                initialStart={production.receptionStart ? toDate(production.receptionStart).toISOString() : null}
                initialEnd={production.receptionEnd ? toDate(production.receptionEnd).toISOString() : null}
                initialEndMode={(production as any).receptionEndMode || 'MANUAL'}
                initialEndMinutes={(production as any).receptionEndMinutes || 0}
                performances={performances}
                customId={production.customId}
                production={{
                    ticketTypes: production.ticketTypes,
                    venue: production.venue,
                    emailTemplates: production.emailTemplates,
                }}
            />

            <ActorUrlManager production={production} />

            {/* 関連する設定 */}
            <div style={{ marginTop: '2.5rem' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                    関連する設定
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
                    <Link
                        href={`/productions/${production.id}/email`}
                        style={{
                            display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                            padding: '1rem 1.25rem', borderRadius: '10px',
                            background: 'var(--secondary)', border: '1px solid var(--card-border)',
                            textDecoration: 'none', color: 'inherit',
                            transition: 'border-color 0.15s, box-shadow 0.15s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--card-border)'; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                        <span style={{ fontSize: '1.3rem', lineHeight: 1, flexShrink: 0, marginTop: '0.1rem' }}>📩</span>
                        <div>
                            <div style={{ fontWeight: '600', fontSize: '0.9rem', marginBottom: '0.25rem' }}>自動メール設定</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>予約確認メールのテンプレートを編集</div>
                        </div>
                    </Link>
                    <Link
                        href={`/productions/${production.id}/form-editor`}
                        style={{
                            display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                            padding: '1rem 1.25rem', borderRadius: '10px',
                            background: 'var(--secondary)', border: '1px solid var(--card-border)',
                            textDecoration: 'none', color: 'inherit',
                            transition: 'border-color 0.15s, box-shadow 0.15s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--card-border)'; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                        <span style={{ fontSize: '1.3rem', lineHeight: 1, flexShrink: 0, marginTop: '0.1rem' }}>📝</span>
                        <div>
                            <div style={{ fontWeight: '600', fontSize: '0.9rem', marginBottom: '0.25rem' }}>予約フォーム設定</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>フォームの項目や表示をカスタマイズ</div>
                        </div>
                    </Link>
                </div>
            </div>
        </div>
    );
}
