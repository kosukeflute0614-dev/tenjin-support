'use server';

import { db } from "@/lib/firebase";
import {
    collection,
    getDocs,
    doc,
    getDoc,
    query,
    where,
    orderBy
} from "firebase/firestore";
import { PerformanceStats, FirestoreReservation, Production, Performance, DuplicateGroup, SalesReport } from "@/types";
import { serializeDoc, serializeDocs } from "@/lib/firestore-utils";

export async function getDashboardStats(productionId: string, userId: string): Promise<PerformanceStats[]> {
    if (!productionId || !userId) return [];

    try {
        const performancesRef = collection(db, "performances");
        const qPerf = query(
            performancesRef,
            where("productionId", "==", productionId)
        );
        const perfSnapshot = await getDocs(qPerf);
        const performances = serializeDocs<Performance>(perfSnapshot.docs)
            .filter(p => p.userId === userId) // Filter userId in memory
            .sort((a, b) => {
                const timeA = a.startTime ? new Date(a.startTime).getTime() : 0;
                const timeB = b.startTime ? new Date(b.startTime).getTime() : 0;
                return timeA - timeB;
            });

        const reservationsRef = collection(db, "reservations");
        const qRes = query(
            reservationsRef,
            where("userId", "==", userId)
        );
        const resSnapshot = await getDocs(qRes);
        const allReservations = serializeDocs<FirestoreReservation>(resSnapshot.docs)
            .filter(res => res.status !== 'CANCELED');

        return performances.map(perf => {
            const perfReservations = allReservations.filter(res => res.performanceId === perf.id);
            const bookedCount = perfReservations.reduce((sum, res) => {
                const ticketCount = res.tickets.reduce((tSum, t) => tSum + t.count, 0);
                return sum + ticketCount;
            }, 0);

            const remainingCount = Math.max(0, perf.capacity - bookedCount);
            const occupancyRate = perf.capacity > 0 ? (bookedCount / perf.capacity) * 100 : 0;

            return {
                id: perf.id,
                startTime: perf.startTime,
                capacity: perf.capacity,
                bookedCount,
                remainingCount,
                occupancyRate
            };
        });
    } catch (error) {
        console.error("Error getting dashboard stats from Firestore:", error);
        return [];
    }
}

export async function getDuplicateReservations(productionId: string, userId: string): Promise<DuplicateGroup[]> {
    if (!productionId || !userId) return [];

    try {
        // 1. Get production to get ticket types
        const productionRef = doc(db, "productions", productionId);
        const productionSnap = await getDoc(productionRef);
        if (!productionSnap.exists()) return [];
        const production = serializeDoc<Production>(productionSnap);
        if (production.userId !== userId) return []; // Security check

        // 2. Get performances to join startTimes
        const performancesRef = collection(db, "performances");
        const qPerf = query(
            performancesRef,
            where("productionId", "==", productionId)
        );
        const perfSnapshot = await getDocs(qPerf);
        const performanceMap: Record<string, Performance> = {};
        perfSnapshot.forEach(doc => {
            const perf = serializeDoc<Performance>(doc);
            if (perf.userId === userId) { // Filter userId in memory
                performanceMap[doc.id] = perf;
            }
        });

        // 3. Get all reservations for these performances
        const reservationsRef = collection(db, "reservations");
        const q = query(
            reservationsRef,
            where("userId", "==", userId)
        );
        const snapshot = await getDocs(q);

        // Filter reservations that belong to our performances and are not canceled
        const reservations = serializeDocs<any>(snapshot.docs)
            .filter(res => performanceMap[res.performanceId] && res.status !== 'CANCELED');

        const groups: { [key: string]: any[] } = {};

        reservations.forEach(res => {
            // Join data for UI
            const perf = performanceMap[res.performanceId];
            res.performance = perf;
            res.tickets = res.tickets.map((t: any) => ({
                ...t,
                ticketType: production.ticketTypes.find(tt => tt.id === t.ticketTypeId)
            }));

            // Grouping key
            const nameKey = `${res.performanceId}_${res.customerName.replace(/\s/g, '')}`;
            if (!groups[nameKey]) groups[nameKey] = [];
            groups[nameKey].push(res);
        });

        return Object.entries(groups)
            .filter(([_, resList]) => resList.length > 1)
            .map(([key, resList]) => ({
                id: key,
                reservations: resList
            }));
    } catch (error) {
        console.error("Error getting duplicates from Firestore:", error);
        return [];
    }
}

