'use server'

import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { formatDateTime, formatTime } from '@/lib/format'
import CheckinList from '../../../../../components/CheckinList'
import SameDayTicketForm from '../../../../../components/SameDayTicketForm'
import GlobalReservationSearch from '../../../../../components/GlobalReservationSearch'
import Link from 'next/link'

export default async function CheckinPage({ params }: { params: Promise<{ id: string, performanceId: string }> }) {
    const { id: productionId, performanceId } = await params

    const production = await prisma.production.findUnique({
        where: { id: productionId },
        include: {
            performances: {
                orderBy: { startTime: 'asc' }
            },
            ticketTypes: true
        }
    })

    const performance = await (prisma.performance.findUnique({
        where: { id: performanceId },
        include: {
            reservations: {
                where: { status: { not: 'CANCELED' } },
                include: {
                    tickets: {
                        include: { ticketType: true }
                    },
                    logs: {
                        orderBy: { createdAt: 'desc' }
                    }
                }
            }
        }
    } as any) as any)

    if (!production || !performance) return notFound()

    // 当日券残数計算
    const bookedCount = performance.reservations.reduce((sum: number, res: any) => {
        return sum + res.tickets.reduce((tSum: number, t: any) => tSum + (t.count || 0), 0)
    }, 0)
    const remainingCount = performance.capacity - bookedCount

    return (
        <div className="container" style={{ paddingBottom: '4rem' }}>
            <header style={{ marginBottom: '2rem', borderBottom: '1px solid var(--card-border)', paddingBottom: '1rem' }}>
                <Link href="/reception" className="btn btn-secondary" style={{ marginBottom: '1rem', display: 'inline-block', fontSize: '0.85rem' }}>
                    &larr; 公演回の選択に戻る
                </Link>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <h1 className="heading-lg" style={{ marginBottom: '0.25rem' }}>当日受付：{production.title}</h1>
                        <p style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
                            {formatDateTime(performance.startTime)} 開演
                        </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div className="card" style={{ padding: '0.75rem 1.5rem', background: 'var(--secondary)', border: '2px solid var(--primary)' }}>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>当日券 残数</p>
                            <p style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--primary)' }}>{remainingCount} <span style={{ fontSize: '1rem' }}>枚</span></p>
                        </div>
                    </div>
                </div>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '2rem', alignItems: 'start' }}>
                {/* 左ペイン：予約一覧 */}
                <div>
                    <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2 className="heading-md" style={{ marginBottom: 0 }}>予約者名簿 ({performance.reservations.length}組)</h2>
                        <GlobalReservationSearch productionId={productionId} />
                    </div>
                    <CheckinList
                        reservations={performance.reservations}
                        performanceId={performanceId}
                        productionId={productionId}
                    />
                </div>

                {/* 右ペイン：当日券発行 */}
                <aside style={{ position: 'sticky', top: '2rem' }}>
                    <h2 className="heading-md">当日券発行</h2>
                    <SameDayTicketForm
                        productionId={productionId}
                        performanceId={performanceId}
                        ticketTypes={production.ticketTypes}
                        remainingCount={remainingCount}
                    />
                </aside>
            </div>
        </div>
    )
}
