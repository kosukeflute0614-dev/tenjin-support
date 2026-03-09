'use client';

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export default function ConfirmModal({
    isOpen,
    title,
    message,
    confirmLabel = '実行する',
    cancelLabel = 'キャンセル',
    onConfirm,
    onCancel,
}: ConfirmModalProps) {
    if (!isOpen) return null;

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
                        onClick={onConfirm}
                        style={{
                            padding: '0.5rem 1.25rem',
                            background: '#d32f2f',
                            borderColor: '#d32f2f',
                        }}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
