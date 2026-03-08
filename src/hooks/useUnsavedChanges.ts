'use client';

import { useEffect, useRef } from 'react';

/**
 * 未保存変更ガード
 * - タブ閉じ/リロード: beforeunload で警告
 * - ブラウザ戻る/進む: popstate でキャッチし、キャンセル時は履歴を復元
 * - Next.js クライアントナビゲーション (Link クリック): click イベントで <a> を検知
 *
 * history.pushState/replaceState のオーバーライドは行わない
 * （Next.js 内部の state 管理と干渉するため）
 */
export function useUnsavedChanges(hasUnsavedChanges: boolean) {
    const dirtyRef = useRef(hasUnsavedChanges);
    dirtyRef.current = hasUnsavedChanges;

    useEffect(() => {
        if (!hasUnsavedChanges) return;

        const message = '変更が保存されていません。このページを離れてもよろしいですか？';
        let guardActive = true;

        // 1. タブ閉じ / リロード
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (!dirtyRef.current) return;
            e.preventDefault();
            e.returnValue = message;
            return message;
        };

        // 2. <a> タグのクリックを検知（Next.js Link 含む）
        const handleClick = (e: MouseEvent) => {
            if (!dirtyRef.current || !guardActive) return;

            const anchor = (e.target as HTMLElement).closest('a');
            if (!anchor) return;

            const href = anchor.getAttribute('href');
            if (!href) return;

            // 外部リンク・アンカーリンク・同一ページはスキップ
            if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

            // 同一ページ内のリンクはスキップ
            try {
                const url = new URL(href, window.location.origin);
                if (url.pathname === window.location.pathname) return;
            } catch {
                // invalid URL, skip
                return;
            }

            if (!window.confirm(message)) {
                e.preventDefault();
                e.stopPropagation();
            }
        };

        // 3. ブラウザ戻る/進むボタン
        //    ダミーの履歴エントリを追加し、popstate で検知
        const currentUrl = window.location.href;
        window.history.pushState({ unsavedGuard: true }, '', currentUrl);

        const handlePopState = (e: PopStateEvent) => {
            if (!dirtyRef.current || !guardActive) return;

            if (!window.confirm(message)) {
                // キャンセル → 元のページに留まる（履歴エントリを再追加）
                window.history.pushState({ unsavedGuard: true }, '', currentUrl);
            }
            // OK → そのままナビゲーション（ブラウザが処理する）
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        window.addEventListener('click', handleClick, true); // capture phase
        window.addEventListener('popstate', handlePopState);

        return () => {
            guardActive = false;
            window.removeEventListener('beforeunload', handleBeforeUnload);
            window.removeEventListener('click', handleClick, true);
            window.removeEventListener('popstate', handlePopState);
        };
    }, [hasUnsavedChanges]);
}
