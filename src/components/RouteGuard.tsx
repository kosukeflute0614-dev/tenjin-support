'use client';

import { useAuth } from '@/components/AuthProvider';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';

export default function RouteGuard({ children }: { children: React.ReactNode }) {
    const { user, profile, loading, isNewUser, isOrganizer } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!loading) {
            // 例外パスの定義（ログインやオンボーディングが不要なページ）
            const EXEMPT_PATH_PREFIXES = [
                '/staff',    // スタッフポータル
                '/book',     // 一般予約フォーム
                '/guide',    // 利用ガイド
                '/faq',      // よくある質問
                '/contact',  // お問い合わせ
            ];

            const isHomePage = pathname === '/';
            const isExemptPage = EXEMPT_PATH_PREFIXES.some(prefix => pathname.startsWith(prefix));
            const isOnboardingPage = pathname === '/onboarding';

            // ログイン不要な判定
            const isAuthExempt = isHomePage || isExemptPage;

            if (!user && !isAuthExempt) {
                // 未ログインかつ例外ページ以外はトップへ
                router.push('/');
            } else if (user && !isOrganizer && !isAuthExempt) {
                // スタッフ（Google以外）かつ例外ページ以外はトップへ（管理者画面には入れない）
                router.push('/');
            } else if (user && isOrganizer && isNewUser && !isOnboardingPage && !isAuthExempt) {
                // 新規主催者かつオンボーディング前
                router.push('/onboarding');
            } else if (user && isOrganizer && !isNewUser && isOnboardingPage) {
                // 完了済みの主催者がオンボーディングにいた場合
                router.push('/dashboard');
            }
        }
    }, [user, profile, loading, isNewUser, isOrganizer, pathname, router]);

    if (loading) {
        return <div className="flex-center" style={{ height: '50vh' }}>読み込み中...</div>;
    }

    return <>{children}</>;
}
