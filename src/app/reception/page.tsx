'use server'

import { prisma } from '@/lib/prisma'
import { getActiveProductionId } from '@/app/actions/production-context'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { formatDateTime } from '@/lib/format'

export default async function ReceptionSelectionPage() {
    const activeProductionId = await getActiveProductionId()

    if (!activeProductionId) {
        redirect('/productions')
    }

    const production = await prisma.production.findUnique({
        where: { id: activeProductionId },
        include: {
            performances: {
                orderBy: { startTime: 'asc' }
            }
        }
    })

    if (!production) {
        return notFound()
    }

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
                    {production.performances.map((perf) => (
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
                    {production.performances.length === 0 && (
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
    )
}
