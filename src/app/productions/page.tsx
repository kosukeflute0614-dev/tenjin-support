'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getProductions } from '@/app/actions/production';
import { getActiveProductionId } from '@/app/actions/production-context';
import ProductionList from '@/components/ProductionList';
import { useAuth } from '@/components/AuthProvider';
import { Production } from '@/types';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { serializeDocs } from '@/lib/firestore-utils';

export default function ProductionsPage() {
    const { user, loading } = useAuth();
    const [productions, setProductions] = useState<Production[]>([]);
    const [activeId, setActiveId] = useState<string | null | undefined>(null);
    const [isInitialLoading, setIsInitialLoading] = useState(true);

    useEffect(() => {
        let unsubscribe: () => void = () => { };

        const setupRealtimeListener = async () => {
            if (user) {
                try {
                    // 1. Get active production ID once (or we could also watch this if needed)
                    const id = await getActiveProductionId();
                    setActiveId(id);

                    // 2. Set up Firestore listener for productions
                    const productionsRef = collection(db, "productions");
                    const q = query(
                        productionsRef,
                        where("userId", "==", user.uid)
                        // orderBy("updatedAt", "desc") // Remove to avoid composite index requirement
                    );

                    unsubscribe = onSnapshot(q, (snapshot) => {
                        const prods = serializeDocs<Production>(snapshot.docs);
                        // Manual sort by updatedAt descending
                        const sortedProds = prods.sort((a, b) => {
                            const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
                            const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
                            return timeB - timeA;
                        });
                        setProductions(sortedProds);
                        setIsInitialLoading(false);
                    }, (error) => {
                        console.error("Firestore snapshot error:", error);
                        setIsInitialLoading(false);
                    });
                } catch (error) {
                    console.error("Error setting up productions listener:", error);
                    setIsInitialLoading(false);
                }
            } else {
                setIsInitialLoading(false);
            }
        };

        if (!loading) {
            setupRealtimeListener();
        }

        return () => unsubscribe();
    }, [user, loading]);

    if (loading || isInitialLoading) {
        return <div className="flex-center" style={{ height: '50vh' }}>読み込み中...</div>;
    }

    if (!user) {
        return (
            <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>
                <h2 className="heading-md">ログインが必要です</h2>
                <p className="text-muted">公演を管理するにはログインしてください。</p>
                <Link href="/" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>ホームに戻る</Link>
            </div>
        );
    }

    return (
        <div className="productions-page">
            <div className="page-header flex-center" style={{ justifyContent: 'space-between', marginBottom: '2rem' }}>
                <div>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <Link href="/" className="btn btn-secondary" style={{
                            padding: '0.75rem 1.5rem',
                            fontSize: '1rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            fontWeight: 'bold',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                        }}>
                            <span>&larr;</span> ダッシュボードに戻る
                        </Link>
                    </div>
                    <h2 className="heading-lg" style={{ margin: 0, borderLeft: '4px solid var(--primary)', paddingLeft: '1rem' }}>公演一覧・管理</h2>
                    <p className="text-muted" style={{ marginTop: '0.5rem' }}>操作する公演を選択するか、新しい公演を作成してください。</p>
                </div>
                <Link href="/productions/new" className="btn btn-primary" style={{ padding: '0.8rem 2rem', fontSize: '1.1rem', fontWeight: 'bold' }}>
                    + 新規公演作成
                </Link>
            </div>

            <ProductionList productions={productions} activeId={activeId} />

            {productions.length === 0 && (
                <div className="empty-state" style={{ textAlign: 'center', padding: '4rem', backgroundColor: 'var(--background-light)', borderRadius: '12px', border: '1px dashed var(--card-border)' }}>
                    <p className="text-muted" style={{ fontSize: '1.1rem' }}>まだ公演が登録されていません。</p>
                    <Link href="/productions/new" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>
                        最初の公演を作成する
                    </Link>
                </div>
            )}
        </div>
    );
}
