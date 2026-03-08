/**
 * 残席チェック・入力バリデーション共通ユーティリティ
 *
 * 全予約経路（公開フォーム、管理者予約、当日券、キャンセル復元）で再利用する。
 */

type ReservationLike = {
    performanceId?: string;
    status?: string;
    tickets?: Array<{ count?: number }>;
};

/**
 * 予約済みチケット数を集計する（CANCELED を除外）
 */
export function calculateBookedCount(
    reservationDocs: ReservationLike[],
    performanceId: string
): number {
    return reservationDocs.reduce((sum, res) => {
        if (res.performanceId !== performanceId) return sum;
        if (res.status === 'CANCELED') return sum;
        const ticketCount = res.tickets?.reduce(
            (tSum: number, t) => tSum + (t.count || 0),
            0
        ) || 0;
        return sum + ticketCount;
    }, 0);
}

/**
 * 残席チェック
 * capacity === 0 は「0席」として扱う（無制限ではない）。
 */
export function validateCapacity(
    capacity: number,
    bookedCount: number,
    requestedCount: number
): { ok: boolean; remaining: number; error?: string } {
    const remaining = Math.max(0, capacity - bookedCount);
    if (requestedCount > remaining) {
        return {
            ok: false,
            remaining,
            error: `残席数（${remaining}枚）を超えています。`,
        };
    }
    return { ok: true, remaining };
}

/**
 * チケット入力バリデーション（悪意ある入力の防御）
 *
 * - 各チケットの count が 0 以上の整数であること
 * - 1 券種あたり上限 50 枚
 * - 合計上限 100 枚
 */
export function validateTicketInput(
    tickets: Array<{ count?: number }>,
    maxPerTicket: number = 50,
    maxTotal: number = 100,
): { totalCount: number; error?: string } {
    let totalCount = 0;
    for (const t of tickets) {
        const count = t.count ?? 0;
        if (!Number.isInteger(count) || count < 0) {
            return { totalCount: 0, error: '枚数は0以上の整数で指定してください。' };
        }
        if (count > maxPerTicket) {
            return { totalCount: 0, error: `1券種あたり${maxPerTicket}枚以下にしてください。` };
        }
        totalCount += count;
    }
    if (totalCount > maxTotal) {
        return { totalCount, error: `合計${maxTotal}枚以下にしてください。` };
    }
    if (totalCount === 0) {
        return { totalCount, error: '券種を1枚以上選択してください。' };
    }
    return { totalCount };
}
