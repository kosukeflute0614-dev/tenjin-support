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
import { PerformanceStats, FirestoreReservation, Production, Performance, DuplicateGroup } from "@/types";
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
