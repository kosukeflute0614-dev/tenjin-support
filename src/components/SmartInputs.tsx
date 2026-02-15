'use client';

import React, { useState, useRef, useEffect } from 'react';
import { DayPicker } from 'react-day-picker';
import { format, parse, isValid } from 'date-fns';
import { ja } from 'date-fns/locale';
import 'react-day-picker/dist/style.css';

/**
 * 日付入力マスク: YYYY / MM / DD
 */
export function SmartMaskedDatePicker({
    name,
    defaultValue,
    required = false,
    label,
    style
}: {
    name: string;
    defaultValue?: string;
    required?: boolean;
    label?: string;
    style?: React.CSSProperties;
}) {
    const [inputValue, setInputValue] = useState('');
    const [showCalendar, setShowCalendar] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // 初期値のセット
    useEffect(() => {
        if (defaultValue) {
            const d = new Date(defaultValue);
            if (isValid(d)) {
                setInputValue(format(d, 'yyyy / MM / dd'));
            }
        }
    }, [defaultValue]);

    // マスキングロジック
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = e.target.value.replace(/\D/g, '').slice(0, 8);
        let formatted = '';

        if (rawValue.length > 0) {
            formatted += rawValue.slice(0, 4);
            if (rawValue.length >= 4) {
                if (rawValue.length > 4) {
                    formatted += ' / ' + rawValue.slice(4, 6);
                    if (rawValue.length >= 6) {
                        if (rawValue.length > 6) {
                            formatted += ' / ' + rawValue.slice(6, 8);
                        } else if (rawValue.length === 6) {
                            // ちょうど月の入力が終わったときもスラッシュを表示する準備
                        }
                    }
                } else if (rawValue.length === 4) {
                    // 4文字打ったら自動的にスラッシュを追加して次を待つ
                    formatted += ' / ';
                }
            }
        }
        setInputValue(formatted);
    };

    // カレンダー選択時の同期
    const handleDaySelect = (day: Date | undefined) => {
        if (day) {
            setInputValue(format(day, 'yyyy / MM / dd'));
            setShowCalendar(false);
        }
    };

    // 外部クリックでカレンダーを閉じる
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setShowCalendar(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // hidden input用の値を生成 (YYYY-MM-DD)
    const hiddenValue = inputValue.replace(/ \/ /g, '-').replace(/ /g, '');

    return (
        <div ref={containerRef} className="smart-input-container" style={{ position: 'relative', ...style }}>
            {label && <label className="smart-label">{label}</label>}
            <div style={{ position: 'relative' }}>
                <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={handleInputChange}
                    placeholder="YYYY / MM / DD"
                    className="smart-input"
                    onFocus={() => setShowCalendar(true)}
                    autoComplete="off"
                />
                <input type="hidden" name={name} value={hiddenValue} required={required} />
                <button
                    type="button"
                    className="calendar-toggle"
                    onClick={() => setShowCalendar(!showCalendar)}
                    style={{
                        position: 'absolute',
                        right: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '1.2rem',
                        padding: '4px'
                    }}
                >
                    📅
                </button>
            </div>

            {showCalendar && (
                <div className="calendar-popover" style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    zIndex: 1000,
                    backgroundColor: '#fff',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                    borderRadius: '12px',
                    marginTop: '8px',
                    padding: '12px',
                    border: '1px solid #eee'
                }}>
                    <DayPicker
                        mode="single"
                        selected={isValid(new Date(hiddenValue)) ? new Date(hiddenValue) : undefined}
                        onSelect={handleDaySelect}
                        locale={ja}
                    />
                </div>
            )}

            <style jsx>{`
                .smart-input-container {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .smart-label {
                    font-size: 0.85rem;
                    font-weight: 600;
                    color: #444;
                    margin-left: 4px;
                }
                .smart-input {
                    width: 100%;
                    padding: 0.75rem 1rem;
                    height: 50px; /* 高さを明示的に指定して整列しやすくする */
                    font-size: 1rem;
                    border: 2px solid #e0e0e0;
                    border-radius: 10px;
                    background-color: #f9fafb;
                    transition: all 0.2s ease;
                    outline: none;
                    font-family: 'Courier New', Courier, monospace; /* 固定幅フォントでマスクずれを防ぐ */
                    letter-spacing: 1px;
                    box-sizing: border-box;
                }
                .smart-input:focus {
                    border-color: #8b0000; /* ブランドカラー（エンジ色） */
                    background-color: #fff;
                    box-shadow: 0 0 0 4px rgba(139, 0, 0, 0.1);
                }
            `}</style>
        </div>
    );
}

