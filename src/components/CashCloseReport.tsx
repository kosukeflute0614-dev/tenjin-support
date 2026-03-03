'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { toDate } from '@/lib/firestore-utils';
import { CashClosing, Performance } from '@/types';

interface CashCloseReportProps {
    productionId: string;
    productionTitle: string;
    performances: Performance[];
    cashClosings: CashClosing[];
}

export default function CashCloseReport({
    productionId,
    productionTitle,
    performances,
    cashClosings,
}: CashCloseReportProps) {
    const [expandedPerformanceId, setExpandedPerformanceId] = useState<string | null>(null);

    // 公演回ごとにレジ締めデータをグループ化
    const closingsByPerformance = useMemo(() => {
        const map: Record<string, CashClosing[]> = {};
        for (const c of cashClosings) {
            if (!map[c.performanceId]) map[c.performanceId] = [];
            map[c.performanceId].push(c);
        }
        return map;
    }, [cashClosings]);

    // 公演回を開演日時順にソート
    const sortedPerformances = useMemo(() => {
        return [...performances].sort((a, b) => {
            const dateA = toDate(a.startTime).getTime();
            const dateB = toDate(b.startTime).getTime();
            return dateA - dateB;
        });
    }, [performances]);

    // サマリー計算
    const summary = useMemo(() => {
        const completedCount = Object.keys(closingsByPerformance).length;
        let totalExpectedSales = 0;
        let totalDiscrepancy = 0;

        for (const perfId of Object.keys(closingsByPerformance)) {
            const latest = closingsByPerformance[perfId][0]; // createdAt desc なので先頭が最新
            if (latest) {
                totalExpectedSales += latest.expectedSales;
                totalDiscrepancy += latest.discrepancy;
            }
        }

        return {
            completedCount,
            totalCount: performances.length,
            totalExpectedSales,
            totalDiscrepancy,
        };
    }, [closingsByPerformance, performances]);

    const toggleExpand = (performanceId: string) => {
        setExpandedPerformanceId(prev => prev === performanceId ? null : performanceId);
    };

    return (
        <div>
            {/* 全体サマリーカード */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem',
                marginBottom: '2rem',
            }}>
                <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
                    <div style={{ fontSize: '0.8rem', color: '#888', fontWeight: 'bold', marginBottom: '0.4rem' }}>
                        レジ締め済み
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: '900', color: 'var(--foreground)' }}>
                        {summary.completedCount}<span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#666' }}> / {summary.totalCount} 回</span>
                    </div>
                </div>
                <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
                    <div style={{ fontSize: '0.8rem', color: '#888', fontWeight: 'bold', marginBottom: '0.4rem' }}>
                        売上合計
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: '900', color: 'var(--foreground)' }}>
                        {formatCurrency(summary.totalExpectedSales)}
                    </div>
                </div>
                <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
                    <div style={{ fontSize: '0.8rem', color: '#888', fontWeight: 'bold', marginBottom: '0.4rem' }}>
                        差額合計
                    </div>
                    <div style={{
                        fontSize: '1.6rem',
                        fontWeight: '900',
                        color: summary.totalDiscrepancy === 0
                            ? 'var(--success)'
                            : summary.totalDiscrepancy > 0
                                ? '#1565c0'
                                : 'var(--accent)',
                    }}>
                        {summary.totalDiscrepancy === 0
                            ? '一致'
                            : summary.totalDiscrepancy > 0
                                ? `+${formatCurrency(summary.totalDiscrepancy)}`
                                : formatCurrency(summary.totalDiscrepancy)}
                    </div>
                </div>
            </div>

            {/* 公演回別レジ締め一覧 */}
            <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem' }}>
                公演回別レジ締め結果
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {sortedPerformances.map(perf => {
                    const closings = closingsByPerformance[perf.id] || [];
                    const latest = closings[0];
                    const isExpanded = expandedPerformanceId === perf.id;
                    const startDate = toDate(perf.startTime);
                    const dateStr = startDate.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
                    const timeStr = startDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

                    if (!latest) {
                        // 未精算
                        return (
                            <div key={perf.id} className="card" style={{ padding: '1.25rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    <div>
                                        <div style={{ fontSize: '1.05rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                                            {dateStr} {timeStr}
                                        </div>
                                        <span style={{
                                            display: 'inline-block',
                                            fontSize: '0.8rem',
                                            padding: '0.2rem 0.6rem',
                                            borderRadius: '4px',
                                            background: '#f0f0f0',
                                            color: '#888',
                                            fontWeight: 'bold',
                                        }}>
                                            未精算
                                        </span>
                                    </div>
                                    <Link
                                        href={`/productions/${productionId}/cashclose/${perf.id}`}
                                        className="btn btn-secondary"
                                        style={{ fontSize: '0.85rem', padding: '0.5rem 1rem', borderRadius: '8px' }}
                                    >
                                        レジ締めを行う
                                    </Link>
                                </div>
                            </div>
                        );
                    }

                    // 精算済み
                    return (
                        <div key={perf.id} className="card" style={{ padding: '1.25rem' }}>
                            {/* ヘッダー（折りたたみ状態） */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                <div>
                                    <div style={{ fontSize: '1.05rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                                        {dateStr} {timeStr}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        <span style={{
                                            display: 'inline-block',
                                            fontSize: '0.8rem',
                                            padding: '0.2rem 0.6rem',
                                            borderRadius: '4px',
                                            background: '#e8f5e9',
                                            color: 'var(--success)',
                                            fontWeight: 'bold',
                                        }}>
                                            レジ締め済み
                                        </span>
                                        <span style={{ fontSize: '0.8rem', color: '#888' }}>
                                            最終精算: {latest.createdAt ? formatDateTime(latest.createdAt) : ''}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* サマリー行 */}
                            <div style={{
                                display: 'flex',
                                gap: '1.5rem',
                                flexWrap: 'wrap',
                                fontSize: '0.9rem',
                                marginBottom: '0.75rem',
                            }}>
                                <span>売上: <strong>{formatCurrency(latest.expectedSales)}</strong></span>
                                <span>現金: <strong>{formatCurrency(latest.cashTotal)}</strong></span>
                                <span>準備金: <strong>-{formatCurrency(latest.changeFloat)}</strong></span>
                                <span>差額: <strong style={{
                                    color: latest.discrepancy === 0
                                        ? 'var(--success)'
                                        : latest.discrepancy > 0
                                            ? '#1565c0'
                                            : 'var(--accent)',
                                }}>
                                    {latest.discrepancy === 0
                                        ? '一致'
                                        : latest.discrepancy > 0
                                            ? `+${formatCurrency(latest.discrepancy)}`
                                            : formatCurrency(latest.discrepancy)}
                                </strong></span>
                            </div>

                            {/* 展開トグル */}
                            <button
                                onClick={() => toggleExpand(perf.id)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--primary)',
                                    cursor: 'pointer',
                                    fontSize: '0.85rem',
                                    fontWeight: 'bold',
                                    padding: '0.25rem 0',
                                }}
                            >
                                {isExpanded ? '詳細を閉じる ▲' : '詳細を見る ▼'}
                            </button>

                            {/* 展開時の詳細 */}
                            {isExpanded && (
                                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #eee' }}>
                                    {/* 精算結果テーブル */}
                                    <h4 style={{ fontSize: '0.95rem', fontWeight: 'bold', marginBottom: '0.75rem', color: '#555' }}>
                                        精算結果
                                    </h4>
                                    <table style={{ width: '100%', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                                        <tbody>
                                            <tr>
                                                <td style={{ padding: '0.4rem 0', color: '#555' }}>チケット売上合計</td>
                                                <td style={{ padding: '0.4rem 0', textAlign: 'right', fontWeight: '600' }}>{formatCurrency(latest.expectedSales)}</td>
                                            </tr>
                                            <tr>
                                                <td style={{ padding: '0.4rem 0', color: '#555' }}>現金実数</td>
                                                <td style={{ padding: '0.4rem 0', textAlign: 'right' }}>{formatCurrency(latest.cashTotal)}</td>
                                            </tr>
                                            <tr>
                                                <td style={{ padding: '0.4rem 0', color: '#555' }}>釣り銭準備金</td>
                                                <td style={{ padding: '0.4rem 0', textAlign: 'right' }}>-{formatCurrency(latest.changeFloat)}</td>
                                            </tr>
                                            <tr style={{ borderTop: '1px solid #eee' }}>
                                                <td style={{ padding: '0.4rem 0', fontWeight: '600' }}>実売上額</td>
                                                <td style={{ padding: '0.4rem 0', textAlign: 'right', fontWeight: '600' }}>{formatCurrency(latest.actualSales)}</td>
                                            </tr>
                                        </tbody>
                                    </table>

                                    {/* 差額表示 */}
                                    <div style={{
                                        padding: '0.75rem',
                                        borderRadius: '8px',
                                        textAlign: 'center',
                                        marginBottom: '1.5rem',
                                        background: latest.discrepancy === 0 ? '#e8f5e9' : latest.discrepancy > 0 ? '#e3f2fd' : '#ffebee',
                                    }}>
                                        <div style={{ fontSize: '0.8rem', color: '#555', marginBottom: '0.2rem' }}>差額</div>
                                        <div style={{
                                            fontSize: '1.3rem',
                                            fontWeight: '900',
                                            color: latest.discrepancy === 0 ? 'var(--success)' : latest.discrepancy > 0 ? '#1565c0' : 'var(--accent)',
                                        }}>
                                            {latest.discrepancy === 0
                                                ? '一致'
                                                : latest.discrepancy > 0
                                                    ? `+${formatCurrency(latest.discrepancy)}（多い）`
                                                    : `${formatCurrency(latest.discrepancy)}（不足）`}
                                        </div>
                                    </div>

                                    {/* 金種別内訳 */}
                                    {latest.denominations && latest.denominations.length > 0 && (
                                        <div style={{ marginBottom: '1.5rem' }}>
                                            <h4 style={{ fontSize: '0.95rem', fontWeight: 'bold', marginBottom: '0.75rem', color: '#555' }}>
                                                金種別内訳
                                            </h4>
                                            <div style={{ fontSize: '0.85rem' }}>
                                                {latest.denominations.map(d => (
                                                    <div key={d.denomination} style={{
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        padding: '0.3rem 0',
                                                        borderBottom: '1px solid #f5f5f5',
                                                    }}>
                                                        <span style={{ color: '#555' }}>
                                                            {getDenominationLabel(d.denomination)}: {d.count}枚
                                                        </span>
                                                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                                                            {formatCurrency(d.denomination * d.count)}
                                                        </span>
                                                    </div>
                                                ))}
                                                <div style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    padding: '0.5rem 0 0',
                                                    fontWeight: 'bold',
                                                    borderTop: '2px solid var(--primary)',
                                                    marginTop: '0.25rem',
                                                }}>
                                                    <span>現金合計</span>
                                                    <span>{formatCurrency(latest.cashTotal)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* 備考 */}
                                    {latest.remarks && (
                                        <div style={{ marginBottom: '1.5rem', fontSize: '0.85rem', color: '#555' }}>
                                            <strong>備考:</strong> {latest.remarks}
                                        </div>
                                    )}

                                    {/* 精算者・日時 */}
                                    <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '1.5rem' }}>
                                        <div>精算日時: {latest.createdAt ? formatDateTime(latest.createdAt) : ''}</div>
                                        <div>精算者: {latest.closedByType === 'ORGANIZER' ? '主催者' : 'スタッフ'}</div>
                                    </div>

                                    {/* 過去の精算履歴 */}
                                    {closings.length > 1 && (
                                        <div>
                                            <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '0.75rem', color: '#555' }}>
                                                過去の精算履歴（{closings.length}件）
                                            </h4>
                                            {closings.map((h, idx) => (
                                                <div key={h.id} style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    padding: '0.4rem 0',
                                                    borderBottom: '1px solid #f5f5f5',
                                                    fontSize: '0.85rem',
                                                }}>
                                                    <span style={{ color: '#888' }}>
                                                        {h.createdAt ? formatDateTime(h.createdAt) : ''}
                                                        {idx === 0 && (
                                                            <span style={{
                                                                marginLeft: '0.5rem',
                                                                fontSize: '0.75rem',
                                                                color: 'var(--primary)',
                                                                fontWeight: 'bold',
                                                            }}>
                                                                最新
                                                            </span>
                                                        )}
                                                    </span>
                                                    <span style={{
                                                        fontWeight: 'bold',
                                                        color: h.discrepancy === 0 ? 'var(--success)' : h.discrepancy > 0 ? '#1565c0' : 'var(--accent)',
                                                    }}>
                                                        {h.discrepancy === 0
                                                            ? '一致'
                                                            : h.discrepancy > 0
                                                                ? `+${formatCurrency(h.discrepancy)}`
                                                                : formatCurrency(h.discrepancy)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function getDenominationLabel(value: number): string {
    const labels: Record<number, string> = {
        10000: '1万円札',
        5000: '5千円札',
        1000: '千円札',
        500: '500円玉',
        100: '100円玉',
        50: '50円玉',
        10: '10円玉',
        5: '5円玉',
        1: '1円玉',
    };
    return labels[value] || `${value}円`;
}