export async function getProductionSalesReport(productionId: string, userId: string): Promise<SalesReport | null> {
    if (!productionId || !userId) {
        console.error("[SalesReport] Missing productionId or userId");
        return null;
    }

    try {
        console.log(`[SalesReport] Generating report for production: ${productionId}, user: ${userId}`);

        const productionRef = doc(db, "productions", productionId);
        const productionSnap = await getDoc(productionRef);
        if (!productionSnap.exists()) {
            console.error(`[SalesReport] Production ${productionId} not found`);
            return null;
        }
        const production = serializeDoc<Production>(productionSnap);
        if (production.userId !== userId) {
            console.error(`[SalesReport] User mismatch. Production owner: ${production.userId}, Requester: ${userId}`);
            return null;
        }

        const performancesRef = collection(db, "performances");
        const qPerf = query(performancesRef, where("productionId", "==", productionId));
        const perfSnapshot = await getDocs(qPerf);
        const performances = serializeDocs<Performance>(perfSnapshot.docs)
            .filter(p => p.userId === userId)
            .sort((a, b) => {
                const at = a.startTime ? new Date(a.startTime).getTime() : 0;
                const bt = b.startTime ? new Date(b.startTime).getTime() : 0;
                return at - bt;
            });

        const reservationsRef = collection(db, "reservations");
        const qRes = query(reservationsRef, where("productionId", "==", productionId));
        const resSnapshot = await getDocs(qRes);
        const reservations = serializeDocs<FirestoreReservation>(resSnapshot.docs)
            .filter(r => r.status !== 'CANCELED');

        const report: SalesReport = {
            totalRevenue: 0,
            totalTickets: 0,
            ticketTypeBreakdown: {},
            performanceSummaries: []
        };

        const ticketTypes = production.ticketTypes || [];
        ticketTypes.forEach(tt => {
            if (tt && tt.id) {
                report.ticketTypeBreakdown[tt.id] = {
                    name: tt.name || '名称未設定',
                    count: 0,
                    revenue: 0
                };
            }
        });

        const OTHER_TT_ID = 'other';
        report.ticketTypeBreakdown[OTHER_TT_ID] = {
            name: 'その他/不明',
            count: 0,
            revenue: 0
        };

        const performanceMap: { [id: string]: typeof report.performanceSummaries[0] } = {};
        performances.forEach(perf => {
            performanceMap[perf.id] = {
                id: perf.id,
                startTime: perf.startTime,
                bookedCount: 0,
                checkedInCount: 0,
                revenue: 0
            };
        });

        reservations.forEach(res => {
            const perfSummary = performanceMap[res.performanceId];
            const tickets = res.tickets || [];

            tickets.forEach(t => {
                const count = Number(t.count || 0);
                const price = Number(t.price || 0);
                const ticketRevenue = count * price;

                report.totalTickets += count;
                report.totalRevenue += ticketRevenue;

                const ttId = t.ticketTypeId || OTHER_TT_ID;
                if (!report.ticketTypeBreakdown[ttId]) {
                    report.ticketTypeBreakdown[OTHER_TT_ID].count += count;
                    report.ticketTypeBreakdown[OTHER_TT_ID].revenue += ticketRevenue;
                } else {
                    report.ticketTypeBreakdown[ttId].count += count;
                    report.ticketTypeBreakdown[ttId].revenue += ticketRevenue;
                }

                if (perfSummary) {
                    perfSummary.bookedCount += count;
                    perfSummary.revenue += ticketRevenue;
                }
            });

            if (perfSummary) {
                perfSummary.checkedInCount += (res.checkedInTickets || 0);
            }
        });

        report.performanceSummaries = Object.values(performanceMap);

        if (report.ticketTypeBreakdown[OTHER_TT_ID] && report.ticketTypeBreakdown[OTHER_TT_ID].count === 0) {
            delete report.ticketTypeBreakdown[OTHER_TT_ID];
        }

        return report;
    } catch (error: any) {
        console.error("[SalesReport] Critical error generating sales report:", error);
        throw error;
    }
}
