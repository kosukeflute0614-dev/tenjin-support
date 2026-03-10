'use client';

import { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { serializeDoc } from '@/lib/firestore-utils';
import { Production, FormFieldConfig } from '@/types';
import { saveFormFieldsClient } from '@/lib/client-firestore';

const LOCKED_FIELD_IDS = ['customer_name', 'customer_kana', 'customer_email', 'remarks'];
const SYSTEM_FIELD_IDS = ['performance_select', 'ticket_select'];

// ブロックグループ: これらのフィールドは常にセットで移動する
const BLOCK_GROUPS: Record<string, string[]> = {
    'customer_name': ['customer_name', 'customer_kana'],
    'performance_select': ['performance_select', 'ticket_select'],
};
// ブロックの2番目以降のフィールド（ブロックリーダーに含まれるためスキップ）
const BLOCK_FOLLOWERS = new Set(['customer_kana', 'ticket_select']);

function toFormField(config: FormFieldConfig): FormField {
    return {
        ...config,
        locked: LOCKED_FIELD_IDS.includes(config.id) || SYSTEM_FIELD_IDS.includes(config.id),
        isSystem: SYSTEM_FIELD_IDS.includes(config.id),
    };
}

function toFormFieldConfig(field: FormField): FormFieldConfig {
    const { locked, isSystem, ...config } = field;
    return config;
}

interface FormField {
    id: string;
    label: string;
    type: 'text' | 'textarea' | 'select' | 'checkbox';
    enabled: boolean;
    required: boolean;
    locked?: boolean;        // 削除・無効化不可（組み込みフィールド）
    placeholder?: string;
    isCustom?: boolean;      // ユーザー追加フィールド
    options?: string[];      // select / checkbox 用選択肢
    isSystem?: boolean;      // システム固定項目（観劇日時・券種）
    templateType?: 'phone' | 'newsletter'; // テンプレートから追加された項目
    validation?: string;     // バリデーションルール表示用
}

const INITIAL_FIELDS: FormField[] = [
    { id: 'customer_name', label: 'お名前', type: 'text', enabled: true, required: true, locked: true },
    { id: 'customer_kana', label: 'ふりがな', type: 'text', enabled: true, required: true, locked: true },
    { id: 'customer_email', label: 'メールアドレス', type: 'text', enabled: true, required: true, locked: true },
    { id: 'performance_select', label: '観劇日時', type: 'select', enabled: true, required: true, locked: true, isSystem: true },
    { id: 'ticket_select', label: '券種選択', type: 'select', enabled: true, required: true, locked: true, isSystem: true },
    { id: 'remarks', label: '備考', type: 'textarea', enabled: true, required: true, locked: true },
    { id: 'custom_newsletter', label: '次回以降の公演のお知らせを受け取る', type: 'checkbox', enabled: true, required: false, isCustom: true, templateType: 'newsletter' },
];

interface AddFieldForm {
    label: string;
    type: 'text' | 'textarea' | 'select' | 'checkbox';
    required: boolean;
    placeholder: string;
    options: string[];
}

export default function FormEditorPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { user, loading } = useAuth();
    const { showToast } = useToast();
    const [production, setProduction] = useState<Production | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [fields, setFields] = useState<FormField[]>([...INITIAL_FIELDS]);
    const [addStep, setAddStep] = useState<'hidden' | 'template' | 'custom'>('hidden');
    const [addForm, setAddForm] = useState<AddFieldForm>({
        label: '', type: 'text', required: false, placeholder: '', options: [''],
    });
    const [editingId, setEditingId] = useState<string | null>(null);
    const [dragBlockId, setDragBlockId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    useUnsavedChanges(isDirty);

    useEffect(() => {
        const fetchProduction = async () => {
            if (!user) return;
            try {
                const docRef = doc(db, 'productions', id);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = serializeDoc<Production>(docSnap);
                    if (data.userId === user.uid) {
                        setProduction(data);
                        if (data.formFields && data.formFields.length > 0) {
                            setFields(data.formFields.map(toFormField));
                        }
                    }
                }
            } catch (error) {
                console.error('Failed to fetch production:', error);
            } finally {
                setIsLoading(false);
            }
        };

        if (!loading && user) {
            fetchProduction();
        } else if (!loading) {
            setIsLoading(false);
        }
    }, [id, user, loading]);

    // フィールド変更をラップしてdirtyフラグを立てる
    const setFieldsDirty = useCallback((updater: React.SetStateAction<FormField[]>) => {
        setFields(updater);
        setIsDirty(true);
    }, []);

    // ブロック単位で移動する
    const moveBlock = useCallback((blockLeaderId: string, direction: -1 | 1) => {
        setFieldsDirty(prev => {
            const next = [...prev];
            const blockIds = BLOCK_GROUPS[blockLeaderId] || [blockLeaderId];
            const blockStartIndex = next.findIndex(f => f.id === blockIds[0]);
            if (blockStartIndex === -1) return prev;
            const blockSize = blockIds.length;

            if (direction === -1) {
                // 上に移動: ブロックの上にある要素を探す
                if (blockStartIndex === 0) return prev;
                // 上の要素がブロックフォロワーの場合、そのブロック全体を超えて移動
                const aboveIndex = blockStartIndex - 1;
                const aboveField = next[aboveIndex];
                const aboveBlockLeader = Object.entries(BLOCK_GROUPS).find(([, ids]) => ids.includes(aboveField.id));
                const aboveBlockStart = aboveBlockLeader
                    ? next.findIndex(f => f.id === aboveBlockLeader[1][0])
                    : aboveIndex;
                // ブロックを抽出して挿入位置に入れる
                const block = next.splice(blockStartIndex, blockSize);
                next.splice(aboveBlockStart, 0, ...block);
            } else {
                // 下に移動: ブロックの下にある要素を探す
                const blockEndIndex = blockStartIndex + blockSize - 1;
                if (blockEndIndex >= next.length - 1) return prev;
                const belowIndex = blockEndIndex + 1;
                const belowField = next[belowIndex];
                const belowBlockLeader = Object.entries(BLOCK_GROUPS).find(([, ids]) => ids.includes(belowField.id));
                const belowBlockSize = belowBlockLeader ? belowBlockLeader[1].length : 1;
                // ブロックを抽出して、下のブロックの後に挿入
                const block = next.splice(blockStartIndex, blockSize);
                next.splice(blockStartIndex + belowBlockSize, 0, ...block);
            }
            return next;
        });
    }, []);

    const updateFieldLabel = (fieldId: string, label: string) => {
        setFieldsDirty(prev => prev.map(f =>
            f.id === fieldId ? { ...f, label } : f
        ));
    };

    const updateFieldPlaceholder = (fieldId: string, placeholder: string) => {
        setFieldsDirty(prev => prev.map(f =>
            f.id === fieldId ? { ...f, placeholder } : f
        ));
    };

    const toggleRequired = (fieldId: string) => {
        setFieldsDirty(prev => prev.map(f =>
            f.id === fieldId && !f.locked ? { ...f, required: !f.required } : f
        ));
    };

    const removeField = (fieldId: string) => {
        setFieldsDirty(prev => prev.filter(f => f.id !== fieldId));
        setEditingId(null);
    };

    const updateFieldOptions = (fieldId: string, options: string[]) => {
        setFieldsDirty(prev => prev.map(f =>
            f.id === fieldId ? { ...f, options } : f
        ));
    };

    const addFromTemplate = (templateKey: 'phone' | 'newsletter') => {
        if (templateKey === 'phone') {
            const exists = fields.some(f => f.id === 'customer_phone');
            if (exists) return;
            setFieldsDirty(prev => [...prev, {
                id: 'customer_phone',
                label: '電話番号',
                type: 'text',
                enabled: true,
                required: false,
                placeholder: '09012345678',
                isCustom: true,
                templateType: 'phone',
                validation: '半角数字のみ（ハイフンなし）',
            }]);
        } else if (templateKey === 'newsletter') {
            const exists = fields.some(f => f.templateType === 'newsletter');
            if (exists) return;
            setFieldsDirty(prev => [...prev, {
                id: 'custom_newsletter',
                label: '次回以降の公演のお知らせを受け取る',
                type: 'checkbox',
                enabled: true,
                required: false,
                isCustom: true,
                templateType: 'newsletter',
            }]);
        }
        setAddStep('hidden');
    };

    const addCustomField = () => {
        if (!addForm.label.trim()) return;
        const options = addForm.options.filter(o => o.trim());
        const newField: FormField = {
            id: `custom_${Date.now()}`,
            label: addForm.label.trim(),
            type: addForm.type,
            enabled: true,
            required: addForm.required,
            placeholder: addForm.placeholder,
            isCustom: true,
            options: (addForm.type === 'select' || addForm.type === 'checkbox') ? options : undefined,
        };
        setFieldsDirty(prev => [...prev, newField]);
        setAddForm({ label: '', type: 'text', required: false, placeholder: '', options: [''] });
        setAddStep('hidden');
    };

    // ブロックのリーダーIDを取得（フォロワーならリーダーを返す）
    const getBlockLeader = (fieldId: string): string => {
        for (const [leader, ids] of Object.entries(BLOCK_GROUPS)) {
            if (ids.includes(fieldId)) return leader;
        }
        return fieldId;
    };

    // ドラッグ&ドロップ（ブロック単位）
    const handleDragStart = (fieldId: string) => {
        setDragBlockId(getBlockLeader(fieldId));
    };

    const handleDragOver = (e: React.DragEvent, targetFieldId: string) => {
        e.preventDefault();
        if (dragBlockId === null) return;
        const targetLeader = getBlockLeader(targetFieldId);
        if (dragBlockId === targetLeader) return;

        setFieldsDirty(prev => {
            const next = [...prev];
            const dragIds = BLOCK_GROUPS[dragBlockId] || [dragBlockId];
            const targetIds = BLOCK_GROUPS[targetLeader] || [targetLeader];
            const dragStart = next.findIndex(f => f.id === dragIds[0]);
            const targetStart = next.findIndex(f => f.id === targetIds[0]);
            if (dragStart === -1 || targetStart === -1) return prev;

            const dragBlock = next.splice(dragStart, dragIds.length);
            const newTargetStart = next.findIndex(f => f.id === targetIds[0]);
            const insertAt = dragStart < targetStart ? newTargetStart + targetIds.length : newTargetStart;
            next.splice(insertAt, 0, ...dragBlock);
            return next;
        });
    };

    const handleDragEnd = () => {
        setDragBlockId(null);
    };

    const handleSave = async () => {
        if (!user || !production) return;
        setIsSaving(true);
        setSaveSuccess(false);
        try {
            const configs = fields.map(toFormFieldConfig);
            await saveFormFieldsClient(production.id, configs, user.uid);
            setIsDirty(false);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
        } catch (err) {
            console.error('Failed to save form fields:', err);
            showToast('保存に失敗しました。', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    // 選択肢の追加・削除・更新（addForm用）
    const addOption = () => {
        setAddForm(prev => ({ ...prev, options: [...prev.options, ''] }));
    };

    const removeOption = (index: number) => {
        setAddForm(prev => ({
            ...prev,
            options: prev.options.filter((_, i) => i !== index),
        }));
    };

    const updateOption = (index: number, value: string) => {
        setAddForm(prev => ({
            ...prev,
            options: prev.options.map((o, i) => i === index ? value : o),
        }));
    };

    if (loading || isLoading) {
        return <div className="flex-center" style={{ height: '50vh' }}>読み込み中...</div>;
    }

    if (!user || !production) {
        return (
            <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>
                <h2 className="heading-md">アクセス権限がありません</h2>
                <Link href="/dashboard" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>ダッシュボードに戻る</Link>
            </div>
        );
    }

    const fieldTypeLabel = (type: string) => {
        switch (type) {
            case 'text': return 'テキスト';
            case 'textarea': return 'テキストエリア';
            case 'select': return 'セレクトボックス';
            case 'checkbox': return 'チェックボックス';
            default: return type;
        }
    };

    const reorderBtnStyle = (active: boolean): React.CSSProperties => ({
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: '28px', flex: 1, borderRadius: '6px',
        border: `1px solid ${active ? 'var(--card-border)' : '#f0f0f0'}`,
        background: active ? 'var(--card-bg)' : 'var(--secondary)',
        fontSize: '0.65rem',
        cursor: active ? 'pointer' : 'default',
        color: active ? 'var(--text-muted)' : '#ddd',
        transition: 'all 0.15s',
        boxShadow: active ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
        padding: 0,
    });

    const dragHandleStyle: React.CSSProperties = {
        cursor: 'grab',
        padding: 0,
        color: 'var(--slate-400)',
        fontSize: '0.85rem',
        userSelect: 'none',
        display: 'flex',
        alignItems: 'center',
        lineHeight: 1,
    };

    return (
        <div className="container" style={{ maxWidth: '1000px' }}>
            <div style={{ marginBottom: '1.25rem' }}>
                <Link href="/dashboard" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', borderRadius: '8px', fontSize: '0.9rem' }}>
                    <span>&larr;</span> ダッシュボードに戻る
                </Link>
            </div>
            <div style={{ marginBottom: '2rem' }}>
                <h2 className="heading-lg" style={{ marginBottom: '0.5rem' }}>予約フォーム編集</h2>
                <p className="text-muted" style={{ fontSize: '0.9rem' }}>予約フォームに表示する項目を設定できます。左の▲▼ボタンで並び替えが可能です。</p>
            </div>

            <div className="form-editor-layout">
                {/* 左カラム: フィールド設定 */}
                <div>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        marginBottom: '0.75rem', paddingBottom: '0.5rem',
                        borderBottom: '1px solid #e5e7eb',
                    }}>
                        <span style={{ fontSize: '1rem' }}>🛠</span>
                        <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--foreground)', margin: 0 }}>フォーム項目の設定</h3>
                        <span style={{ fontSize: '0.75rem', color: 'var(--slate-500)', marginLeft: 'auto' }}>{fields.filter(f => f.enabled).length} 項目</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {(() => {
                            // ブロック単位でレンダリング（フォロワーはスキップ）
                            const blocks: { leaderId: string; fields: FormField[] }[] = [];
                            const seen = new Set<string>();
                            fields.forEach(field => {
                                if (seen.has(field.id)) return;
                                const blockIds = BLOCK_GROUPS[field.id];
                                if (blockIds) {
                                    const blockFields = blockIds.map(id => fields.find(f => f.id === id)).filter(Boolean) as FormField[];
                                    blockFields.forEach(f => seen.add(f.id));
                                    blocks.push({ leaderId: field.id, fields: blockFields });
                                } else if (!BLOCK_FOLLOWERS.has(field.id)) {
                                    seen.add(field.id);
                                    blocks.push({ leaderId: field.id, fields: [field] });
                                }
                            });

                            return blocks.map((block, blockIndex) => {
                                const isMultiBlock = block.fields.length > 1;
                                const isDragging = dragBlockId === block.leaderId;
                                const isFirst = blockIndex === 0;
                                const isLast = blockIndex === blocks.length - 1;
                                const blockLabel = block.leaderId === 'customer_name' ? 'お名前・ふりがな'
                                    : block.leaderId === 'performance_select' ? '観劇日時・券種選択'
                                    : null;
                                const singleField = !isMultiBlock ? block.fields[0] : null;

                                return (
                                    <div
                                        key={block.leaderId}
                                        style={{ display: 'flex', gap: '0.4rem', alignItems: 'stretch' }}
                                    >
                                        {/* 並べ替えボタン（カード左横） */}
                                        <div style={{
                                            display: 'flex', flexDirection: 'column', gap: '2px',
                                            flexShrink: 0, width: '28px',
                                        }}>
                                            <button
                                                className="form-editor-move-btn"
                                                onClick={() => moveBlock(block.leaderId, -1)}
                                                disabled={isFirst}
                                                style={reorderBtnStyle(!isFirst)}
                                                aria-label="上に移動"
                                            >▲</button>
                                            <button
                                                className="form-editor-move-btn"
                                                onClick={() => moveBlock(block.leaderId, 1)}
                                                disabled={isLast}
                                                style={reorderBtnStyle(!isLast)}
                                                aria-label="下に移動"
                                            >▼</button>
                                        </div>

                                    <div
                                        draggable
                                        onDragStart={() => handleDragStart(block.leaderId)}
                                        onDragOver={(e) => handleDragOver(e, block.leaderId)}
                                        onDragEnd={handleDragEnd}
                                        style={{
                                            flex: 1,
                                            padding: 0,
                                            background: isDragging ? 'rgba(139, 0, 0, 0.03)' : 'var(--card-bg)',
                                            border: isDragging ? '2px dashed var(--primary)' : '1px solid var(--card-border)',
                                            borderRadius: '6px',
                                            opacity: isDragging ? 0.7 : 1,
                                            transition: 'background 0.15s, opacity 0.15s',
                                            overflow: 'hidden',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            minHeight: '58px',
                                        }}
                                    >
                                        {/* 共通ヘッダー行 */}
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: '0.35rem',
                                            padding: '0.45rem 0.6rem',
                                            background: 'var(--secondary)',
                                            flex: 1,
                                        }}>
                                            <span style={dragHandleStyle} title="ドラッグで並び替え">⠿</span>

                                            {/* ブロックラベル or 単独フィールドラベル */}
                                            {isMultiBlock && blockLabel ? (
                                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                    <span style={{ fontWeight: '600', fontSize: '0.85rem', color: 'var(--foreground)' }}>{blockLabel}</span>
                                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', background: '#eee', padding: '1px 5px', borderRadius: '3px', lineHeight: '1.4' }}>セット</span>
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--slate-500)', marginLeft: '0.1rem' }}>
                                                        ({block.fields.map(f => f.label).join(' + ')})
                                                    </span>
                                                </div>
                                            ) : singleField && (
                                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.35rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
                                                        {singleField.isSystem && <span style={{ fontSize: '0.8rem' }}>🔒</span>}
                                                        <span style={{ fontWeight: '600', fontSize: '0.85rem', color: 'var(--foreground)' }}>{singleField.label}</span>
                                                        {singleField.locked && (
                                                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', background: '#eee', padding: '1px 5px', borderRadius: '3px', lineHeight: '1.4' }}>必須・固定</span>
                                                        )}
                                                        {singleField.isCustom && !singleField.templateType && (
                                                            <span style={{ fontSize: '0.65rem', color: '#1565c0', background: '#e3f2fd', padding: '1px 5px', borderRadius: '3px', lineHeight: '1.4' }}>カスタム</span>
                                                        )}
                                                        {singleField.templateType === 'phone' && (
                                                            <span style={{ fontSize: '0.65rem', color: 'var(--success)', background: 'rgba(46, 125, 50, 0.1)', padding: '1px 5px', borderRadius: '3px', lineHeight: '1.4' }}>テンプレート</span>
                                                        )}
                                                        {singleField.templateType === 'newsletter' && (
                                                            <span style={{ fontSize: '0.65rem', color: '#e65100', background: '#fff3e0', padding: '1px 5px', borderRadius: '3px', lineHeight: '1.4' }}>テンプレート</span>
                                                        )}
                                                        {singleField.required && !singleField.locked && (
                                                            <span style={{ fontSize: '0.65rem', color: '#fff', background: 'var(--primary)', padding: '1px 5px', borderRadius: '3px', lineHeight: '1.4' }}>必須</span>
                                                        )}
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--slate-500)' }}>
                                                            {fieldTypeLabel(singleField.type)}
                                                        </span>
                                                    </div>
                                                    {singleField.isCustom && (
                                                        <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
                                                            {singleField.templateType !== 'newsletter' && (
                                                                <button
                                                                    onClick={() => setEditingId(editingId === singleField.id ? null : singleField.id)}
                                                                    style={{
                                                                        border: '1px solid #ddd', background: editingId === singleField.id ? 'var(--secondary)' : 'var(--card-bg)',
                                                                        borderRadius: '4px', padding: '0.2rem 0.5rem', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--slate-600)',
                                                                    }}
                                                                >
                                                                    {editingId === singleField.id ? '閉じる' : '設定'}
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => removeField(singleField.id)}
                                                                style={{
                                                                    border: '1px solid #f5c6c6', background: 'var(--card-bg)',
                                                                    borderRadius: '4px', padding: '0.2rem 0.5rem', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--accent)',
                                                                }}
                                                            >
                                                                削除
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* 単独フィールドの編集パネル */}
                                        {singleField && singleField.templateType === 'phone' && editingId === singleField.id && (
                                            <div style={{
                                                padding: '0.75rem',
                                                borderTop: '1px solid var(--card-border)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '0.75rem',
                                            }}>
                                                <div style={{ fontSize: '0.85rem', color: 'var(--slate-600)', background: '#f5f5f5', padding: '0.6rem 0.85rem', borderRadius: '6px' }}>
                                                    <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>入力バリデーション</div>
                                                    <div style={{ color: 'var(--text-muted)' }}>半角数字のみ（ハイフンなし）で入力を受け付けます。</div>
                                                </div>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={singleField.required}
                                                        onChange={() => toggleRequired(singleField.id)}
                                                        style={{ accentColor: 'var(--primary)' }}
                                                    />
                                                    必須項目にする
                                                </label>
                                            </div>
                                        )}

                                        {singleField && singleField.isCustom && !singleField.templateType && editingId === singleField.id && (
                                            <div style={{
                                                padding: '0.75rem',
                                                borderTop: '1px solid var(--card-border)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '0.75rem',
                                            }}>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', marginBottom: '0.3rem' }}>ラベル</label>
                                                    <input
                                                        type="text"
                                                        className="input"
                                                        value={singleField.label}
                                                        onChange={(e) => updateFieldLabel(singleField.id, e.target.value)}
                                                        style={{ width: '100%', maxWidth: '300px' }}
                                                    />
                                                </div>
                                                {(singleField.type === 'text' || singleField.type === 'textarea') && (
                                                    <div>
                                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', marginBottom: '0.3rem' }}>プレースホルダー</label>
                                                        <input
                                                            type="text"
                                                            className="input"
                                                            value={singleField.placeholder || ''}
                                                            onChange={(e) => updateFieldPlaceholder(singleField.id, e.target.value)}
                                                            style={{ width: '100%', maxWidth: '300px' }}
                                                        />
                                                    </div>
                                                )}
                                                {(singleField.type === 'select' || singleField.type === 'checkbox') && (
                                                    <div>
                                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', marginBottom: '0.3rem' }}>選択肢</label>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxWidth: '350px' }}>
                                                            {(singleField.options || []).map((opt, i) => (
                                                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                                    <span style={{ fontSize: '0.8rem', color: 'var(--slate-500)', width: '1.5rem', textAlign: 'center', flexShrink: 0 }}>{i + 1}.</span>
                                                                    <input
                                                                        type="text"
                                                                        className="input"
                                                                        value={opt}
                                                                        onChange={(e) => {
                                                                            const newOptions = [...(singleField.options || [])];
                                                                            newOptions[i] = e.target.value;
                                                                            updateFieldOptions(singleField.id, newOptions);
                                                                        }}
                                                                        style={{ flex: 1, fontSize: '0.85rem', padding: '0.35rem 0.6rem' }}
                                                                        placeholder={`選択肢 ${i + 1}`}
                                                                    />
                                                                    <button
                                                                        onClick={() => {
                                                                            const newOptions = (singleField.options || []).filter((_, idx) => idx !== i);
                                                                            updateFieldOptions(singleField.id, newOptions);
                                                                        }}
                                                                        disabled={(singleField.options || []).length <= 1}
                                                                        style={{
                                                                            border: 'none', background: 'none', cursor: (singleField.options || []).length <= 1 ? 'default' : 'pointer',
                                                                            color: (singleField.options || []).length <= 1 ? '#ddd' : '#e53935', fontSize: '1rem', padding: '0 0.25rem',
                                                                            flexShrink: 0,
                                                                        }}
                                                                        title="削除"
                                                                    >×</button>
                                                                </div>
                                                            ))}
                                                            <button
                                                                onClick={() => updateFieldOptions(singleField.id, [...(singleField.options || []), ''])}
                                                                style={{
                                                                    border: '1px dashed #ccc', background: 'none', cursor: 'pointer',
                                                                    borderRadius: '4px', padding: '0.3rem 0.6rem', fontSize: '0.8rem', color: 'var(--text-muted)',
                                                                    marginTop: '0.15rem',
                                                                }}
                                                            >
                                                                + 選択肢を追加
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={singleField.required}
                                                        onChange={() => toggleRequired(singleField.id)}
                                                        style={{ accentColor: 'var(--primary)' }}
                                                    />
                                                    必須項目にする
                                                </label>
                                            </div>
                                        )}
                                    </div>
                                    </div>
                                );
                            });
                        })()}

                        {/* フィールド追加 */}
                        {addStep === 'hidden' && (
                            <button
                                onClick={() => setAddStep('template')}
                                style={{
                                    padding: '0.75rem',
                                    border: '2px dashed #ccc',
                                    borderRadius: '8px',
                                    background: 'none',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    color: 'var(--text-muted)',
                                    fontWeight: '500',
                                    transition: 'all 0.15s',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor = 'var(--primary)';
                                    e.currentTarget.style.color = 'var(--primary)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor = '#ccc';
                                    e.currentTarget.style.color = '#888';
                                }}
                            >
                                + フィールドを追加
                            </button>
                        )}

                        {/* テンプレート選択 */}
                        {addStep === 'template' && (
                            <div className="card" style={{ padding: '1.25rem', border: '2px solid var(--primary)' }}>
                                <h4 style={{ fontSize: '0.95rem', fontWeight: 'bold', marginBottom: '0.75rem' }}>追加するフィールドを選択</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {/* 電話番号テンプレート */}
                                    <button
                                        onClick={() => addFromTemplate('phone')}
                                        disabled={fields.some(f => f.id === 'customer_phone')}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '0.75rem',
                                            padding: '0.85rem 1rem', border: '1px solid #e0e0e0', borderRadius: '8px',
                                            background: fields.some(f => f.id === 'customer_phone') ? 'var(--secondary)' : 'var(--card-bg)',
                                            cursor: fields.some(f => f.id === 'customer_phone') ? 'not-allowed' : 'pointer',
                                            textAlign: 'left', width: '100%', transition: 'border-color 0.15s',
                                            opacity: fields.some(f => f.id === 'customer_phone') ? 0.5 : 1,
                                        }}
                                        onMouseEnter={(e) => {
                                            if (!fields.some(f => f.id === 'customer_phone')) e.currentTarget.style.borderColor = 'var(--primary)';
                                        }}
                                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e0e0e0'; }}
                                    >
                                        <span style={{ fontSize: '1.3rem' }}>📞</span>
                                        <div>
                                            <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>電話番号</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                {fields.some(f => f.id === 'customer_phone') ? '追加済み' : 'テキスト入力 — 任意項目として追加'}
                                            </div>
                                        </div>
                                    </button>

                                    {/* お知らせ受取テンプレート */}
                                    <button
                                        onClick={() => addFromTemplate('newsletter')}
                                        disabled={fields.some(f => f.templateType === 'newsletter')}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '0.75rem',
                                            padding: '0.85rem 1rem', border: '1px solid #e0e0e0', borderRadius: '8px',
                                            background: fields.some(f => f.templateType === 'newsletter') ? 'var(--secondary)' : 'var(--card-bg)',
                                            cursor: fields.some(f => f.templateType === 'newsletter') ? 'not-allowed' : 'pointer',
                                            textAlign: 'left', width: '100%', transition: 'border-color 0.15s',
                                            opacity: fields.some(f => f.templateType === 'newsletter') ? 0.5 : 1,
                                        }}
                                        onMouseEnter={(e) => {
                                            if (!fields.some(f => f.templateType === 'newsletter')) e.currentTarget.style.borderColor = 'var(--primary)';
                                        }}
                                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e0e0e0'; }}
                                    >
                                        <span style={{ fontSize: '1.3rem' }}>📬</span>
                                        <div>
                                            <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>公演お知らせ受取</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                {fields.some(f => f.templateType === 'newsletter') ? '追加済み' : 'チェックボックス —「次回以降の公演のお知らせを受け取る」'}
                                            </div>
                                        </div>
                                    </button>

                                    {/* 自由設定 */}
                                    <button
                                        onClick={() => {
                                            setAddForm({ label: '', type: 'text', required: false, placeholder: '', options: [''] });
                                            setAddStep('custom');
                                        }}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '0.75rem',
                                            padding: '0.85rem 1rem', border: '1px solid #e0e0e0', borderRadius: '8px',
                                            background: 'var(--card-bg)', cursor: 'pointer', textAlign: 'left', width: '100%',
                                            transition: 'border-color 0.15s',
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e0e0e0'; }}
                                    >
                                        <span style={{ fontSize: '1.3rem' }}>✏️</span>
                                        <div>
                                            <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>自由に質問を設定</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ラベル・タイプ・プレースホルダーを自由に設定</div>
                                        </div>
                                    </button>
                                </div>
                                <div style={{ marginTop: '0.75rem' }}>
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => setAddStep('hidden')}
                                        style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}
                                    >
                                        キャンセル
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* 自由設定フォーム */}
                        {addStep === 'custom' && (
                            <div className="card" style={{ padding: '1.25rem', border: '2px solid var(--primary)' }}>
                                <h4 style={{ fontSize: '0.95rem', fontWeight: 'bold', marginBottom: '1rem' }}>自由に質問を設定</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', marginBottom: '0.3rem' }}>ラベル</label>
                                        <input
                                            type="text"
                                            className="input"
                                            placeholder="例: 同行者名"
                                            value={addForm.label}
                                            onChange={(e) => setAddForm(prev => ({ ...prev, label: e.target.value }))}
                                            style={{ width: '100%', maxWidth: '300px' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', marginBottom: '0.3rem' }}>フィールドタイプ</label>
                                        <select
                                            className="input"
                                            value={addForm.type}
                                            onChange={(e) => {
                                                const type = e.target.value as AddFieldForm['type'];
                                                setAddForm(prev => ({
                                                    ...prev,
                                                    type,
                                                    options: (type === 'select' || type === 'checkbox') ? (prev.options.length > 0 ? prev.options : ['']) : prev.options,
                                                }));
                                            }}
                                            style={{ maxWidth: '200px' }}
                                        >
                                            <option value="text">テキスト</option>
                                            <option value="textarea">テキストエリア</option>
                                            <option value="select">セレクトボックス</option>
                                            <option value="checkbox">チェックボックス</option>
                                        </select>
                                    </div>
                                    {(addForm.type === 'text' || addForm.type === 'textarea') && (
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', marginBottom: '0.3rem' }}>プレースホルダー</label>
                                            <input
                                                type="text"
                                                className="input"
                                                placeholder="入力例を記載"
                                                value={addForm.placeholder}
                                                onChange={(e) => setAddForm(prev => ({ ...prev, placeholder: e.target.value }))}
                                                style={{ width: '100%', maxWidth: '300px' }}
                                            />
                                        </div>
                                    )}
                                    {(addForm.type === 'select' || addForm.type === 'checkbox') && (
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', marginBottom: '0.3rem' }}>選択肢</label>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxWidth: '350px' }}>
                                                {addForm.options.map((opt, i) => (
                                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                        <span style={{ fontSize: '0.8rem', color: 'var(--slate-500)', width: '1.5rem', textAlign: 'center', flexShrink: 0 }}>{i + 1}.</span>
                                                        <input
                                                            type="text"
                                                            className="input"
                                                            value={opt}
                                                            onChange={(e) => updateOption(i, e.target.value)}
                                                            style={{ flex: 1, fontSize: '0.85rem', padding: '0.35rem 0.6rem' }}
                                                            placeholder={`選択肢 ${i + 1}`}
                                                        />
                                                        <button
                                                            onClick={() => removeOption(i)}
                                                            disabled={addForm.options.length <= 1}
                                                            style={{
                                                                border: 'none', background: 'none', cursor: addForm.options.length <= 1 ? 'default' : 'pointer',
                                                                color: addForm.options.length <= 1 ? '#ddd' : '#e53935', fontSize: '1rem', padding: '0 0.25rem',
                                                                flexShrink: 0,
                                                            }}
                                                            title="削除"
                                                        >×</button>
                                                    </div>
                                                ))}
                                                <button
                                                    onClick={addOption}
                                                    style={{
                                                        border: '1px dashed #ccc', background: 'none', cursor: 'pointer',
                                                        borderRadius: '4px', padding: '0.3rem 0.6rem', fontSize: '0.8rem', color: 'var(--text-muted)',
                                                        marginTop: '0.15rem',
                                                    }}
                                                >
                                                    + 選択肢を追加
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                                        <input
                                            type="checkbox"
                                            checked={addForm.required}
                                            onChange={(e) => setAddForm(prev => ({ ...prev, required: e.target.checked }))}
                                            style={{ accentColor: 'var(--primary)' }}
                                        />
                                        必須項目にする
                                    </label>
                                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                                        <button
                                            className="btn btn-primary"
                                            onClick={addCustomField}
                                            disabled={!addForm.label.trim() || ((addForm.type === 'select' || addForm.type === 'checkbox') && addForm.options.filter(o => o.trim()).length === 0)}
                                            style={{ padding: '0.5rem 1.25rem', fontSize: '0.9rem' }}
                                        >
                                            追加する
                                        </button>
                                        <button
                                            className="btn btn-secondary"
                                            onClick={() => {
                                                setAddStep('hidden');
                                                setAddForm({ label: '', type: 'text', required: false, placeholder: '', options: [''] });
                                            }}
                                            style={{ padding: '0.5rem 1.25rem', fontSize: '0.9rem' }}
                                        >
                                            キャンセル
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 保存ボタン */}
                    <div style={{ marginTop: '1.5rem' }}>
                        <button
                            className="btn btn-primary"
                            disabled={isSaving}
                            onClick={handleSave}
                            style={{
                                padding: '0.75rem 2rem',
                                fontSize: '1rem',
                                borderRadius: '8px',
                            }}
                        >
                            {isSaving ? '確定中...' : saveSuccess ? '✓ 確定しました' : '確定する'}
                        </button>
                    </div>
                </div>

                {/* 右カラム: プレビュー（実際の予約フォームと同じ表示） */}
                <div className="form-editor-preview" style={{ position: 'sticky', top: '1rem' }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        marginBottom: '0.75rem', paddingBottom: '0.5rem',
                        borderBottom: '1px solid #e5e7eb',
                    }}>
                        <span style={{ fontSize: '1rem' }}>👁</span>
                        <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--foreground)', margin: 0 }}>プレビュー</h3>
                        <span style={{ fontSize: '0.75rem', color: 'var(--slate-500)', marginLeft: 'auto' }}>実際の表示</span>
                    </div>
                    <div className="card" style={{
                        padding: 0,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                        overflow: 'hidden',
                    }}>
                        <div style={{
                            padding: '1rem 1.25rem',
                            borderBottom: '1px solid var(--card-border)',
                            background: 'var(--secondary)',
                            textAlign: 'center',
                        }}>
                            <div style={{ fontSize: '0.65rem', color: 'var(--slate-500)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                                TICKET RESERVATION
                            </div>
                            <div style={{ fontWeight: 'bold', fontSize: '1rem', color: 'var(--foreground)' }}>
                                {production.title}
                            </div>
                            <div style={{ width: '40px', height: '2px', background: 'var(--primary)', margin: '0.5rem auto 0' }} />
                        </div>

                        {/* プレビュー本体 */}
                        <div style={{ padding: '1.25rem' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--primary)', marginBottom: '1.25rem' }}>
                                チケット予約フォーム
                            </h3>

                            {fields.filter(f => f.enabled).map((field) => {
                                // お名前 + ふりがな（セット表示）
                                if (field.id === 'customer_name') {
                                    return (
                                        <div key={field.id} className="form-group" style={{ marginBottom: '1.25rem' }}>
                                            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 'bold', fontSize: '0.85rem' }}>
                                                お名前 <span style={{ color: 'var(--primary)', fontSize: '0.75rem' }}>（必須）</span>
                                            </label>
                                            <input type="text" className="input" disabled placeholder="例: 山田 太郎" style={{ width: '100%', fontSize: '0.85rem', background: 'var(--card-bg)', marginBottom: '0.4rem' }} />
                                            <input type="text" className="input" disabled placeholder="ふりがな (例: やまだ たろう)" style={{ width: '100%', fontSize: '0.8rem', background: 'var(--card-bg)' }} />
                                        </div>
                                    );
                                }
                                // ふりがなはcustomer_nameで一緒に描画済み
                                if (field.id === 'customer_kana') return null;

                                // メールアドレス
                                if (field.id === 'customer_email') {
                                    return (
                                        <div key={field.id} className="form-group" style={{ marginBottom: '1.25rem' }}>
                                            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 'bold', fontSize: '0.85rem' }}>
                                                メールアドレス <span style={{ color: 'var(--primary)', fontSize: '0.75rem' }}>（必須）</span>
                                            </label>
                                            <input type="email" className="input" disabled placeholder="例: example@mail.com" style={{ width: '100%', fontSize: '0.85rem', background: 'var(--card-bg)' }} />
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                                ※予約完了メールが送信されますので、正確に入力してください。
                                            </div>
                                        </div>
                                    );
                                }

                                // 観劇日時 + 券種選択（セットで表示）
                                if (field.id === 'performance_select') {
                                    return (
                                        <div key={field.id}>
                                            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                                                <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 'bold', fontSize: '0.85rem' }}>
                                                    観劇日時 <span style={{ color: 'var(--primary)', fontSize: '0.75rem' }}>（必須）</span>
                                                </label>
                                                <select className="input" disabled style={{ width: '100%', fontSize: '0.85rem', background: 'var(--card-bg)' }}>
                                                    <option>日時を選択してください</option>
                                                </select>
                                            </div>
                                            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                                                <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 'bold', fontSize: '0.85rem' }}>
                                                    券種・枚数 <span style={{ color: 'var(--primary)', fontSize: '0.75rem' }}>（必須: 合計1枚以上）</span>
                                                </label>
                                                <div style={{
                                                    padding: '0.75rem',
                                                    border: '1px solid var(--card-border, #dee2e6)',
                                                    borderRadius: '8px',
                                                    background: 'var(--card-bg)',
                                                }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0' }}>
                                                        <div>
                                                            <div style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>一般</div>
                                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>¥3,000</div>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                            <input type="number" className="input" disabled value="0" style={{ width: '55px', textAlign: 'right', fontSize: '0.85rem', marginBottom: 0, padding: '0.3rem 0.5rem' }} />
                                                            <span style={{ fontSize: '0.8rem' }}>枚</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }
                                // ticket_selectはperformance_selectで一緒に描画済み
                                if (field.id === 'ticket_select') return null;

                                // 備考
                                if (field.id === 'remarks') {
                                    return (
                                        <div key={field.id} className="form-group" style={{ marginBottom: '1.25rem' }}>
                                            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 'bold', fontSize: '0.85rem' }}>
                                                備考 <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>（任意）</span>
                                            </label>
                                            <textarea className="input" disabled rows={2} placeholder="車椅子でのご来場など、伝えたいことがあればご記入ください。" style={{ width: '100%', fontSize: '0.85rem', resize: 'none', background: 'var(--card-bg)' }} />
                                        </div>
                                    );
                                }

                                // カスタムフィールド
                                const reqLabel = field.required
                                    ? <span style={{ color: 'var(--primary)', fontSize: '0.75rem' }}>（必須）</span>
                                    : <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>（任意）</span>;

                                if (field.templateType === 'phone') {
                                    return (
                                        <div key={field.id} className="form-group" style={{ marginBottom: '1.25rem' }}>
                                            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 'bold', fontSize: '0.85rem' }}>
                                                {field.label} {reqLabel}
                                            </label>
                                            <input type="tel" className="input" disabled placeholder={field.placeholder || '09012345678'} style={{ width: '100%', fontSize: '0.85rem', background: 'var(--card-bg)' }} />
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                                ※半角数字のみ・ハイフンなしで入力してください
                                            </div>
                                        </div>
                                    );
                                }

                                if (field.type === 'checkbox') {
                                    if (field.options && field.options.length > 0) {
                                        return (
                                            <div key={field.id} className="form-group" style={{ marginBottom: '1.25rem' }}>
                                                <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 'bold', fontSize: '0.85rem' }}>
                                                    {field.label} {reqLabel}
                                                </label>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                                    {field.options.map((opt, i) => (
                                                        <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                                                            <input type="checkbox" disabled style={{ accentColor: 'var(--primary)', width: '16px', height: '16px' }} />
                                                            {opt}
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    }
                                    return (
                                        <div key={field.id} className="form-group" style={{ marginBottom: '1.25rem' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '500' }}>
                                                <input type="checkbox" disabled style={{ accentColor: 'var(--primary)', width: '16px', height: '16px' }} />
                                                {field.label}
                                            </label>
                                        </div>
                                    );
                                }

                                if (field.type === 'select') {
                                    return (
                                        <div key={field.id} className="form-group" style={{ marginBottom: '1.25rem' }}>
                                            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 'bold', fontSize: '0.85rem' }}>
                                                {field.label} {reqLabel}
                                            </label>
                                            <select className="input" disabled style={{ width: '100%', fontSize: '0.85rem', background: 'var(--card-bg)' }}>
                                                <option>選択してください</option>
                                                {field.options?.map((opt, i) => <option key={i}>{opt}</option>)}
                                            </select>
                                        </div>
                                    );
                                }

                                if (field.type === 'textarea') {
                                    return (
                                        <div key={field.id} className="form-group" style={{ marginBottom: '1.25rem' }}>
                                            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 'bold', fontSize: '0.85rem' }}>
                                                {field.label} {reqLabel}
                                            </label>
                                            <textarea className="input" disabled rows={2} placeholder={field.placeholder || ''} style={{ width: '100%', fontSize: '0.85rem', resize: 'none', background: 'var(--card-bg)' }} />
                                        </div>
                                    );
                                }

                                // text (default)
                                return (
                                    <div key={field.id} className="form-group" style={{ marginBottom: '1.25rem' }}>
                                        <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 'bold', fontSize: '0.85rem' }}>
                                            {field.label} {reqLabel}
                                        </label>
                                        <input type="text" className="input" disabled placeholder={field.placeholder || ''} style={{ width: '100%', fontSize: '0.85rem', background: 'var(--card-bg)' }} />
                                    </div>
                                );
                            })}

                            {/* 送信ボタン（プレビュー） */}
                            <div style={{ marginTop: '0.5rem' }}>
                                <button
                                    disabled
                                    className="btn btn-primary"
                                    style={{
                                        width: '100%',
                                        padding: '0.9rem',
                                        fontWeight: 'bold',
                                        fontSize: '1rem',
                                        opacity: 0.7,
                                    }}
                                >
                                    予約する
                                </button>
                                <p style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
                                    ※「予約する」を押すと確認画面へ進みます。
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
