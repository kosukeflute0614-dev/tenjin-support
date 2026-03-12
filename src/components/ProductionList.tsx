'use client';

import { useState, useRef } from 'react';
import { switchProduction } from '@/app/actions/production-context';
import { deleteProductionClient } from '@/lib/client-firestore';
import Link from 'next/link';
import { Production } from '@/types';
import { useToast } from '@/components/Toast';
import { toDate } from '@/lib/firestore-utils';
import styles from '@/app/productions/productions.module.css';

type Props = {
    productions: Production[];
    activeId?: string | null;
};

function MoreMenu({ productionId, productionTitle, onDeleted }: {
    productionId: string;
    productionTitle: string;
    onDeleted: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const handleDelete = async () => {
        if (confirm(`「${productionTitle}」を削除してもよろしいですか？\nこの操作は取り消せません。`)) {
            setIsDeleting(true);
            setOpen(false);
            try {
                await deleteProductionClient(productionId);
                onDeleted();
            } catch {
                setIsDeleting(false);
            }
        } else {
            setOpen(false);
        }
    };

    return (
        <div style={{ position: 'relative' }}>
            <button
                className={styles.moreBtn}
                onClick={() => setOpen(!open)}
                aria-label="メニュー"
                aria-expanded={open}
                disabled={isDeleting}
                title="操作メニュー"
            >
                {isDeleting ? '…' : '⋮'}
            </button>
            {open && (
                <>
                    <div className={styles.menuBackdrop} onClick={() => setOpen(false)} />
                    <div className={styles.moreMenu} ref={menuRef}>
                        <Link
                            href={`/productions/${productionId}`}
                            className={styles.moreMenuItem}
                            onClick={() => setOpen(false)}
                        >
                            ⚙️ 設定を編集
                        </Link>
                        <button
                            className={`${styles.moreMenuItem} ${styles.moreMenuDanger}`}
                            onClick={handleDelete}
                        >
                            🗑️ 公演を削除
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}

function formatPerformanceShort(startTime: unknown): string {
    const d = toDate(startTime as any);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hours}:${minutes}`;
}

export default function ProductionList({ productions, activeId }: Props) {
    const { showToast } = useToast();

    const handleSwitch = async (id: string) => {
        await switchProduction(id);
    };

    const handleDeleteError = () => {
        showToast('公演の削除に失敗しました。権限がないか、エラーが発生しました。', 'error');
    };

    return (
        <div className={styles.list}>
            {productions.map((prod) => {
                const isActive = prod.id === activeId;
                const isOpen = prod.receptionStatus === 'OPEN';
                const perfCount = prod.performances?.length ?? 0;
                const sortedPerfs = prod.performances
                    ? [...prod.performances].sort((a, b) =>
                        toDate(a.startTime).getTime() - toDate(b.startTime).getTime()
                    )
                    : [];

                return (
                    <div
                        key={prod.id}
                        className={`${styles.card} ${isActive ? styles.cardActive : ''}`}
                    >
                        <div className={styles.cardBody}>
                            <div className={styles.cardTitleRow}>
                                <h3 className={styles.cardTitle}>{prod.title}</h3>
                                {isActive && (
                                    <span className={`${styles.badge} ${styles.badgeActive}`}>選択中</span>
                                )}
                                {isOpen ? (
                                    <span className={`${styles.badge} ${styles.badgeReception}`}>受付中</span>
                                ) : (
                                    <span className={`${styles.badge} ${styles.badgeClosed}`}>受付停止</span>
                                )}
                            </div>

                            <p className={styles.cardMeta}>
                                {prod.venue && (
                                    <>
                                        <span>{prod.venue}</span>
                                        <span className={styles.metaDivider}>|</span>
                                    </>
                                )}
                                <span>{perfCount > 0 ? `全${perfCount}回公演` : '公演回未設定'}</span>
                                {prod.ticketTypes?.length > 0 && (
                                    <>
                                        <span className={styles.metaDivider}>|</span>
                                        <span>{prod.ticketTypes.length}券種</span>
                                    </>
                                )}
                            </p>

                            {sortedPerfs.length > 0 && (
                                <div className={styles.performanceList}>
                                    {sortedPerfs.slice(0, 6).map((perf, i) => (
                                        <span key={perf.id || i} className={styles.performanceChip}>
                                            {formatPerformanceShort(perf.startTime)}
                                        </span>
                                    ))}
                                    {sortedPerfs.length > 6 && (
                                        <span className={styles.performanceChip}>
                                            +{sortedPerfs.length - 6}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className={styles.cardActions}>
                            {isActive ? (
                                <Link
                                    href="/dashboard"
                                    className={`btn btn-primary ${styles.actionBtn}`}
                                >
                                    ダッシュボードへ
                                </Link>
                            ) : (
                                <button
                                    onClick={() => handleSwitch(prod.id)}
                                    className={`btn btn-secondary ${styles.actionBtn}`}
                                >
                                    この公演を選択
                                </button>
                            )}
                            <MoreMenu
                                productionId={prod.id}
                                productionTitle={prod.title}
                                onDeleted={handleDeleteError}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
