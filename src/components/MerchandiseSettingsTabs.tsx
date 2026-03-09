'use client';

import { useState } from 'react';
import { MerchandiseProduct, MerchandiseSet, Production } from '@/types';
import MerchandiseSettingsForm from './MerchandiseSettingsForm';
import MerchandiseProductManager from './MerchandiseProductManager';
import MerchandiseSetManager from './MerchandiseSetManager';
import { updateMerchandiseSetsClient } from '@/lib/client-firestore';
import { useToast } from '@/components/Toast';

type TabId = 'settings' | 'products' | 'sets';

interface Props {
    production: Production;
    products: MerchandiseProduct[];
}

export default function MerchandiseSettingsTabs({ production, products }: Props) {
    const [activeTab, setActiveTab] = useState<TabId>('settings');
    const [sets, setSets] = useState<MerchandiseSet[]>(production.merchandiseSets || []);
    const { showToast } = useToast();

    const tabs: { id: TabId; label: string }[] = [
        { id: 'settings', label: '物販設定' },
        { id: 'products', label: '商品管理' },
        { id: 'sets', label: 'セット販売' },
    ];

    const handleSetsChanged = async (newSets: MerchandiseSet[]) => {
        setSets(newSets);
        try {
            await updateMerchandiseSetsClient(production.id, newSets);
        } catch {
            showToast('セット販売設定の保存に失敗しました', 'error');
        }
    };

    return (
        <div>
            {/* Tab Bar */}
            <div style={{
                display: 'flex',
                gap: '0',
                borderBottom: '2px solid var(--card-border)',
                marginBottom: '1.5rem',
            }}>
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            padding: '0.75rem 1.5rem',
                            border: 'none',
                            background: 'none',
                            cursor: 'pointer',
                            fontSize: '0.95rem',
                            fontWeight: activeTab === tab.id ? '700' : '500',
                            color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-muted)',
                            borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
                            marginBottom: '-2px',
                            transition: 'all 0.15s',
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {activeTab === 'settings' && (
                <MerchandiseSettingsForm
                    productionId={production.id}
                    currentMode={production.merchandiseMode || 'SIMPLE'}
                    currentInventoryEnabled={production.merchandiseInventoryEnabled || false}
                    hasProducts={products.length > 0}
                />
            )}
            {activeTab === 'products' && (
                <MerchandiseProductManager
                    productionId={production.id}
                    userId={production.userId}
                    inventoryEnabled={production.merchandiseInventoryEnabled || false}
                />
            )}
            {activeTab === 'sets' && (
                <MerchandiseSetManager
                    productionId={production.id}
                    sets={sets}
                    products={products}
                    onSetsChanged={handleSetsChanged}
                />
            )}
        </div>
    );
}
