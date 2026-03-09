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

    // 文字列またはTimestampから安全にDateオブジェクトを作成するヘルパー
    const toDate = (val: any) => {
        if (!val) return null;
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
    };

    const start = toDate(production.receptionStart);

    // 1. 開始前判定
    if (start && now < start) return 'BEFORE_START';

    // 2. 終了判定の準備
    const endMode = production.receptionEndMode || 'MANUAL';
    const manualEnd = toDate(production.receptionEnd);

    // 一律の終了判定（個別指定）
    if (endMode === 'MANUAL') {
        if (manualEnd && now > manualEnd) return 'CLOSED';
    }

    // 3. 公演開始連動判定の場合
    if (['PERFORMANCE_START', 'BEFORE_PERFORMANCE', 'DAY_BEFORE'].includes(endMode)) {
        if (production.performances && production.performances.length > 0) {
            const offsetMinutes = endMode === 'BEFORE_PERFORMANCE' ? (production.receptionEndMinutes || 0) : 0;

            // 全ての公演回がそれぞれの締切時刻を過ぎているかチェック
            const allClosed = production.performances.every(perf => {
                const perfStart = toDate(perf.startTime);
                if (!perfStart) return true; // 日付不正なら終了扱い

                let deadline: Date;
                if (endMode === 'DAY_BEFORE') {
                    deadline = new Date(perfStart.getFullYear(), perfStart.getMonth(), perfStart.getDate());
                } else {
                    deadline = new Date(perfStart.getTime() - (offsetMinutes * 60 * 1000));
                }
                return now > deadline;
            });
            if (allClosed) return 'CLOSED';
        } else {
            // 公演回データがない場合は、もし手動終了時刻があればそれに従う
            if (manualEnd && now > manualEnd) return 'CLOSED';
            // 公演開始連動なのにデータがない場合は、安全のため OPEN にするかステータスに従う
        }
    }

    // 4. 開始・稼働中判定
    // スケジュール開始が有効であれば OPEN
    if (start && now >= start) return 'OPEN';

    // スケジュール開始がない（null）または現在時刻が開始後の場合、手動ステータスに従う
    if (!start || now >= start) {
        if (production.receptionStatus === 'OPEN') return 'OPEN';
    }

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

    const toDate = (val: any) => {
        if (!val) return null;
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
    };

    const start = toDate(production.receptionStart);

    // 開始前ならNG
    if (start && now < start) return false;

    // 2. 終了判定
    const endMode = production.receptionEndMode || 'MANUAL';

    // 一律終了設定（MANUAL）がある場合
    if (endMode === 'MANUAL') {
        const manualEnd = toDate(production.receptionEnd);
        if (manualEnd && now > manualEnd) return false;
    }

    // 公演開始連動判定
    if (['PERFORMANCE_START', 'BEFORE_PERFORMANCE', 'DAY_BEFORE'].includes(endMode)) {
        const perfStart = toDate(performance.startTime);
        if (!perfStart) return false;

        let deadline: Date;
        if (endMode === 'DAY_BEFORE') {
            deadline = new Date(perfStart.getFullYear(), perfStart.getMonth(), perfStart.getDate());
        } else {
            const offsetMinutes = endMode === 'BEFORE_PERFORMANCE' ? (production.receptionEndMinutes || 0) : 0;
            deadline = new Date(perfStart.getTime() - (offsetMinutes * 60 * 1000));
        }
        if (now > deadline) return false;
    }

    // 3. 基本的な開始フラグの確認
    // スケジュール開始が有効であれば OK
    if (start && now >= start) return true;

    // スケジュール作成なし（開始時刻未設定）の場合は手動ステータスに従う
    if (!start || now >= start) {
        return production.receptionStatus === 'OPEN';
    }

    return false;
}
