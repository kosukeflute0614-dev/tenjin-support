'use client';

import { useState, useTransition, Fragment, useRef, useEffect } from 'react'
import { CheckCircle, MinusCircle, Circle, ChevronDown, RotateCcw, Users } from 'lucide-react'
import {
    processCheckinWithPaymentClient,
    resetCheckInClient,
    processPartialResetClient,
    processCheckinWithPaymentStaffClient,
    resetCheckInStaffClient,
    processPartialResetStaffClient
} from '@/lib/client-firestore'
import { formatTime } from '@/lib/format'
import { NumberStepper, SoftKeypad } from './TouchInputs'
import { useAuth } from './AuthProvider'
import { useToast } from '@/components/Toast'
import styles from './checkin-list.module.css'

type ReservationWithTickets = any

function hasInvitationTickets(res: any): boolean {
    return (res.tickets || []).some((t: any) => t.ticketType?.isInvitation === true);
}

function InvitationBadge() {
    return (
        <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '2px',
            padding: '0.15rem 0.5rem',
            borderRadius: '4px',
            fontSize: '0.7rem',
            fontWeight: 'bold',
            background: '#7c3aed',
            color: '#fff',
            marginLeft: '0.4rem',
            letterSpacing: '0.05em',
            flexShrink: 0,
            whiteSpace: 'nowrap' as const,
        }}>
            招待
        </span>
    );
}

