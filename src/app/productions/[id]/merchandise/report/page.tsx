'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { serializeDoc, serializeDocs, toDate } from '@/lib/firestore-utils';
import { fetchMerchandiseReportClient, MerchandiseReportData, ProductBreakdown } from '@/lib/client-firestore/merchandise-report';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { Production, Performance } from '@/types';
import { ChevronDown, ChevronRight } from 'lucide-react';

export default function MerchandiseReportPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { user, loading } = useAuth();
    const [production, setProduction] = useState<Production | null>(null);
    const [report, setReport] = useState<MerchandiseReportData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());

    useEffect(() => {
        const fetchData = async () => {
            if (!user) return;
            try {
                // 公演情報取得
                const prodRef = doc(db, 'productions', id);
                const prodSnap = await getDoc(prodRef);
                if (!prodSnap.exists()) {
                    setIsLoading(false);
                    return;
                }
                const prod = serializeDoc<Production>(prodSnap);
                if (prod.userId !== user.uid) {
                    setIsLoading(false);
                    return;
                }
                setProduction(prod);

                // 物販レポートデータ取得
                const reportData = await fetchMerchandiseReportClient(id, user.uid);
                setReport(reportData);
            } catch (error) {
                console.error('Failed to fetch merchandise report:', error);
            } finally {
                setIsLoading(false);
            }
        };

        if (!loading && user) {
            fetchData();
        } else if (!loading) {
            setIsLoading(false);
        }
    }, [id, user, loading]);

    const toggleProduct = (productId: string) => {
        setExpandedProducts(prev => {
            const next = new Set(prev);
            if (next.has(productId)) {
                next.delete(productId);
            } else {
                next.add(productId);
            }
            return next;
        });
    };

    if (loading || isLoading) {
        return <div className="flex-center" style={{ height: '50vh' }}>読み込み中...</div>;
    }

    if (!user || !production) {
        return (
            <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>
                <h2 className="heading-md">レポートが見つかりません</h2>
                <Link href="/dashboard" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>ダッシュボードに戻る</Link>
            </div>
        );
    }

    return (
        <div className="container" style={{ maxWidth: '1000px' }}>
            {/* 戻るボタン */}
            <div style={{ marginBottom: '1.25rem' }}>
                <Link href="/dashboard" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', borderRadius: '8px', fontSize: '0.9rem' }}>
                    <span>&larr;</span> ダッシュボードに戻る
                </Link>
            </div>

            {/* ヘッダー */}
            <div style={{ marginBottom: '2rem' }}>
                <h2 className="heading-lg" style={{ marginBottom: '0.5rem' }}>
                    物販レポート
                </h2>
                <p className="text-muted" style={{ fontSize: '0.9rem' }}>
                    商品別売上・公演回別の物販集計データを確認できます。
                </p>
            </div>

            {!report ? (
                <div className="card" style={{ padding: '2rem', textAlign: 'center', border: 'none', boxShadow: 'var(--shadow-sm)' }}>
                    <p className="text-muted">物販データがありません。</p>
                </div>
            ) : (
                <>
                    {/* KPIカード */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                        <KpiCard label="物販売上合計" value={formatCurrency(report.totalRevenue)} />
                        <KpiCard label="販売点数" value={`${report.totalItems}`} unit="点" />
                        <KpiCard label="取引件数" value={`${report.totalTransactions}`} unit="件" />
                        <KpiCard label="キャンセル取引" value={`${report.canceledTransactions}`} unit="件" />
                    </div>

                    {/* 公演回別テーブル */}
                    {report.performanceSummaries.length > 0 && (
                        <div className="card" style={{ padding: '0', border: 'none', boxShadow: 'var(--shadow-sm)', marginBottom: '2rem', overflow: 'hidden' }}>
                            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--card-border)' }}>
                                <h3 className="heading-md" style={{ margin: 0 }}>公演回別集計</h3>
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.95rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid var(--card-border)', background: 'var(--secondary)' }}>
                                            <th style={{ padding: '0.8rem 1.2rem', color: 'var(--text-muted)', fontWeight: 'bold', fontSize: '0.8rem' }}>公演回</th>
                                            <th style={{ padding: '0.8rem 1.2rem', color: 'var(--text-muted)', fontWeight: 'bold', fontSize: '0.8rem', textAlign: 'right' }}>取引数</th>
                                            <th style={{ padding: '0.8rem 1.2rem', color: 'var(--text-muted)', fontWeight: 'bold', fontSize: '0.8rem', textAlign: 'right' }}>販売点数</th>
                                            <th style={{ padding: '0.8rem 1.2rem', color: 'var(--text-muted)', fontWeight: 'bold', fontSize: '0.8rem', textAlign: 'right' }}>売上</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {report.performanceSummaries.map(perf => (
                                            <tr key={perf.id} style={{ borderBottom: '1px solid var(--card-border)' }}>
                                                <td style={{ padding: '0.8rem 1.2rem', fontWeight: 'bold' }}>
                                                    {formatDateTime(perf.startTime)}
                                                </td>
                                                <td style={{ padding: '0.8rem 1.2rem', textAlign: 'right' }}>
                                                    {perf.transactionCount}
                                                    {perf.canceledTransactionCount > 0 && (
                                                        <span style={{ fontSize: '0.8rem', color: 'var(--danger, #dc2626)', marginLeft: '0.3rem' }}>
                                                            (取消{perf.canceledTransactionCount})
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '0.8rem 1.2rem', textAlign: 'right' }}>
                                                    {perf.totalItems}<span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.2rem' }}>点</span>
                                                </td>
                                                <td style={{ padding: '0.8rem 1.2rem', textAlign: 'right', fontWeight: 'bold' }}>
                                                    {formatCurrency(perf.revenue)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* 商品別テーブル */}
                    {report.productBreakdown.length > 0 && (
                        <div className="card" style={{ padding: '0', border: 'none', boxShadow: 'var(--shadow-sm)', marginBottom: '2rem', overflow: 'hidden' }}>
                            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--card-border)' }}>
                                <h3 className="heading-md" style={{ margin: 0 }}>商品別集計</h3>
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.95rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid var(--card-border)', background: 'var(--secondary)' }}>
                                            <th style={{ padding: '0.8rem 1.2rem', color: 'var(--text-muted)', fontWeight: 'bold', fontSize: '0.8rem' }}>商品名</th>
                                            <th style={{ padding: '0.8rem 1.2rem', color: 'var(--text-muted)', fontWeight: 'bold', fontSize: '0.8rem', textAlign: 'right' }}>販売数</th>
                                            <th style={{ padding: '0.8rem 1.2rem', color: 'var(--text-muted)', fontWeight: 'bold', fontSize: '0.8rem', textAlign: 'right' }}>キャンセル数</th>
                                            <th style={{ padding: '0.8rem 1.2rem', color: 'var(--text-muted)', fontWeight: 'bold', fontSize: '0.8rem', textAlign: 'right' }}>売上</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {report.productBreakdown.map(product => (
                                            <React.Fragment key={product.productId}>
                                                <tr
                                                    style={{
                                                        borderBottom: '1px solid var(--card-border)',
                                                        cursor: product.variants.length > 0 ? 'pointer' : 'default',
                                                        transition: 'background-color 0.2s',
                                                    }}
                                                    onClick={() => product.variants.length > 0 && toggleProduct(product.productId)}
                                                >
                                                    <td style={{ padding: '0.8rem 1.2rem', fontWeight: 'bold' }}>
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                                                            {product.variants.length > 0 && (
                                                                expandedProducts.has(product.productId)
                                                                    ? <ChevronDown size={16} />
                                                                    : <ChevronRight size={16} />
                                                            )}
                                                            {product.productName}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '0.8rem 1.2rem', textAlign: 'right' }}>
                                                        {product.quantity}<span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.2rem' }}>点</span>
                                                    </td>
                                                    <td style={{ padding: '0.8rem 1.2rem', textAlign: 'right' }}>
                                                        {product.canceledQuantity > 0 ? (
                                                            <span style={{ color: 'var(--danger, #dc2626)' }}>{product.canceledQuantity}</span>
                                                        ) : (
                                                            <span style={{ color: 'var(--text-muted)' }}>0</span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '0.8rem 1.2rem', textAlign: 'right', fontWeight: 'bold' }}>
                                                        {formatCurrency(product.revenue)}
                                                    </td>
                                                </tr>
                                                {/* バリアント詳細行 */}
                                                {expandedProducts.has(product.productId) && product.variants.map(variant => (
                                                    <tr key={`${product.productId}-${variant.variantId}`} style={{ borderBottom: '1px solid var(--card-border)', background: 'var(--secondary)' }}>
                                                        <td style={{ padding: '0.6rem 1.2rem 0.6rem 3rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                                            └ {variant.variantName}
                                                        </td>
                                                        <td style={{ padding: '0.6rem 1.2rem', textAlign: 'right', fontSize: '0.9rem' }}>
                                                            {variant.quantity}<span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.2rem' }}>点</span>
                                                        </td>
                                                        <td style={{ padding: '0.6rem 1.2rem', textAlign: 'right', fontSize: '0.9rem' }}>
                                                            {variant.canceledQuantity > 0 ? (
                                                                <span style={{ color: 'var(--danger, #dc2626)' }}>{variant.canceledQuantity}</span>
                                                            ) : (
                                                                <span style={{ color: 'var(--text-muted)' }}>0</span>
                                                            )}
                                                        </td>
                                                        <td style={{ padding: '0.6rem 1.2rem', textAlign: 'right', fontSize: '0.9rem' }}>
                                                            {formatCurrency(variant.revenue)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </React.Fragment>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ── KPIカードコンポーネント ──

function KpiCard({ label, value, unit }: { label: string; value: string; unit?: string }) {
    return (
        <div style={{
            backgroundColor: 'var(--card-bg)',
            borderRadius: 'var(--border-radius)',
            border: '1px solid var(--card-border)',
            padding: '1.25rem 1.5rem',
            boxShadow: 'var(--shadow-sm)',
        }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'bold', marginBottom: '0.4rem' }}>
                {label}
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: '900', color: 'var(--foreground)' }}>
                {value}
                {unit && <span style={{ fontSize: '0.9rem', fontWeight: 'bold', marginLeft: '0.25rem', color: 'var(--text-muted)' }}>{unit}</span>}
            </div>
        </div>
    );
}
