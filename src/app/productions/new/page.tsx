'use client';

import { createProduction } from '@/app/actions/production';
import Link from 'next/link';

export default function NewProductionPage() {
    return (
        <div className="container" style={{ maxWidth: '600px' }}>
            <div style={{ marginBottom: '1rem' }}>
                <Link href="/productions" className="text-primary">
                    &larr; 公演一覧に戻る
                </Link>
            </div>
            <h2 className="heading-lg">新規公演作成</h2>
            <form action={createProduction} className="card">
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
