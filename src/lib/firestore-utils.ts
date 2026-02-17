/**
 * Helper to serialize Firestore documents (handles Timestamps)
 * Convert Firestore Timestamp objects within a document to ISO strings
 * so they can be passed from Server Components to Client Components.
 */
export function serializeDoc<T>(docOrData: any): T {
    if (!docOrData) return docOrData;

    // Support both DocumentSnapshot and raw data object
    const data = typeof docOrData.data === 'function' ? docOrData.data() : docOrData;
    const id = docOrData.id;

    const serialized = JSON.parse(JSON.stringify(data, (key, value) => {
        // Look for Firestore Timestamp structure: { seconds: number, nanoseconds: number }
        if (value && typeof value === 'object' && typeof value.seconds === 'number' && typeof value.nanoseconds === 'number') {
            return new Date(value.seconds * 1000).toISOString();
        }
        return value;
    }));

    if (id) {
        return { id, ...serialized } as T;
    }
    return serialized as T;
}

/**
 * Serialize an array of Firestore documents or data objects
 */
export function serializeDocs<T>(docs: any[]): T[] {
    return docs.map(doc => serializeDoc<T>(doc));
}
