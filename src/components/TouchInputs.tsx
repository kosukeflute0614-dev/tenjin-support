'use client'

import React from 'react'

// --- NumberStepper ---
export function NumberStepper({
    value,
    min,
    max,
    onChange,
    label
}: {
    value: number,
    min: number,
    max: number,
    onChange: (val: number) => void,
    label?: string
}) {
    // ローカル状態を文字列で持つことで「空」の状態や「入力中」の状態を許容する
    const [inputValue, setInputValue] = React.useState(value.toString())

    // 外部からの値変更（ボタンクリック等）に同期
    React.useEffect(() => {
        if (parseInt(inputValue) !== value) {
            setInputValue(value.toString())
        }
    }, [value])

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const str = e.target.value.replace(/[^0-9]/g, '') // 数字以外を除去
        setInputValue(str)

        if (str !== '') {
            const num = parseInt(str, 10)
            // 範囲内に収まる場合のみ即座に親に通知する
            // 範囲外の場合は Blur 時まで待つことで「入力を邪魔しない」挙動にする
            if (num >= min && num <= max) {
                onChange(num)
            }
        }
    }

    const handleBlur = () => {
        let num = parseInt(inputValue, 10)
        if (isNaN(num)) num = min
        const clamped = Math.max(min, Math.min(max, num))

        setInputValue(clamped.toString())
        onChange(clamped)
    }

    return (
        <div style={{ display: 'flex', alignItems: 'stretch', gap: '2px', height: '3.5rem' }}>
            <button
                type="button"
                className="btn btn-secondary"
                style={{ width: '4rem', fontSize: '1.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 0, border: '1px solid #ddd', borderRadius: '6px 0 0 6px' }}
                onClick={() => {
                    const next = Math.max(min, value - 1)
                    onChange(next)
                    setInputValue(next.toString())
                }}
            >
                -
            </button>
            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                background: '#fff',
                borderTop: '1px solid #ddd',
                borderBottom: '1px solid #ddd',
                minWidth: '60px',
                position: 'relative'
            }}>
                <input
                    type="text"
                    inputMode="numeric"
                    value={inputValue}
                    onChange={handleInputChange}
                    onBlur={handleBlur}
                    onFocus={(e) => e.target.select()} // 文字列を全選択して上書きしやすくする
                    style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        textAlign: 'center',
                        fontSize: '1.25rem',
                        fontWeight: 'bold',
                        outline: 'none',
                        padding: '0 4px',
                        margin: 0,
                        background: 'transparent'
                    }}
                />
                {label && (
                    <div style={{
                        position: 'absolute',
                        bottom: '2px',
                        fontSize: '0.6rem',
                        color: '#888',
                        pointerEvents: 'none'
                    }}>
                        {label}
                    </div>
                )}
            </div>
            <button
                type="button"
                className="btn btn-secondary"
                style={{ width: '4rem', fontSize: '1.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 0, border: '1px solid #ddd', borderRadius: '0 6px 6px 0' }}
                onClick={() => {
                    const next = Math.min(max, value + 1)
                    onChange(next)
                    setInputValue(next.toString())
                }}
            >
                +
            </button>
        </div>
    )
}

// --- SoftKeypad ---
export function SoftKeypad({
    onInput,
    onClear,
    onConfirm,
    statusText,
    onQuickInput
}: {
    onInput: (digit: string) => void,
    onClear: () => void,
    onConfirm?: () => void,
    statusText?: string,
    onQuickInput?: (amount: number) => void
}) {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '00', 'C']
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            background: '#f8f9fa',
            padding: '16px',
            borderRadius: '16px',
            border: '1px solid #dee2e6',
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'
        }}>
            {statusText && (
                <div style={{ padding: '4px', textAlign: 'right', fontSize: '0.75rem', color: '#888' }}>
                    {statusText}
                </div>
            )}

            {onQuickInput && (
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ flex: 1, padding: '0.6rem', fontSize: '0.9rem', background: '#fff' }}
                        onClick={() => onQuickInput(5000)}
                    >
                        5,000円
                    </button>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ flex: 1, padding: '0.6rem', fontSize: '0.9rem', background: '#fff' }}
                        onClick={() => onQuickInput(10000)}
                    >
                        10,000円
                    </button>
                </div>
            )}

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px'
            }}>
                {keys.map(key => (
                    <button
                        key={key}
                        type="button"
                        className="btn btn-secondary"
                        style={{
                            height: '3.8rem',
                            fontSize: '1.25rem',
                            fontWeight: 'bold',
                            background: key === 'C' ? '#fff5f5' : '#fff',
                            color: key === 'C' ? '#d93025' : '#333',
                            border: '1px solid #ddd',
                            borderRadius: '10px',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            boxShadow: '0 2px 0 rgba(0,0,0,0.05)'
                        }}
                        onClick={() => key === 'C' ? onClear() : onInput(key)}
                    >
                        {key}
                    </button>
                ))}
            </div>

            {onConfirm && (
                <button
                    type="button"
                    className="btn btn-primary"
                    style={{
                        height: '3.5rem',
                        fontSize: '1.1rem',
                        fontWeight: 'bold',
                        borderRadius: '10px'
                    }}
                    onClick={onConfirm}
                >
                    確定
                </button>
            )}
        </div>
    )
}