/**
 * 時間入力マスク: HH : MM
 */
export function SmartMaskedTimeInput({
    name,
    defaultValue,
    required = false,
    label,
    style
}: {
    name: string;
    defaultValue?: string;
    required?: boolean;
    label?: string;
    style?: React.CSSProperties;
}) {
    const [inputValue, setInputValue] = useState('');

    useEffect(() => {
        if (defaultValue) {
            setInputValue(defaultValue.replace(/:/g, ' : '));
        }
    }, [defaultValue]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = e.target.value.replace(/\D/g, '').slice(0, 4);
        let formatted = '';

        if (rawValue.length > 0) {
            formatted += rawValue.slice(0, 2);
            if (rawValue.length >= 2) {
                if (rawValue.length > 2) {
                    formatted += ' : ' + rawValue.slice(2, 4);
                } else if (rawValue.length === 2) {
                    formatted += ' : ';
                }
            }
        }
        setInputValue(formatted);
    };

    const hiddenValue = inputValue.replace(/ : /g, ':').replace(/ /g, '');

    return (
        <div className="smart-input-container" style={style}>
            {label && <label className="smart-label">{label}</label>}
            <input
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                placeholder="HH : MM"
                className="smart-input"
                autoComplete="off"
            />
            <input type="hidden" name={name} value={hiddenValue} required={required} />

            <style jsx>{`
                .smart-input-container {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .smart-label {
                    font-size: 0.85rem;
                    font-weight: 600;
                    color: #444;
                    margin-left: 4px;
                }
                .smart-label {
                    font-size: 0.85rem;
                    font-weight: 600;
                    color: #444;
                    margin: 0 0 6px 4px;
                    line-height: 1.2;
                    display: block;
                }
                .smart-input {
                    width: 100%;
                    padding: 0 1rem;
                    height: 50px;
                    font-size: 1rem;
                    border: 2px solid #e0e0e0;
                    border-radius: 10px;
                    background-color: #f9fafb;
                    transition: all 0.2s ease;
                    outline: none;
                    font-family: 'Courier New', Courier, monospace;
                    letter-spacing: 1px;
                    box-sizing: border-box;
                    margin: 0;
                }
                .smart-input:focus {
                    border-color: #8b0000;
                    background-color: #fff;
                    box-shadow: 0 0 0 4px rgba(139, 0, 0, 0.1);
                }
            `}</style>
        </div>
    );
}

/**
 * 数値入力用 (定員など)
 */
export function SmartNumberInput({
    name,
    defaultValue,
    required = false,
    label,
    width,
    style
}: {
    name: string;
    defaultValue?: number;
    required?: boolean;
    label?: string;
    width?: string;
    style?: React.CSSProperties;
}) {
    return (
        <div className="smart-input-container" style={{ width: width || '100%', ...style }}>
            {label && <label className="smart-label">{label}</label>}
            <input
                type="number"
                name={name}
                defaultValue={defaultValue}
                className="smart-input"
                required={required}
                autoComplete="off"
            />
            <style jsx>{`
                .smart-input-container {
                    display: flex;
                    flex-direction: column;
                }
                .smart-label {
                    font-size: 0.85rem;
                    font-weight: 600;
                    color: #444;
                    margin: 0 0 6px 4px;
                    line-height: 1.2;
                    display: block;
                }
                .smart-input {
                    width: 100%;
                    padding: 0 1rem;
                    height: 50px;
                    font-size: 1rem;
                    border: 2px solid #e0e0e0;
                    border-radius: 10px;
                    background-color: #f9fafb;
                    transition: all 0.2s ease;
                    outline: none;
                    box-sizing: border-box;
                    margin: 0;
                }
                .smart-input:focus {
                    border-color: #8b0000;
                    background-color: #fff;
                    box-shadow: 0 0 0 4px rgba(139, 0, 0, 0.1);
                }
            `}</style>
        </div>
    );
}
