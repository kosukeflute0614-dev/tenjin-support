import { prisma } from '@/lib/prisma';
import PublicReservationForm from '@/components/PublicReservationForm';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function PublicBookPage({ params }: { params: Promise<{ productionId: string }> }) {
    const { productionId } = await params;

    const production = await prisma.production.findUnique({
        where: { id: productionId },
        include: {
            performances: {
                orderBy: { startTime: 'asc' }
            },
            ticketTypes: true
        }
    });

    if (!production) {
        return notFound();
    }

    const { isReceptionOpen } = await import('@/lib/production');

    if (!isReceptionOpen(production)) {
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

    return (
        <div className="container" style={{ maxWidth: '600px', paddingBottom: '4rem' }}>
            <header style={{ textAlign: 'center', margin: '3rem 0' }}>
                <p style={{ letterSpacing: '0.2em', color: 'var(--primary)', fontWeight: 'bold', marginBottom: '0.5rem' }}>TICKET RESERVATION</p>
                <h1 className="heading-lg" style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>{production.title}</h1>
                <div style={{ width: '40px', height: '2px', backgroundColor: 'var(--primary)', margin: '0 auto' }}></div>
            </header>

            <PublicReservationForm production={production} />

            <footer style={{ textAlign: 'center', marginTop: '3rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <p>&copy; {new Date().getFullYear()} Tenjin-Support Theater Ticketing System</p>
            </footer>
        </div>
    );
}
