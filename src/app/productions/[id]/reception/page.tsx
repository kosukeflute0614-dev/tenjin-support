import { getProductionDetails } from '@/app/actions/production-details';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReceptionLinkManager from '@/components/ReceptionLinkManager';

export const dynamic = 'force-dynamic';

export default async function ReceptionPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const production = await getProductionDetails(id);

    if (!production) {
        return notFound();
    }

    return (
        <div className="container" style={{ maxWidth: '800px' }}>
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
                    performances={production.performances}
                />

            </div>
        </div>
    );
}
