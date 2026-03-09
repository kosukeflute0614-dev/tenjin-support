'use client';

import { createProductionClient } from '@/lib/client-firestore';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';

export default function NewProductionPage() {
    const { user, profile, loading } = useAuth();
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!user) return;

        const formData = new FormData(e.currentTarget);
        const title = formData.get('title') as string;

        try {
            const newId = await createProductionClient(title, user.uid);

            // 重要: 作成した公演を即座に「有効な公演」として設定する
            // サーバーアクションをクライアントから呼ぶ（Next.js Actions）
            const { setActiveProductionId } = await import('@/app/actions/production-context');
            await setActiveProductionId(newId);

            // ダッシュボードではなく、そのまま詳細設定画面へ飛ばす
            router.push(`/productions/${newId}`);
        } catch (error) {
            console.error("Error creating production:", error);
            alert("公演の作成に失敗しました。");
        }
    };

    if (loading) return <div className="flex-center" style={{ height: '50vh' }}>読み込み中...</div>;

    if (!user || !profile?.troupeName) {
        return (
            <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>
                <h2 className="heading-md">{!user ? 'ログインが必要です' : '劇団名の設定が必要です'}</h2>
                <p className="text-muted" style={{ marginTop: '1rem' }}>
                    {!user ? '公演を作成するにはログインしてください。' : '公演を作成する前に、まずは劇団名を登録してください。'}
                </p>
                <Link href={!user ? "/" : "/onboarding"} className="btn btn-primary" style={{ marginTop: '1.5rem' }}>
                    {!user ? 'ホームに戻る' : '設定に進む'}
                </Link>
            </div>
        );
    }

    return (
        <div className="container" style={{ maxWidth: '600px' }}>
            <div style={{ marginBottom: '1rem' }}>
                <Link href="/productions" className="text-primary">
                    &larr; 公演一覧に戻る
                </Link>
            </div>
            <h2 className="heading-lg">新規公演作成</h2>
            <form onSubmit={handleSubmit} className="card">
                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                    <label htmlFor="title" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                        公演タイトル
                    </label>
                    <input
                        type="text"
                        id="title"
                        name="title"
                        required
                        className="input"
                        placeholder="例: 第一回公演「初演」"
                    />
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                    作成する
                </button>
            </form>
        </div>
    );
}
