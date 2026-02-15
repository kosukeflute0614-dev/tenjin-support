import Link from 'next/link';
import { getReservations, getBookingOptions } from '@/app/actions/reservation';
import ReservationList from '@/components/ReservationList';

export const dynamic = 'force-dynamic';

export default async function ReservationsPage() {
    const reservations = await getReservations();
    const bookingOptions = await getBookingOptions();

    return (
        <div className="reservations-page container">
            <div className="page-header" style={{ marginBottom: '2.5rem' }}>
                <div style={{ marginBottom: '1.5rem' }}>
                    <Link href="/" className="btn btn-secondary" style={{
                        padding: '0.75rem 1.5rem',
                        fontSize: '1rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontWeight: 'bold',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}>
                        <span>&larr;</span> ダッシュボードに戻る
                    </Link>
                </div>

                <div className="flex-center" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                        <h2 className="heading-lg" style={{ margin: 0, borderLeft: '4px solid var(--primary)', paddingLeft: '1rem' }}>予約管理</h2>
                        <p className="text-muted" style={{ marginTop: '0.5rem' }}>
                            全 {reservations.filter(r => r.status !== 'CANCELED').length} 件の予約があります。
                        </p>
                    </div>
                    <Link href="/reservations/new" className="btn btn-primary" style={{ padding: '0.8rem 2rem', fontSize: '1.1rem', fontWeight: 'bold' }}>
                        + 新規予約登録
                    </Link>
                </div>
            </div>

            <ReservationList reservations={reservations} bookingOptions={bookingOptions} />
        </div>
    );
}
