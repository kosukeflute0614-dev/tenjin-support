'use client';

import { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { serializeDoc } from '@/lib/firestore-utils';
import { Production, FormFieldConfig } from '@/types';
import Breadcrumb from '@/components/Breadcrumb';
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

    // ブロック単位で移動する
    const moveBlock = useCallback((blockLeaderId: string, direction: -1 | 1) => {
        setFields(prev => {
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
        setFields(prev => prev.map(f =>
            f.id === fieldId ? { ...f, label } : f
        ));
    };

    const updateFieldPlaceholder = (fieldId: string, placeholder: string) => {
        setFields(prev => prev.map(f =>
            f.id === fieldId ? { ...f, placeholder } : f
        ));
    };

    const toggleRequired = (fieldId: string) => {
        setFields(prev => prev.map(f =>
            f.id === fieldId && !f.locked ? { ...f, required: !f.required } : f
        ));
    };

    const removeField = (fieldId: string) => {
        setFields(prev => prev.filter(f => f.id !== fieldId));
        setEditingId(null);
    };

    const updateFieldOptions = (fieldId: string, options: string[]) => {
        setFields(prev => prev.map(f =>
            f.id === fieldId ? { ...f, options } : f
        ));
    };

    const addFromTemplate = (templateKey: 'phone' | 'newsletter') => {
        if (templateKey === 'phone') {
            const exists = fields.some(f => f.id === 'customer_phone');
            if (exists) return;
            setFields(prev => [...prev, {
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
            setFields(prev => [...prev, {
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
        setFields(prev => [...prev, newField]);
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

        setFields(prev => {
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

    const enabledFields = fields.filter(f => f.enabled);

    const fieldTypeLabel = (type: string) => {
        switch (type) {
            case 'text': return 'テキスト';
            case 'textarea': return 'テキストエリア';
            case 'select': return 'セレクトボックス';
            case 'checkbox': return 'チェックボックス';
            default: return type;
        }
    };

    const renderPreviewField = (field: FormField) => {
        if (field.isSystem) {
            if (field.id === 'performance_select') {
                return (
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.3rem' }}>
                            観劇日時 <span style={{ color: 'var(--accent)', fontSize: '0.75rem' }}>*必須</span>
                        </label>
                        <select className="input" disabled style={{ width: '100%', fontSize: '0.85rem', background: '#fff' }}>
                            <option>公演日時を選択してください</option>
                        </select>
                    </div>
                );
            }
            if (field.id === 'ticket_select') {
                return (
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.3rem' }}>
                            券種・枚数 <span style={{ color: 'var(--accent)', fontSize: '0.75rem' }}>*必須</span>
                        </label>
                        <div style={{
                            border: '1px solid #ddd',
                            borderRadius: '6px',
                            padding: '0.5rem 0.75rem',
                            fontSize: '0.8rem',
                            color: '#999',
                            background: '#fff',
                        }}>
                            券種 × 枚数
                        </div>
                    </div>
                );
            }
        }

        return (
            <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.3rem' }}>
                    {field.label}
                    {field.required && <span style={{ color: 'var(--accent)', fontSize: '0.75rem', marginLeft: '0.25rem' }}>*必須</span>}
                </label>
                {field.type === 'text' && (
                    <>
                        <input
                            type="text"
                            className="input"
                            disabled
                            placeholder={field.placeholder}
                            style={{ width: '100%', fontSize: '0.85rem', background: '#fff' }}
                            inputMode={field.templateType === 'phone' ? 'numeric' : undefined}
                            pattern={field.templateType === 'phone' ? '[0-9]*' : undefined}
                        />
                        {field.templateType === 'phone' && (
                            <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '0.2rem' }}>※ 半角数字のみ・ハイフンなしで入力</div>
                        )}
                    </>
                )}
                {field.type === 'textarea' && (
                    <textarea className="input" disabled rows={2} placeholder={field.placeholder} style={{ width: '100%', fontSize: '0.85rem', resize: 'none', background: '#fff' }} />
                )}
                {field.type === 'select' && (
                    <select className="input" disabled style={{ width: '100%', fontSize: '0.85rem', background: '#fff' }}>
                        <option>選択してください</option>
                        {field.options?.map((opt, i) => <option key={i}>{opt}</option>)}
                    </select>
                )}
                {field.type === 'checkbox' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        {field.options && field.options.length > 0 ? field.options.map((opt, i) => (
                            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: '#666' }}>
                                <input type="checkbox" disabled style={{ accentColor: 'var(--primary)' }} />
                                {opt}
                            </label>
                        )) : (
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: '#666' }}>
                                <input type="checkbox" disabled style={{ accentColor: 'var(--primary)' }} />
                                {field.label}
                            </label>
                        )}
                    </div>
                )}
            </div>
        );
    };

    const dragHandleStyle: React.CSSProperties = {
        cursor: 'grab',
        padding: '0.25rem',
        color: '#aaa',
        fontSize: '1.1rem',
        userSelect: 'none',
        display: 'flex',
        alignItems: 'center',
        lineHeight: 1,
    };

    return (
        <div className="container" style={{ maxWidth: '1200px' }}>
            <Breadcrumb items={[
                { label: 'ダッシュボード', href: '/dashboard' },
                { label: production.title, href: `/productions/${id}` },
                { label: 'フォーム編集' }
            ]} />
            <div style={{ marginBottom: '1.25rem' }}>
                <Link href="/dashboard" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', borderRadius: '8px', fontSize: '0.9rem' }}>
                    <span>&larr;</span> ダッシュボードに戻る
                </Link>
            </div>
            <div style={{ marginBottom: '2rem' }}>
                <h2 className="heading-lg" style={{ marginBottom: '0.5rem' }}>📝 {production.title} — 予約フォーム編集</h2>
                <p className="text-muted" style={{ fontSize: '0.9rem' }}>予約フォームに表示する項目を設定できます。ドラッグで並び替えが可能です。</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem', alignItems: 'start' }}>
                {/* 左カラム: フィールド設定 */}
                <div>
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

                                return (
                                    <div
                                        key={block.leaderId}
                                        draggable
                                        onDragStart={() => handleDragStart(block.leaderId)}
                                        onDragOver={(e) => handleDragOver(e, block.leaderId)}
                                        onDragEnd={handleDragEnd}
                                        className="card"
                                        style={{
                                            padding: isMultiBlock ? '0' : '0.85rem 1rem',
                                            background: isDragging ? '#f0f4ff' : undefined,
                                            border: isDragging ? '2px dashed var(--primary)' : undefined,
                                            opacity: isDragging ? 0.7 : 1,
                                            transition: 'background 0.15s, opacity 0.15s',
                                            overflow: 'hidden',
                                        }}
                                    >
                                        {/* ブロックヘッダー（複数フィールドブロック） */}
                                        {isMultiBlock && blockLabel && (
                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: '0.6rem',
                                                padding: '0.6rem 1rem',
                                                background: '#fafafa', borderBottom: '1px solid #eee',
                                            }}>
                                                <span style={dragHandleStyle} title="ドラッグで並び替え">⠿</span>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                                    <button
                                                        onClick={() => moveBlock(block.leaderId, -1)}
                                                        disabled={isFirst}
                                                        style={{
                                                            border: 'none', background: 'none', cursor: isFirst ? 'default' : 'pointer',
                                                            padding: '0', fontSize: '0.7rem', color: isFirst ? '#ddd' : '#888', lineHeight: 1,
                                                        }}
                                                        title="上に移動"
                                                    >▲</button>
                                                    <button
                                                        onClick={() => moveBlock(block.leaderId, 1)}
                                                        disabled={isLast}
                                                        style={{
                                                            border: 'none', background: 'none', cursor: isLast ? 'default' : 'pointer',
                                                            padding: '0', fontSize: '0.7rem', color: isLast ? '#ddd' : '#888', lineHeight: 1,
                                                        }}
                                                        title="下に移動"
                                                    >▼</button>
                                                </div>
                                                <span style={{ fontWeight: '600', fontSize: '0.85rem', color: '#666' }}>🔗 {blockLabel}</span>
                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: '#f0f0f0', padding: '1px 6px', borderRadius: '3px' }}>セット項目</span>
                                            </div>
                                        )}

                                        {/* 各フィールド */}
                                        {block.fields.map((field, fieldIndexInBlock) => (
                                            <div key={field.id} style={{
                                                padding: '0.85rem 1rem',
                                                ...(isMultiBlock && fieldIndexInBlock > 0 ? { borderTop: '1px dashed #e8e8e8' } : {}),
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                                    {/* 単独フィールドの場合のみドラッグハンドル・上下ボタン */}
                                                    {!isMultiBlock && (
                                                        <>
                                                            <span style={dragHandleStyle} title="ドラッグで並び替え">⠿</span>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                                                <button
                                                                    onClick={() => moveBlock(block.leaderId, -1)}
                                                                    disabled={isFirst}
                                                                    style={{
                                                                        border: 'none', background: 'none', cursor: isFirst ? 'default' : 'pointer',
                                                                        padding: '0', fontSize: '0.7rem', color: isFirst ? '#ddd' : '#888', lineHeight: 1,
                                                                    }}
                                                                    title="上に移動"
                                                                >▲</button>
                                                                <button
                                                                    onClick={() => moveBlock(block.leaderId, 1)}
                                                                    disabled={isLast}
                                                                    style={{
                                                                        border: 'none', background: 'none', cursor: isLast ? 'default' : 'pointer',
                                                                        padding: '0', fontSize: '0.7rem', color: isLast ? '#ddd' : '#888', lineHeight: 1,
                                                                    }}
                                                                    title="下に移動"
                                                                >▼</button>
                                                            </div>
                                                        </>
                                                    )}
                                                    {/* ブロック内のインデント */}
                                                    {isMultiBlock && <div style={{ width: '0.5rem' }} />}

                                                    {/* ラベル */}
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                            {field.isSystem && <span style={{ fontSize: '0.85rem' }}>🔒</span>}
                                                            <span style={{ fontWeight: '600', fontSize: '0.95rem' }}>{field.label}</span>
                                                            {field.locked && !isMultiBlock && (
                                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: '#f0f0f0', padding: '1px 6px', borderRadius: '3px' }}>必須・固定</span>
                                                            )}
                                                            {field.locked && isMultiBlock && (
                                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: '#f0f0f0', padding: '1px 6px', borderRadius: '3px' }}>固定</span>
                                                            )}
                                                            {field.isCustom && !field.templateType && (
                                                                <span style={{ fontSize: '0.7rem', color: '#1565c0', background: '#e3f2fd', padding: '1px 6px', borderRadius: '3px' }}>カスタム</span>
                                                            )}
                                                            {field.templateType === 'phone' && (
                                                                <span style={{ fontSize: '0.7rem', color: '#2e7d32', background: '#e8f5e9', padding: '1px 6px', borderRadius: '3px' }}>テンプレート</span>
                                                            )}
                                                            {field.templateType === 'newsletter' && (
                                                                <span style={{ fontSize: '0.7rem', color: '#e65100', background: '#fff3e0', padding: '1px 6px', borderRadius: '3px' }}>テンプレート</span>
                                                            )}
                                                            {field.required && !field.locked && (
                                                                <span style={{ fontSize: '0.7rem', color: '#fff', background: 'var(--primary)', padding: '1px 6px', borderRadius: '3px' }}>必須</span>
                                                            )}
                                                        </div>
                                                        {field.isSystem && (
                                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>常に表示（変更不可）</div>
                                                        )}
                                                        {!field.isSystem && !field.templateType && (
                                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                                {fieldTypeLabel(field.type)}
                                                                {field.placeholder && ` — ${field.placeholder}`}
                                                            </div>
                                                        )}
                                                        {field.templateType === 'phone' && (
                                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                                テキスト — 半角数字のみ（ハイフンなし）
                                                            </div>
                                                        )}
                                                        {field.templateType === 'newsletter' && (
                                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                                チェックボックス — 常に任意項目
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* カスタムフィールド・テンプレートフィールドのボタン */}
                                                    {field.isCustom && (
                                                        <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                                                            {field.templateType !== 'newsletter' && (
                                                                <button
                                                                    onClick={() => setEditingId(editingId === field.id ? null : field.id)}
                                                                    style={{
                                                                        border: '1px solid #ddd',
                                                                        background: editingId === field.id ? '#f0f0f0' : '#fff',
                                                                        borderRadius: '6px',
                                                                        padding: '0.3rem 0.6rem',
                                                                        cursor: 'pointer',
                                                                        fontSize: '0.8rem',
                                                                        color: '#555',
                                                                    }}
                                                                >
                                                                    {editingId === field.id ? '閉じる' : '設定'}
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => removeField(field.id)}
                                                                style={{
                                                                    border: '1px solid #f5c6c6',
                                                                    background: '#fff',
                                                                    borderRadius: '6px',
                                                                    padding: '0.3rem 0.6rem',
                                                                    cursor: 'pointer',
                                                                    fontSize: '0.8rem',
                                                                    color: 'var(--accent)',
                                                                }}
                                                            >
                                                                削除
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* 電話番号テンプレートの編集パネル */}
                                                {field.templateType === 'phone' && editingId === field.id && (
                                                    <div style={{
                                                        marginTop: '1rem',
                                                        paddingTop: '1rem',
                                                        borderTop: '1px solid #eee',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '0.75rem',
                                                    }}>
                                                        <div style={{ fontSize: '0.85rem', color: '#555', background: '#f5f5f5', padding: '0.6rem 0.85rem', borderRadius: '6px' }}>
                                                            <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>入力バリデーション</div>
                                                            <div style={{ color: '#888' }}>半角数字のみ（ハイフンなし）で入力を受け付けます。</div>
                                                        </div>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={field.required}
                                                                onChange={() => toggleRequired(field.id)}
                                                                style={{ accentColor: 'var(--primary)' }}
                                                            />
                                                            必須項目にする
                                                        </label>
                                                    </div>
                                                )}

                                                {/* カスタムフィールドの編集パネル（テンプレート以外） */}
                                                {field.isCustom && !field.templateType && editingId === field.id && (
                                                    <div style={{
                                                        marginTop: '1rem',
                                                        paddingTop: '1rem',
                                                        borderTop: '1px solid #eee',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '0.75rem',
                                                    }}>
                                                        <div>
                                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', marginBottom: '0.3rem' }}>ラベル</label>
                                                            <input
                                                                type="text"
                                                                className="input"
                                                                value={field.label}
                                                                onChange={(e) => updateFieldLabel(field.id, e.target.value)}
                                                                style={{ width: '100%', maxWidth: '300px' }}
                                                            />
                                                        </div>
                                                        {(field.type === 'text' || field.type === 'textarea') && (
                                                            <div>
                                                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', marginBottom: '0.3rem' }}>プレースホルダー</label>
                                                                <input
                                                                    type="text"
                                                                    className="input"
                                                                    value={field.placeholder || ''}
                                                                    onChange={(e) => updateFieldPlaceholder(field.id, e.target.value)}
                                                                    style={{ width: '100%', maxWidth: '300px' }}
                                                                />
                                                            </div>
                                                        )}
                                                        {(field.type === 'select' || field.type === 'checkbox') && (
                                                            <div>
                                                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', marginBottom: '0.3rem' }}>選択肢</label>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxWidth: '350px' }}>
                                                                    {(field.options || []).map((opt, i) => (
                                                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                                            <span style={{ fontSize: '0.8rem', color: '#aaa', width: '1.5rem', textAlign: 'center', flexShrink: 0 }}>{i + 1}.</span>
                                                                            <input
                                                                                type="text"
                                                                                className="input"
                                                                                value={opt}
                                                                                onChange={(e) => {
                                                                                    const newOptions = [...(field.options || [])];
                                                                                    newOptions[i] = e.target.value;
                                                                                    updateFieldOptions(field.id, newOptions);
                                                                                }}
                                                                                style={{ flex: 1, fontSize: '0.85rem', padding: '0.35rem 0.6rem' }}
                                                                                placeholder={`選択肢 ${i + 1}`}
                                                                            />
                                                                            <button
                                                                                onClick={() => {
                                                                                    const newOptions = (field.options || []).filter((_, idx) => idx !== i);
                                                                                    updateFieldOptions(field.id, newOptions);
                                                                                }}
                                                                                disabled={(field.options || []).length <= 1}
                                                                                style={{
                                                                                    border: 'none', background: 'none', cursor: (field.options || []).length <= 1 ? 'default' : 'pointer',
                                                                                    color: (field.options || []).length <= 1 ? '#ddd' : '#e53935', fontSize: '1rem', padding: '0 0.25rem',
                                                                                    flexShrink: 0,
                                                                                }}
                                                                                title="削除"
                                                                            >×</button>
                                                                        </div>
                                                                    ))}
                                                                    <button
                                                                        onClick={() => updateFieldOptions(field.id, [...(field.options || []), ''])}
                                                                        style={{
                                                                            border: '1px dashed #ccc', background: 'none', cursor: 'pointer',
                                                                            borderRadius: '4px', padding: '0.3rem 0.6rem', fontSize: '0.8rem', color: '#888',
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
                                                                checked={field.required}
                                                                onChange={() => toggleRequired(field.id)}
                                                                style={{ accentColor: 'var(--primary)' }}
                                                            />
                                                            必須項目にする
                                                        </label>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
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
                                    color: '#888',
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
                                            background: fields.some(f => f.id === 'customer_phone') ? '#f5f5f5' : '#fff',
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
                                            <div style={{ fontSize: '0.8rem', color: '#888' }}>
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
                                            background: fields.some(f => f.templateType === 'newsletter') ? '#f5f5f5' : '#fff',
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
                                            <div style={{ fontSize: '0.8rem', color: '#888' }}>
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
                                            background: '#fff', cursor: 'pointer', textAlign: 'left', width: '100%',
                                            transition: 'border-color 0.15s',
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e0e0e0'; }}
                                    >
                                        <span style={{ fontSize: '1.3rem' }}>✏️</span>
                                        <div>
                                            <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>自由に質問を設定</div>
                                            <div style={{ fontSize: '0.8rem', color: '#888' }}>ラベル・タイプ・プレースホルダーを自由に設定</div>
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
                                                        <span style={{ fontSize: '0.8rem', color: '#aaa', width: '1.5rem', textAlign: 'center', flexShrink: 0 }}>{i + 1}.</span>
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
                                                        borderRadius: '4px', padding: '0.3rem 0.6rem', fontSize: '0.8rem', color: '#888',
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
                            {isSaving ? '保存中...' : saveSuccess ? '✓ 保存しました' : '保存する'}
                        </button>
                    </div>
                </div>

                {/* 右カラム: プレビュー */}
                <div style={{ position: 'sticky', top: '1rem' }}>
                    <div style={{
                        background: '#f8f9fa',
                        borderRadius: '12px',
                        border: '1px solid #e0e0e0',
                        overflow: 'hidden',
                    }}>
                        <div style={{
                            background: 'var(--primary)',
                            color: '#fff',
                            padding: '0.75rem 1rem',
                            fontSize: '0.85rem',
                            fontWeight: '600',
                        }}>
                            プレビュー
                        </div>
                        <div style={{ padding: '1.25rem' }}>
                            {enabledFields.map((field) => (
                                <div key={field.id}>
                                    {renderPreviewField(field)}
                                </div>
                            ))}

                            {/* 送信ボタン（プレビュー） */}
                            <button
                                disabled
                                style={{
                                    width: '100%',
                                    padding: '0.6rem',
                                    background: 'var(--primary)',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '0.9rem',
                                    fontWeight: '600',
                                    opacity: 0.7,
                                    marginTop: '0.5rem',
                                }}
                            >
                                予約を確定する
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
