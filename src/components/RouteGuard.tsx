'use client';

import { useAuth } from '@/components/AuthProvider';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';

export default function RouteGuard({ children }: { children: React.ReactNode }) {
    const { user, profile, loading, isNewUser } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!loading) {
            // 公開ページやオンボーディング自体は除外
            const isPublicPage = pathname === '/' || pathname.startsWith('/book') || pathname.startsWith('/guide') || pathname.startsWith('/faq') || pathname.startsWith('/contact');
            const isOnboardingPage = pathname === '/onboarding';

            if (!user && !isPublicPage) {
                // ログインしていない場合はトップへ
                router.push('/');
            } else if (user && isNewUser && !isOnboardingPage && !isPublicPage) {
                // ログイン済みだが劇団名未登録の場合はオンボーディングへ強制
                router.push('/onboarding');
            } else if (user && !isNewUser && isOnboardingPage) {
                // 登録済みユーザーがオンボーディングに来た場合はダッシュボードへ
                router.push('/dashboard');
            }
        }
    }, [user, profile, loading, isNewUser, pathname, router]);

    if (loading) {
        return <div className="flex-center" style={{ height: '50vh' }}>読み込み中...</div>;
    }

    return <>{children}</>;
}
