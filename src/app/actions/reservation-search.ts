'use server'

import { prisma } from '@/lib/prisma'

export async function searchReservations(query: string) {
    if (!query) return []

    return await prisma.reservation.findMany({
        where: {
            OR: [
                { customerName: { contains: query } },
                { customerEmail: { contains: query } }
            ]
        },
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
