'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import {
    TEMPLATE_VARIABLES,
    getVariableLabel,
    getVariableIcon,
    createChipElement,
    textToHtml,
    textToInlineHtml,
    htmlToText,
    htmlToInlineText,
} from '@/lib/template-editor-utils';
import ConfirmModal from '@/components/ConfirmModal';

import type { EmailTemplateData } from '@/types';
export type { EmailTemplateData } from '@/types';

interface EmailTemplateEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: EmailTemplateData) => void;
    onReset?: () => void;
    title: string;
    icon: string;
    template: EmailTemplateData;
    showTiming?: boolean;
    timingOptions?: { value: string; label: string }[];
}

export default function EmailTemplateEditModal({
    isOpen,
    onClose,
    onSave,
    onReset,
    title,
    icon,
    template,
    showTiming = false,
    timingOptions,
}: EmailTemplateEditModalProps) {
    const [timing, setTiming] = useState(template.timing || '');
    const [activeField, setActiveField] = useState<'subject' | 'body'>('body');
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    useUnsavedChanges(isDirty);

    const subjectEditorRef = useRef<HTMLDivElement>(null);
    const bodyEditorRef = useRef<HTMLDivElement>(null);
    const isInitialized = useRef(false);

    // エディタ初期化
    useEffect(() => {
        if (!isInitialized.current) {
            if (subjectEditorRef.current) {
                subjectEditorRef.current.innerHTML = textToInlineHtml(template.subject);
            }
            if (bodyEditorRef.current) {
                bodyEditorRef.current.innerHTML = textToHtml(template.body);
            }
            isInitialized.current = true;
        }
    }, [template.subject, template.body]);

    /** contentEditable に変数チップを挿入する共通関数 */
    const insertChipToEditor = useCallback((editor: HTMLDivElement, variableKey: string) => {
        editor.focus();
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;

        const range = sel.getRangeAt(0);

        if (!editor.contains(range.commonAncestorContainer)) {
            range.selectNodeContents(editor);
            range.collapse(false);
        }

        const label = getVariableLabel(variableKey);
        const varIcon = getVariableIcon(variableKey);
        if (!label) return;

        const chip = createChipElement(variableKey, `${varIcon} ${label}`);

        range.deleteContents();
        range.insertNode(chip);

        range.setStartAfter(chip);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    }, []);

    const insertVariable = useCallback((variableKey: string) => {
        const editor = activeField === 'subject' ? subjectEditorRef.current : bodyEditorRef.current;
        if (!editor) return;
        insertChipToEditor(editor, variableKey);
        setIsDirty(true);
    }, [activeField, insertChipToEditor]);

    const handleSave = () => {
        const finalSubject = subjectEditorRef.current ? htmlToInlineText(subjectEditorRef.current) : template.subject;
        const finalBody = bodyEditorRef.current ? htmlToText(bodyEditorRef.current) : template.body;
        setIsDirty(false);
        onSave({ subject: finalSubject, body: finalBody, timing: showTiming ? timing : undefined });
    };

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) onClose();
    };

    if (!isOpen) return null;

    return (
        <div
            onClick={handleBackdropClick}
            onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
            style={{
                position: 'fixed',
                top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0, 0, 0, 0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 1000, padding: '1rem',
            }}
        >
            <div role="dialog" aria-modal="true" aria-labelledby="modal-title-email-template" style={{
                background: 'var(--card-bg)', borderRadius: '12px',
                width: '100%', maxWidth: '800px', maxHeight: '90vh',
                overflow: 'hidden', display: 'flex', flexDirection: 'column',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.2)',
            }}>
                {/* ヘッダー */}
                <div style={{
                    padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--card-border)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <h3 id="modal-title-email-template" style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold' }}>
                        {icon} {title} — テンプレート編集
                    </h3>
                    <button onClick={onClose} aria-label="閉じる" title="閉じる"
                        style={{ border: 'none', background: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--slate-500)', padding: '0.25rem', lineHeight: 1 }}
                    >&times;</button>
                </div>

                {/* コンテンツ */}
                <div style={{ overflow: 'auto', padding: '1.5rem', flex: 1 }}>
                    {showTiming && timingOptions && (
                        <div style={{ marginBottom: '1.25rem' }}>
                            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem' }}>送信タイミング</label>
                            <select className="input" value={timing} onChange={(e) => { setTiming(e.target.value); setIsDirty(true); }} style={{ width: '100%', maxWidth: '300px' }}>
                                {timingOptions.map(opt => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                            </select>
                        </div>
                    )}

                    {/* 件名 */}
                    <div style={{ marginBottom: '1.25rem' }}>
                        <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem' }}>件名</label>
                        <div
                            ref={subjectEditorRef} contentEditable suppressContentEditableWarning
                            onFocus={() => setActiveField('subject')}
                            onInput={() => setIsDirty(true)}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                            onPaste={(e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain').replace(/\n/g, ' ')); }}
                            style={{
                                width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #ccc', borderRadius: '6px',
                                fontSize: '0.95rem', lineHeight: '1.6', fontFamily: 'inherit', outline: 'none',
                                whiteSpace: 'nowrap', overflow: 'hidden', background: 'var(--card-bg)', minHeight: '2.4rem',
                            }}
                        />
                    </div>

                    {/* 変数挿入パレット */}
                    <div style={{ marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--slate-600)' }}>変数を挿入</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                — クリックで{activeField === 'subject' ? '件名' : '本文'}のカーソル位置に挿入
                            </span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                            {TEMPLATE_VARIABLES.map((v) => (
                                <button key={v.key} onClick={() => insertVariable(v.key)} title={v.description}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                        padding: '0.35rem 0.65rem', border: '1px solid #ddd', borderRadius: '6px',
                                        background: 'var(--secondary)', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--foreground)',
                                        transition: 'all 0.15s', whiteSpace: 'nowrap',
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'rgba(139, 0, 0, 0.05)'; e.currentTarget.style.color = 'var(--primary)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#ddd'; e.currentTarget.style.background = '#fafafa'; e.currentTarget.style.color = '#444'; }}
                                >
                                    <span>{v.icon}</span><span>{v.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 本文エディタ */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem' }}>本文</label>
                        <div
                            ref={bodyEditorRef} contentEditable suppressContentEditableWarning
                            onFocus={() => setActiveField('body')}
                            onInput={() => setIsDirty(true)}
                            onPaste={(e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); }}
                            style={{
                                width: '100%', minHeight: '350px', padding: '0.75rem',
                                border: '1px solid #ccc', borderRadius: '6px', fontSize: '0.9rem', lineHeight: '1.8',
                                fontFamily: 'inherit', outline: 'none', overflowY: 'auto',
                                whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--card-bg)',
                            }}
                        />
                    </div>
                </div>

                {/* フッター */}
                <div style={{
                    padding: '1rem 1.5rem', borderTop: '1px solid var(--card-border)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--secondary)',
                }}>
                    <div>
                        {onReset && (
                            <button
                                onClick={() => setShowResetConfirm(true)}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                    padding: '0.5rem 1rem', border: '1px solid #ccc',
                                    borderRadius: '6px', background: 'var(--card-bg)', cursor: 'pointer',
                                    fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500',
                                    transition: 'all 0.15s',
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#999'; e.currentTarget.style.color = '#555'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#ccc'; e.currentTarget.style.color = '#888'; }}
                            >
                                デフォルトに戻す
                            </button>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button className="btn btn-secondary" onClick={onClose} style={{ padding: '0.6rem 1.5rem' }}>キャンセル</button>
                        <button className="btn btn-primary" onClick={handleSave} style={{ padding: '0.6rem 1.5rem' }}>保存する</button>
                    </div>
                </div>

                {/* デフォルトリセット確認モーダル */}
                <ConfirmModal
                    isOpen={showResetConfirm}
                    title="デフォルトに戻す"
                    message="現在の文章は保存されずに削除されます。デフォルトのテンプレートに戻してもよろしいですか？"
                    confirmLabel="デフォルトに戻す"
                    cancelLabel="キャンセル"
                    onConfirm={() => {
                        setShowResetConfirm(false);
                        onReset?.();
                    }}
                    onCancel={() => setShowResetConfirm(false)}
                />
            </div>
        </div>
    );
}
