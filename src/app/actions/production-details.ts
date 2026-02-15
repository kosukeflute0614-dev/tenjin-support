'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function addPerformance(formData: FormData) {
    const productionId = formData.get('productionId') as string
    const date = formData.get('date') as string
    const time = formData.get('time') as string
    const startTimeStr = formData.get('startTime') as string
    const capacity = parseInt(formData.get('capacity') as string)

    if (!productionId || capacity < 1) {
        throw new Error('Invalid input')
    }

    let startTime: Date
    if (date && time) {
        startTime = new Date(`${date}T${time}`)
    } else if (startTimeStr) {
        startTime = new Date(startTimeStr)
    } else {
        throw new Error('日時を入力してください')
    }

    await prisma.performance.create({
        data: {
            productionId,
            startTime,
            capacity
        }
    })

    revalidatePath(`/productions/${productionId}`)
}

export async function addTicketType(formData: FormData) {
    const productionId = formData.get('productionId') as string
    const name = formData.get('name') as string
    const advancePrice = parseInt(formData.get('advancePrice') as string)
    const doorPrice = parseInt(formData.get('doorPrice') as string)

    if (!productionId || !name || isNaN(advancePrice) || isNaN(doorPrice)) {
        throw new Error('Invalid input')
    }

    await prisma.ticketType.create({
        data: {
            productionId,
            name,
            price: advancePrice, // Legacy
            advancePrice,
            doorPrice
        } as any
    })

    revalidatePath(`/productions/${productionId}`)
}

export async function getProductionDetails(id: string) {
    if (!id) throw new Error('Production ID is required');
    return await prisma.production.findUnique({
        where: { id },
        include: {
            performances: {
                orderBy: { startTime: 'asc' }
            },
            ticketTypes: true
        }
    })
}

export async function updatePerformance(id: string, formData: FormData) {
    const date = formData.get('date') as string
    const time = formData.get('time') as string
    const startTimeStr = formData.get('startTime') as string
    const capacity = parseInt(formData.get('capacity') as string)
    const productionId = formData.get('productionId') as string // Added to support the validation check

    if (!id || capacity < 1 || !productionId) {
        throw new Error('Invalid input')
    }

    let startTime: Date
    if (date && time) {
        startTime = new Date(`${date}T${time}`)
    } else if (startTimeStr) {
        startTime = new Date(startTimeStr)
    } else {
        throw new Error('日時を入力してください')
    }

    const updated = await prisma.performance.update({
        where: { id },
        data: {
            startTime,
            capacity
        }
    })

    revalidatePath(`/productions/${updated.productionId}`)
}

export async function deletePerformance(id: string, productionId: string) {
    if (!id || !productionId) throw new Error('Missing ID');

    // Check for existing reservations that are not canceled
    const activeReservationsCount = await prisma.reservation.count({
        where: {
            performanceId: id,
            status: { not: 'CANCELED' }
        }
    });

    if (activeReservationsCount > 0) {
        throw new Error('すでに予約があるため削除できません');
    }

    // Delete canceled reservations (this will also delete reservationTickets due to onDelete: Cascade)
    await prisma.reservation.deleteMany({
        where: {
            performanceId: id,
            status: 'CANCELED'
        }
    });

    await prisma.performance.delete({
        where: { id }
    })

    revalidatePath(`/productions/${productionId}`)
}

export async function updateTicketType(id: string, formData: FormData) {
    const name = formData.get('name') as string
    const advancePrice = parseInt(formData.get('advancePrice') as string)
    const doorPrice = parseInt(formData.get('doorPrice') as string)
    const productionId = formData.get('productionId') as string

    if (!id || !name || isNaN(advancePrice) || isNaN(doorPrice) || !productionId) {
        throw new Error('Invalid input')
    }

    const updated = await prisma.ticketType.update({
        where: { id },
        data: { name, price: advancePrice, advancePrice, doorPrice } as any
    })

    revalidatePath(`/productions/${updated.productionId}`)
}

export async function deleteTicketType(id: string, productionId: string) {
    if (!id || !productionId) throw new Error('Missing ID');

    // Check for existing reservation tickets that are not canceled
    const activeReservations = await (prisma.reservation as any).findMany({
        where: {
            status: { not: 'CANCELED' }
        },
        include: {
            tickets: true
        }
    });

    const hasActiveTicket = activeReservations.some((res: any) =>
        res.tickets && res.tickets.some((t: any) => t.ticketTypeId === id)
    );

    if (hasActiveTicket) {
        throw new Error('すでに予約があるため削除できません');
    }

    // Delete related tickets from ANY reservation (including canceled ones)
    // Since we checked for active tickets above, if we find any here, they must be from canceled reservations
    // Note: We use any because of the previous lint issues with reservationTicket property
    await (prisma as any).reservationTicket.deleteMany({
        where: {
            ticketTypeId: id
        }
    });

    await prisma.ticketType.delete({
        where: { id }
    })

    revalidatePath(`/productions/${productionId}`)
}
