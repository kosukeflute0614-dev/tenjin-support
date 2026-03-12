'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
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

interface Props {
    subject: string;
    body: string;
    onSubjectChange: (value: string) => void;
    onBodyChange: (value: string) => void;
    subjectPlaceholder?: string;
    bodyPlaceholder?: string;
    bodyMinHeight?: string;
}

export default function TemplateInlineEditor({
    subject,
    body,
    onSubjectChange,
    onBodyChange,
    subjectPlaceholder,
    bodyPlaceholder,
    bodyMinHeight = '200px',
}: Props) {
    const [activeField, setActiveField] = useState<'subject' | 'body'>('body');
    const subjectRef = useRef<HTMLDivElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);
    const isInitialized = useRef(false);

    // 初期化: テキスト → チップHTML に変換して表示
    useEffect(() => {
        if (!isInitialized.current) {
            if (subjectRef.current) {
                subjectRef.current.innerHTML = subject ? textToInlineHtml(subject) : '';
            }
            if (bodyRef.current) {
                bodyRef.current.innerHTML = body ? textToHtml(body) : '';
            }
            isInitialized.current = true;
        }
    }, [subject, body]);

    // チップ挿入
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

        // 変更をコールバックに通知
        if (editor === subjectRef.current) {
            onSubjectChange(htmlToInlineText(editor));
        } else {
            onBodyChange(htmlToText(editor));
        }
    }, [onSubjectChange, onBodyChange]);

    const insertVariable = useCallback((variableKey: string) => {
        const editor = activeField === 'subject' ? subjectRef.current : bodyRef.current;
        if (!editor) return;
        insertChipToEditor(editor, variableKey);
    }, [activeField, insertChipToEditor]);

    // 入力時にプレーンテキストに変換してコールバック
    const handleSubjectInput = () => {
        if (subjectRef.current) {
            onSubjectChange(htmlToInlineText(subjectRef.current));
        }
    };

    const handleBodyInput = () => {
        if (bodyRef.current) {
            onBodyChange(htmlToText(bodyRef.current));
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* 件名 */}
            <div>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                    件名
                </label>
                <div
                    ref={subjectRef}
                    contentEditable
                    suppressContentEditableWarning
                    onFocus={() => setActiveField('subject')}
                    onInput={handleSubjectInput}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                    onPaste={(e) => {
                        e.preventDefault();
                        document.execCommand('insertText', false, e.clipboardData.getData('text/plain').replace(/\n/g, ' '));
                    }}
                    data-placeholder={subjectPlaceholder}
                    style={{
                        width: '100%',
                        padding: '0.6rem 0.75rem',
                        border: '1px solid #ccc',
                        borderRadius: '6px',
                        fontSize: '0.95rem',
                        lineHeight: '1.6',
                        fontFamily: 'inherit',
                        outline: 'none',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        background: 'var(--card-bg)',
                        minHeight: '2.4rem',
                    }}
                />
            </div>

            {/* 変数挿入パレット */}
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--slate-600)' }}>
                        変数を挿入
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        — クリックで{activeField === 'subject' ? '件名' : '本文'}のカーソル位置に挿入
                    </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {TEMPLATE_VARIABLES.map((v) => (
                        <button
                            key={v.key}
                            onClick={() => insertVariable(v.key)}
                            title={v.description}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                padding: '0.35rem 0.65rem', border: '1px solid #ddd', borderRadius: '6px',
                                background: 'var(--secondary)', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--foreground)',
                                transition: 'all 0.15s', whiteSpace: 'nowrap',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = 'var(--primary)';
                                e.currentTarget.style.background = 'rgba(139, 0, 0, 0.05)';
                                e.currentTarget.style.color = 'var(--primary)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = '#ddd';
                                e.currentTarget.style.background = '#fafafa';
                                e.currentTarget.style.color = '#444';
                            }}
                        >
                            <span>{v.icon}</span>
                            <span>{v.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* 本文 */}
            <div>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                    本文
                </label>
                <div
                    ref={bodyRef}
                    contentEditable
                    suppressContentEditableWarning
                    onFocus={() => setActiveField('body')}
                    onInput={handleBodyInput}
                    onPaste={(e) => {
                        e.preventDefault();
                        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
                    }}
                    data-placeholder={bodyPlaceholder}
                    style={{
                        width: '100%',
                        minHeight: bodyMinHeight,
                        padding: '0.75rem',
                        border: '1px solid #ccc',
                        borderRadius: '6px',
                        fontSize: '0.9rem',
                        lineHeight: '1.8',
                        fontFamily: 'inherit',
                        outline: 'none',
                        overflowY: 'auto',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        background: 'var(--card-bg)',
                    }}
                />
            </div>
        </div>
    );
}
