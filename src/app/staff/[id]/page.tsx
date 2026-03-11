'use client';

import { useState, useEffect, use } from 'react';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, orderBy, doc, getDoc, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { Production, FirestoreReservation, MerchandiseProduct } from '@/types';
import { serializeDoc, serializeDocs, toDate } from '@/lib/firestore-utils';
import { verifyStaffPasscode, checkStaffSession, validateStaffToken } from '@/app/actions/staff-auth';
import { updateReservationByStaffToken, createSameDayTicketStaffClient, fetchProductionDetailsClient } from '@/lib/client-firestore';
import { getMerchandiseSalesTotalClient } from '@/lib/client-firestore/merchandise-sales';
import { useSearchParams } from 'next/navigation';
import { useToast } from '@/components/Toast';
import CheckinList from '@/components/CheckinList';
import SameDayTicketForm from '@/components/SameDayTicketForm';
import AttendanceStatus from '@/components/AttendanceStatus';
import CashCloseForm from '@/components/CashCloseForm';
import MerchandiseSalesForm from '@/components/MerchandiseSalesForm';
import BottomNav from '@/components/BottomNav';
import { ShoppingBag, Calculator, ClipboardList, Ticket } from 'lucide-react';
import { getPerformancePaidTotalClient } from '@/lib/client-firestore/cash-close';

