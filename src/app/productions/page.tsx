'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getActiveProductionId } from '@/app/actions/production-context';
import ProductionList from '@/components/ProductionList';
import { useAuth } from '@/components/AuthProvider';
import { Production, Performance } from '@/types';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { serializeDocs, serializeDoc, toDate } from '@/lib/firestore-utils';
import styles from './productions.module.css';

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
                    const id = await getActiveProductionId();
                    setActiveId(id);

                    const productionsRef = collection(db, "productions");
                    const q = query(
                        productionsRef,
                        where("userId", "==", user.uid)
                    );

                    unsubscribe = onSnapshot(q, (snapshot) => {
                        const prods = serializeDocs<Production>(snapshot.docs);

                        // Fetch performances for each production, then update state
                        Promise.all(
                            prods.map(async (prod) => {
                                try {
                                    const perfsRef = collection(db, "performances");
                                    const perfsQuery = query(perfsRef, where("productionId", "==", prod.id));
                                    const perfsSnap = await getDocs(perfsQuery);
                                    const performances = serializeDocs<Performance>(perfsSnap.docs);
                                    return { ...prod, performances };
                                } catch {
                                    return { ...prod, performances: [] as Performance[] };
                                }
                            })
                        ).then((prodsWithPerfs) => {
                            const sortedProds = prodsWithPerfs.sort((a, b) => {
                                const timeA = a.updatedAt ? toDate(a.updatedAt!).getTime() : 0;
                                const timeB = b.updatedAt ? toDate(b.updatedAt!).getTime() : 0;
                                return timeB - timeA;
                            });
                            setProductions(sortedProds);
                            setIsInitialLoading(false);
                        });
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
        <div className={styles.page}>
            <div className={styles.pageHeader}>
                <div>
                    <Link href="/dashboard" className={`btn btn-secondary ${styles.backLink}`}>
                        <span>&larr;</span> ダッシュボードに戻る
                    </Link>
                    <h2 className={`heading-lg ${styles.pageTitle}`}>公演一覧・管理</h2>
                    <p className={`text-muted ${styles.pageSubtitle}`}>
                        操作する公演を選択するか、新しい公演を作成してください。
                    </p>
                </div>
                <Link href="/productions/new" className={`btn btn-primary ${styles.createBtn}`}>
                    + 新規公演作成
                </Link>
            </div>

            <ProductionList productions={productions} activeId={activeId} />

            {productions.length === 0 && (
                <div className={styles.emptyState}>
                    <p className={`text-muted ${styles.emptyText}`}>まだ公演が登録されていません。</p>
                    <Link href="/productions/new" className={`btn btn-primary ${styles.emptyBtn}`}>
                        最初の公演を作成する
                    </Link>
                </div>
            )}
        </div>
    );
}
