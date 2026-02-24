'use client'

import { useState, useRef, useEffect } from 'react'
import { createSameDayTicketClient, createSameDayTicketStaffClient } from '@/lib/client-firestore'
import { NumberStepper, SoftKeypad } from './TouchInputs'
import { useAuth } from './AuthProvider'

export default function SameDayTicketForm({
    productionId,
    performanceId,
    ticketTypes,
    remainingCount,
    nextNumber = 1,
    staffToken
}: {
    productionId: string,
    performanceId: string,
    ticketTypes: any[],
    remainingCount: number,
    nextNumber?: number,
    staffToken?: string
}) {
    const { user } = useAuth()
    const [customerName, setCustomerName] = useState(`当日_${nextNumber}`)
    const [ticketCounts, setTicketCounts] = useState<{ [id: string]: number }>(() => {
        const initial: any = {}
        ticketTypes.forEach(t => initial[t.id] = 0)
        return initial
    })
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState('')

    // nextNumber が変更されたら（かつ名前が手付かずなら）デフォルト名を更新
    const prevDefaultNameRef = useRef(`当日_${nextNumber}`)
    useEffect(() => {
        const newDefault = `当日_${nextNumber}`
        // 名前が空、あるいは「前のデフォルト名」と同じままであれば、新しいデフォルト名に上書き
        if (!customerName || customerName === prevDefaultNameRef.current) {
            setCustomerName(newDefault)
        }
        prevDefaultNameRef.current = newDefault
    }, [nextNumber])

    // お釣り計算用
    const [receivedStr, setReceivedStr] = useState('')
    const received = parseInt(receivedStr || '0')
    const [showKeypad, setShowKeypad] = useState(false)
    const keypadRef = useRef<HTMLDivElement>(null)

    const totalQuantity = Object.values(ticketCounts).reduce((sum, count) => sum + count, 0)
    const totalPrice = (ticketTypes as any[]).reduce((sum, t) => sum + ((t.doorPrice ?? t.price) * (ticketCounts[t.id] || 0)), 0)
    const change = received - totalPrice

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (totalQuantity === 0) {
            setError('枚数を指定してください')
            return
        }
        if (totalQuantity > remainingCount) {
            setError('満席のため登録できません')
            return
        }

        setIsSubmitting(true)
        setError('')

        try {
            if (staffToken) {
                await createSameDayTicketStaffClient(
                    performanceId,
                    productionId,
                    customerName,
                    ticketCounts,
                    staffToken
                )
            } else {
                if (!user) throw new Error('ログインが必要です')
                await createSameDayTicketClient(
                    performanceId,
                    productionId,
                    customerName,
                    ticketCounts,
                    user.uid
                )
            }

            // Reset form
            setCustomerName(`当日_${nextNumber + 1}`) // 次の番号を予測してセット（CheckinPageからも降ってくるが即応性のため）
            const resetCounts: any = {}
            ticketTypes.forEach(t => resetCounts[t.id] = 0)
            setTicketCounts(resetCounts)
            setReceivedStr('')
            setShowKeypad(false)
        } catch (err: any) {
            setError(err.message || '登録に失敗しました')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="card" style={{ background: '#fff9f9', position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
            {error && (
                <div style={{ color: 'var(--accent)', fontSize: '0.85rem', marginBottom: '1rem', padding: '0.5rem', border: '1px solid var(--accent)', background: '#fff', borderRadius: '4px' }}>
                    {error}
                </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                    <label className="label" style={{ fontWeight: 'bold' }}>お名前</label>
                    <input
                        type="text"
                        value={customerName}
                        onChange={e => setCustomerName(e.target.value)}
                        className="input"
                        placeholder="例: 当日 太郎"
                        required
                    />
                </div>

                <div className="form-group">
                    <label className="label" style={{
                        fontWeight: 'bold', borderLeft: '4px solid var(--primary)',
                        padding: '0.4rem 0.75rem', background: '#f4f4f4', borderRadius: '0 4px 4px 0',
                        display: 'block', marginBottom: '1rem'
                    }}>
                        券種と枚数
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {ticketTypes.map(t => (
                            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '0.75rem', borderRadius: '8px', border: '1px solid #eee' }}>
                                <div style={{ fontSize: '0.9rem' }}>
                                    <div style={{ fontWeight: 'bold' }}>{t.name}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#888' }}>¥{(t.doorPrice ?? t.price).toLocaleString()}</div>
                                </div>
                                <div style={{ width: '140px' }}>
                                    <NumberStepper
                                        value={ticketCounts[t.id] || 0}
                                        min={0}
                                        max={remainingCount}
                                        onChange={(val) => setTicketCounts({ ...ticketCounts, [t.id]: val })}
                                        label="枚"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div style={{ borderTop: '1px solid #eee', marginTop: '1rem', paddingTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div>
                        <div style={{ fontSize: '0.8rem', color: '#666' }}>合計金額</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                            ¥{totalPrice.toLocaleString()}
                            <span style={{ fontSize: '0.9rem', color: '#666', fontWeight: 'normal', marginLeft: '0.5rem' }}>({totalQuantity}枚)</span>
                        </div>
                    </div>

                    {/* 電卓ポップオーバー */}
                    <div style={{ position: 'relative' }}>
                        <button
                            type="button"
                            onClick={() => setShowKeypad(!showKeypad)}
                            style={{
                                background: '#fff',
                                border: '1px solid var(--primary)',
                                borderRadius: '4px',
                                padding: '6px 16px',
                                fontSize: '0.9rem',
                                color: 'var(--primary)',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                            }}
                        >
                            電卓
                        </button>

                        {showKeypad && (
                            <div
                                ref={keypadRef}
                                style={{
                                    position: 'absolute', right: '0', bottom: '100%', marginBottom: '10px', width: '280px', background: '#fff',
                                    border: '1px solid #ddd', borderRadius: '12px', boxShadow: '0 -10px 25px rgba(0,0,0,0.2)',
                                    zIndex: 100, padding: '0.75rem 1rem'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#666' }}>お釣り計算</span>
                                    <button
                                        type="button"
                                        onClick={() => setShowKeypad(false)}
                                        style={{
                                            background: '#f5f5f5',
                                            border: 'none',
                                            fontSize: '1.25rem',
                                            cursor: 'pointer',
                                            color: '#666',
                                            width: '28px',
                                            height: '28px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            borderRadius: '50%',
                                            lineHeight: 1,
                                            padding: 0
                                        }}
                                    >
                                        &times;
                                    </button>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.75rem', color: '#999' }}>預かり</span>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#333' }}>
                                            {received.toLocaleString()} <span style={{ fontSize: '0.8rem', fontWeight: 'normal' }}>円</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #eee', paddingTop: '0.4rem' }}>
                                        <span style={{ fontSize: '0.75rem', color: '#999' }}>{change >= 0 ? 'お釣り' : '不足'}</span>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: change >= 0 ? 'var(--success)' : 'var(--primary)' }}>
                                            ¥{Math.abs(change).toLocaleString()}
                                        </div>
                                    </div>
                                </div>

                                <SoftKeypad
                                    onInput={(digit) => setReceivedStr(prev => {
                                        if (digit === '00' && (prev === '' || prev === '0')) return '0'
                                        if (prev === '0' && digit !== '00') return digit
                                        return prev + digit
                                    })}
                                    onClear={() => setReceivedStr('')}
                                    onQuickInput={(amount) => setReceivedStr(prev => ((parseInt(prev) || 0) + amount).toString())}
                                />
                            </div>
                        )}
                    </div>
                </div>

                <button
                    type="submit"
                    className="btn btn-primary"
                    style={{
                        width: '100%', padding: '1.2rem', fontWeight: 'bold',
                        fontSize: '1.1rem', borderRadius: '12px',
                        boxShadow: '0 4px 14px rgba(var(--primary-rgb), 0.3)'
                    }}
                    disabled={isSubmitting || remainingCount <= 0 || totalQuantity === 0}
                >
                    {isSubmitting ? '登録中...' : '当日券として予約を登録'}
                </button>

                {remainingCount <= 0 && (
                    <p style={{ color: 'var(--accent)', fontSize: '0.8rem', marginTop: '0.75rem', textAlign: 'center', fontWeight: 'bold' }}>
                        ⚠️ 満席のため販売できません
                    </p>
                )}
            </div>
        </form>
    )
}
