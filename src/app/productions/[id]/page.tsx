'use client';

import { useEffect, useState, use } from 'react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, collection, query, where, getDocs, getDoc, limit } from 'firebase/firestore';
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
                // 1. Production の監視/取得
                const productionsRef = collection(db, "productions");
                let targetId = id;
                let foundDocId = '';

                // 最初の一回だけ、id が docId か customId かを確認する
                const checkIdResolution = async () => {
                    const docRef = doc(db, "productions", id);
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        foundDocId = id;
                        return docSnap;
                    } else {
                        const qCustom = query(productionsRef, where("customId", "==", id), limit(1));
                        const customSnap = await getDocs(qCustom);
                        if (!customSnap.empty) {
                            foundDocId = customSnap.docs[0].id;
                            return customSnap.docs[0];
                        }
                    }
                    return null;
                };

                // 監視の設定
                const startMonitoring = (realId: string) => {
                    console.log("[Debug] Monitoring production:", realId);
                    const prodRef = doc(db, "productions", realId);
                    unsubscribeProd = onSnapshot(prodRef, (docSnap) => {
                        if (docSnap.exists()) {
                            const prodData = serializeDoc<Production>(docSnap);

                            if (prodData.userId !== user.uid) {
                                console.error("[Debug] 所有権がありません:", { docUserId: prodData.userId, currentUserId: user.uid });
                                setDetails(null);
                                setIsInitialLoading(false);
                                return;
                            }

                            if (!unsubscribePerf) {
                                const perfsRef = collection(db, "performances");
                                const q = query(perfsRef, where("productionId", "==", realId));
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
                                    console.error("[Debug] Performances listener error:", err);
                                    setIsInitialLoading(false);
                                });
                            } else {
                                setDetails(prev => prev ? { ...prev, production: prodData } : null);
                            }
                        } else {
                            console.error("[Debug] Production が存在しません:", realId);
                            setDetails(null);
                            setIsInitialLoading(false);
                        }
                    }, (err) => {
                        console.error("[Debug] Production listener error:", err);
                        setIsInitialLoading(false);
                    });
                };

                try {
                    const resSnap = await checkIdResolution();
                    if (resSnap) {
                        startMonitoring(resSnap.id);
                    } else {
                        console.error("[Debug] IDを解決できませんでした:", id);
                        setIsInitialLoading(false);
                    }
                } catch (err) {
                    console.error("[Debug] ID resolution error:", err);
                    setIsInitialLoading(false);
                }
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
                    <Link href="/dashboard" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', borderRadius: '8px', fontSize: '0.9rem' }}>
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