export default function CheckinList({
    reservations,
    performanceId,
    productionId,
    staffToken,
    staffRole
}: {
    reservations: ReservationWithTickets[],
    performanceId: string,
    productionId: string,
    staffToken?: string,
    staffRole?: string
}) {
    const { user } = useAuth()
    const { showToast } = useToast()
    const [isPending, startTransition] = useTransition()
    const [selectedRes, setSelectedRes] = useState<any | null>(null)

    const sorted = [...reservations].sort((a, b) => {
        // 入場済みを一番下に
        const scoreA = a.checkinStatus === 'CHECKED_IN' ? 1 : 0
        const scoreB = b.checkinStatus === 'CHECKED_IN' ? 1 : 0
        if (scoreA !== scoreB) return scoreA - scoreB
        // 同じステータス内は名前順
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

    let lastGroupMobile = ""

    return (
        <div className="card" style={{ padding: 0, overflow: 'visible' }}>
            {/* Desktop table */}
            <div className="desktop-only">
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
                            const kana = res.customerNameKana || res.customerName || ""
                            const group = getKanaGroup(kana)
                            const showHeader = group !== lastGroup
                            lastGroup = group

                            const totalTickets = (res.tickets || []).reduce((sum: number, t: any) => sum + (t.count || 0), 0)

                            return (
                                <Fragment key={res.id}>
                                    {showHeader && (
                                        <tr style={{ background: 'var(--secondary)' }}>
                                            <td colSpan={4} style={{ padding: '0.5rem 1rem', fontWeight: 'bold', borderBottom: '1px solid var(--card-border)', fontSize: '0.85rem', color: 'var(--primary)' }}>
                                                {group}
                                            </td>
                                        </tr>
                                    )}
                                    <tr style={{ borderBottom: '1px solid var(--card-border)', background: (res.checkinStatus === 'CHECKED_IN') ? '#f0fff4' : 'transparent' }}>
                                        <td style={{ padding: '1rem' }}>
                                            <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
                                                {res.customerName}
                                                {hasInvitationTickets(res) && <InvitationBadge />}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{res.customerNameKana}</div>
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            <div style={{ fontSize: '0.85rem' }}>
                                                {res.tickets?.map((t: any) => `${t.ticketType?.name || '不明な券種'}×${t.count}`).join(', ') || 'チケットなし'}
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
            </div>

            {/* Mobile cards */}
            <div className="mobile-only">
                <div className="mobile-card-list">
                    {sorted.map((res) => {
                        const kana = res.customerNameKana || res.customerName || ""
                        const group = getKanaGroup(kana)
                        const showGroupHeader = group !== lastGroupMobile
                        lastGroupMobile = group

                        const totalTickets = (res.tickets || []).reduce((sum: number, t: any) => sum + (t.count || 0), 0)

                        return (
                            <Fragment key={res.id}>
                                {showGroupHeader && (
                                    <div className="mobile-card-group-header">{group}</div>
                                )}
                                <div
                                    className={`mobile-card-item${res.checkinStatus === 'CHECKED_IN' ? ' is-checked-in' : ''}`}
                                    onClick={() => setSelectedRes(res)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <div className="mobile-card-info">
                                        <div className="mobile-card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <span>{res.customerName}</span>
                                            {hasInvitationTickets(res) && <InvitationBadge />}
                                        </div>
                                        <div className="mobile-card-tickets">
                                            {res.tickets?.map((t: any) => `${t.ticketType?.name || '不明'}×${t.count}`).join(', ') || 'チケットなし'}
                                            {res.checkinStatus !== 'NOT_CHECKED_IN' && ` (${res.checkedInTickets}/${totalTickets}人入場)`}
                                        </div>
                                    </div>
                                    {res.checkinStatus === 'CHECKED_IN' && <MobileCheckinTag status="CHECKED_IN" />}
                                    {res.checkinStatus === 'PARTIALLY_CHECKED_IN' && <MobileCheckinTag status="PARTIALLY_CHECKED_IN" />}
                                    <button
                                        className={`${res.checkinStatus === 'CHECKED_IN' ? 'btn btn-secondary' : 'btn btn-primary'} mobile-card-action-btn`}
                                        disabled={isPending}
                                        onClick={(e) => { e.stopPropagation(); setSelectedRes(res); }}
                                    >
                                        {res.checkinStatus === 'CHECKED_IN' ? '詳細' : '受付'}
                                    </button>
                                </div>
                            </Fragment>
                        )
                    })}
                </div>
            </div>

            {selectedRes && (
                <DetailModal
                    res={selectedRes}
                    performanceId={performanceId}
                    productionId={productionId}
                    onClose={() => setSelectedRes(null)}
                    staffToken={staffToken}
                    staffRole={staffRole}
                    onAction={(type, count, additionalPayment, breakdown) => {
                        if (!user && !staffToken) return
                        startTransition(() => {
                            if (type === 'checkin') {
                                // 一括入場の場合の内訳作成
                                const fullBreakdown: any = {}
                                const resTickets = selectedRes.tickets || []
                                resTickets.forEach((t: any) => {
                                    const remainingToPay = t.count - (t.paidCount || 0)
                                    if (remainingToPay > 0) fullBreakdown[t.ticketTypeId] = remainingToPay
                                })
                                if (staffToken) {
                                    processCheckinWithPaymentStaffClient(selectedRes.id, count, additionalPayment || 0, fullBreakdown, performanceId, productionId, staffToken)
                                        .then(() => setSelectedRes(null))
                                        .catch(err => showToast(err.message, 'error'))
                                } else if (user) {
                                    processCheckinWithPaymentClient(selectedRes.id, count, additionalPayment || 0, fullBreakdown, performanceId, productionId, user.uid)
                                        .then(() => setSelectedRes(null))
                                        .catch(err => showToast(err.message, 'error'))
                                }
                            } else if (type === 'complex_checkin') {
                                if (staffToken) {
                                    processCheckinWithPaymentStaffClient(selectedRes.id, count, additionalPayment || 0, breakdown || {}, performanceId, productionId, staffToken)
                                        .then(() => setSelectedRes(null))
                                        .catch(err => showToast(err.message, 'error'))
                                } else if (user) {
                                    processCheckinWithPaymentClient(selectedRes.id, count, additionalPayment || 0, breakdown || {}, performanceId, productionId, user.uid)
                                        .then(() => setSelectedRes(null))
                                        .catch(err => showToast(err.message, 'error'))
                                }
                            } else if (type === 'reset') {
                                if (staffToken) {
                                    resetCheckInStaffClient(selectedRes.id, performanceId, productionId, staffToken)
                                        .then(() => setSelectedRes(null))
                                        .catch(err => showToast(err.message, 'error'))
                                } else if (user) {
                                    resetCheckInClient(selectedRes.id, performanceId, productionId, user.uid)
                                        .then(() => setSelectedRes(null))
                                        .catch(err => showToast(err.message, 'error'))
                                }
                            }
                        })
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
        NOT_CHECKED_IN: { bg: '#eee', color: 'var(--text-muted)', label: '未入場' }
    }
    const style = styles[status] || styles.NOT_CHECKED_IN

    const iconMap: Record<string, React.ReactNode> = {
        CHECKED_IN: <CheckCircle size={14} />,
        PARTIALLY_CHECKED_IN: <MinusCircle size={14} />,
        NOT_CHECKED_IN: <Circle size={14} />
    }

    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold', background: style.bg, color: style.color, flexShrink: 0, whiteSpace: 'nowrap' as const }}>{iconMap[status] || iconMap.NOT_CHECKED_IN}{style.label}</span>
}

function MobileCheckinTag({ status }: { status: string }) {
    if (status === 'CHECKED_IN') {
        return (
            <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: '24px', height: '24px', borderRadius: '50%',
                backgroundColor: 'var(--primary)', color: '#fff',
                fontSize: '0.65rem', fontWeight: 'bold', flexShrink: 0,
            }}>
                済
            </span>
        )
    }
    if (status === 'PARTIALLY_CHECKED_IN') {
        return (
            <span style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '0.15rem 0.4rem', borderRadius: '4px',
                backgroundColor: '#fef3c7', color: '#92400e',
                fontSize: '0.65rem', fontWeight: 'bold', flexShrink: 0,
                whiteSpace: 'nowrap',
            }}>
                一部入場
            </span>
        )
    }
    return null
}

// 受付詳細モーダル
function DetailModal({
    res,
    performanceId,
    productionId,
    onClose,
    onAction,
    isPending,
    staffToken,
    staffRole
}: {
    res: any,
    performanceId: string,
    productionId: string,
    onClose: () => void,
    onAction: (type: 'checkin' | 'reset' | 'complex_checkin', count: number, additionalPayment?: number, breakdown?: { [ticketTypeId: string]: number }) => void,
    isPending: boolean,
    staffToken?: string,
    staffRole?: string
}) {
    const { user } = useAuth()
    const { showToast } = useToast()
    const [isTransitionPending, startTransition] = useTransition()
    const tickets = res.tickets || []
    const totalTickets = tickets.reduce((sum: number, t: any) => sum + (t.count || 0), 0)
    const totalAmount = tickets.reduce((sum: number, t: any) => sum + ((t.price || 0) * (t.count || 0)), 0)

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
    const mobileCalcRef = useRef<HTMLDivElement>(null)
    const sidebarRef = useRef<HTMLDivElement>(null)
    const [calcPos, setCalcPos] = useState<{ top: number; right: number } | null>(null)

    const openCalcWithPosition = () => {
        setReceivedStr('');
        if (showKeypad) { setShowKeypad(false); return; }
        if (sidebarRef.current) {
            const rect = sidebarRef.current.getBoundingClientRect();
            const top = Math.max(8, rect.top);
            const right = window.innerWidth - rect.left + 16;
            setCalcPos({ top, right });
        }
        setShowKeypad(true);
    }
    // 電卓: 外側クリックで閉じる（デスクトップポップオーバー & モバイルオーバーレイ両対応）
    useEffect(() => {
        if (!showKeypad) return;
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            // デスクトップポップオーバー内のクリックは無視
            if (keypadRef.current?.contains(target)) return;
            // モバイルボトムシート内のクリックは無視
            if (mobileCalcRef.current?.contains(target)) return;
            setShowKeypad(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showKeypad]);

    const [showLogs, setShowLogs] = useState(false)
    const [showMoreActions, setShowMoreActions] = useState(false)

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
        return sum + (ticket ? (ticket.price || 0) * (count || 0) : 0)
    }, 0)

    const handlePartialReset = () => {
        if (!user && !staffToken) return
        startTransition(() => {
            if (staffToken) {
                processPartialResetStaffClient(res.id, resetCount, totalRefund, refundBreakdown, performanceId, productionId, staffToken)
                    .then(() => onClose())
                    .catch(err => showToast(err.message, 'error'))
            } else if (user) {
                processPartialResetClient(res.id, resetCount, totalRefund, refundBreakdown, performanceId, productionId, user.uid)
                    .then(() => onClose())
                    .catch(err => showToast(err.message, 'error'))
            }
        })
    }

    // バリデーション: 入場する人数分は必ず支払わないといけない（合計額ベース）
    const totalCheckinAfter = checkedInCount + partialEntryCount
    const sortedByPriceAsc = [...tickets].sort((a, b) => a.price - b.price)
    let tempCheckin = totalCheckinAfter
    let requiredMinAmount = 0
    sortedByPriceAsc.forEach(t => {
        const count = Math.min(t.count || 0, tempCheckin)
        requiredMinAmount += count * (t.price || 0)
        tempCheckin -= count
    })
    const isAmountValid = (currentPaidAmount + currentTransactionAmount) >= requiredMinAmount

    // 電卓コンテンツ（デスクトップポップオーバー & モバイルオーバーレイ共通）
    const renderCalcContent = (amount: number, recv: number, chg: number, setStr: (fn: (prev: string) => string) => void, onClose: () => void) => (
        <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>お釣り計算</span>
                <button
                    type="button"
                    onClick={onClose}
                    style={{
                        background: '#f5f5f5', border: 'none', fontSize: '1.25rem', cursor: 'pointer',
                        color: 'var(--text-muted)', width: '28px', height: '28px', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', borderRadius: '50%', lineHeight: 1, padding: 0,
                    }}
                >
                    &times;
                </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.35rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>合計</span>
                <span style={{ fontWeight: '700', color: 'var(--primary)' }}>¥{amount.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--slate-500)' }}>預かり</span>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
                    {recv > 0 ? recv.toLocaleString() : '0'} <span style={{ fontSize: '0.8rem', fontWeight: 'normal' }}>円</span>
                </div>
            </div>
            {recv > 0 && (
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    borderTop: '1px solid var(--card-border)', paddingTop: '0.5rem', marginBottom: '0.75rem',
                }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--slate-500)' }}>{chg >= 0 ? 'お釣り' : '不足'}</span>
                    <div style={{ fontSize: '1.3rem', fontWeight: '900', color: chg >= 0 ? 'var(--success)' : 'var(--accent)' }}>
                        ¥{Math.abs(chg).toLocaleString()}
                    </div>
                </div>
            )}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '0.5rem' }}>
                {[1000, 5000, 10000].map(amt => (
                    <button
                        key={amt}
                        type="button"
                        className="btn btn-secondary"
                        style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem', background: 'var(--card-bg)' }}
                        onClick={() => setStr(prev => String((parseInt(prev) || 0) + amt))}
                    >
                        +{(amt / 1000).toLocaleString()}千
                    </button>
                ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                {['1','2','3','4','5','6','7','8','9','0','00','C'].map(key => (
                    <button
                        key={key}
                        type="button"
                        className="btn btn-secondary"
                        style={{
                            height: '3.2rem', fontSize: '1.15rem', fontWeight: 'bold',
                            background: key === 'C' ? 'rgba(139,0,0,0.05)' : 'var(--card-bg)',
                            color: key === 'C' ? '#d93025' : '#333',
                            border: '1px solid #ddd', borderRadius: '8px',
                        }}
                        onClick={() => {
                            if (key === 'C') { setStr(() => ''); return; }
                            setStr(prev => {
                                if (key === '00' && (prev === '' || prev === '0')) return '0';
                                if (prev === '0' && key !== '00') return key;
                                return prev + key;
                            });
                        }}
                    >
                        {key}
                    </button>
                ))}
            </div>
        </>
    );

    // モバイル電卓オーバーレイ（ボトムシート）
    const renderMobileCalc = () => {
        if (!showKeypad) return null;
        return (
            <div
                className={styles.calcOverlay}
                onClick={(e) => { if (e.target === e.currentTarget) setShowKeypad(false); }}
            >
                <div className={styles.calcPanel} ref={mobileCalcRef}>
                    {renderCalcContent(currentTransactionAmount, received, change, setReceivedStr, () => setShowKeypad(false))}
                </div>
            </div>
        );
    };

    if (view === 'CONFIRM_PARTIAL') {
        return (
            <ModalOverlay onClose={() => setView('DETAIL')} maxWidth="400px" ariaLabelledBy="modal-title-confirm-partial">
                <div style={{ textAlign: 'center', padding: '1rem' }}>
                    <h3 id="modal-title-confirm-partial" className="heading-md" style={{ marginBottom: '1.5rem', fontSize: '1.25rem' }}>一部入場させますか？</h3>
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
            <ModalOverlay onClose={() => setView('DETAIL')} ariaLabelledBy="modal-title-partial-edit">
                <div style={{ position: 'relative', height: '80vh', display: 'flex', flexDirection: 'column' }}>
                    {/* ヘッダー */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--card-border)', paddingBottom: '1rem', flexShrink: 0 }}>
                        <h2 id="modal-title-partial-edit" className="heading-md" style={{ margin: 0 }}>一部入場・会計</h2>
                        <button onClick={() => setView('DETAIL')} aria-label="閉じる" style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
                    </div>

                    {/* メインスクロールエリア */}
                    <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '80px' }}>
                        <div className={styles.modalColumns}>
                            {/* 左カラム: 設定 */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <label style={{
                                        fontSize: '0.85rem', fontWeight: 'bold', display: 'block', marginBottom: '0.75rem',
                                        color: 'var(--foreground)', borderLeft: '4px solid var(--primary)', padding: '0.4rem 0.75rem',
                                        background: '#f4f4f4', borderRadius: '0 4px 4px 0'
                                    }}>
                                        1. 入場する人数
                                    </label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', background: 'var(--secondary)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--card-border)' }}>
                                        <div style={{ width: '160px' }}>
                                            <NumberStepper
                                                value={partialEntryCount}
                                                min={1}
                                                max={remaining}
                                                onChange={setPartialEntryCount}
                                            />
                                        </div>
                                        <div style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                                            <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--foreground)' }}>{partialEntryCount}</span>
                                            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>名が入場</span>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>(残り {remaining}名のうち)</span>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '0.75rem' }}>
                                        <label style={{
                                            fontSize: '0.85rem', fontWeight: 'bold', display: 'block', margin: 0,
                                            color: 'var(--foreground)', borderLeft: '4px solid var(--primary)', padding: '0.4rem 0.75rem',
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
                                            <div key={t.ticketTypeId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--card-bg)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--card-border)' }}>
                                                <div style={{ fontSize: '0.85rem' }}>
                                                    <div style={{ fontWeight: 'bold' }}>{(t.ticketType?.name) || '不明な券種'} (¥{(t.price || 0).toLocaleString()})</div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>残交付: {t.remainingCount || 0}枚</div>
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
                            <div className={styles.modalSidebarNarrow} ref={sidebarRef}>
                                <div style={{ background: 'var(--secondary)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.05)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>今回会計額</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                        <span style={{ fontWeight: '900', fontSize: '1.5rem' }}>¥{currentTransactionAmount.toLocaleString()}</span>
                                        {/* 電卓ボタン */}
                                        <button
                                            onClick={openCalcWithPosition}
                                            style={{
                                                background: 'var(--card-bg)',
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
                                    </div>

                                </div>
                                <button className="btn btn-secondary" style={{ width: '100%', marginTop: '1rem', padding: '0.6rem' }} onClick={() => setView('DETAIL')}>戻る</button>
                            </div>
                        </div>
                    </div>

                    {/* 固定フッターアクション */}
                    <div className={styles.modalFooter}>
                        <button
                            className={`btn btn-primary ${styles.actionBtnLarge}`}
                            onClick={() => onAction('complex_checkin', partialEntryCount, currentTransactionAmount, partialPayingCounts)}
                            disabled={isPending || !isAmountValid}
                        >
                            一部入場と受領を確定
                        </button>
                    </div>
                </div>
                {renderMobileCalc()}
                {showKeypad && calcPos && (
                    <div
                        ref={keypadRef}
                        className={styles.calcPopover}
                        style={{ top: calcPos.top, right: calcPos.right }}
                    >
                        {renderCalcContent(currentTransactionAmount, received, change, setReceivedStr, () => setShowKeypad(false))}
                    </div>
                )}
            </ModalOverlay>
        )
    }

    if (view === 'PARTIAL_RESET') {
        if (confirmStep === 1) {
            return (
                <ModalOverlay onClose={() => { setView('DETAIL'); setConfirmStep(0); }} maxWidth="450px" ariaLabelledBy="modal-title-reset-confirm1">
                    <div style={{ position: 'relative', height: 'auto', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '1rem' }}>
                            <h3 id="modal-title-reset-confirm1" style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>この内容で取り消しますか？</h3>
                            <div style={{ background: 'var(--secondary)', padding: '1.5rem', borderRadius: '12px', marginBottom: '1.5rem', textAlign: 'left', width: '100%', maxWidth: '400px', border: '1px solid var(--card-border)' }}>
                                <div style={{ marginBottom: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)', fontSize: '0.9rem' }}>取消内容:</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>入場取消</span>
                                        <span style={{ fontWeight: 'bold' }}>{resetCount}名</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #ddd', paddingTop: '0.5rem' }}>
                                        <span>返金合計</span>
                                        <span style={{ fontWeight: 'bold', color: 'var(--accent)' }}>¥{totalRefund.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 固定フッターアクション */}
                        <div className={styles.modalFooterWithGap}>
                            <button className="btn btn-secondary" style={{ padding: '0.8rem 2rem' }} onClick={() => setConfirmStep(0)}>いいえ</button>
                            <button className="btn btn-primary" style={{ minWidth: '180px', padding: '0.8rem 2rem', background: '#333' }} onClick={() => setConfirmStep(2)}>はい、次へ</button>
                        </div>
                    </div>
                </ModalOverlay>
            )
        }

        if (confirmStep === 2) {
            return (
                <ModalOverlay onClose={() => { setView('DETAIL'); setConfirmStep(0); }} maxWidth="450px" ariaLabelledBy="modal-title-reset-confirm2">
                    <div style={{ position: 'relative', height: 'auto', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '1rem' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
                            <h3 id="modal-title-reset-confirm2" style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem', color: 'var(--accent)' }}>本当に取り消しますか？</h3>
                            <p style={{ fontSize: '1rem', marginBottom: '1.5rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                                入場記録と支払い記録が削除されます。<br />
                                この操作は元に戻せません。
                            </p>
                        </div>

                        {/* 固定フッターアクション */}
                        <div className={styles.modalFooterWithGap}>
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
            <ModalOverlay onClose={() => setView('DETAIL')} ariaLabelledBy="modal-title-partial-reset">
                <div style={{ position: 'relative', height: '80vh', display: 'flex', flexDirection: 'column' }}>
                    {/* ヘッダー */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--card-border)', paddingBottom: '1rem', flexShrink: 0 }}>
                        <h2 id="modal-title-partial-reset" className="heading-md" style={{ margin: 0 }}>入場/支払いの取消</h2>
                        <button onClick={() => setView('DETAIL')} aria-label="閉じる" style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
                    </div>

                    {/* メインスクロールエリア */}
                    <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '80px' }}>
                        <div className={styles.modalColumns}>
                            {/* 左カラム: 入力 */}
                            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 'bold', display: 'block', marginBottom: '0.75rem', color: 'var(--text-muted)' }}>1. 取消する入場人数 <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>(現在: {checkedInCount}名)</span></label>
                                    <NumberStepper
                                        value={resetCount}
                                        min={0}
                                        max={checkedInCount}
                                        onChange={setResetCount}
                                        label="名"
                                    />
                                </div>

                                <div>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 'bold', display: 'block', marginBottom: '0.75rem', color: 'var(--text-muted)' }}>2. 返金する枚数 (券種ごと)</label>
                                    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        {ticketPaymentStatus.filter((t: any) => (t.paidCount || 0) > 0).map((t: any) => (
                                            <div key={t.ticketTypeId}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>{(t.ticketType?.name) || '不明な券種'}</div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>支払い済み: {t.paidCount || 0}枚</div>
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
                            <div className={styles.modalSidebarNarrow}>
                                <div style={{ background: 'rgba(220, 53, 69, 0.08)', padding: '1.25rem', borderRadius: '12px', border: '1px solid #ffeded' }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--accent)', marginBottom: '0.5rem' }}>返金合計額</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: '900', color: 'var(--accent)' }}>
                                        ¥{totalRefund.toLocaleString()}
                                    </div>
                                </div>
                                <button className="btn btn-secondary" style={{ width: '100%', marginTop: '1rem', padding: '0.6rem' }} onClick={() => setView('DETAIL')}>戻る</button>
                            </div>
                        </div>
                    </div>

                    {/* 固定フッターアクション */}
                    <div className={styles.modalFooter}>
                        <button
                            className={`btn btn-primary ${styles.actionBtnLarge}`}
                            style={{ background: '#333' }}
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
        <ModalOverlay onClose={onClose} ariaLabelledBy="modal-title-checkin-detail">
            <div style={{ position: 'relative', height: '80vh', display: 'flex', flexDirection: 'column' }}>
                {/* ヘッダー */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', borderBottom: '1px solid var(--card-border)', paddingBottom: '1rem', flexShrink: 0 }}>
                    <div>
                        <h2 id="modal-title-checkin-detail" className="heading-md" style={{ marginBottom: '0.2rem' }}>{res.customerName} 様</h2>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{res.customerNameKana}</p>
                    </div>
                    <button onClick={onClose} aria-label="閉じる" style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', lineHeight: 1 }}>&times;</button>
                </div>

                {/* メインスクロールエリア */}
                <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '80px' }}>
                    <div className={styles.modalColumns}>
                        {/* 左カラム: 明細と状況 */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ marginBottom: '1rem', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '6px', overflow: 'hidden' }}>
                                <div style={{ padding: '0.5rem 0.75rem', background: 'var(--card-bg)', borderBottom: '1px solid var(--card-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>予約チケット</span>
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
                                        <div key={t.ticketTypeId} style={{ display: 'flex', padding: '0.5rem 0.75rem', borderBottom: '1px solid #fafafa', alignItems: 'center' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--foreground)', marginBottom: '0.1rem' }}>{t.ticketType?.name || '不明な券種'}</div>
                                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>¥{(t.price || 0).toLocaleString()}</span>
                                                    <span style={{ fontSize: '0.75rem', color: '#ccc' }}>×</span>
                                                    <span style={{
                                                        fontSize: '0.85rem',
                                                        fontWeight: 'bold',
                                                        background: 'var(--secondary)',
                                                        padding: '0.05rem 0.4rem',
                                                        borderRadius: '3px',
                                                        color: '#000'
                                                    }}>{t.count || 0}枚</span>
                                                    {(currentPaidAmount || 0) > 0 && (
                                                        <div style={{ display: 'flex', gap: '0.2rem', marginLeft: '0.5rem' }}>
                                                            {(t.paidCount || 0) > 0 && <span style={{ color: '#1e8e3e', background: '#e6f4ea', padding: '0 0.3rem', borderRadius: '2px', fontSize: '0.65rem', border: '1px solid #ceead6' }}>済:{t.paidCount}</span>}
                                                            {(t.remainingCount || 0) > 0 && <span style={{ color: '#d93025', background: '#fce8e6', padding: '0 0.3rem', borderRadius: '2px', fontSize: '0.65rem', border: '1px solid #fad2cf' }}>未:{t.remainingCount}</span>}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div style={{ fontSize: '1rem', fontWeight: '900', color: '#111' }}>
                                                ¥{((t.price || 0) * (t.count || 0)).toLocaleString()}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                            </div>

                        </div>

                        {/* 右カラム: サブアクション */}
                        <div className={styles.modalSidebar} ref={sidebarRef}>
                            {/* 会計情報 */}
                            <div style={{ background: 'var(--secondary)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.05)', marginBottom: '0.5rem' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                    {currentPaidAmount >= totalAmount ? '受領合計' : '今回請求額'}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontWeight: '900', fontSize: '1.75rem', color: currentPaidAmount < totalAmount ? 'var(--primary)' : '#333' }}>
                                        ¥{(totalAmount - currentPaidAmount).toLocaleString()}
                                    </span>
                                    {/* 電卓ポップオーバーボタン */}
                                    {currentPaidAmount < totalAmount && (
                                        <button
                                            onClick={openCalcWithPosition}
                                            style={{
                                                background: 'var(--card-bg)',
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
                                    )}
                                </div>
                                <div style={{ marginTop: '0.4rem', paddingTop: '0.4rem', borderTop: '1px solid rgba(0,0,0,0.05)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>予約時合計:</span>
                                        <span>¥{totalAmount.toLocaleString()}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>受領済:</span>
                                        <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>¥{currentPaidAmount.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>

                            {/* メインアクション: 入場ボタン（remaining > 0 のときだけ表示） */}
                            {remaining > 0 && (
                                <button
                                    className="btn btn-primary"
                                    style={{
                                        padding: '1.25rem', fontSize: '1.2rem', fontWeight: 'bold', borderRadius: '12px',
                                        boxShadow: '0 4px 12px rgba(var(--primary-rgb), 0.3)',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem'
                                    }}
                                    onClick={() => onAction('checkin', remaining, totalAmount - currentPaidAmount)}
                                    disabled={isPending}
                                >
                                    <span>{remaining > 1 ? `残りの ${remaining}名 を全員入場` : '入場受付と会計を確定'}</span>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 'normal', opacity: 0.9 }}>
                                        {totalAmount - currentPaidAmount > 0 ? `受領額: ¥${(totalAmount - currentPaidAmount).toLocaleString()}` : (totalAmount > 0 ? 'お支払い済み' : '無料')}
                                    </span>
                                </button>
                            )}

                            {/* 全員入場済み: 取り消しボタンを直接表示 */}
                            {remaining === 0 && (
                                <button
                                    className={styles.resetBtn}
                                    onClick={() => setView('PARTIAL_RESET')}
                                    disabled={isPending}
                                >
                                    <RotateCcw size={16} />
                                    入場/支払を取り消す
                                </button>
                            )}

                            {/* その他の操作アコーディオン */}
                            {(() => {
                                // 表示するサブアクションを決定
                                const showPartial = remaining >= 2;
                                const showReset = checkedInCount > 0 && remaining > 0;
                                if (!showPartial && !showReset) return null;

                                return (
                                    <>
                                        <button
                                            type="button"
                                            className={styles.moreActionsToggle}
                                            onClick={() => setShowMoreActions(!showMoreActions)}
                                        >
                                            <ChevronDown size={14} style={{ transition: 'transform 0.2s', transform: showMoreActions ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                                            その他の操作
                                        </button>
                                        <div className={`${styles.moreActionsPanel} ${showMoreActions ? styles.moreActionsPanelOpen : ''}`}>
                                            <div className={styles.moreActionsCard}>
                                                {showPartial && (
                                                    <button
                                                        type="button"
                                                        className={styles.moreActionsBtn}
                                                        onClick={() => setView('CONFIRM_PARTIAL')}
                                                        disabled={isPending}
                                                    >
                                                        <Users size={15} />
                                                        一部のみ入場・会計
                                                    </button>
                                                )}
                                                {showReset && (
                                                    <button
                                                        type="button"
                                                        className={styles.moreActionsBtnDanger}
                                                        onClick={() => setView('PARTIAL_RESET')}
                                                        disabled={isPending}
                                                    >
                                                        <RotateCcw size={15} />
                                                        入場/支払を取り消す
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    </div>

                    {/* 受付履歴（アコーディオン） */}
                    {res.logs && res.logs.length > 0 && (
                        <div style={{ marginTop: '1rem', borderTop: '1px solid var(--card-border)', paddingTop: '0.5rem' }}>
                            <button
                                type="button"
                                onClick={() => setShowLogs(!showLogs)}
                                style={{
                                    background: 'none', border: 'none', cursor: 'pointer', padding: '0.4rem 0',
                                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                                    fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)', width: '100%',
                                }}
                            >
                                <ChevronDown size={14} style={{ transition: 'transform 0.2s', transform: showLogs ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                                受付履歴 ({res.logs.length}件)
                            </button>
                            {showLogs && (
                                <div style={{ fontSize: '0.75rem', padding: '0.25rem 0' }}>
                                    {res.logs.map((log: any, index: number) => (
                                        <div key={log.id || `${log.type}-${log.createdAt}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px dashed #f0f0f0' }}>
                                            <span>
                                                {log.type === 'CHECKIN' ? <span style={{ color: 'var(--success)' }}>● 入場</span> : <span style={{ color: 'var(--primary)' }}>× 取消</span>}
                                                {log.count > 0 && ` (${log.count}枚)`}
                                            </span>
                                            <span style={{ color: 'var(--slate-500)' }}>
                                                {(() => {
                                                    const date = log.createdAt?.toDate ? log.createdAt.toDate() : new Date(log.createdAt);
                                                    return isNaN(date.getTime()) ? '時刻不明' : date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
                                                })()}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* 固定フッターアクション */}
                <div className={styles.modalFooter}>
                    <button className="btn btn-secondary" style={{ minWidth: '120px' }} onClick={onClose}>閉じる</button>
                </div>
            </div>
            {renderMobileCalc()}
            {/* デスクトップ電卓ポップオーバー（fixed、サイドバーの左横） */}
            {showKeypad && calcPos && (
                <div
                    ref={keypadRef}
                    className={styles.calcPopover}
                    style={{ top: calcPos.top, right: calcPos.right }}
                >
                    {renderCalcContent(currentTransactionAmount, received, change, setReceivedStr, () => setShowKeypad(false))}
                </div>
            )}
        </ModalOverlay>
    )
}

function ModalOverlay({ children, onClose, maxWidth = '900px', ariaLabelledBy }: { children: React.ReactNode, onClose: () => void, maxWidth?: string, ariaLabelledBy?: string }) {
    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
            padding: '1rem'
        }} onClick={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
            <div className="card" role="dialog" aria-modal="true" aria-labelledby={ariaLabelledBy} style={{
                width: '100%', maxWidth: maxWidth, maxHeight: '90vh',
                position: 'relative', boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                border: 'none', overflow: 'hidden', padding: '1.5rem'
            }}>
                {children}
            </div>
        </div>
    )
}
