'use client';

import { useState } from 'react';
import { switchProduction } from '@/app/actions/production-context';
import Link from 'next/link';

type Props = {
    productions: { id: string, title: string }[];
    activeId?: string;
};

export default function ProductionSwitcher({ productions, activeId }: Props) {
    const activeProduction = productions.find(p => p.id === activeId);

    const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const id = e.target.value;
        if (id && id !== activeId) {
            await switchProduction(id);
        }
    };

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span className="current-context" style={{ border: '1px solid var(--card-border)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.85rem' }}>
                <span className="label" style={{ opacity: 0.7 }}>劇団:</span> サンプル劇団 |
                <span className="label" style={{ opacity: 0.7, marginLeft: '0.5rem' }}> 公演:</span>
                <select
                    value={activeId || ''}
                    onChange={handleChange}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--foreground)',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        padding: '0 0.5rem',
                        fontSize: '0.85rem',
                        outline: 'none'
                    }}
                >
                    {!activeId && <option value="" disabled style={{ color: '#333' }}>未選択</option>}
                    {productions.map(p => (
                        <option key={p.id} value={p.id} style={{ color: '#333' }}>
                            {p.title}
                        </option>
                    ))}
                </select>
            </span>
            <Link
                href="/productions"
                className="btn"
                style={{
                    padding: '0.25rem 0.6rem',
                    fontSize: '0.75rem',
                    backgroundColor: 'var(--secondary)',
                    border: '1px solid var(--card-border)',
                    color: 'var(--foreground)'
                }}
            >
                管理・追加
            </Link>
        </div>
    );
}
