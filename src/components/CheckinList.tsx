'use client'

import { useState, useTransition, Fragment, useRef } from 'react'
import { addCheckedInTickets, resetCheckIn, processCheckinWithPayment, processPartialReset } from '@/app/actions/checkin'
import { formatTime } from '@/lib/format'
import { NumberStepper, SoftKeypad } from './TouchInputs'

type ReservationWithTickets = any

export default function CheckinList({
    reservations,
    performanceId,
    productionId
}: {
    reservations: ReservationWithTickets[],
    performanceId: string,
    productionId: string
}) {
    const [isPending, startTransition] = useTransition()
    const [selectedRes, setSelectedRes] = useState<any | null>(null)

    const sorted = [...reservations].sort((a, b) => {
        const nameA = a.customerNameKana || a.customerName
        const nameB = b.customerNameKana || b.customerName
        return nameA.localeCompare(nameB, 'ja')
    })

    const getKanaGroup = (kana: string) => {
        if (!kana) return "その他"
        const char = kana[0]
        if (/[あ-お]/.test(char)) return "あ行"
        if (/[か-こ]/.test(char)) return "か行"
        if (/[さ-そ]/.test(char)) return "さ行"
        if (/[た-と]/.test(char)) return "た行"
        if (/[な-の]/.test(char)) return "な行"
        if (/[は-ほ]/.test(char)) return "は行"
        if (/[ま-も]/.test(char)) return "ま行"
        if (/[や-よ]/.test(char)) return "や行"
        if (/[ら-ろ]/.test(char)) return "ら行"
        if (/[わ-ん]/.test(char)) return "わ行"
        return "その他"
    }

    let lastGroup = ""

    return (
        <div className="card" style={{ padding: 0, overflow: 'visible' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ background: 'var(--secondary)', textAlign: 'left', fontSize: '0.85rem' }}>
                        <th style={{ padding: '1rem' }}>お名前</th>
                        <th style={{ padding: '1rem' }}>内容</th>
                        <th style={{ padding: '1rem' }}>状況</th>
                        <th style={{ padding: '1rem', textAlign: 'right' }}>操作</th>
                    </tr>
                </thead>
                <tbody>
                    {sorted.map((res) => {
                        const kana = res.customerNameKana || res.customerName
                        const group = getKanaGroup(kana)
                        const showHeader = group !== lastGroup
                        lastGroup = group

                        const totalTickets = res.tickets.reduce((sum: number, t: any) => sum + (t.count || 0), 0)

                        return (
                            <Fragment key={res.id}>
                                {showHeader && (
                                    <tr style={{ background: '#f8f9fa' }}>
                                        <td colSpan={4} style={{ padding: '0.5rem 1rem', fontWeight: 'bold', borderBottom: '1px solid #eee', fontSize: '0.85rem', color: 'var(--primary)' }}>
                                            {group}
                                        </td>
                                    </tr>
                                )}
                                <tr style={{ borderBottom: '1px solid #eee', background: (res.checkinStatus === 'CHECKED_IN') ? '#f0fff4' : 'transparent' }}>
                                    <td style={{ padding: '1rem' }}>
                                        <div style={{ fontWeight: 'bold' }}>{res.customerName}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{res.customerNameKana}</div>
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        <div style={{ fontSize: '0.85rem' }}>
                                            {res.tickets.map((t: any) => `${t.ticketType.name}×${t.count}`).join(', ')}
                                        </div>
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                            <CheckinBadge status={res.checkinStatus} />
                                            {res.checkinStatus !== 'NOT_CHECKED_IN' && (
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                    ({res.checkedInTickets}/{totalTickets}人)
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                                        <button
                                            className={res.checkinStatus === 'CHECKED_IN' ? "btn btn-secondary" : "btn btn-primary"}
                                            style={{ padding: '0.5rem 1.2rem', fontSize: '0.85rem' }}
                                            disabled={isPending}
                                            onClick={() => setSelectedRes(res)}
                                        >
                                            {res.checkinStatus === 'CHECKED_IN' ? '詳細/ログ' : '受付する'}
                                        </button>
                                    </td>
                                </tr>
                            </Fragment>
                        )
                    })}
                </tbody>
            </table>

            {selectedRes && (
                <DetailModal
                    res={selectedRes}
                    performanceId={performanceId}
                    productionId={productionId}
                    onClose={() => setSelectedRes(null)}
                    onAction={(type, count, additionalPayment, breakdown) => {
                        startTransition(() => {
                            if (type === 'checkin') {
                                // 一括入場の場合の内訳作成
                                const fullBreakdown: any = {}
                                const resTickets = selectedRes.tickets || []
                                resTickets.forEach((t: any) => {
                                    const remainingToPay = t.count - (t.paidCount || 0)
                                    if (remainingToPay > 0) fullBreakdown[t.ticketTypeId] = remainingToPay
                                })
                                processCheckinWithPayment(selectedRes.id, count, additionalPayment || 0, fullBreakdown, performanceId, productionId)
                            } else if (type === 'complex_checkin') {
                                processCheckinWithPayment(selectedRes.id, count, additionalPayment || 0, breakdown || {}, performanceId, productionId)
                            } else if (type === 'reset') {
                                resetCheckIn(selectedRes.id, performanceId, productionId)
                            }
                        })
                        setSelectedRes(null)
                    }}
                    isPending={isPending}
                />
            )}
        </div>
    )
}

function CheckinBadge({ status }: { status: string }) {
    const styles: any = {
        CHECKED_IN: { bg: 'var(--primary)', color: '#fff', label: '全員入場' },
        PARTIALLY_CHECKED_IN: { bg: '#e2e3e5', color: '#383d41', label: '一部入場' },
        NOT_CHECKED_IN: { bg: '#eee', color: '#666', label: '未入場' }
    }
    const style = styles[status] || styles.NOT_CHECKED_IN
    return <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold', background: style.bg, color: style.color }}>{style.label}</span>
}



// 受付詳細モーダル
function DetailModal({
    res,
    performanceId,
    productionId,
    onClose,
    onAction,
    isPending
}: {
    res: any,
    performanceId: string,
    productionId: string,
    onClose: () => void,
    onAction: (type: 'checkin' | 'reset' | 'complex_checkin', count: number, additionalPayment?: number, breakdown?: { [ticketTypeId: string]: number }) => void,
    isPending: boolean
}) {
    const [isTransitionPending, startTransition] = useTransition()
    const tickets = res.tickets || []
    const totalTickets = tickets.reduce((sum: number, t: any) => sum + (t.count || 0), 0)
    const totalAmount = tickets.reduce((sum: number, t: any) => sum + (t.price * t.count), 0)

    // 入場済み人数（DB値）
    const checkedInCount = res.checkedInTickets || 0
    const remaining = totalTickets - checkedInCount
    const currentPaidAmount = res.paidAmount || 0

    // モーダル表示状態: 'DETAIL' | 'CONFIRM_PARTIAL' | 'PARTIAL_EDIT' | 'PARTIAL_RESET'
    const [view, setView] = useState<'DETAIL' | 'CONFIRM_PARTIAL' | 'PARTIAL_EDIT' | 'PARTIAL_RESET'>('DETAIL')

    // 一部入場・会計用の状態
    const [partialEntryCount, setPartialEntryCount] = useState(1)
    const [partialPayingCounts, setPartialPayingCounts] = useState<{ [ticketTypeId: string]: number }>(() => {
        const counts: any = {}
        tickets.forEach((t: any) => counts[t.ticketTypeId] = 0)
        return counts
    })

    // お釣り計算用の状態
    const [receivedStr, setReceivedStr] = useState("")
    const received = parseInt(receivedStr) || 0
    const [showKeypad, setShowKeypad] = useState(false)
    const keypadRef = useRef<HTMLDivElement>(null)

    // 各券種の支払い状況 (DBの値を使用)
    const ticketPaymentStatus = tickets.map((t: any) => ({
        ...t,
        paidCount: t.paidCount || 0,
        remainingCount: t.count - (t.paidCount || 0)
    }))

    // 今回の会計額
    // 初期表示（DETAIL）では残金全員分、一部入場（PARTIAL_EDIT）では選択した人数分を計算する
    const currentTransactionAmount = view === 'PARTIAL_EDIT'
        ? tickets.reduce((sum: any, t: any) => sum + (t.price * (partialPayingCounts[t.ticketTypeId] || 0)), 0)
        : (totalAmount - currentPaidAmount)
    const change = received - currentTransactionAmount


    // 取消用の状態
    const [resetCount, setResetCount] = useState(checkedInCount)
    const [refundBreakdown, setRefundBreakdown] = useState<{ [key: string]: number }>(() =>
        Object.fromEntries(ticketPaymentStatus.map((t: any) => [t.ticketTypeId, t.paidCount]))
    )
    const [confirmStep, setConfirmStep] = useState(0) // 0: 入力, 1: 確認1, 2: 確認2

    const totalRefund = Object.entries(refundBreakdown).reduce((sum, [id, count]) => {
        const ticket = tickets.find((t: any) => t.ticketTypeId === id)
        return sum + (ticket ? ticket.price * count : 0)
    }, 0)

    const handlePartialReset = () => {
        startTransition(() => {
            processPartialReset(res.id, resetCount, totalRefund, refundBreakdown, performanceId, productionId)
                .then(() => onClose())
        })
    }

    // バリデーション: 入場する人数分は必ず支払わないといけない（合計額ベース）
    const totalCheckinAfter = checkedInCount + partialEntryCount
    const sortedByPriceAsc = [...tickets].sort((a, b) => a.price - b.price)
    let tempCheckin = totalCheckinAfter
    let requiredMinAmount = 0
    sortedByPriceAsc.forEach(t => {
        const count = Math.min(t.count, tempCheckin)
        requiredMinAmount += count * t.price
        tempCheckin -= count
    })
    const isAmountValid = (currentPaidAmount + currentTransactionAmount) >= requiredMinAmount

    if (view === 'CONFIRM_PARTIAL') {
        return (
            <ModalOverlay onClose={() => setView('DETAIL')} maxWidth="400px">
                <div style={{ textAlign: 'center', padding: '1rem' }}>
                    <h3 className="heading-md" style={{ marginBottom: '1.5rem', fontSize: '1.25rem' }}>一部入場させますか？</h3>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setView('DETAIL')}>いいえ</button>
                        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setView('PARTIAL_EDIT')}>はい</button>
                    </div>
                </div>
            </ModalOverlay>
        )
    }

    if (view === 'PARTIAL_EDIT') {
        return (
            <ModalOverlay onClose={() => setView('DETAIL')}>
                <div style={{ position: 'relative', height: '80vh', display: 'flex', flexDirection: 'column' }}>
                    {/* ヘッダー */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #eee', paddingBottom: '1rem', flexShrink: 0 }}>
                        <h2 className="heading-md" style={{ margin: 0 }}>一部入場・会計</h2>
                        <button onClick={() => setView('DETAIL')} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
                    </div>

                    {/* メインスクロールエリア */}
                    <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '80px' }}>
                        <div style={{ display: 'flex', gap: '2rem' }}>
                            {/* 左カラム: 設定 */}
                            <div style={{ flex: 1 }}>
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <label style={{
                                        fontSize: '0.85rem', fontWeight: 'bold', display: 'block', marginBottom: '0.75rem',
                                        color: '#333', borderLeft: '4px solid var(--primary)', padding: '0.4rem 0.75rem',
                                        background: '#f4f4f4', borderRadius: '0 4px 4px 0'
                                    }}>
                                        1. 入場する人数
                                    </label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', background: '#f8f9fa', padding: '1rem', borderRadius: '8px', border: '1px solid #eee' }}>
                                        <div style={{ width: '160px' }}>
                                            <NumberStepper
                                                value={partialEntryCount}
                                                min={1}
                                                max={remaining}
                                                onChange={setPartialEntryCount}
                                            />
                                        </div>
                                        <div style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                                            <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#333' }}>{partialEntryCount}</span>
                                            <span style={{ fontSize: '0.9rem', color: '#666' }}>名が入場</span>
                                            <span style={{ fontSize: '0.8rem', color: '#888', marginLeft: '0.5rem' }}>(残り {remaining}名のうち)</span>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '0.75rem' }}>
                                        <label style={{
                                            fontSize: '0.85rem', fontWeight: 'bold', display: 'block', margin: 0,
                                            color: '#333', borderLeft: '4px solid var(--primary)', padding: '0.4rem 0.75rem',
                                            background: '#f4f4f4', borderRadius: '0 4px 4px 0', flex: 1
                                        }}>
                                            2. 今回お支払いいただく枚数
                                        </label>
                                        {!isAmountValid && (
                                            <span style={{ color: 'var(--primary)', fontSize: '0.75rem', fontWeight: 'bold', marginLeft: '1rem', whiteSpace: 'nowrap', marginBottom: '0.3rem' }}>
                                                ⚠️ 入場人数分の支払いが不足しています
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {ticketPaymentStatus.map((t: any) => (
                                            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fcfcfc', padding: '0.75rem', borderRadius: '6px', border: '1px solid #eee' }}>
                                                <div style={{ fontSize: '0.85rem' }}>
                                                    <div style={{ fontWeight: 'bold' }}>{t.ticketType.name} (¥{t.price.toLocaleString()})</div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>残交付: {t.remainingCount}枚</div>
                                                </div>
                                                <div style={{ width: '150px' }}>
                                                    <NumberStepper
                                                        value={partialPayingCounts[t.ticketTypeId]}
                                                        min={0}
                                                        max={t.remainingCount}
                                                        onChange={(val: number) => setPartialPayingCounts({
                                                            ...partialPayingCounts,
                                                            [t.ticketTypeId]: val
                                                        })}
                                                        label="枚"
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* 右カラム: 会計情報と電卓ボタン */}
                            <div style={{ width: '240px' }}>
                                <div style={{ background: 'var(--secondary)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.05)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                        <span style={{ fontSize: '0.8rem', color: '#666' }}>今回会計額</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                        <span style={{ fontWeight: '900', fontSize: '1.5rem' }}>¥{currentTransactionAmount.toLocaleString()}</span>
                                        {/* 電卓ボタン */}
                                        <div style={{ position: 'relative' }}>
                                            <button
                                                onClick={() => setShowKeypad(!showKeypad)}
                                                style={{
                                                    background: '#fff',
                                                    border: '1px solid var(--primary)',
                                                    borderRadius: '4px',
                                                    padding: '4px 12px',
                                                    fontSize: '0.85rem',
                                                    color: 'var(--primary)',
                                                    cursor: 'pointer',
                                                    fontWeight: 'bold',
                                                }}
                                                title="お釣り計算"
                                            >
                                                電卓
                                            </button>
                                            {showKeypad && (
                                                <div
                                                    ref={keypadRef}
                                                    style={{
                                                        position: 'absolute', right: '0', top: '45px', width: '280px', background: '#fff',
                                                        border: '1px solid #ddd', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                                                        zIndex: 100, padding: '0.75rem 1rem'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                                        <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#666' }}>お釣り計算</span>
                                                        <button
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

                                </div>
                                <button className="btn btn-secondary" style={{ width: '100%', marginTop: '1rem', padding: '0.6rem' }} onClick={() => setView('DETAIL')}>戻る</button>
                            </div>
                        </div>
                    </div>

                    {/* 固定フッターアクション */}
                    <div style={{
                        position: 'absolute', bottom: '-1.5rem', right: '-1.5rem', left: '-1.5rem',
                        padding: '1rem 1.5rem', background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)',
                        borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end',
                        borderRadius: '0 0 12px 12px', zIndex: 10, flexShrink: 0
                    }}>
                        <button
                            className="btn btn-primary"
                            style={{
                                minWidth: '240px', padding: '1.2rem 2.5rem', fontSize: '1.25rem', fontWeight: 'bold',
                                borderRadius: '12px', boxShadow: '0 4px 14px rgba(var(--primary-rgb), 0.4)'
                            }}
                            onClick={() => onAction('complex_checkin', partialEntryCount, currentTransactionAmount, partialPayingCounts)}
                            disabled={isPending || !isAmountValid}
                        >
                            一部入場と受領を確定
                        </button>
                    </div>
                </div>
            </ModalOverlay>
        )
    }

    if (view === 'PARTIAL_RESET') {
        if (confirmStep === 1) {
            return (
                <ModalOverlay onClose={() => { setView('DETAIL'); setConfirmStep(0); }} maxWidth="450px">
                    <div style={{ position: 'relative', height: 'auto', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '1rem' }}>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>この内容で取り消しますか？</h3>
                            <div style={{ background: '#f8f9fa', padding: '1.5rem', borderRadius: '12px', marginBottom: '1.5rem', textAlign: 'left', width: '100%', maxWidth: '400px', border: '1px solid #eee' }}>
                                <div style={{ marginBottom: '0.75rem', fontWeight: 'bold', color: '#666', fontSize: '0.9rem' }}>取消内容:</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>入場取消</span>
                                        <span style={{ fontWeight: 'bold' }}>{resetCount}名</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #ddd', paddingTop: '0.5rem' }}>
                                        <span>返金合計</span>
                                        <span style={{ fontWeight: 'bold', color: '#c53030' }}>¥{totalRefund.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 固定フッターアクション */}
                        <div style={{
                            position: 'absolute', bottom: '-1.5rem', right: '-1.5rem', left: '-1.5rem',
                            padding: '1rem 1.5rem', background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)',
                            borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end', gap: '1rem',
                            borderRadius: '0 0 12px 12px', zIndex: 10
                        }}>
                            <button className="btn btn-secondary" style={{ padding: '0.8rem 2rem' }} onClick={() => setConfirmStep(0)}>いいえ</button>
                            <button className="btn btn-primary" style={{ minWidth: '180px', padding: '0.8rem 2rem', background: '#333' }} onClick={() => setConfirmStep(2)}>はい、次へ</button>
                        </div>
                    </div>
                </ModalOverlay>
            )
        }

        if (confirmStep === 2) {
            return (
                <ModalOverlay onClose={() => { setView('DETAIL'); setConfirmStep(0); }} maxWidth="450px">
                    <div style={{ position: 'relative', height: 'auto', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '1rem' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
                            <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem', color: '#c53030' }}>本当に取り消しますか？</h3>
                            <p style={{ fontSize: '1rem', marginBottom: '1.5rem', color: '#666', textAlign: 'center' }}>
                                入場記録と支払い記録が削除されます。<br />
                                この操作は元に戻せません。
                            </p>
                        </div>

                        {/* 固定フッターアクション */}
                        <div style={{
                            position: 'absolute', bottom: '-1.5rem', right: '-1.5rem', left: '-1.5rem',
                            padding: '1rem 1.5rem', background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)',
                            borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end', gap: '1rem',
                            borderRadius: '0 0 12px 12px', zIndex: 10
                        }}>
                            <button className="btn btn-secondary" style={{ padding: '0.8rem 2rem' }} onClick={() => setConfirmStep(0)}>いいえ、戻ります</button>
                            <button
                                className="btn btn-primary"
                                style={{ minWidth: '220px', padding: '0.8rem 2rem', background: '#d93025' }}
                                onClick={handlePartialReset}
                                disabled={isTransitionPending}
                            >
                                {isTransitionPending ? '処理中...' : '取消を実行する'}
                            </button>
                        </div>
                    </div>
                </ModalOverlay>
            )
        }

        return (
            <ModalOverlay onClose={() => setView('DETAIL')}>
                <div style={{ position: 'relative', height: '80vh', display: 'flex', flexDirection: 'column' }}>
                    {/* ヘッダー */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #eee', paddingBottom: '1rem', flexShrink: 0 }}>
                        <h2 className="heading-md" style={{ margin: 0 }}>入場/支払いの取消</h2>
                        <button onClick={() => setView('DETAIL')} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
                    </div>

                    {/* メインスクロールエリア */}
                    <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '80px' }}>
                        <div style={{ display: 'flex', gap: '2rem' }}>
                            {/* 左カラム: 入力 */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 'bold', display: 'block', marginBottom: '0.75rem', color: '#666' }}>1. 取消する入場人数 <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: '#888' }}>(現在: {checkedInCount}名)</span></label>
                                    <NumberStepper
                                        value={resetCount}
                                        min={0}
                                        max={checkedInCount}
                                        onChange={setResetCount}
                                        label="名"
                                    />
                                </div>

                                <div>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 'bold', display: 'block', marginBottom: '0.75rem', color: '#666' }}>2. 返金する枚数 (券種ごと)</label>
                                    <div style={{ background: '#fcfcfc', border: '1px solid #eee', borderRadius: '8px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        {ticketPaymentStatus.filter((t: any) => t.paidCount > 0).map((t: any) => (
                                            <div key={t.id}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>{t.ticketType.name}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#888' }}>支払い済み: {t.paidCount}枚</div>
                                                </div>
                                                <NumberStepper
                                                    value={refundBreakdown[t.ticketTypeId] || 0}
                                                    min={0}
                                                    max={t.paidCount}
                                                    onChange={val => setRefundBreakdown({ ...refundBreakdown, [t.ticketTypeId]: val })}
                                                    label="枚"
                                                />
                                            </div>
                                        ))}
                                        {ticketPaymentStatus.filter((t: any) => t.paidCount > 0).length === 0 && (
                                            <p style={{ color: '#ccc', textAlign: 'center', fontSize: '0.8rem' }}>返金可能なチケットはありません</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* 右カラム: 合計 */}
                            <div style={{ width: '240px' }}>
                                <div style={{ background: '#fff5f5', padding: '1.25rem', borderRadius: '12px', border: '1px solid #ffeded' }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#c53030', marginBottom: '0.5rem' }}>返金合計額</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#c53030' }}>
                                        ¥{totalRefund.toLocaleString()}
                                    </div>
                                </div>
                                <button className="btn btn-secondary" style={{ width: '100%', marginTop: '1rem', padding: '0.6rem' }} onClick={() => setView('DETAIL')}>戻る</button>
                            </div>
                        </div>
                    </div>

                    {/* 固定フッターアクション */}
                    <div style={{
                        position: 'absolute', bottom: '-1.5rem', right: '-1.5rem', left: '-1.5rem',
                        padding: '1rem 1.5rem', background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)',
                        borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end',
                        borderRadius: '0 0 12px 12px', zIndex: 10
                    }}>
                        <button
                            className="btn btn-primary"
                            style={{
                                minWidth: '240px', padding: '1.2rem 2.5rem', fontSize: '1.25rem', fontWeight: 'bold',
                                borderRadius: '12px', background: '#333'
                            }}
                            onClick={() => setConfirmStep(1)}
                            disabled={resetCount === 0 && totalRefund === 0}
                        >
                            確認画面へ
                        </button>
                    </div>
                </div>
            </ModalOverlay>
        )
    }

    return (
        <ModalOverlay onClose={onClose}>
            <div style={{ position: 'relative', height: '80vh', display: 'flex', flexDirection: 'column' }}>
                {/* ヘッダー */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', borderBottom: '1px solid #eee', paddingBottom: '1rem', flexShrink: 0 }}>
                    <div>
                        <h2 className="heading-md" style={{ marginBottom: '0.2rem' }}>{res.customerName} 様</h2>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{res.customerNameKana}</p>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', lineHeight: 1 }}>&times;</button>
                </div>

                {/* メインスクロールエリア */}
                <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '80px' }}>
                    <div style={{ display: 'flex', gap: '2rem' }}>
                        {/* 左カラム: 明細と状況 */}
                        <div style={{ flex: 1 }}>
                            <div style={{ marginBottom: '1rem', background: '#fff', border: '1px solid #eee', borderRadius: '6px', overflow: 'hidden' }}>
                                <div style={{ padding: '0.5rem 0.75rem', background: '#fcfcfc', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#666' }}>予約チケット</span>
                                    <span style={{
                                        fontSize: '0.65rem',
                                        padding: '0.1rem 0.4rem',
                                        borderRadius: '10px',
                                        background: currentPaidAmount >= totalAmount ? '#e6f4ea' : currentPaidAmount > 0 ? '#fff8e1' : '#f5f5f5',
                                        color: currentPaidAmount >= totalAmount ? '#1e8e3e' : currentPaidAmount > 0 ? '#b08b00' : '#70757a',
                                        fontWeight: 'bold',
                                        border: `1px solid ${currentPaidAmount >= totalAmount ? '#ceead6' : currentPaidAmount > 0 ? '#ffe082' : '#e0e0e0'}`
                                    }}>
                                        {currentPaidAmount >= totalAmount ? '● 受領済' : currentPaidAmount > 0 ? '● 一部受領' : '○ 未受領'}
                                    </span>
                                </div>

                                <div style={{ padding: '0.25rem 0' }}>
                                    {ticketPaymentStatus.map((t: any) => (
                                        <div key={t.id} style={{ display: 'flex', padding: '0.5rem 0.75rem', borderBottom: '1px solid #fafafa', alignItems: 'center' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#333', marginBottom: '0.1rem' }}>{t.ticketType.name}</div>
                                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '0.8rem', color: '#666' }}>¥{t.price.toLocaleString()}</span>
                                                    <span style={{ fontSize: '0.75rem', color: '#ccc' }}>×</span>
                                                    <span style={{
                                                        fontSize: '0.85rem',
                                                        fontWeight: 'bold',
                                                        background: '#f0f0f0',
                                                        padding: '0.05rem 0.4rem',
                                                        borderRadius: '3px',
                                                        color: '#000'
                                                    }}>{t.count}枚</span>
                                                    {currentPaidAmount > 0 && (
                                                        <div style={{ display: 'flex', gap: '0.2rem', marginLeft: '0.5rem' }}>
                                                            {t.paidCount > 0 && <span style={{ color: '#1e8e3e', background: '#e6f4ea', padding: '0 0.3rem', borderRadius: '2px', fontSize: '0.65rem', border: '1px solid #ceead6' }}>済:{t.paidCount}</span>}
                                                            {t.remainingCount > 0 && <span style={{ color: '#d93025', background: '#fce8e6', padding: '0 0.3rem', borderRadius: '2px', fontSize: '0.65rem', border: '1px solid #fad2cf' }}>未:{t.remainingCount}</span>}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div style={{ fontSize: '1rem', fontWeight: '900', color: '#111' }}>
                                                ¥{(t.price * t.count).toLocaleString()}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                            </div>

                            {/* 操作履歴 */}
                            <div style={{ padding: '0.75rem', background: '#fcfcfc', border: '1px solid #eee', borderRadius: '6px' }}>
                                <h3 style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>受付履歴</h3>
                                <div style={{ maxHeight: '100px', overflowY: 'auto', fontSize: '0.75rem' }}>
                                    {res.logs && res.logs.length > 0 ? (
                                        res.logs.map((log: any) => (
                                            <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.2rem 0', borderBottom: '1px dashed #f0f0f0' }}>
                                                <span>
                                                    {log.type === 'CHECKIN' ? <span style={{ color: 'var(--success)' }}>● 入場</span> : <span style={{ color: 'var(--primary)' }}>× 取消</span>}
                                                    {log.count > 0 && ` (${log.count}枚)`}
                                                </span>
                                                <span style={{ color: '#999' }}>{new Date(log.createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                        ))
                                    ) : (
                                        <p style={{ color: '#ccc', textAlign: 'center', padding: '0.5rem' }}>履歴はありません</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* 右カラム: サブアクション */}
                        <div style={{ width: '240px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {/* 会計情報 */}
                            <div style={{ background: 'var(--secondary)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.05)', marginBottom: '0.5rem' }}>
                                <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.5rem' }}>
                                    {currentPaidAmount >= totalAmount ? '受領合計' : '今回請求額'}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontWeight: '900', fontSize: '1.75rem', color: currentPaidAmount < totalAmount ? 'var(--primary)' : '#333' }}>
                                        ¥{(totalAmount - currentPaidAmount).toLocaleString()}
                                    </span>
                                    {/* 電卓ポップオーバーボタン */}
                                    {currentPaidAmount < totalAmount && (
                                        <div style={{ position: 'relative' }}>
                                            <button
                                                onClick={() => setShowKeypad(!showKeypad)}
                                                style={{
                                                    background: '#fff',
                                                    border: '1px solid var(--primary)',
                                                    borderRadius: '4px',
                                                    padding: '4px 12px',
                                                    fontSize: '0.85rem',
                                                    color: 'var(--primary)',
                                                    cursor: 'pointer',
                                                    fontWeight: 'bold',
                                                }}
                                                title="お釣り計算"
                                            >
                                                電卓
                                            </button>
                                            {showKeypad && (
                                                <div
                                                    ref={keypadRef}
                                                    style={{
                                                        position: 'absolute',
                                                        right: '0',
                                                        top: '45px',
                                                        width: '280px',
                                                        background: '#fff',
                                                        border: '1px solid #ddd',
                                                        borderRadius: '12px',
                                                        boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                                                        zIndex: 100,
                                                        padding: '0.75rem 1rem'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                                        <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#666' }}>お釣り計算</span>
                                                        <button
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
                                    )}
                                </div>
                                <div style={{ marginTop: '0.4rem', paddingTop: '0.4rem', borderTop: '1px solid rgba(0,0,0,0.05)', fontSize: '0.75rem', color: '#888' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.1rem' }}>
                                        <span>予約合計:</span>
                                        <span>¥{totalAmount.toLocaleString()}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>受領済み:</span>
                                        <span style={{ color: currentPaidAmount > 0 ? 'var(--success)' : 'inherit' }}>- ¥{currentPaidAmount.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{
                    position: 'absolute',
                    bottom: '-1.5rem',
                    right: '-1.5rem',
                    left: '-1.5rem',
                    padding: '1rem 1.5rem',
                    background: 'rgba(255,255,255,0.9)',
                    backdropFilter: 'blur(10px)',
                    borderTop: '1px solid #eee',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderRadius: '0 0 12px 12px',
                    zIndex: 10,
                    flexShrink: 0
                }}>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        {totalTickets > 1 && (remaining > 1 || currentPaidAmount < totalAmount) && (
                            <button
                                className="btn btn-secondary"
                                style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                                onClick={() => setView('CONFIRM_PARTIAL')}
                            >
                                {remaining > 1 ? '一部入場' : '支払内容を個別指定'}
                            </button>
                        )}
                        {(checkedInCount > 0 || currentPaidAmount > 0) && (
                            <button
                                style={{ background: 'none', border: 'none', color: '#666', textDecoration: 'underline', fontSize: '0.8rem', cursor: 'pointer', padding: '0.5rem', whiteSpace: 'nowrap' }}
                                onClick={() => setView('PARTIAL_RESET')}
                            >
                                入場/支払いの取消
                            </button>
                        )}
                    </div>

                    <button
                        className="btn btn-primary"
                        style={{
                            minWidth: '240px',
                            padding: '1.2rem 2.5rem',
                            fontSize: '1.25rem',
                            fontWeight: 'bold',
                            borderRadius: '12px',
                            boxShadow: '0 4px 14px rgba(var(--primary-rgb), 0.4)'
                        }}
                        onClick={() => onAction('checkin', remaining, totalAmount - currentPaidAmount)}
                        disabled={isPending || (remaining === 0 && currentPaidAmount >= totalAmount)}
                    >
                        {remaining > 0
                            ? (remaining === totalTickets ? '一括入場・受領を確定' : '残りの全員を入場・受領を確定')
                            : (currentPaidAmount < totalAmount ? '残金の受領を確定' : '受付完了済')
                        }
                    </button>
                </div>
            </div>
        </ModalOverlay>
    )
}

function ModalOverlay({ children, onClose, maxWidth = '800px' }: { children: React.ReactNode, onClose: () => void, maxWidth?: string }) {
    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center',
            alignItems: 'center', zIndex: 1000, padding: '1rem'
        }} onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="card" style={{ width: '100%', maxWidth, background: '#fff', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', padding: '1.5rem' }}>
                {children}
            </div>
        </div>
    )
}
