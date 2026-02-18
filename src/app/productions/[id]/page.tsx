'use client';

import { useEffect, useState, use } from 'react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { serializeDoc, serializeDocs } from '@/lib/firestore-utils';
import Link from 'next/link';
import ProductionSettingsTabs from '@/components/ProductionSettingsTabs';
import { useAuth } from '@/components/AuthProvider';
import { Production, Performance } from '@/types';
import { useRouter } from 'next/navigation';

export default function ProductionDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { user, loading } = useAuth();
    const router = useRouter();
    const [details, setDetails] = useState<{ production: Production, performances: Performance[] } | null>(null);
    const [isInitialLoading, setIsInitialLoading] = useState(true);

    useEffect(() => {
        let unsubscribeProd: () => void;
        let unsubscribePerf: () => void;

        const setupListeners = async () => {
            if (user) {
                // 1. Production の監視
                const prodRef = doc(db, "productions", id);
                unsubscribeProd = onSnapshot(prodRef, (docSnap) => {
                    if (docSnap.exists()) {
                        const prodData = serializeDoc<Production>(docSnap);

                        // 所有権チェック
                        if (prodData.userId !== user.uid) {
                            console.error("所有権がありません");
                            router.push('/productions');
                            return;
                        }

                        // 2. Performances の監視 (Production が取得できた後に開始)
                        const perfsRef = collection(db, "performances");
                        const q = query(perfsRef, where("productionId", "==", id));
                        unsubscribePerf = onSnapshot(q, (perfSnap) => {
                            const performances = serializeDocs<Performance>(perfSnap.docs)
                                .sort((a, b) => {
                                    const tA = new Date(a.startTime).getTime();
                                    const tB = new Date(b.startTime).getTime();
                                    return tA - tB;
                                });

                            setDetails({ production: prodData, performances });
                            setIsInitialLoading(false);
                        }, (err) => {
                            console.error("Performances listener error:", err);
                        });
                    } else {
                        console.error("Production が存在しません");
                        setIsInitialLoading(false);
                    }
                }, (err) => {
                    console.error("Production listener error:", err);
                    setIsInitialLoading(false);
                });
            } else if (!loading) {
                setIsInitialLoading(false);
            }
        };

        setupListeners();

        return () => {
            if (unsubscribeProd) unsubscribeProd();
            if (unsubscribePerf) unsubscribePerf();
        };
    }, [id, user, loading, router]);

    if (loading || isInitialLoading) {
        return <div className="flex-center" style={{ height: '50vh' }}>読み込み中...</div>;
    }

    if (!user) {
        return (
            <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>
                <h2 className="heading-md">ログインが必要です</h2>
                <Link href="/" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>ホームに戻る</Link>
            </div>
        );
    }

    if (!details || !details.production) {
        return (
            <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>
                <h2 className="heading-md">公演が見つかりません</h2>
                <p className="text-muted">権限がないか、存在しない公演です。</p>
                <Link href="/productions" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>一覧に戻る</Link>
            </div>
        );
    }

    return (
        <div className="container" style={{ maxWidth: '1000px' }}>
            <div className="page-header" style={{ marginBottom: '2rem' }}>
                <div style={{ marginBottom: '1.25rem' }}>
                    <Link href="/" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', borderRadius: '8px', fontSize: '0.9rem' }}>
                        <span>&larr;</span> ダッシュボードに戻る
                    </Link>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h2 className="heading-lg" style={{ marginBottom: '0.5rem' }}>{details.production.title}</h2>
                        <p className="text-muted" style={{ fontSize: '0.95rem' }}>公演のスケジュールとチケット設定を管理します。</p>
                    </div>
                </div>
            </div>

            <ProductionSettingsTabs
                production={details.production}
                performances={details.performances}
                ticketTypes={details.production.ticketTypes}
            />
        </div>
    );
}
