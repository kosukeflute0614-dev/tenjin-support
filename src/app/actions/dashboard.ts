'use server'

import { prisma } from '@/lib/prisma'

export interface PerformanceStats {
    id: string
    startTime: Date
    capacity: number
    bookedCount: number
    remainingCount: number
    occupancyRate: number
}

export interface DuplicateGroup {
    id: string; // Grouping key
    reservations: any[]; // Full reservation objects
}

export async function getDashboardStats(productionId: string): Promise<PerformanceStats[]> {
    if (!productionId) return []

    const performances = await prisma.performance.findMany({
        where: { productionId },
        include: {
            reservations: {
                where: {
                    status: { not: 'CANCELED' }
                },
                include: {
                    tickets: true
                }
            }
        },
        orderBy: {
            startTime: 'asc'
        }
    })

    return performances.map(perf => {
        const bookedCount = perf.reservations.reduce((sum, res) => {
            return sum + res.tickets.reduce((tSum, t) => tSum + t.count, 0)
        }, 0)

        return {
            id: perf.id,
            startTime: perf.startTime,
            capacity: perf.capacity,
            bookedCount,
            remainingCount: perf.capacity - bookedCount,
            occupancyRate: perf.capacity > 0 ? (bookedCount / perf.capacity) * 100 : 0
        }
    })
}

export async function getDuplicateReservations(productionId: string): Promise<DuplicateGroup[]> {
    if (!productionId) return [];

    const reservations = await prisma.reservation.findMany({
        where: {
            status: { not: 'CANCELED' },
            performance: { productionId }
        },
        include: {
            performance: true,
            tickets: {
                include: {
                    ticketType: true
                }
            },
            actor: true
        }
    });

    // Helper to calculate total count and breakdown
    const getTicketBreakdown = (res: any) => {
        const breakdown: Record<string, number> = {};
        let total = 0;
        res.tickets.forEach((t: any) => {
            breakdown[t.ticketTypeId] = t.count;
            total += t.count;
        });
        return { total, breakdown };
    };

    const duplicateGroups: Map<string, any[]> = new Map();
    const processedIds = new Set<string>();

    for (let i = 0; i < reservations.length; i++) {
        const resA = reservations[i];
        if (processedIds.has(resA.id)) continue;

        const currentGroup = [resA];
        const infoA = getTicketBreakdown(resA);

        for (let j = i + 1; j < reservations.length; j++) {
            const resB = reservations[j];
            if (processedIds.has(resB.id)) continue;

            const infoB = getTicketBreakdown(resB);

            // Detection logic
            const isSamePerformance = resA.performanceId === resB.performanceId;
            const isSameTotalCount = infoA.total === infoB.total;

            // Check if ticket breakdowns match exactly
            const ticketTypesA = Object.keys(infoA.breakdown);
            const ticketTypesB = Object.keys(infoB.breakdown);
            const isSameTicketBreakdown = isSameTotalCount &&
                ticketTypesA.length === ticketTypesB.length &&
                ticketTypesA.every(id => infoA.breakdown[id] === infoB.breakdown[id]);

            const isSameName = resA.customerName === resB.customerName;
            const isSameEmail = resA.customerEmail && resB.customerEmail && resA.customerEmail === resB.customerEmail;

            if (isSamePerformance && isSameTicketBreakdown && (isSameName || isSameEmail)) {
                currentGroup.push(resB);
                processedIds.add(resB.id);
            }
        }

        if (currentGroup.length > 1) {
            processedIds.add(resA.id);
            const groupId = `group-${resA.id}`;
            duplicateGroups.set(groupId, currentGroup);
        }
    }

    return Array.from(duplicateGroups.entries()).map(([id, reservations]) => ({
        id,
        reservations
    }));
}
