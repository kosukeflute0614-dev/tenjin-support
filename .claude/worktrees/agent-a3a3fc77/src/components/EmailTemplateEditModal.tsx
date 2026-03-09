'use client';

import { useRef, useCallback, useEffect, useState } from 'react';

/** テンプレートに挿入できる変数 */
const TEMPLATE_VARIABLES = [
    { key: '{{customer_name}}', label: 'お客様名', icon: '👤', description: '予約者のお名前' },
    { key: '{{production_title}}', label: '公演名', icon: '🎭', description: '公演のタイトル' },
    { key: '{{performance_date}}', label: '公演日時', icon: '📅', description: '開演の日付と時刻' },
    { key: '{{venue}}', label: '会場名', icon: '📍', description: '会場の名前' },
    { key: '{{ticket_details}}', label: 'チケット詳細', icon: '🎫', description: '券種・枚数・金額の一覧' },
    { key: '{{total_amount}}', label: '合計金額', icon: '💰', description: '予約の合計金額' },
    { key: '{{ticket_count}}', label: 'チケット枚数', icon: '🔖', description: '予約のチケット総枚数' },
    { key: '{{organizer_name}}', label: '主催者名', icon: '🏢', description: '主催者・劇団名' },
] as const;

/** 変数キーからラベルを取得 */
function getVariableLabel(key: string): string | null {
    const v = TEMPLATE_VARIABLES.find(tv => tv.key === key);
    return v ? v.label : null;
}

function getVariableIcon(key: string): string {
    const v = TEMPLATE_VARIABLES.find(tv => tv.key === key);
    return v ? v.icon : '📎';
}

/** チップのインラインスタイル（共通） */
const CHIP_STYLE = 'display:inline-flex;align-items:center;gap:3px;padding:1px 8px;margin:0 1px;border:1px solid #d0d0d0;border-radius:5px;background:#fff;color:#333;font-size:0.82em;font-weight:600;white-space:nowrap;vertical-align:baseline;cursor:default;user-select:all;line-height:1.6';

/** チップ span を DOM 要素として作成 */
function createChipElement(variableKey: string, displayText: string): HTMLSpanElement {
    const chip = document.createElement('span');
    chip.contentEditable = 'false';
    chip.setAttribute('data-variable', variableKey);
    chip.style.cssText = CHIP_STYLE;
    chip.textContent = displayText;
    return chip;
}

/** テキスト内の変数を HTML チップに変換する共通処理 */
function replaceVariablesWithChips(escaped: string): string {
    return escaped.replace(/\{\{([^}]+)\}\}/g, (_match, varName) => {
        const key = `{{${varName}}}`;
        const label = getVariableLabel(key);
        const icon = getVariableIcon(key);
        if (!label) return _match;
        return `<span contenteditable="false" data-variable="${key}" style="${CHIP_STYLE}">${icon} ${label}</span>`;
    });
}

/** プレーンテキスト（{{var}} 形式）→ HTML（チップ表示、複数行）に変換 */
function textToHtml(text: string): string {
    const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const html = replaceVariablesWithChips(escaped);
    return html.replace(/\n/g, '<br>');
}

/** プレーンテキスト（{{var}} 形式）→ HTML（チップ表示、1行 / 件名用）に変換 */
function textToInlineHtml(text: string): string {
    const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    return replaceVariablesWithChips(escaped);
}

/** HTML（チップ表示）→ プレーンテキスト（{{var}} 形式）に変換 */
function htmlToText(container: HTMLElement): string {
    let result = '';
    const walk = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            result += node.textContent || '';
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            // 変数チップ
            const variable = el.getAttribute('data-variable');
            if (variable) {
                result += variable;
                return;
            }
            // <br> → 改行
            if (el.tagName === 'BR') {
                result += '\n';
                return;
            }
            // <div> ブロック（contenteditable が自動で作る）
            if (el.tagName === 'DIV' && el.previousSibling) {
                // 前にノードがある場合のみ改行を追加（先頭divは不要）
                result += '\n';
            }
            el.childNodes.forEach(walk);
        }
    };
    container.childNodes.forEach(walk);
    return result;
}

/** HTML（チップ表示）→ プレーンテキスト（{{var}} 形式、1行 / 件名用）に変換 */
function htmlToInlineText(container: HTMLElement): string {
    let result = '';
    const walk = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            result += node.textContent || '';
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            const variable = el.getAttribute('data-variable');
            if (variable) {
                result += variable;
                return;
            }
            el.childNodes.forEach(walk);
        }
    };
    container.childNodes.forEach(walk);
    return result;
}

export interface EmailTemplateData {
    subject: string;
    body: string;
    timing?: string;
}

