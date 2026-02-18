'use client'

import { useState } from 'react'
import { searchReservations } from '@/app/actions/reservation-search'
import { formatDateTime } from '@/lib/format'
import { useAuth } from './AuthProvider'

export default function GlobalReservationSearch({ productionId }: { productionId: string }) {
    const { user } = useAuth()
    const [enabled, setEnabled] = useState(false)
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<any[]>([])
    const [isSearching, setIsSearching] = useState(false)

    const handleSearch = async (q: string) => {
        setQuery(q)
        if (q.length < 2 || !user) {
            setResults([])
            return
        }
        setIsSearching(true)
        try {
            const data = await searchReservations(q, user.uid)
            // 当該プロジェクト以外の予約が混ざる可能性があればフィルタリング（今回はプロジェクト内全公演想定）
            setResults(data)
        } catch (err) {
            console.error(err)
        } finally {
            setIsSearching(false)
        }
    }

    if (!enabled) {
        return (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
                    別の公演回の予約を検索する（例外対応用）
                </label>
            </div>
        )
    }

    return (
        <div className="card" style={{ position: 'absolute', top: '100%', right: 0, zIndex: 100, width: '400px', padding: '1rem', boxShadow: '0 10px 30px rgba(0,0,0,0.15)', marginTop: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>全公演回 検索</span>
                <button onClick={() => { setEnabled(false); setQuery(''); setResults([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>&times;</button>
            </div>

            <input
                type="text"
                className="input"
                placeholder="お名前を入力..."
                value={query}
                onChange={e => handleSearch(e.target.value)}
                autoFocus
            />

            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {isSearching && <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>検索中...</p>}
                {!isSearching && query.length >= 2 && results.length === 0 && (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>見つかりませんでした</p>
                )}
                {results.map(res => (
                    <div key={res.id} style={{ padding: '0.75rem 0', borderBottom: '1px solid #eee' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{res.customerName}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--primary)', marginTop: '0.2rem' }}>
                            予約回: {formatDateTime(res.performance.startTime)}
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.3rem', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.3rem', borderRadius: '3px', background: res.paymentStatus === 'PAID' ? '#e6fffa' : '#fff5f5', color: res.paymentStatus === 'PAID' ? '#2c7a7b' : '#c53030', border: '1px solid currentColor' }}>
                                {res.paymentStatus === 'PAID' ? '精算済' : '未精算'}
                            </span>
                            <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.3rem', borderRadius: '3px', background: res.checkinStatus === 'CHECKED_IN' ? '#ebf8ff' : '#f7fafc', color: res.checkinStatus === 'CHECKED_IN' ? '#2b6cb0' : '#4a5568', border: '1px solid currentColor' }}>
                                {res.checkinStatus === 'CHECKED_IN' ? '入場済' : res.checkinStatus === 'PARTIALLY_CHECKED_IN' ? '一部入場' : '未入場'}
                            </span>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {res.tickets.map((t: any) => `${t.ticketType?.name || '不明な券種'}${t.count}枚`).join(', ')}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '1rem' }}>
                ※この検索結果からは受付操作はできません。
            </p>
        </div>
    )
}
