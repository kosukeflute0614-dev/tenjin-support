'use client';

import { createProduction } from '@/app/actions/production';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';

export default function NewProductionPage() {
    const { user, loading } = useAuth();
    const router = useRouter();

    const handleSubmit = async (formData: FormData) => {
        if (!user) return;
        await createProduction(formData, user.uid);
    };

    if (loading) return <div className="flex-center" style={{ height: '50vh' }}>読み込み中...</div>;

    if (!user) {
        return (
            <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>
                <h2 className="heading-md">ログインが必要です</h2>
                <Link href="/" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>ホームに戻る</Link>
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
            <form action={handleSubmit} className="card">
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
