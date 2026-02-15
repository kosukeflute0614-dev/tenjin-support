import { getBookingOptions } from '@/app/actions/reservation';
import ReservationForm from '@/components/ReservationForm';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function NewReservationPage() {
    const productions = await getBookingOptions();

    return (
        <div className="container" style={{ maxWidth: '600px' }}>
            <div style={{ marginBottom: '1.5rem' }}>
                <Link href="/reservations" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}>
                    <span>&larr;</span> 予約一覧に戻る
                </Link>
            </div>
            <h2 className="heading-lg" style={{ marginBottom: '1.5rem', borderBottom: '2px solid var(--primary)', paddingBottom: '0.5rem' }}>新規予約登録</h2>

            <ReservationForm productions={productions} />
        </div>
    );
}
