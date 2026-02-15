'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function addCheckedInTickets(reservationId: string, count: number, performanceId: string, productionId: string) {
    const reservation = await prisma.reservation.findUnique({
        where: { id: reservationId },
        include: { tickets: true }
    })

    if (!reservation) throw new Error('予約が見つかりません')

    const resAny = reservation as any
    const totalTickets = (resAny.tickets || []).reduce((sum: number, t: any) => sum + (t.count || 0), 0)
    const newCheckedInTickets = Math.min((resAny.checkedInTickets || 0) + count, totalTickets)

    let status = "PARTIALLY_CHECKED_IN"
    if (newCheckedInTickets === totalTickets) {
        status = "CHECKED_IN"
    } else if (newCheckedInTickets === 0) {
        status = "NOT_CHECKED_IN"
    }

    const p = prisma as any
    await p.$transaction([
        p.reservation.update({
            where: { id: reservationId },
            data: {
                checkedInTickets: newCheckedInTickets,
                checkinStatus: status,
                checkedInAt: resAny.checkedInAt || new Date()
            }
        }),
        p.checkinLog.create({
            data: {
                reservationId,
                type: 'CHECKIN',
                count: count
            }
        })
    ])

    revalidatePath(`/productions/${productionId}/checkin/${performanceId}`)
}

export async function resetCheckIn(reservationId: string, performanceId: string, productionId: string) {
    // 現在の入場数を取得してログに残す
    const res = await prisma.reservation.findUnique({
        where: { id: reservationId },
        select: { checkedInTickets: true } as any
    }) as any

    const p = prisma as any
    await p.$transaction([
        p.reservation.update({
            where: { id: reservationId },
            data: {
                checkedInTickets: 0,
                checkinStatus: "NOT_CHECKED_IN",
                checkedInAt: null,
                paidAmount: 0,
                paymentStatus: "UNPAID"
            }
        }),
        p.reservationTicket.updateMany({
            where: { reservationId },
            data: {
                paidCount: 0
            }
        }),
        p.checkinLog.create({
            data: {
                reservationId,
                type: 'RESET',
                count: res?.checkedInTickets || 0
            }
        })
    ])

    revalidatePath(`/productions/${productionId}/checkin/${performanceId}`)
}

export async function processCheckinWithPayment(
    reservationId: string,
    checkinCount: number,
    additionalPaidAmount: number,
    paymentBreakdown: { [ticketTypeId: string]: number },
    performanceId: string,
    productionId: string
) {
    const reservation = await prisma.reservation.findUnique({
        where: { id: reservationId },
        include: { tickets: true }
    })

    if (!reservation) throw new Error('予約が見つかりません')

    const resAny = reservation as any
    const totalTickets = (resAny.tickets || []).reduce((sum: number, t: any) => sum + (t.count || 0), 0)
    const totalAmount = (resAny.tickets || []).reduce((sum: number, t: any) => sum + (t.price * t.count), 0)

    const newCheckedInTickets = Math.min((resAny.checkedInTickets || 0) + checkinCount, totalTickets)
    const newPaidAmount = (resAny.paidAmount || 0) + additionalPaidAmount

    let checkinStatus = "PARTIALLY_CHECKED_IN"
    if (newCheckedInTickets === totalTickets) {
        checkinStatus = "CHECKED_IN"
    } else if (newCheckedInTickets === 0) {
        checkinStatus = "NOT_CHECKED_IN"
    }

    let paymentStatus = "UNPAID"
    if (newPaidAmount >= totalAmount) {
        paymentStatus = "PAID"
    } else if (newPaidAmount > 0) {
        paymentStatus = "PARTIALLY_PAID"
    }

    const p = prisma as any
    await p.$transaction([
        // 予約レコードの更新
        p.reservation.update({
            where: { id: reservationId },
            data: {
                checkedInTickets: newCheckedInTickets,
                checkinStatus: checkinStatus,
                paidAmount: newPaidAmount,
                paymentStatus: paymentStatus,
                checkedInAt: resAny.checkedInAt || new Date()
            }
        }),
        // 各チケットの内訳更新
        ...Object.entries(paymentBreakdown).map(([ticketTypeId, count]) => {
            const ticket = resAny.tickets.find((t: any) => t.ticketTypeId === ticketTypeId)
            if (!ticket || count === 0) return null
            return p.reservationTicket.update({
                where: { id: ticket.id },
                data: {
                    paidCount: { increment: count }
                }
            })
        }).filter(Boolean),
        // ログの作成
        p.checkinLog.create({
            data: {
                reservationId,
                type: 'CHECKIN',
                count: checkinCount,
                paymentInfo: JSON.stringify(paymentBreakdown)
            }
        })
    ])

    revalidatePath(`/productions/${productionId}/checkin/${performanceId}`)
}

export async function processPartialReset(
    reservationId: string,
    resetCheckinCount: number,
    refundAmount: number,
    refundBreakdown: { [ticketTypeId: string]: number },
    performanceId: string,
    productionId: string
) {
    const reservation = await prisma.reservation.findUnique({
        where: { id: reservationId },
        include: { tickets: true }
    })

    if (!reservation) throw new Error('予約が見つかりません')

    const resAny = reservation as any
    const totalTickets = (resAny.tickets || []).reduce((sum: number, t: any) => sum + (t.count || 0), 0)
    const totalAmount = (resAny.tickets || []).reduce((sum: number, t: any) => sum + (t.price * t.count), 0)

    const newCheckedInTickets = Math.max((resAny.checkedInTickets || 0) - resetCheckinCount, 0)
    const newPaidAmount = Math.max((resAny.paidAmount || 0) - refundAmount, 0)

    let checkinStatus = "PARTIALLY_CHECKED_IN"
    if (newCheckedInTickets === totalTickets) {
        checkinStatus = "CHECKED_IN"
    } else if (newCheckedInTickets === 0) {
        checkinStatus = "NOT_CHECKED_IN"
    }

    let paymentStatus = "UNPAID"
    if (newPaidAmount >= totalAmount) {
        paymentStatus = "PAID"
    } else if (newPaidAmount > 0) {
        paymentStatus = "PARTIALLY_PAID"
    }

    const p = prisma as any
    await p.$transaction([
        // 予約レコードの更新
        p.reservation.update({
            where: { id: reservationId },
            data: {
                checkedInTickets: newCheckedInTickets,
                checkinStatus: checkinStatus,
                paidAmount: newPaidAmount,
                paymentStatus: paymentStatus,
                checkedInAt: newCheckedInTickets === 0 ? null : resAny.checkedInAt
            }
        }),
        // 各チケットの内訳更新 (減算)
        ...Object.entries(refundBreakdown).map(([ticketTypeId, count]) => {
            const ticket = resAny.tickets.find((t: any) => t.ticketTypeId === ticketTypeId)
            if (!ticket || count === 0) return null
            return p.reservationTicket.update({
                where: { id: ticket.id },
                data: {
                    paidCount: { decrement: count }
                }
            })
        }).filter(Boolean),
        // ログの作成
        p.checkinLog.create({
            data: {
                reservationId,
                type: 'RESET',
                count: resetCheckinCount,
                paymentInfo: JSON.stringify(Object.fromEntries(
                    Object.entries(refundBreakdown).map(([k, v]) => [k, -v])
                ))
            }
        })
    ])

    revalidatePath(`/productions/${productionId}/checkin/${performanceId}`)
}
