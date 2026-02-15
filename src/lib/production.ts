/**
 * 公演全体の予約受付が現在どのような状態にあるかを判定します。
 * (全ての公演回が終了するまで、あるいは一律の終了時刻が来るまで)
 */
export function getEffectiveReceptionStatus(production: {
    receptionStatus: string;
    receptionStart?: Date | string | null;
    receptionEnd?: Date | string | null;
    receptionEndMode?: string;
    receptionEndMinutes?: number;
    performances?: { startTime: Date | string }[];
}): 'OPEN' | 'BEFORE_START' | 'CLOSED' {
    const now = new Date();
    const start = production.receptionStart ? new Date(production.receptionStart) : null;

    // 1. 開始前判定
    if (start && now < start) return 'BEFORE_START';

    // 2. 手動・一律の終了判定
    const manualEnd = production.receptionEnd ? new Date(production.receptionEnd) : null;
    if (production.receptionEndMode === 'MANUAL' || !production.receptionEndMode) {
        if (manualEnd && now > manualEnd) return 'CLOSED';
    }

    // 3. 公演開始連動判定の場合
    if (production.receptionEndMode === 'PERFORMANCE_START' || production.receptionEndMode === 'BEFORE_PERFORMANCE' || production.receptionEndMode === 'DAY_BEFORE') {
        if (production.performances && production.performances.length > 0) {
            const offsetMinutes = production.receptionEndMode === 'BEFORE_PERFORMANCE' ? (production.receptionEndMinutes || 0) : 0;

            // 全ての公演回がそれぞれの締切時刻を過ぎているかチェック
            const allClosed = production.performances.every(perf => {
                let deadline: Date;
                if (production.receptionEndMode === 'DAY_BEFORE') {
                    // 当日の0:00（前日の23:59:59の直後）を締切とする
                    const startDate = new Date(perf.startTime);
                    deadline = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
                } else {
                    deadline = new Date(new Date(perf.startTime).getTime() - (offsetMinutes * 60 * 1000));
                }
                return now > deadline;
            });
            if (allClosed) return 'CLOSED';
        } else {
            // 公演回がない場合は手動終了設定に従うか、CLOSEDにする
            if (manualEnd && now > manualEnd) return 'CLOSED';
        }
    }

    // 4. 開始・稼働中判定
    // 開始時刻が設定されており、現在時刻がそれ以降であれば OPEN
    if (start && now >= start) return 'OPEN';

    // 開始時刻が設定されていない場合、手動ステータスに従う
    if (!start && production.receptionStatus === 'OPEN') return 'OPEN';

    return 'CLOSED';
}

/**
 * 予約フォームを表示可能かどうか（受付中かどうか）を判定します。
 */
export function isReceptionOpen(production: any) {
    return getEffectiveReceptionStatus(production) === 'OPEN';
}

/**
 * 特定の公演回が受付可能かどうかを判定します。
 */
export function isPerformanceReceptionOpen(performance: { startTime: Date | string }, production: {
    receptionStatus: string;
    receptionStart?: Date | string | null;
    receptionEnd?: Date | string | null;
    receptionEndMode?: string;
    receptionEndMinutes?: number;
}) {
    const now = new Date();
    const start = production.receptionStart ? new Date(production.receptionStart) : null;

    // 開始前ならNG
    if (start && now < start) return false;

    // 2. 終了判定
    // 一律終了設定（MANUAL）がある場合
    if (production.receptionEndMode === 'MANUAL' || !production.receptionEndMode) {
        const manualEnd = production.receptionEnd ? new Date(production.receptionEnd) : null;
        if (manualEnd && now > manualEnd) return false;
    }

    // 公演開始連動判定（開始時刻、開始前指定、または前日締切）
    if (production.receptionEndMode === 'PERFORMANCE_START' || production.receptionEndMode === 'BEFORE_PERFORMANCE' || production.receptionEndMode === 'DAY_BEFORE') {
        let deadline: Date;
        if (production.receptionEndMode === 'DAY_BEFORE') {
            const startDate = new Date(performance.startTime);
            deadline = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
        } else {
            const offsetMinutes = production.receptionEndMode === 'BEFORE_PERFORMANCE' ? (production.receptionEndMinutes || 0) : 0;
            deadline = new Date(new Date(performance.startTime).getTime() - (offsetMinutes * 60 * 1000));
        }
        if (now > deadline) return false;
    }

    // 3. 基本的な開始フラグの確認
    // スケジュール開始が有効であれば OK
    if (start && now >= start) return true;

    // スケジュール作成なし（開始時刻未設定）の場合は手動ステータスに従う
    return production.receptionStatus === 'OPEN';
}
