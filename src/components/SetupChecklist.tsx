'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Production } from '@/types';
import { Check, ChevronDown, ChevronUp, X, Ticket, MapPin, Mail, FileEdit, Key, ListChecks } from 'lucide-react';

interface ChecklistItem {
    id: string;
    label: string;
    description: string;
    icon: React.ReactNode;
    href: string;
    isCompleted: (production: Production) => boolean;
    priority?: 'required' | 'recommended';
}

interface SetupChecklistProps {
    production: Production;
    productionId: string;
}

const STORAGE_KEY_PREFIX = 'setup_checklist_mode_';

type DisplayMode = 'expanded' | 'collapsed' | 'minimized';

export default function SetupChecklist({ production, productionId }: SetupChecklistProps) {
    const [mode, setMode] = useState<DisplayMode>('collapsed'); // useEffect で復元するまで collapsed
    const [initialized, setInitialized] = useState(false);

    const storageKey = `${STORAGE_KEY_PREFIX}${productionId}`;

    useEffect(() => {
        const saved = localStorage.getItem(storageKey);
        if (saved === 'expanded') {
            setMode('expanded');
        } else if (saved === 'collapsed') {
            setMode('collapsed');
        } else {
            setMode('minimized');
        }
        setInitialized(true);
    }, [storageKey]);

    const items: ChecklistItem[] = [
        {
            id: 'ticket_types',
            label: 'チケット種別を追加',
            description: '予約受付に必須です。チケットの種類と料金を設定しましょう',
            icon: <Ticket size={18} />,
            href: `/productions/${productionId}`,
            isCompleted: (p) => p.ticketTypes && p.ticketTypes.length > 0,
            priority: 'required',
        },
        {
            id: 'venue',
            label: '会場情報を入力',
            description: '確認メールに会場名が自動挿入されます',
            icon: <MapPin size={18} />,
            href: `/productions/${productionId}`,
            isCompleted: (p) => !!p.venue && p.venue.trim().length > 0,
            priority: 'recommended',
        },
        {
            id: 'email',
            label: 'メールテンプレートを確認',
            description: '予約確認メールの内容をカスタマイズできます',
            icon: <Mail size={18} />,
            href: `/productions/${productionId}/email`,
            isCompleted: (p) => !!p.emailTemplates && typeof p.emailTemplates === 'object' && Object.keys(p.emailTemplates).length > 0,
            priority: 'recommended',
        },
        {
            id: 'form',
            label: '予約フォームを確認',
            description: 'お客様に共有する予約ページを確認しましょう',
            icon: <FileEdit size={18} />,
            href: `/productions/${productionId}/form-editor`,
            isCompleted: (p) => !!p.formFields && p.formFields.length > 0,
            priority: 'recommended',
        },
        {
            id: 'staff',
            label: 'スタッフを追加',
            description: '当日の受付スタッフを登録しましょう',
            icon: <Key size={18} />,
            href: `/productions/${productionId}/staff`,
            isCompleted: (p) => !!p.staffTokens && Object.keys(p.staffTokens).length > 0,
        },
    ];

    const completedCount = items.filter(item => item.isCompleted(production)).length;
    const totalCount = items.length;
    const allCompleted = completedCount === totalCount;
    const progressPercent = (completedCount / totalCount) * 100;
    const remainingCount = totalCount - completedCount;

    const saveMode = (newMode: DisplayMode) => {
        setMode(newMode);
        localStorage.setItem(storageKey, newMode);
    };

    // 初期化前はレンダリングしない（ちらつき防止）
    if (!initialized) return null;

    // 全完了時は非表示（もう不要）
    if (allCompleted) return null;

    // ミニ化モード: 小さなピルボタンで表示
    if (mode === 'minimized') {
        return (
            <div style={{ marginBottom: '1.5rem' }}>
                <button
                    onClick={() => saveMode('expanded')}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 1rem',
                        background: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '20px',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        color: '#555',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                        transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--primary)';
                        e.currentTarget.style.color = 'var(--primary)';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(139, 0, 0, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#e5e7eb';
                        e.currentTarget.style.color = '#555';
                        e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)';
                    }}
                >
                    <ListChecks size={16} />
                    <span>セットアップ</span>
                    <span style={{
                        background: 'var(--primary)',
                        color: '#fff',
                        fontSize: '0.7rem',
                        fontWeight: '700',
                        borderRadius: '10px',
                        padding: '1px 7px',
                        minWidth: '20px',
                        textAlign: 'center',
                    }}>
                        {remainingCount}
                    </span>
                </button>
            </div>
        );
    }

    const isCollapsed = mode === 'collapsed';

    return (
        <div style={{
            marginBottom: '2rem',
            background: '#fff',
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            overflow: 'hidden',
        }}>
            {/* ヘッダー */}
            <div
                style={{
                    padding: '1rem 1.25rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    userSelect: 'none',
                }}
                onClick={() => saveMode(isCollapsed ? 'expanded' : 'collapsed')}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                        width: '32px', height: '32px', borderRadius: '50%',
                        background: 'rgba(139, 0, 0, 0.08)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--primary)' }}>{completedCount}/{totalCount}</span>
                    </div>
                    <div>
                        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 'bold' }}>
                            セットアップを完了しましょう
                        </h4>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#888' }}>
                            あと {remainingCount} 項目で準備完了です
                        </p>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            saveMode('minimized');
                        }}
                        title="小さく表示する"
                        style={{
                            border: 'none', background: 'none', cursor: 'pointer',
                            color: '#bbb', padding: '0.25rem',
                            display: 'flex', alignItems: 'center',
                        }}
                    >
                        <X size={16} />
                    </button>
                    {isCollapsed ? <ChevronDown size={18} color="#999" /> : <ChevronUp size={18} color="#999" />}
                </div>
            </div>

            {/* プログレスバー */}
            <div style={{ height: '3px', background: '#f0f0f0' }}>
                <div style={{
                    height: '100%',
                    width: `${progressPercent}%`,
                    background: 'var(--primary)',
                    transition: 'width 0.4s ease',
                }} />
            </div>

            {/* チェックリスト項目 */}
            {!isCollapsed && (
                <div style={{ padding: '0.5rem 0' }}>
                    {items.map((item) => {
                        const completed = item.isCompleted(production);
                        return (
                            <Link
                                key={item.id}
                                href={item.href}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    padding: '0.75rem 1.25rem',
                                    textDecoration: 'none',
                                    color: 'inherit',
                                    transition: 'background 0.15s',
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#f9fafb'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                            >
                                <div style={{
                                    width: '28px', height: '28px', borderRadius: '50%',
                                    border: completed ? 'none' : '2px solid #d1d5db',
                                    background: completed ? '#dcfce7' : 'transparent',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0,
                                    transition: 'all 0.2s',
                                }}>
                                    {completed ? <Check size={14} color="#16a34a" /> : <span style={{ color: '#d1d5db' }}>{item.icon}</span>}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{
                                        fontSize: '0.9rem',
                                        fontWeight: '600',
                                        color: completed ? '#999' : '#333',
                                        textDecoration: completed ? 'line-through' : 'none',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.4rem',
                                    }}>
                                        {item.label}
                                        {!completed && item.priority === 'required' && (
                                            <span style={{
                                                fontSize: '0.65rem',
                                                fontWeight: '700',
                                                color: '#dc2626',
                                                background: '#fef2f2',
                                                border: '1px solid #fecaca',
                                                borderRadius: '4px',
                                                padding: '1px 6px',
                                            }}>
                                                必須
                                            </span>
                                        )}
                                    </div>
                                    <div style={{
                                        fontSize: '0.78rem',
                                        color: '#aaa',
                                        marginTop: '0.1rem',
                                    }}>
                                        {item.description}
                                    </div>
                                </div>
                                {!completed && (
                                    <span style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: '600', whiteSpace: 'nowrap' }}>
                                        設定する &rarr;
                                    </span>
                                )}
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
