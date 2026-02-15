'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// Status constants moved to @/lib/constants

export async function getReservations() {
    return await prisma.reservation.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
            performance: {
                include: {
                    production: true
                }
            },
            tickets: {
                include: {
                    ticketType: true
                }
            },
            actor: true
        }
    })
}

export async function createReservation(formData: FormData) {
    const performanceId = formData.get('performanceId') as string
    const customerName = formData.get('customerName') as string
    const customerNameKana = formData.get('customerNameKana') as string || ""
    const customerEmail = formData.get('customerEmail') as string
    const remarks = formData.get('remarks') as string

    // Parse tickets
    const tickets: { ticketTypeId: string, count: number, price: number }[] = [];

    for (const [key, value] of Array.from(formData.entries())) {
        if (key.startsWith('ticket_')) {
            const count = parseInt(value as string);
            if (count > 0) {
                const ticketTypeId = key.replace('ticket_', '');
                tickets.push({ ticketTypeId, count, price: 0 }); // Price to be filled
            }
        }
    }

    // Logging for debugging
    console.log('Processed Tickets:', tickets);

    if (!performanceId) {
        throw new Error('Performance ID is missing');
    }
    if (!customerName) {
        throw new Error('Customer Name is missing');
    }
    if (tickets.length === 0) {
        console.error('No tickets selected in form submission');
        throw new Error('No tickets selected (枚数を1枚以上指定してください)');
    }

    // Fetch prices for selected tickets
    const ticketTypeIds = tickets.map(t => t.ticketTypeId);
    const ticketTypes = await prisma.ticketType.findMany({
        where: { id: { in: ticketTypeIds } }
    });

    const reservationTicketsData = tickets.map(t => {
        const type = ticketTypes.find(tt => tt.id === t.ticketTypeId);
        return {
            ticketTypeId: t.ticketTypeId,
            count: t.count,
            price: (type as any) ? ((type as any).advancePrice ?? (type as any).price) : 0
        };
    });

    await prisma.reservation.create({
        data: {
            performanceId,
            customerName,
            customerNameKana,
            customerEmail,
            remarks,
            status: 'CONFIRMED',
            paymentStatus: 'UNPAID',
            tickets: {
                create: reservationTicketsData
            }
        }
    })

    revalidatePath('/reservations')
    redirect('/reservations')
}

export async function createPublicReservation(formData: FormData) {
    const performanceId = formData.get('performanceId') as string
    const productionId = formData.get('productionId') as string
    const customerName = formData.get('customerName') as string
    const customerNameKana = formData.get('customerNameKana') as string || ""
    const customerEmail = formData.get('customerEmail') as string
    const remarks = formData.get('remarks') as string

    if (!customerEmail) {
        throw new Error('メールアドレスは必須です');
    }

    // Parse tickets
    const tickets: { ticketTypeId: string, count: number, price: number }[] = [];
    for (const [key, value] of Array.from(formData.entries())) {
        if (key.startsWith('ticket_')) {
            const count = parseInt(value as string);
            if (count > 0) {
                const ticketTypeId = key.replace('ticket_', '');
                tickets.push({ ticketTypeId, count, price: 0 });
            }
        }
    }

    if (!performanceId || !customerName || tickets.length === 0) {
        throw new Error('入力内容が不足しています');
    }

    // Validate production reception status
    const production = await prisma.production.findUnique({
        where: { id: productionId },
        include: { performances: true }
    });

    const { isReceptionOpen, isPerformanceReceptionOpen } = await import('@/lib/production');

    if (!production || !isReceptionOpen(production)) {
        throw new Error('現在、予約を受け付けておりません');
    }

    const performance = production.performances.find(p => p.id === performanceId);
    if (!performance || !isPerformanceReceptionOpen(performance, production)) {
        throw new Error('選択された公演回の予約受付は終了しました');
    }

    // Fetch prices
    const ticketTypeIds = tickets.map(t => t.ticketTypeId);
    const ticketTypes = await prisma.ticketType.findMany({
        where: { id: { in: ticketTypeIds } }
    });

    const reservationTicketsData = tickets.map(t => {
        const type = ticketTypes.find(tt => tt.id === t.ticketTypeId);
        return {
            ticketTypeId: t.ticketTypeId,
            count: t.count,
            price: (type as any) ? ((type as any).advancePrice ?? (type as any).price) : 0
        };
    });

    await prisma.reservation.create({
        data: {
            performanceId,
            customerName,
            customerNameKana,
            customerEmail,
            remarks,
            status: 'CONFIRMED', // 即時確定
            paymentStatus: 'UNPAID',
            tickets: {
                create: reservationTicketsData
            }
        }
    })

    redirect(`/book/${productionId}/success`)
}

export async function updateReservation(id: string, formData: FormData) {
    const customerName = formData.get('customerName') as string;
    const customerNameKana = formData.get('customerNameKana') as string || "";
    const customerEmail = formData.get('customerEmail') as string;
    const remarks = formData.get('remarks') as string;
    const performanceId = formData.get('performanceId') as string;

    // We no longer update status or paymentStatus directly from the general update form

    // Parse tickets
    const tickets: { ticketTypeId: string, count: number }[] = [];
    for (const [key, value] of Array.from(formData.entries())) {
        if (key.startsWith('ticket_')) {
            const count = parseInt(value as string);
            if (count > 0) {
                const ticketTypeId = key.replace('ticket_', '');
                tickets.push({ ticketTypeId, count });
            }
        }
    }

    // Fetch prices for selected tickets
    const ticketTypes = await prisma.ticketType.findMany({
        where: { id: { in: tickets.map(t => t.ticketTypeId) } }
    });

    const reservationTicketsData = tickets.map(t => {
        const type = ticketTypes.find(tt => tt.id === t.ticketTypeId);
        return {
            ticketTypeId: t.ticketTypeId,
            count: t.count,
            price: (type as any) ? ((type as any).advancePrice ?? (type as any).price) : 0
        };
    });

    await prisma.reservation.update({
        where: { id },
        data: {
            customerName,
            customerEmail,
            remarks,
            performanceId,
            tickets: {
                deleteMany: {}, // Clear existing tickets
                create: reservationTicketsData // Re-create
            }
        }
    });

    revalidatePath('/reservations');
}

export async function cancelReservation(id: string) {
    await prisma.reservation.update({
        where: { id },
        data: { status: 'CANCELED' }
    });
    revalidatePath('/reservations');
}

export async function restoreReservation(id: string) {
    await prisma.reservation.update({
        where: { id },
        data: { status: 'CONFIRMED' }
    });
    revalidatePath('/reservations');
}

export async function confirmReservation(id: string) {
    await prisma.reservation.update({
        where: { id },
        data: { status: 'CONFIRMED' }
    });
    revalidatePath('/reservations');
}

export async function deleteReservation(id: string) {
    await prisma.reservation.delete({
        where: { id }
    });
    revalidatePath('/reservations');
}

// Data fetching helper for the creation form
export async function getBookingOptions() {
    const productions = await prisma.production.findMany({
        include: {
            performances: {
                orderBy: { startTime: 'asc' }
            },
            ticketTypes: true,
        },
        orderBy: { createdAt: 'desc' }
    })
    return productions
}
