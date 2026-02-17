'use server'

import { db } from "@/lib/firebase";
import {
    collection,
    getDocs,
    getDoc,
    doc,
    query,
    where,
    orderBy
} from "firebase/firestore";
import { FirestoreReservation, Production, Performance } from "@/types";
import { serializeDoc, serializeDocs } from "@/lib/firestore-utils";

export async function searchReservations(queryStr: string, userId: string) {
    if (!queryStr || !userId) return []

    try {
        const reservationsRef = collection(db, "reservations");
        const q = query(
            reservationsRef,
            where("userId", "==", userId)
        );
        const snapshot = await getDocs(q);

        const allReservations = serializeDocs<any>(snapshot.docs).sort((a, b) => {
            const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return timeB - timeA;
        });

        // In-memory filter for partial matches (customerName or customerEmail)
        const filtered = allReservations.filter((res: any) =>
            (res.customerName && res.customerName.includes(queryStr)) ||
            (res.customerEmail && res.customerEmail.includes(queryStr))
        );

        // Join necessary data for UI (Performance -> Production)
        const productionCache: Record<string, Production> = {};
        const performanceCache: Record<string, Performance> = {};

        const results = await Promise.all(filtered.map(async (res: any) => {
            // Join Performance
            let perf = performanceCache[res.performanceId];
            if (!perf) {
                const perfSnap = await getDoc(doc(db, "performances", res.performanceId));
                if (perfSnap.exists()) {
                    perf = serializeDoc<Performance>(perfSnap);
                    performanceCache[res.performanceId] = perf;
                }
            }
            res.performance = perf;

            if (perf) {
                // Join Production
                let prod = productionCache[perf.productionId];
                if (!prod) {
                    const prodSnap = await getDoc(doc(db, "productions", perf.productionId));
                    if (prodSnap.exists()) {
                        prod = serializeDoc<Production>(prodSnap);
                        productionCache[perf.productionId] = prod;
                    }
                }
                if (res.performance) res.performance.production = prod;

                // Join Ticket Details
                if (prod && res.tickets) {
                    res.tickets = res.tickets.map((t: any) => ({
                        ...t,
                        ticketType: prod.ticketTypes.find(tt => tt.id === t.ticketTypeId)
                    }));
                }
            }

            return res;
        }));

        return results;
    } catch (error) {
        console.error("Error searching reservations in Firestore:", error);
        return [];
    }
}
