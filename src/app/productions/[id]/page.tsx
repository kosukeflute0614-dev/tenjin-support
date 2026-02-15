import { getProductionDetails } from '@/app/actions/production-details';
import Link from 'next/link';
import ProductionSettingsTabs from '@/components/ProductionSettingsTabs';

export const dynamic = 'force-dynamic';

export default async function ProductionDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const production = await getProductionDetails(id);

    if (!production) {
        return <div>Production not found</div>;
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
                        <h2 className="heading-lg" style={{ marginBottom: '0.5rem' }}>{production.title}</h2>
                        <p className="text-muted" style={{ fontSize: '0.95rem' }}>公演のスケジュールとチケット設定を管理します。</p>
                    </div>
                </div>
            </div>

            <ProductionSettingsTabs
                production={production}
                performances={production.performances}
                ticketTypes={production.ticketTypes}
            />
        </div>
    );
}