interface EmailTemplateEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: EmailTemplateData) => void;
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
    title,
    icon,
    template,
    showTiming = false,
    timingOptions,
}: EmailTemplateEditModalProps) {
    const [timing, setTiming] = useState(template.timing || '');
    const [activeField, setActiveField] = useState<'subject' | 'body'>('body');
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
    }, [activeField, insertChipToEditor]);

    const handleSave = () => {
        const finalSubject = subjectEditorRef.current ? htmlToInlineText(subjectEditorRef.current) : template.subject;
        const finalBody = bodyEditorRef.current ? htmlToText(bodyEditorRef.current) : template.body;
        onSave({ subject: finalSubject, body: finalBody, timing: showTiming ? timing : undefined });
    };

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) onClose();
    };

    if (!isOpen) return null;

    return (
        <div
            onClick={handleBackdropClick}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: '1rem',
            }}
        >
            <div style={{
                background: '#fff',
                borderRadius: '12px',
                width: '100%',
                maxWidth: '800px',
                maxHeight: '90vh',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.2)',
            }}>
                {/* ヘッダー */}
                <div style={{
                    padding: '1.25rem 1.5rem',
                    borderBottom: '1px solid #eee',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold' }}>
                        {icon} {title} — テンプレート編集
                    </h3>
                    <button
                        onClick={onClose}
                        style={{
                            border: 'none',
                            background: 'none',
                            fontSize: '1.5rem',
                            cursor: 'pointer',
                            color: '#999',
                            padding: '0.25rem',
                            lineHeight: 1,
                        }}
                        title="閉じる"
                    >
                        &times;
                    </button>
                </div>

                {/* コンテンツ */}
                <div style={{ overflow: 'auto', padding: '1.5rem', flex: 1 }}>
                    {/* 送信タイミング（リマインドメールのみ） */}
                    {showTiming && timingOptions && (
                        <div style={{ marginBottom: '1.25rem' }}>
                            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                                送信タイミング
                            </label>
                            <select
                                className="input"
                                value={timing}
                                onChange={(e) => setTiming(e.target.value)}
                                style={{ width: '100%', maxWidth: '300px' }}
                            >
                                {timingOptions.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* 件名 */}
                    <div style={{ marginBottom: '1.25rem' }}>
                        <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                            件名
                        </label>
                        <div
                            ref={subjectEditorRef}
                            contentEditable
                            suppressContentEditableWarning
                            onFocus={() => setActiveField('subject')}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') e.preventDefault();
                            }}
                            onPaste={(e) => {
                                e.preventDefault();
                                const text = e.clipboardData.getData('text/plain').replace(/\n/g, ' ');
                                document.execCommand('insertText', false, text);
                            }}
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
                                background: '#fff',
                                minHeight: '2.4rem',
                            }}
                        />
                    </div>

                    {/* 変数挿入パレット */}
                    <div style={{ marginBottom: '1rem' }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            marginBottom: '0.5rem',
                        }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#555' }}>
                                変数を挿入
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                — クリックで{activeField === 'subject' ? '件名' : '本文'}のカーソル位置に挿入
                            </span>
                        </div>
                        <div style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '0.4rem',
                        }}>
                            {TEMPLATE_VARIABLES.map((v) => (
                                <button
                                    key={v.key}
                                    onClick={() => insertVariable(v.key)}
                                    title={v.description}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.3rem',
                                        padding: '0.35rem 0.65rem',
                                        border: '1px solid #ddd',
                                        borderRadius: '6px',
                                        background: '#fafafa',
                                        cursor: 'pointer',
                                        fontSize: '0.8rem',
                                        color: '#444',
                                        transition: 'all 0.15s',
                                        whiteSpace: 'nowrap',
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

                    {/* 本文エディタ（contentEditable） */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                            本文
                        </label>
                        <div
                            ref={bodyEditorRef}
                            contentEditable
                            suppressContentEditableWarning
                            onFocus={() => setActiveField('body')}
                            style={{
                                width: '100%',
                                minHeight: '350px',
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
                                background: '#fff',
                            }}
                            onPaste={(e) => {
                                e.preventDefault();
                                const text = e.clipboardData.getData('text/plain');
                                document.execCommand('insertText', false, text);
                            }}
                        />
                    </div>
                </div>

                {/* フッター */}
                <div style={{
                    padding: '1rem 1.5rem',
                    borderTop: '1px solid #eee',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '0.75rem',
                    background: '#fafafa',
                }}>
                    <button
                        className="btn btn-secondary"
                        onClick={onClose}
                        style={{ padding: '0.6rem 1.5rem' }}
                    >
                        キャンセル
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        style={{ padding: '0.6rem 1.5rem' }}
                    >
                        保存する
                    </button>
                </div>
            </div>
        </div>
    );
}
