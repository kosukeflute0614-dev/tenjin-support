/**
 * Firestore の Timestamp または日付型を安全に Date に変換する
 */
export function timestampToDate(val: any): Date | null {
    if (!val) return null;
    if (typeof val.toDate === 'function') return val.toDate();
    if (val instanceof Date) return val;
    if (typeof val === 'string' || typeof val === 'number') return new Date(val);
    if (val.seconds !== undefined) return new Date(val.seconds * 1000);
    return null;
}
