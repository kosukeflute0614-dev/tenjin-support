'use client';

import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { updateMerchandiseSettingsClient } from '@/lib/client-firestore';
import styles from './merchandise.module.css';

type MerchandiseMode = 'SIMPLE' | 'INDEPENDENT';

interface Props {
    productionId: string;
    currentMode: MerchandiseMode;
    currentInventoryEnabled: boolean;
    hasProducts: boolean;
    onSaved?: () => void;
}

const MODE_OPTIONS: {
    value: MerchandiseMode;
    label: string;
    description: string;
    features: string[];
}[] = [
    {
        value: 'SIMPLE',
        label: 'かんたんモード',
        description: 'チケットと共有レジ＋チェックインページ内で操作',
        features: [
            'チケット販売と同じレジで物販を処理',
            'チェックインページ内に物販セクションを表示',
            '少量の物販に最適',
        ],
    },
    {
        value: 'INDEPENDENT',
        label: '独立モード',
        description: '物販専用レジ＋専用ページで操作',
        features: [
            '物販専用のレジ画面を使用',
            '物販専用のダッシュボード・集計',
            '大量の物販やスタッフ分業に最適',
        ],
    },
];

export default function MerchandiseSettingsForm({
    productionId,
    currentMode,
    currentInventoryEnabled,
    hasProducts,
    onSaved,
}: Props) {
    const { showToast } = useToast();
    const [mode, setMode] = useState<MerchandiseMode>(currentMode);
    const [inventoryEnabled, setInventoryEnabled] = useState(currentInventoryEnabled);
    const [isSaving, setIsSaving] = useState(false);

    const isDirty = mode !== currentMode || inventoryEnabled !== currentInventoryEnabled;

    const handleSave = async () => {
        if (!isDirty) return;
        setIsSaving(true);
        try {
            await updateMerchandiseSettingsClient(productionId, {
                merchandiseMode: mode,
                merchandiseInventoryEnabled: inventoryEnabled,
            });
            showToast('物販設定を保存しました。', 'success');
            onSaved?.();
        } catch (err) {
            console.error('Failed to save merchandise settings:', err);
            showToast('物販設定の保存に失敗しました。', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div>
            {/* Mode selection */}
            <div className={styles.section}>
                <h3 className={styles.sectionTitle}>運用スタイル</h3>
                <div className={styles.modeCards}>
                    {MODE_OPTIONS.map((option) => {
                        const selected = mode === option.value;
                        return (
                            <label
                                key={option.value}
                                className={`${styles.modeCard} ${selected ? styles.modeCardSelected : ''}`}
                            >
                                <input
                                    type="radio"
                                    name="merchandiseMode"
                                    value={option.value}
                                    checked={selected}
                                    onChange={() => setMode(option.value)}
                                    className={styles.hiddenRadio}
                                />
                                <div className={styles.modeCardHeader}>
                                    <span className={`${styles.radioCircle} ${selected ? styles.radioCircleSelected : ''}`}>
                                        {selected && <span className={styles.radioCircleInner} />}
                                    </span>
                                    <span className={styles.modeName}>{option.label}</span>
                                </div>
                                <p className={styles.modeDescription}>{option.description}</p>
                                <ul className={styles.modeFeatures}>
                                    {option.features.map((f, i) => (
                                        <li key={i}>{f}</li>
                                    ))}
                                </ul>
                            </label>
                        );
                    })}
                </div>
            </div>

            {/* Inventory toggle */}
            <div className={styles.section}>
                <h3 className={styles.sectionTitle}>在庫管理</h3>
                <label className={`${styles.toggleRow} ${hasProducts ? styles.toggleRowDisabled : ''}`}>
                    <input
                        type="checkbox"
                        checked={inventoryEnabled}
                        disabled={hasProducts}
                        onChange={(e) => setInventoryEnabled(e.target.checked)}
                    />
                    <span className={styles.toggleLabel}>在庫管理を有効にする</span>
                    <span className={styles.toggleHint}>商品ごとの在庫数を追跡します</span>
                </label>
                {hasProducts && (
                    <p className={styles.inventoryLockedNote}>
                        商品が登録されているため、在庫管理の設定を変更できません。変更するには、先にすべての商品を削除してください。
                    </p>
                )}
            </div>

            {/* Warning */}
            <div className={styles.warning}>
                <AlertTriangle size={18} className={styles.warningIcon} />
                <span>公演期間中のモード切替は非推奨です。データの整合性に影響する可能性があります。</span>
            </div>

            {/* Save button */}
            <div className={styles.actions}>
                <button
                    className="btn btn-primary"
                    onClick={handleSave}
                    disabled={!isDirty || isSaving}
                >
                    {isSaving ? '保存中...' : '設定を保存'}
                </button>
            </div>
        </div>
    );
}
