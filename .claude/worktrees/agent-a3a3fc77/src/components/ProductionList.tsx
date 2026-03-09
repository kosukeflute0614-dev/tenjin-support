'use client';

import { useState } from 'react';
import { switchProduction } from '@/app/actions/production-context';
import { deleteProductionClient } from '@/lib/client-firestore';
import Link from 'next/link';
import { Production } from '@/types';

type Props = {
    productions: Production[];
    activeId?: string | null;
};

export default function ProductionList({ productions, activeId }: Props) {
    const [isDeleting, setIsDeleting] = useState<string | null>(null);

    const handleSwitch = async (id: string) => {
        await switchProduction(id);
    };

    const handleDelete = async (id: string) => {
        if (confirm('この公演を削除してもよろしいですか？この操作は取り消せません。')) {
            setIsDeleting(id);
            try {
                await deleteProductionClient(id);
            } catch (error) {
                alert("公演の削除に失敗しました。権限がないか、エラーが発生しました。");
            } finally {
                setIsDeleting(null);
            }
        }
    };

    return (
        <div className="menu-grid">
            {productions.map((prod) => {
                const isActive = prod.id === activeId;
                return (
                    <div key={prod.id} className={`menu-card ${isActive ? 'active-day' : ''}`} style={{
                        alignItems: 'flex-start',
                        textAlign: 'left',
                        cursor: 'default',
                        position: 'relative',
                        padding: '1.5rem'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: '0.5rem' }}>
                            <span className="icon" style={{ margin: 0 }}>🎭</span>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    onClick={() => handleDelete(prod.id)}
                                    title="公演を削除"
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: 'var(--accent)',
                                        cursor: 'pointer',
                                        fontSize: '0.8rem',
                                        padding: '0.2rem 0.5rem',
                                        borderRadius: '4px',
                                        transition: 'all 0.2s',
                                        opacity: 0.6
                                    }}
                                    onMouseOver={(e) => {
                                        e.currentTarget.style.opacity = '1';
                                        e.currentTarget.style.backgroundColor = 'rgba(255, 75, 75, 0.1)';
                                    }}
                                    onMouseOut={(e) => {
                                        e.currentTarget.style.opacity = '0.6';
                                        e.currentTarget.style.backgroundColor = 'transparent';
                                    }}
                                    disabled={isDeleting === prod.id}
                                >
                                    {isDeleting === prod.id ? '削除中...' : '🗑️ 公演を削除'}
                                </button>
                            </div>
                        </div>
                        <h3 style={{ marginBottom: '0.5rem' }}>{prod.title}</h3>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                            {prod.performances ? `${prod.performances.length} 回公演` : '公演情報を管理'}
                        </p>

                        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', width: '100%' }}>
                            {isActive ? (
                                <Link
                                    href="/"
                                    className="btn btn-primary"
                                    style={{ flex: 1, textAlign: 'center', fontSize: '0.85rem' }}
                                >
                                    ダッシュボードへ
                                </Link>
                            ) : (
                                <button
                                    onClick={() => handleSwitch(prod.id)}
                                    className="btn btn-secondary"
                                    style={{ flex: 1, fontSize: '0.85rem' }}
                                >
                                    この公演を選択する
                                </button>
                            )}
                            <Link
                                href={`/productions/${prod.id}`}
                                className="btn btn-secondary"
                                style={{ flex: 1, textAlign: 'center', fontSize: '0.85rem' }}
                            >
                                設定を編集
                            </Link>
                        </div>

                        {isActive && (
                            <div style={{
                                position: 'absolute',
                                top: '0.5rem',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                backgroundColor: 'var(--primary)',
                                color: 'white',
                                padding: '0.1rem 0.6rem',
                                borderRadius: '10px',
                                fontSize: '0.7rem',
                                fontWeight: 'bold'
                            }}>
                                選択中
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
