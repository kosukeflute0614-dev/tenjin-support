'use client';

import { useEffect } from 'react';

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('Unhandled error:', error);
    }, [error]);

    return (
        <div className="container" style={{ maxWidth: '600px', textAlign: 'center', paddingTop: '4rem' }}>
            <div className="card" style={{ padding: '3rem', borderTop: '4px solid var(--accent)' }}>
                <h2 className="heading-lg" style={{ color: 'var(--accent)', marginBottom: '1rem' }}>
                    エラーが発生しました
                </h2>
                <p style={{ color: 'var(--text-muted)', lineHeight: '1.8', marginBottom: '2rem' }}>
                    予期しないエラーが発生しました。<br />
                    ページを再読み込みしてください。
                </p>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                    <button onClick={reset} className="btn btn-primary">
                        再試行
                    </button>
                    <a href="/" className="btn btn-secondary">
                        ホームに戻る
                    </a>
                </div>
            </div>
        </div>
    );
}
