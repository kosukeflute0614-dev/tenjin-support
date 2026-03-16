'use client';

import { useState, useEffect } from 'react';

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: ((inputValue?: string) => void);
    onCancel: () => void;
    /** trueにすると確認ボタンの色が赤(危険操作)ではなくプライマリカラーになる */
    safe?: boolean;
    /** 入力フィールドを表示する場合の設定 */
    input?: {
        placeholder?: string;
        type?: string;
        inputMode?: 'text' | 'numeric' | 'tel';
        maxLength?: number;
        pattern?: string;
        validate?: (value: string) => string | null;
    };
}

export default function ConfirmModal({
    isOpen,
    title,
    message,
    confirmLabel = '実行する',
    cancelLabel = 'キャンセル',
    onConfirm,
    onCancel,
    safe = false,
    input,
}: ConfirmModalProps) {
    const [inputValue, setInputValue] = useState('');
    const [inputError, setInputError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setInputValue('');
            setInputError(null);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleConfirm = () => {
        if (input) {
            if (input.validate) {
                const error = input.validate(inputValue);
                if (error) { setInputError(error); return; }
            }
            onConfirm(inputValue);
        } else {
            onConfirm();
        }
    };

    return (
        <div
            onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
            onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
            style={{
                position: 'fixed',
                top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0, 0, 0, 0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 2000, padding: '1rem',
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                style={{
                    background: 'var(--card-bg)',
                    borderRadius: '12px',
                    width: '100%',
                    maxWidth: '420px',
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.25)',
                    overflow: 'hidden',
                }}
            >
                <div style={{ padding: '1.5rem 1.5rem 1rem' }}>
                    <h4 style={{ margin: '0 0 0.75rem', fontSize: '1.05rem', fontWeight: 'bold' }}>
                        {title}
                    </h4>
                    <p style={{
                        margin: 0,
                        fontSize: '0.9rem',
                        color: 'var(--slate-600)',
                        lineHeight: '1.7',
                        whiteSpace: 'pre-line',
                    }}>
                        {message}
                    </p>
                    {input && (
                        <div style={{ marginTop: '1rem' }}>
                            <input
                                type={input.type || 'text'}
                                inputMode={input.inputMode}
                                maxLength={input.maxLength}
                                pattern={input.pattern}
                                placeholder={input.placeholder}
                                value={inputValue}
                                onChange={(e) => { setInputValue(e.target.value); setInputError(null); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
                                className="input"
                                autoFocus
                                style={{ width: '100%', fontSize: '1.1rem', textAlign: 'center', letterSpacing: input.inputMode === 'numeric' ? '0.3rem' : undefined }}
                            />
                            {inputError && <p style={{ color: '#d32f2f', fontSize: '0.8rem', marginTop: '0.5rem' }}>{inputError}</p>}
                        </div>
                    )}
                </div>
                <div style={{
                    padding: '1rem 1.5rem',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '0.75rem',
                    background: 'var(--secondary)',
                    borderTop: '1px solid var(--card-border)',
                }}>
                    <button
                        className="btn btn-secondary"
                        onClick={onCancel}
                        style={{ padding: '0.5rem 1.25rem' }}
                    >
                        {cancelLabel}
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleConfirm}
                        style={{
                            padding: '0.5rem 1.25rem',
                            ...(safe ? {} : { background: '#d32f2f', borderColor: '#d32f2f' }),
                        }}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
