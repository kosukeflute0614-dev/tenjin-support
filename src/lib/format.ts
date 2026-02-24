export function formatDateTime(date: Date | string | number) {
    const d = new Date(date);
    return d.toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function formatTime(date: Date | string | number) {
    const d = new Date(date);
    return d.toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function formatDate(date: Date | string | number) {
    const d = new Date(date);
    return d.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
}
export function formatForDateTimeLocal(date: Date | string | number | null | undefined) {
    if (!date) return '';
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function formatCurrency(amount: number) {
    return new Intl.NumberFormat('ja-JP', {
        style: 'currency',
        currency: 'JPY',
    }).format(amount);
}