export default function StaffPortalPage({ params }: { params: Promise<{ id: string }> }) {
    const { id: productionId } = use(params);
    const searchParams = useSearchParams();
    const token = searchParams.get('token');

    const [production, setProduction] = useState<Production | null>(null);
    const [resolvedProductionId, setResolvedProductionId] = useState<string | null>(null);
    const [reservations, setReservations] = useState<FirestoreReservation[]>([]);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [passcode, setPasscode] = useState('');
    const { showToast } = useToast();
    const [isVerifying, setIsVerifying] = useState(false);
    const [initError, setInitError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showCheckedIn, setShowCheckedIn] = useState(false);
    const [role, setRole] = useState<string | null>(null);
    const [selectedPerformanceId, setSelectedPerformanceId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'LIST' | 'SAME_DAY' | 'MERCHANDISE' | 'CASH_CLOSE'>('LIST');
    const [ticketSalesTotal, setTicketSalesTotal] = useState<number>(0);
    const [merchActiveTab, setMerchActiveTab] = useState<'SALES' | 'CASH_CLOSE'>('SALES');
    const [merchProducts, setMerchProducts] = useState<MerchandiseProduct[]>([]);
    const [merchSalesTotal, setMerchSalesTotal] = useState<number>(0);
    const [otherReservations, setOtherReservations] = useState<FirestoreReservation[]>([]);

    // Firestore 側のセッション同期用
    const syncStaffSessionToFirestore = async (uid: string, passcodeHashed: string) => {
        const prodId = resolvedProductionId || productionId;
        if (!token || !prodId) return;
        const sessionRef = doc(db, "staffSessions", uid);
        await setDoc(sessionRef, {
            productionId: prodId,
            token,
            passcodeHashed, // ルールでの照合用
            createdAt: serverTimestamp(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        });
    };

    // 初期化とセッションチェック
    useEffect(() => {
        async function init() {
            if (!token) {
                setInitError('無効なアクセスです。トークンが不足しています。');
                setIsLoading(false);
                return;
            }

            try {
                // すでに認証済み（管理者など）でない場合のみ匿名認証を実行
                let uid = auth.currentUser?.uid;
                if (!uid) {
                    try {
                        const authRes = await signInAnonymously(auth);
                        uid = authRes.user.uid;
                    } catch (authErr: any) {
                        if (authErr.code === 'auth/admin-restricted-operation') {
                            setInitError('Firebase の匿名認証が有効になっていません。Firebase Console の Authentication > Sign-in method で「匿名」を有効にしてください。');
                            setIsLoading(false);
                            return;
                        }
                        throw authErr;
                    }
                }

                if (!uid) throw new Error('UID取得失敗');

                // 公演情報の取得
                const prod = await fetchProductionDetailsClient(productionId);
                if (!prod) {
                    setInitError('公演が見つかりません。');
                    setIsLoading(false);
                    return;
                }
                const prodData = prod.production;
                const perfsData = prod.performances;
                const realId = prodData.id;

                setProduction({ ...prodData, performances: perfsData } as any);
                setResolvedProductionId(realId);

                // ロールの特定（サーバーサイドで検証、staffTokensをクライアントに露出しない）
                const tokenValidation = await validateStaffToken(realId, token);
                if (!tokenValidation.valid) {
                    setInitError('このトークンは無効化されているか、存在しません。');
                    setIsLoading(false);
                    return;
                }
                setRole(tokenValidation.role || 'reception');

                // セッションチェック (UID を渡す)
                // productionId ではなく解決された realId を保存する
                const sessionKey = `staff_session_${realId}`;
                sessionStorage.setItem('last_staff_production_id', realId);
                sessionStorage.setItem('last_staff_token', token);

                const sessionValid = await checkStaffSession(realId, token, uid);
                if (sessionValid) {
                    const sessionSnap = await getDoc(doc(db, "staffSessions", uid));
                    if (sessionSnap.exists()) {
                        const sessData = sessionSnap.data();
                        if (sessData.productionId === realId && sessData.token === token) {
                            setIsAuthenticated(true);
                            setIsLoading(false);
                            return;
                        }
                    }
                }
            } catch (err: any) {
                console.error("Init error:", err);
                setInitError('情報の読み込みに失敗しました。');
            } finally {
                setIsLoading(false);
            }
        }
        init();
    }, [productionId, token]);

    // 予約リストのリアルタイム購読
    useEffect(() => {
        if (!isAuthenticated || !token || !productionId || !selectedPerformanceId) {
            setReservations([]);
            return;
        }

        const currentProdId = resolvedProductionId || productionId;
        const reservationsRef = collection(db, "reservations");
        const q = query(
            collection(db, "reservations"),
            where("productionId", "==", currentProdId),
            where("performanceId", "==", selectedPerformanceId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docs = serializeDocs<FirestoreReservation>(snapshot.docs);
            const mappedReservations = docs
                .filter(r => r.status !== 'CANCELED')
                .map(res => ({
                    ...res,
                    tickets: (res.tickets || []).map((t: any) => ({
                        ...t,
                        ticketType: production?.ticketTypes?.find((tt: any) => tt.id === t.ticketTypeId) || { name: '不明な券種', price: t.price || 0 }
                    }))
                }));
            setReservations(mappedReservations as any);
        }, (err) => {
            console.error("Snapshot error:", err);
            showToast('予約リストの同期に失敗しました。', 'error');
        });

        return () => unsubscribe();
    }, [isAuthenticated, resolvedProductionId, token, selectedPerformanceId]);

    // 公演が1つだけの場合は自動選択、または初期選択を補助
    useEffect(() => {
        if (isAuthenticated && production?.performances && production.performances.length > 0 && !selectedPerformanceId) {
        }
    }, [isAuthenticated, production, selectedPerformanceId]);

    // 物販データ読み込み（merchandiseロール or receptionロール+SIMPLEモード）
    const needsMerch = role === 'merchandise' || (role === 'reception' && production?.merchandiseMode === 'SIMPLE');
    useEffect(() => {
        if (!isAuthenticated || !needsMerch || !selectedPerformanceId) return;

        const currentProdId = resolvedProductionId || productionId;
        const merchQuery = query(
            collection(db, 'merchandiseProducts'),
            where('productionId', '==', currentProdId),
            orderBy('sortOrder')
        );
        const unsubMerch = onSnapshot(merchQuery, (snap) => {
            setMerchProducts(serializeDocs<MerchandiseProduct>(snap.docs));
        });

        // 売上合計
        getMerchandiseSalesTotalClient(selectedPerformanceId, currentProdId, production?.userId || '')
            .then(total => setMerchSalesTotal(total))
            .catch(err => console.error('Failed to load merch sales total:', err));

        // 受付スタッフ: チケット売上合計も読み込む（精算画面で必要）
        if (role === 'reception') {
            getPerformancePaidTotalClient(selectedPerformanceId, production?.userId || '')
                .then(total => setTicketSalesTotal(total))
                .catch(err => console.error('Failed to load ticket sales total:', err));
        }

        return () => unsubMerch();
    }, [isAuthenticated, needsMerch, role, selectedPerformanceId, resolvedProductionId, productionId, production?.userId]);

    // 他の回の予約を検索（debounce付き、受付ロール用）
    useEffect(() => {
        if (!searchTerm || !isAuthenticated || !selectedPerformanceId || !production) {
            setOtherReservations([]);
            return;
        }
        const currentProdId = resolvedProductionId || productionId;
        const timer = setTimeout(async () => {
            try {
                const resQuery = query(
                    collection(db, 'reservations'),
                    where('productionId', '==', currentProdId)
                );
                const snap = await getDocs(resQuery);
                const allRes = serializeDocs<FirestoreReservation>(snap.docs)
                    .filter(r => r.status !== 'CANCELED')
                    .filter(r => r.performanceId !== selectedPerformanceId)
                    .map(r => ({
                        ...r,
                        tickets: (r.tickets || []).map((t: any) => ({
                            ...t,
                            ticketType: production?.ticketTypes?.find((tt: any) => tt.id === t.ticketTypeId) || { name: '不明な券種', price: t.price || 0 }
                        }))
                    }));
                setOtherReservations(allRes);
            } catch (err) {
                console.error('Failed to load other reservations:', err);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm, isAuthenticated, selectedPerformanceId, resolvedProductionId, productionId, production]);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token) return;
        setIsVerifying(true);

        try {
            const uid = auth.currentUser?.uid;
            if (!uid) throw new Error('認証UIDがありません');

            const res = await verifyStaffPasscode(resolvedProductionId || productionId, token, passcode, uid);
            if (res.success && res.passcodeHashed) {
                // Firestore 側にセッションドキュメントを作成
                await syncStaffSessionToFirestore(uid, res.passcodeHashed);
                setIsAuthenticated(true);
            } else {
                showToast(res.error || '認証に失敗しました。', 'error');
            }
        } catch (err) {
            console.error("Auth error:", err);
            showToast('通信エラーが発生しました。', 'error');
        } finally {
            setIsVerifying(false);
        }
    };

    const filteredReservations = reservations
        .filter(res => {
            // 検索ワードにマッチするか
            const matchesSearch = res.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (res.customerNameKana || '').includes(searchTerm);

            // 入場済み表示フィルタ
            // 検索ワードが入っている場合は自動的に全員を表示し、空の場合はチェックボックスに従う
            const isFullyCheckedIn = res.checkinStatus === 'CHECKED_IN';
            const matchesCheckin = (showCheckedIn || searchTerm) ? true : !isFullyCheckedIn;

            return matchesSearch && matchesCheckin;
        })
        .sort((a, b) => {
            // 未入場（または一部入場）を上に、全員入場済みを下に
            const score = (r: any) => r.checkinStatus === 'CHECKED_IN' ? 1 : 0;
            if (score(a) !== score(b)) return score(a) - score(b);

            // 名前順でソート
            const nameA = a.customerNameKana || a.customerName;
            const nameB = b.customerNameKana || b.customerName;
            return nameA.localeCompare(nameB, 'ja');
        });

    const stats = {
        total: reservations.reduce((sum, r) => sum + r.tickets.reduce((ts, t) => ts + t.count, 0), 0),
        checkedIn: reservations.reduce((sum, r) => sum + (r.checkedInTickets || 0), 0)
    };

    if (isLoading) return <div className="flex-center" style={{ height: '100vh' }}>読み込み中...</div>;

    if (initError && !isAuthenticated) {
        return (
            <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>
                <div className="card" style={{ padding: '2rem', borderTop: '4px solid #ff4d4f' }}>
                    <h2 className="heading-md" style={{ color: '#ff4d4f' }}>エラー</h2>
                    <p style={{ marginTop: '1rem' }}>{initError}</p>
                </div>
            </div>
        );
    }

    // パスコードゲート
    if (!isAuthenticated) {
        return (
            <div className="container" style={{ maxWidth: '400px', marginTop: '10vh' }}>
                <div className="card" style={{ padding: '2.5rem', boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}>
                    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                        <span style={{ fontSize: '3rem' }}>🔒</span>
                        <h2 className="heading-md" style={{ marginTop: '1rem' }}>スタッフ認証</h2>
                        <p className="text-muted" style={{ fontSize: '0.9rem' }}>{production?.title}<br />パスコードを入力してください</p>
                    </div>
                    <form onSubmit={handleAuth}>
                        <div style={{ marginBottom: '1.5rem' }}>
                            <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={4}
                                className="input"
                                style={{ textAlign: 'center', fontSize: '2rem', letterSpacing: '0.5rem', height: '4rem' }}
                                value={passcode}
                                onChange={(e) => setPasscode(e.target.value)}
                                placeholder="0000"
                                required
                            />
                        </div>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            style={{ width: '100%', padding: '1rem', fontSize: '1.1rem' }}
                            disabled={isVerifying || passcode.length < 4}
                        >
                            {isVerifying ? '認証中...' : '入場する'}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    // メインUI
    if (!selectedPerformanceId) {
        // 公演選択画面
        const sortedPerformances = [...(production?.performances || [])].sort((a, b) => {
            const timeA = a.startTime ? toDate(a.startTime).getTime() : 0;
            const timeB = b.startTime ? toDate(b.startTime).getTime() : 0;
            return timeA - timeB;
        });

        return (
            <div style={{ backgroundColor: '#f4f7f6', minHeight: '100vh', paddingBottom: '2rem' }}>
                <header style={{ backgroundColor: 'var(--card-bg)', padding: '1rem', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', position: 'sticky', top: 0, zIndex: 100 }}>
                    <div className="container" style={{ maxWidth: '600px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h1 style={{ fontSize: '1rem', fontWeight: 'bold', margin: 0 }}>{production?.title}</h1>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                                スタッフ用ポータル ({role === 'monitor' ? 'モニター' : role === 'merchandise' ? '物販' : '受付'})
                            </p>
                        </div>
                    </div>
                </header>

                <main className="container" style={{ maxWidth: '600px', marginTop: '2rem' }}>
                    <div className="card" style={{ padding: '1.5rem' }}>
                        <h2 className="heading-md" style={{ marginBottom: '1.5rem', textAlign: 'center' }}>{role === 'monitor' ? '確認する公演を選択してください' : role === 'merchandise' ? '物販を行う公演を選択してください' : '受付する公演を選択してください'}</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {sortedPerformances.map(perf => {
                                const d = perf.startTime ? toDate(perf.startTime) : new Date();
                                return (
                                    <button
                                        key={perf.id}
                                        className="btn btn-secondary"
                                        style={{
                                            padding: '1.5rem',
                                            textAlign: 'left',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.5rem',
                                            border: '1px solid var(--card-border)',
                                            borderRadius: '12px',
                                            background: 'var(--card-bg)'
                                        }}
                                        onClick={() => setSelectedPerformanceId(perf.id)}
                                    >
                                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                                            {d.toLocaleDateString('ja-JP')} {d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}～
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    const performance = production?.performances?.find(p => p.id === selectedPerformanceId);
    const performanceTicketTypes = production?.ticketTypes || [];

    // 当日券番号の計算
    const sameDayResCount = reservations.filter(r => r.source === 'SAME_DAY').length;

    // 収容人数チェック（簡易）
    const totalReserved = reservations.reduce((sum, r) => sum + r.tickets.reduce((ts, t) => ts + t.count, 0), 0);
    const capacity = performance?.capacity || 0;
    const remainingCount = capacity - totalReserved;

    const startTime = performance?.startTime;
    const startDate = startTime ? toDate(startTime) : null;
    const perfDateStr = startDate ? startDate.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }) : '';
    const perfTimeStr = startDate ? startDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '';

    // モニターロール: 来場状況確認画面（読み取り専用）
    if (role === 'monitor') {
        return (
            <div className="container" style={{ maxWidth: '1000px', paddingBottom: '2rem' }}>
                <header className="checkin-header">
                    <button
                        onClick={() => setSelectedPerformanceId(null)}
                        className="btn btn-secondary checkin-header-back"
                    >
                        &larr; 公演回の選択に戻る
                    </button>

                    <div className="checkin-header-content">
                        <div className="checkin-header-info">
                            <div style={{ marginBottom: '0.5rem' }}>
                                <span style={{ background: '#f3e8ff', color: 'var(--primary)', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                    モニター（読み取り専用）
                                </span>
                            </div>
                            <div style={{ fontSize: '1rem', fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                公演：{production?.title}
                            </div>
                            <h2 className="checkin-header-date">
                                {perfDateStr} {perfTimeStr}
                            </h2>
                        </div>
                    </div>
                </header>

                <AttendanceStatus
                    productionId={resolvedProductionId || productionId}
                    performances={production?.performances || []}
                    readOnly={true}
                />
            </div>
        );
    }

    // 物販ロール: 物販スタッフUI
    if (role === 'merchandise') {
        return (
            <div className="container" style={{ maxWidth: '1000px', paddingBottom: 'calc(72px + env(safe-area-inset-bottom) + 1rem)' }}>
                <header className="checkin-header">
                    <button
                        onClick={() => setSelectedPerformanceId(null)}
                        className="btn btn-secondary checkin-header-back"
                    >
                        &larr; 公演回の選択に戻る
                    </button>

                    <div className="checkin-header-content">
                        <div className="checkin-header-info">
                            <div style={{ marginBottom: '0.5rem' }}>
                                <span style={{ background: '#fef3c7', color: '#92400e', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                    物販スタッフ
                                </span>
                            </div>
                            <div style={{ fontSize: '1rem', fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                公演：{production?.title}
                            </div>
                            <h2 className="checkin-header-date">
                                {perfDateStr} {perfTimeStr}
                            </h2>
                        </div>
                    </div>
                </header>

                {merchActiveTab === 'SALES' ? (
                    <MerchandiseSalesForm
                        products={merchProducts}
                        sets={production?.merchandiseSets || []}
                        productionId={resolvedProductionId || productionId}
                        performanceId={selectedPerformanceId}
                        userId={production?.userId || ''}
                        soldBy={auth.currentUser?.uid || ''}
                        soldByType="STAFF"
                    />
                ) : (
                    <CashCloseForm
                        productionId={resolvedProductionId || productionId}
                        performanceId={selectedPerformanceId}
                        userId={production?.userId || ''}
                        closedByType="STAFF"
                        closedBy={auth.currentUser?.uid || ''}
                        hideHistory
                        expectedSalesOverride={merchSalesTotal}
                        merchandiseSales={merchSalesTotal}
                        inventoryEnabled={production?.merchandiseInventoryEnabled ?? false}
                        merchProducts={merchProducts}
                    />
                )}

                <BottomNav
                    items={[
                        { id: 'SALES', label: '販売', icon: <ShoppingBag size={22} /> },
                        { id: 'CASH_CLOSE', label: '精算', icon: <Calculator size={22} /> },
                    ]}
                    activeId={merchActiveTab}
                    onSelect={(id) => setMerchActiveTab(id as typeof merchActiveTab)}
                />
            </div>
        );
    }

    // 受付ロール: オーナーの当日受付と同じ構成
    const showMerchTab = production?.merchandiseMode === 'SIMPLE' && merchProducts.length > 0;
    const uncheckedCount = stats.total - stats.checkedIn;
    const receptionTicketSalesTotal = reservations.reduce((sum, r) => sum + (r.paidAmount || 0), 0);

    // 他の回の検索結果（検索語がある場合のみ）
    const otherPerformanceResults = (() => {
        if (!searchTerm || otherReservations.length === 0) return [];
        const term = searchTerm.toLowerCase();
        const allPerfs = production?.performances || [];
        const matched = otherReservations
            .filter(r => r.checkinStatus !== 'CHECKED_IN')
            .filter(r =>
                r.customerName.toLowerCase().includes(term) ||
                (r.customerNameKana || '').includes(searchTerm)
            );
        if (matched.length === 0) return [];

        // performanceId ごとにグルーピング
        const grouped: { [perfId: string]: FirestoreReservation[] } = {};
        matched.forEach(r => {
            if (!grouped[r.performanceId]) grouped[r.performanceId] = [];
            grouped[r.performanceId].push(r);
        });

        return Object.entries(grouped)
            .map(([perfId, resArr]) => {
                const perf = allPerfs.find((p: any) => p.id === perfId);
                const perfDate = perf?.startTime ? toDate(perf.startTime) : null;
                return { perfId, perf, perfDate, reservations: resArr };
            })
            .filter(g => g.perf)
            .sort((a, b) => (b.perfDate?.getTime() || 0) - (a.perfDate?.getTime() || 0));
    })();

    return (
        <div className="container" style={{ paddingBottom: 'calc(72px + env(safe-area-inset-bottom) + 1rem)', maxWidth: activeTab === 'MERCHANDISE' ? '1200px' : '1000px' }}>
            <header className="checkin-header">
                <button
                    onClick={() => setSelectedPerformanceId(null)}
                    className="btn btn-secondary checkin-header-back"
                >
                    &larr; 公演回の選択に戻る
                </button>

                <div className="checkin-header-content">
                    <div className="checkin-header-info">
                        <div style={{ marginBottom: '0.5rem' }}>
                            <span style={{ background: '#eef2f1', color: 'var(--slate-600)', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                受付スタッフ
                            </span>
                        </div>
                        <div style={{ fontSize: '1rem', fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                            公演：{production?.title}
                        </div>
                        <h2 className="checkin-header-date">
                            {perfDateStr} {perfTimeStr}
                        </h2>
                    </div>

                    <div className="checkin-header-stats">
                        {/* 進捗バー */}
                        <div className="checkin-progress-box">
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '0.4rem' }}>
                                <span>来場進捗</span>
                                <span>{stats.checkedIn}/{stats.total}人</span>
                            </div>
                            <div style={{ width: '100%', height: '8px', backgroundColor: '#edf2f7', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{
                                    width: `${Math.min(100, (stats.checkedIn / (stats.total || 1)) * 100)}%`,
                                    height: '100%',
                                    backgroundColor: 'var(--primary)',
                                    transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
                                }} />
                            </div>
                        </div>

                        {/* 当日券残数 */}
                        <div className="checkin-remaining-box">
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>当日券 残数</div>
                            <div style={{ fontSize: '1.6rem', fontWeight: '900', color: 'var(--primary)', lineHeight: '1' }}>
                                {remainingCount} <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>枚</span>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Tab Content */}
            {activeTab === 'CASH_CLOSE' ? (
                <CashCloseForm
                    productionId={resolvedProductionId || productionId}
                    performanceId={selectedPerformanceId}
                    userId={production?.userId || ''}
                    closedByType="STAFF"
                    closedBy={auth.currentUser?.uid || ''}
                    hideHistory
                    {...(showMerchTab ? {
                        expectedSalesOverride: receptionTicketSalesTotal + merchSalesTotal,
                        ticketSales: receptionTicketSalesTotal,
                        merchandiseSales: merchSalesTotal,
                        inventoryEnabled: production?.merchandiseInventoryEnabled || false,
                        merchProducts: merchProducts,
                    } : {
                        expectedSalesOverride: receptionTicketSalesTotal,
                    })}
                />
            ) : activeTab === 'MERCHANDISE' ? (
                <MerchandiseSalesForm
                    productionId={resolvedProductionId || productionId}
                    performanceId={selectedPerformanceId}
                    userId={production?.userId || ''}
                    products={merchProducts}
                    sets={production?.merchandiseSets || []}
                    soldBy={auth.currentUser?.uid || ''}
                    soldByType="STAFF"
                />
            ) : (
            <div>
                <div className="card" style={{ padding: '1.5rem', borderRadius: '16px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                    {activeTab === 'LIST' && (
                    <>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <div className="checkin-search-header">
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: 0 }}>予約リスト ({filteredReservations.length}件)</h2>
                            <span className="checkin-search-hint">未入場の方を優先表示しています</span>
                        </div>
                        <div style={{ position: 'relative' }}>
                            <input
                                type="search"
                                className="input"
                                placeholder="名前またはカタカナで検索..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{
                                    height: '3.5rem',
                                    fontSize: '1rem',
                                    borderRadius: '12px',
                                    paddingLeft: '3rem',
                                    backgroundColor: '#f8fafc',
                                    border: '1px solid #e2e8f0',
                                    width: '100%',
                                    marginBottom: '1rem'
                                }}
                            />
                            <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', marginTop: '-0.5rem', fontSize: '1.2rem', color: '#94a3b8' }}>🔍</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0' }}>
                            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--slate-600)', fontWeight: '500' }}>
                                <input
                                    type="checkbox"
                                    checked={showCheckedIn}
                                    onChange={(e) => setShowCheckedIn(e.target.checked)}
                                    style={{ width: '1.2rem', height: '1.2rem', cursor: 'pointer', marginRight: '0.5rem' }}
                                />
                                入場済みを表示
                            </label>
                        </div>
                    </div>

                    <CheckinList
                        reservations={filteredReservations}
                        performanceId={selectedPerformanceId}
                        productionId={resolvedProductionId || productionId}
                        staffToken={token || undefined}
                        staffRole={role || undefined}
                    />

                    {/* 他の公演回の検索結果 */}
                    {searchTerm && otherPerformanceResults.length > 0 && (
                        <div style={{ marginTop: '1.5rem', borderTop: '2px solid var(--card-border)', paddingTop: '1rem' }}>
                            <h3 style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                                他の公演回にも該当する予約があります
                            </h3>
                            {otherPerformanceResults.map(group => {
                                const d = group.perfDate;
                                const dateLabel = d
                                    ? `${d.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })} ${d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`
                                    : '日時不明';
                                return (
                                    <div key={group.perfId} style={{ marginBottom: '1rem' }}>
                                        <div style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            padding: '0.5rem 0.75rem', background: 'var(--secondary)', borderRadius: '6px',
                                            marginBottom: '0.5rem'
                                        }}>
                                            <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                                                {dateLabel}
                                            </span>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                {group.reservations.length}件
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            {group.reservations.map(r => {
                                                const totalTickets = (r.tickets || []).reduce((sum: number, t: any) => sum + (t.count || 0), 0);
                                                const checkedIn = r.checkedInTickets || 0;
                                                return (
                                                    <div key={r.id} style={{
                                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                        padding: '0.6rem 0.75rem', background: 'var(--card-bg)',
                                                        border: '1px solid var(--card-border)', borderRadius: '6px',
                                                        fontSize: '0.85rem'
                                                    }}>
                                                        <div style={{ minWidth: 0, flex: 1 }}>
                                                            <div style={{ fontWeight: 'bold' }}>{r.customerName}</div>
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                                {r.tickets?.map((t: any) => `${t.ticketType?.name || '不明'}×${t.count}`).join(', ')}
                                                                {checkedIn > 0 && ` (入場済: ${checkedIn}/${totalTickets})`}
                                                            </div>
                                                        </div>
                                                        <span style={{
                                                            fontSize: '0.7rem', fontWeight: 'bold', padding: '0.2rem 0.5rem',
                                                            borderRadius: '4px', flexShrink: 0, whiteSpace: 'nowrap',
                                                            background: checkedIn > 0 ? '#e2e3e5' : '#eee',
                                                            color: checkedIn > 0 ? '#383d41' : 'var(--text-muted)'
                                                        }}>
                                                            {checkedIn > 0 ? '一部入場' : '未入場'}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    </>
                    )}
                    {activeTab === 'SAME_DAY' && (
                    <>
                        <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--card-border)', paddingBottom: '0.75rem' }}>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: 0 }}>当日券を発行</h2>
                        </div>
                        <SameDayTicketForm
                            productionId={resolvedProductionId || productionId}
                            performanceId={selectedPerformanceId}
                            ticketTypes={performanceTicketTypes}
                            remainingCount={remainingCount}
                            nextNumber={sameDayResCount + 1}
                            staffToken={token || undefined}
                        />
                    </>
                    )}
                </div>
            </div>
            )}

            {/* Bottom Navigation */}
            <BottomNav
                items={[
                    { id: 'LIST', label: '一覧', icon: <ClipboardList size={22} />, badge: uncheckedCount > 0 ? uncheckedCount : null },
                    { id: 'SAME_DAY', label: '当日券', icon: <Ticket size={22} /> },
                    { id: 'MERCHANDISE', label: '物販', icon: <ShoppingBag size={22} />, visible: showMerchTab },
                    { id: 'CASH_CLOSE', label: '精算', icon: <Calculator size={22} /> },
                ]}
                activeId={activeTab}
                onSelect={(id) => setActiveTab(id as typeof activeTab)}
            />
        </div>
    );
}
