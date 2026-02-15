'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function createSameDayTicket(formData: FormData) {
    const performanceId = formData.get('performanceId') as string
    const productionId = formData.get('productionId') as string
    const customerName = formData.get('customerName') as string
    const customerNameKana = formData.get('customerNameKana') as string || ""
    const breakdownJson = formData.get('breakdown') as string

    if (!performanceId || !customerName || !breakdownJson) {
        throw new Error('入力内容が不足しています')
    }

    const breakdown: { [ticketTypeId: string]: number } = JSON.parse(breakdownJson)
    const activeTicketCounts = Object.entries(breakdown).filter(([_, count]) => count > 0)

    if (activeTicketCounts.length === 0) {
        throw new Error('枚数が指定されていません')
    }

    const totalQuantity = activeTicketCounts.reduce((sum, [_, count]) => sum + count, 0)

    // 1. 公演の残数チェック
    const performance = await prisma.performance.findUnique({
        where: { id: performanceId },
        include: {
            reservations: {
                include: {
                    tickets: true
                }
            }
        }
    })

    if (!performance) throw new Error('公演が見つかりません')

    const bookedCount = performance.reservations.reduce((sum, res) => {
        if (res.status === 'CANCELED') return sum
        return sum + res.tickets.reduce((tSum, t) => tSum + t.count, 0)
    }, 0)

    const remaining = performance.capacity - bookedCount

    if (totalQuantity > remaining) {
        throw new Error(`枚数が販売可能数（${remaining}枚）を超えています`)
    }

    // 2. 券種データの取得と価格計算
    const ticketTypeIds = activeTicketCounts.map(([id, _]) => id)
    const ticketTypes = await prisma.ticketType.findMany({
        where: { id: { in: ticketTypeIds } }
    })

    let totalAmount = 0
    const ticketDatas = activeTicketCounts.map(([id, count]) => {
        const tt = ticketTypes.find(t => t.id === id) as any
        if (!tt) throw new Error('券種が見つかりません')
        totalAmount += (tt.doorPrice ?? tt.price) * count
        return {
            ticketTypeId: id,
            count,
            price: tt.doorPrice ?? tt.price
        }
    })

    // 3. 予約の作成 (source: SAME_DAY, checkedInAt: now)
    await prisma.reservation.create({
        data: {
            performanceId,
            customerName,
            customerNameKana,
            source: "SAME_DAY",
            checkedInAt: new Date(),
            checkedInTickets: totalQuantity,
            checkinStatus: "CHECKED_IN",
            status: "CONFIRMED",
            paymentStatus: "PAID",
            paidAmount: totalAmount,
            tickets: {
                create: ticketDatas
            }
        }
    })

    revalidatePath(`/productions/${productionId}/checkin/${performanceId}`)
}
