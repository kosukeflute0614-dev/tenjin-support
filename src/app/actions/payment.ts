'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function registerPayment(reservationId: string, receivedAmount: number, performanceId: string, productionId: string) {
    const reservation = await prisma.reservation.findUnique({
        where: { id: reservationId },
        include: { tickets: true }
    })

    if (!reservation) throw new Error('予約が見つかりません')

    const totalAmount = reservation.tickets.reduce((sum, t) => sum + (t.price * t.count), 0)
    const newPaidAmount = reservation.paidAmount + receivedAmount

    let status = "UNPAID"
    if (newPaidAmount >= totalAmount) {
        status = "PAID"
    } else if (newPaidAmount > 0) {
        status = "PARTIALLY_PAID"
    }

    await prisma.reservation.update({
        where: { id: reservationId },
        data: {
            paidAmount: newPaidAmount,
            paymentStatus: status
        }
    })

    revalidatePath(`/productions/${productionId}/checkin/${performanceId}`)
}
