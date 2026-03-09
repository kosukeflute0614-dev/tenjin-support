'use client';

import React from 'react';
import styles from '@/components/merchandise-sales.module.css';

interface BottomNavItem {
    id: string;
    label: string;
    icon: React.ReactNode;
    badge?: string | number | null;
    visible?: boolean;
}

interface Props {
    items: BottomNavItem[];
    activeId: string;
    onSelect: (id: string) => void;
}

export default function BottomNav({ items, activeId, onSelect }: Props) {
    const visibleItems = items.filter(item => item.visible !== false);

    return (
        <nav className={styles.bottomNav}>
            {visibleItems.map(item => (
                <button
                    key={item.id}
                    className={`${styles.bottomNavItem} ${activeId === item.id ? styles.bottomNavItemActive : ''}`}
                    onClick={() => onSelect(item.id)}
                    type="button"
                >
                    <span style={{ position: 'relative' }}>
                        {item.icon}
                        {item.badge != null && (
                            <span className={styles.bottomNavBadge}>{item.badge}</span>
                        )}
                    </span>
                    <span>{item.label}</span>
                </button>
            ))}
        </nav>
    );
}
