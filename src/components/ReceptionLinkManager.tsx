'use client';

import { useState, useEffect, useRef } from 'react';
import { updateReceptionStatus, updateReceptionStart, updateReceptionEnd, updateReceptionSchedule } from '@/app/actions/production';
import { formatForDateTimeLocal, formatDateTime } from '@/lib/format';
import { getEffectiveReceptionStatus } from '@/lib/production';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { NumberStepper } from '@/components/TouchInputs';
import { SmartMaskedDatePicker, SmartMaskedTimeInput } from './SmartInputs';

type Props = {
    productionId: string;
    initialStatus: string;
    initialStart?: Date | string | null;
    initialEnd?: Date | string | null;
    initialEndMode?: string;
    initialEndMinutes?: number;
    performances?: any[];
};

type ModalType = 'TOGGLE_STATUS' | 'SAVE_START' | 'SAVE_END' | 'CLEAR_SCHEDULE' | null;

export default function ReceptionLinkManager({
    productionId,
    initialStatus,
    initialStart,
    initialEnd,
    initialEndMode = 'MANUAL',
    initialEndMinutes = 0,
    performances = []
}: Props) {
    const [baseUrl, setBaseUrl] = useState('');
    const [copied, setCopied] = useState(false);
    const [manualStatus, setManualStatus] = useState(initialStatus);
    const [isUpdating, setIsUpdating] = useState(false);
    const [modalType, setModalType] = useState<ModalType>(null);
    const [showQRCode, setShowQRCode] = useState(false);

    const svgRef = useRef<SVGSVGElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Form Input states (Transient) - 分割して管理
    const initialStartStr = formatForDateTimeLocal(initialStart);
    const [inputStartDate, setInputStartDate] = useState(initialStartStr.split('T')[0] || '');
    const [inputStartTime, setInputStartTime] = useState(initialStartStr.split('T')[1]?.slice(0, 5) || '');

    const initialEndStr = formatForDateTimeLocal(initialEnd);
    const [inputEndDate, setInputEndDate] = useState(initialEndStr.split('T')[0] || '');
    const [inputEndTime, setInputEndTime] = useState(initialEndStr.split('T')[1]?.slice(0, 5) || '');

    const [endMode, setEndMode] = useState(initialEndMode);

    // Time/Minutes split states for BEFORE_PERFORMANCE
    const [endHours, setEndHours] = useState(Math.floor(initialEndMinutes / 60));
    const [endMinutesPart, setEndMinutesPart] = useState(initialEndMinutes % 60);

    // Confirmed/Saved states (Used for effective status calculation)
    const [confirmedStart, setConfirmedStart] = useState(initialStart);
    const [confirmedEnd, setConfirmedEnd] = useState(initialEnd);
    const [confirmedEndMode, setConfirmedEndMode] = useState(initialEndMode);
    const [confirmedEndMinutes, setConfirmedEndMinutes] = useState(initialEndMinutes);

    const [scheduleMessage, setScheduleMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Effective status
    const [effectiveStatus, setEffectiveStatus] = useState<'OPEN' | 'BEFORE_START' | 'CLOSED'>('CLOSED');

    useEffect(() => {
        setBaseUrl(window.location.origin);
    }, []);

    // Update effective status calculation
    useEffect(() => {
        const updateStatus = () => {
            const currentStatus = getEffectiveReceptionStatus({
                receptionStatus: manualStatus,
                receptionStart: confirmedStart,
                receptionEnd: confirmedEnd,
                receptionEndMode: confirmedEndMode,
                receptionEndMinutes: confirmedEndMinutes,
                performances: performances
            });
            setEffectiveStatus(currentStatus);
        };

        updateStatus();
        const interval = setInterval(updateStatus, 10000);
        return () => clearInterval(interval);
    }, [manualStatus, confirmedStart, confirmedEnd, confirmedEndMode, confirmedEndMinutes, performances]);

    const reservationUrl = `${baseUrl}/book/${productionId}`;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(reservationUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy: ', err);
        }
    };

    const handleOpen = () => {
        window.open(reservationUrl, '_blank');
    };

    const downloadSVG = () => {
        if (!svgRef.current) return;
        const svgData = new XMLSerializer().serializeToString(svgRef.current);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `reservation-qr-${productionId}.svg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const downloadPNG = () => {
        const canvas = document.querySelector('#qr-canvas') as HTMLCanvasElement;
        if (!canvas) return;
        const url = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = url;
        link.download = `reservation-qr-${productionId}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // --- Action Handlers ---

    const handleConfirmAction = async () => {
        if (!modalType) return;

        setIsUpdating(true);
        const currentModal = modalType;
        setModalType(null);

        try {
            if (currentModal === 'TOGGLE_STATUS') {
                const isCurrentlyOpen = effectiveStatus === 'OPEN';

                if (!isCurrentlyOpen) {
                    // 「即時開始」する場合
                    const now = new Date();
                    const hasPastEnd = confirmedEnd && new Date(confirmedEnd) < now;

                    const formData = new FormData();
                    formData.append('receptionStart', '');

                    // 過去の終了設定があればクリアし、なければ維持する
                    const finalEnd = hasPastEnd ? null : confirmedEnd;
                    const finalEndMode = hasPastEnd ? 'MANUAL' : (confirmedEndMode || 'MANUAL');
                    const finalEndMinutes = hasPastEnd ? 0 : (confirmedEndMinutes || 0);

                    formData.append('receptionEnd', finalEnd ? new Date(finalEnd).toISOString() : '');
                    formData.append('receptionEndMode', finalEndMode);
                    formData.append('receptionEndMinutes', finalEndMinutes.toString());

                    await Promise.all([
                        updateReceptionStatus(productionId, 'OPEN'),
                        updateReceptionSchedule(productionId, formData)
                    ]);

                    setManualStatus('OPEN');
                    setConfirmedStart(null);
                    setConfirmedEnd(finalEnd);
                    setConfirmedEndMode(finalEndMode);
                    setConfirmedEndMinutes(finalEndMinutes);
                    setInputStartDate('');
                    setInputStartTime('');
                    if (hasPastEnd) {
                        setInputEndDate('');
                        setInputEndTime('');
                        setEndMode('MANUAL');
                        setEndHours(0);
                        setEndMinutesPart(0);
                    }
                } else {
                    // 「即時停止」する場合
                    const formData = new FormData();
                    formData.append('receptionStart', '');
                    formData.append('receptionEnd', '');
                    formData.append('receptionEndMode', 'MANUAL');
                    formData.append('receptionEndMinutes', '0');

                    await Promise.all([
                        updateReceptionStatus(productionId, 'CLOSED'),
                        updateReceptionSchedule(productionId, formData)
                    ]);

                    setManualStatus('CLOSED');
                    setConfirmedStart(null);
                    setConfirmedEnd(null);
                    setConfirmedEndMode('MANUAL');
                    setConfirmedEndMinutes(0);
                    setInputStartDate('');
                    setInputStartTime('');
                    setInputEndDate('');
                    setInputEndTime('');
                    setEndMode('MANUAL');
                    setEndHours(0);
                    setEndMinutesPart(0);
                }
            } else if (currentModal === 'SAVE_START') {
                const combinedStart = inputStartDate && inputStartTime ? `${inputStartDate}T${inputStartTime}` : null;
                await Promise.all([
                    updateReceptionStart(productionId, combinedStart),
                    updateReceptionStatus(productionId, 'CLOSED')
                ]);

                setManualStatus('CLOSED');
                setConfirmedStart(combinedStart ? new Date(combinedStart) : null);

                setScheduleMessage({ type: 'success', text: '開始時刻を設定しました' });
                setTimeout(() => setScheduleMessage(null), 3000);
            } else if (currentModal === 'SAVE_END') {
                const totalMinutes = (endHours * 60) + endMinutesPart;
                const combinedEnd = inputEndDate && inputEndTime ? `${inputEndDate}T${inputEndTime}` : null;
                const formData = new FormData();
                formData.append('receptionEnd', combinedEnd || '');
                formData.append('receptionEndMode', endMode);
                formData.append('receptionEndMinutes', totalMinutes.toString());

                await Promise.all([
                    updateReceptionEnd(productionId, formData),
                    updateReceptionStatus(productionId, 'CLOSED')
                ]);

                setManualStatus('CLOSED');
                setConfirmedEnd(combinedEnd ? new Date(combinedEnd) : null);
                setConfirmedEndMode(endMode);
                setConfirmedEndMinutes(totalMinutes);

                setScheduleMessage({ type: 'success', text: '終了条件を設定しました' });
                setTimeout(() => setScheduleMessage(null), 3000);
            } else if (currentModal === 'CLEAR_SCHEDULE') {
                const formData = new FormData();
                formData.append('receptionStart', '');
                formData.append('receptionEnd', '');
                formData.append('receptionEndMode', 'MANUAL');
                formData.append('receptionEndMinutes', '0');

                await updateReceptionSchedule(productionId, formData);

                setConfirmedStart(null);
                setConfirmedEnd(null);
                setConfirmedEndMode('MANUAL');
                setConfirmedEndMinutes(0);
                setInputStartDate('');
                setInputStartTime('');
                setInputEndDate('');
                setInputEndTime('');
                setEndMode('MANUAL');
                setEndHours(0);
                setEndMinutesPart(0);

                setScheduleMessage({ type: 'success', text: 'スケジュールを解除しました' });
                setTimeout(() => setScheduleMessage(null), 3000);
            }
        } catch (err) {
            console.error('Action failed:', err);
            alert('操作に失敗しました。');
        } finally {
            setIsUpdating(false);
        }
    };

    const isCurrentlyOpen = effectiveStatus === 'OPEN';

    const getStatusDisplay = () => {
        switch (effectiveStatus) {
            case 'OPEN':
                return { label: '受付中', color: '#2e7d32', bg: '#e8f5e9', border: '#c8e6c9' };
            case 'BEFORE_START':
                return { label: '受付開始待機中', color: '#7b1fa2', bg: '#f3e5f5', border: '#e1bee7' };
            case 'CLOSED':
            default:
                return { label: '受付停止中', color: '#c62828', bg: '#ffebee', border: '#ffcdd2' };
        }
    };

    const display = getStatusDisplay();
    const hasSavedSchedule = confirmedStart || confirmedEnd || confirmedEndMode !== 'MANUAL';

    const formatMinutesAsText = (totalMinutes: number) => {
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        if (h === 0) return `${m}分前`;
        if (m === 0) return `${h}時間前`;
        return `${h}時間${m}分前`;
    };

    const renderEndLabel = () => {
        switch (confirmedEndMode) {
            case 'PERFORMANCE_START': return '各公演回の開始まで';
            case 'BEFORE_PERFORMANCE': return `各公演開始の${formatMinutesAsText(confirmedEndMinutes)}まで`;
            case 'DAY_BEFORE': return '各公演日の前日23:59まで';
            default: return confirmedEnd ? formatDateTime(confirmedEnd) : '期限なし';
        }
    };

    return (
        <div style={{ display: 'grid', gap: '2rem' }}>
            {/* Confirmation Modal */}
            {modalType && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                    backgroundColor: 'rgba(0, 0, 0, 0.3)', display: 'flex', justifyContent: 'center',
                    alignItems: 'center', zIndex: 2000, backdropFilter: 'blur(2px)'
                }}>
                    <div className="card" style={{
                        width: '90%', maxWidth: '400px', padding: '2rem', textAlign: 'center',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.1)', border: '1px solid var(--card-border)'
                    }}>
                        <h3 className="heading-md" style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>
                            {modalType === 'TOGGLE_STATUS' ? (isCurrentlyOpen ? '予約受付の停止' : '予約受付の即時開始') :
                                modalType === 'SAVE_START' ? '開始時刻の確定' :
                                    modalType === 'SAVE_END' ? '終了条件の確定' : 'スケジュールの解除'}
                        </h3>
                        <div style={{ marginBottom: '2rem', color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: '1.6' }}>
                            {modalType === 'TOGGLE_STATUS' ? `予約受付を${isCurrentlyOpen ? '停止' : '開始'}してもよろしいですか？` :
                                modalType === 'SAVE_START' ? '設定した開始時刻を反映してもよろしいですか？' :
                                    modalType === 'SAVE_END' ? '設定した終了条件を反映してもよろしいですか？' :
                                        '設定されているスケジュールを解除してもよろしいですか？'}

                            {modalType === 'TOGGLE_STATUS' && !isCurrentlyOpen && confirmedStart && (
                                <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#fff5f5', borderRadius: '4px', textAlign: 'left', fontSize: '0.85rem' }}>
                                    <strong style={{ color: '#c53030' }}>注意:</strong> 開始時刻の設定は解除され、即座に受付開始となります。終了設定（{renderEndLabel()}）は維持されます。
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button className="btn btn-secondary" onClick={() => setModalType(null)} style={{ flex: 1, padding: '0.6rem' }}>キャンセル</button>
                            <button className="btn btn-primary" onClick={handleConfirmAction} style={{
                                flex: 1, padding: '0.6rem',
                                backgroundColor: (modalType === 'TOGGLE_STATUS' && isCurrentlyOpen) ? 'var(--primary)' : 'var(--success)',
                                borderColor: (modalType === 'TOGGLE_STATUS' && isCurrentlyOpen) ? 'var(--primary)' : 'var(--success)'
                            }}>確定して実行</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Combined Status Manager Card */}
            <div className="card" style={{ padding: '2rem', borderTop: `4px solid ${display.color}` }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>現在の予約受付ステータス</p>
                    <div style={{
                        display: 'inline-block', padding: '0.75rem 2.5rem', borderRadius: '50px',
                        fontSize: '1.5rem', fontWeight: 'bold', color: display.color,
                        backgroundColor: display.bg, border: `2px solid ${display.border}`
                    }}>
                        {display.label}
                    </div>
                </div>

                {hasSavedSchedule && (
                    <div style={{
                        marginBottom: '1.5rem', padding: '1.25rem', backgroundColor: '#fff9db',
                        borderRadius: '8px', border: '1px solid #ffe066'
                    }}>
                        <p style={{ margin: '0 0 0.75rem 0', fontWeight: 'bold', color: '#856404', fontSize: '0.9rem' }}>現在適用中のスケジュール:</p>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', fontSize: '1rem', color: '#856404', flexWrap: 'wrap' }}>
                            <div style={{ background: 'white', padding: '0.4rem 0.8rem', borderRadius: '4px', border: '1px solid #ffe066' }}>
                                {confirmedStart ? formatDateTime(confirmedStart) : '手動で開始'}
                            </div>
                            <span>〜</span>
                            <div style={{ background: 'white', padding: '0.4rem 0.8rem', borderRadius: '4px', border: '1px solid #ffe066' }}>
                                {renderEndLabel()}
                            </div>
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <button
                        onClick={() => setModalType('TOGGLE_STATUS')}
                        disabled={isUpdating}
                        className={`btn ${isCurrentlyOpen ? 'btn-secondary' : 'btn-primary'}`}
                        style={{ width: '100%', padding: '1rem', fontWeight: 'bold', fontSize: '1.1rem' }}
                    >
                        {isUpdating ? '更新中...' : (isCurrentlyOpen ? '予約受付を今すぐ停止する' : '予約受付を今すぐ開始する')}
                    </button>
                </div>
            </div>

            {/* Schedule Manager Card */}
            <div className="card" style={{ padding: '2rem' }}>
                <h3 className="heading-md" style={{ marginBottom: '1.5rem', fontSize: '1.25rem' }}>予約受付スケジュールの設定</h3>

                <div style={{ display: 'grid', gap: '2rem' }}>
                    {/* Start Setting Section */}
                    <div className="form-group" style={{
                        padding: '1.5rem',
                        border: '1px solid var(--card-border)',
                        borderRadius: '8px',
                        background: isCurrentlyOpen ? '#f5f5f5' : '#fcfcfc',
                        opacity: isCurrentlyOpen ? 0.6 : 1,
                        pointerEvents: isCurrentlyOpen ? 'none' : 'auto',
                        position: 'relative'
                    }}>
                        <label style={{ display: 'block', fontSize: '1rem', fontWeight: 'bold', marginBottom: '1rem' }}>
                            1. 受付開始の設定
                            {isCurrentlyOpen && <span style={{ marginLeft: '1rem', color: '#666', fontSize: '0.8rem', fontWeight: 'normal' }}>(受付中のため設定不可)</span>}
                        </label>
                        <div style={{ display: 'grid', gap: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap' }}>
                                <SmartMaskedDatePicker
                                    name="receptionStartDate"
                                    defaultValue={inputStartDate ? new Date(inputStartDate).toISOString() : undefined}
                                    onChange={setInputStartDate}
                                    label="開始日"
                                    style={{ flex: 2, minWidth: '180px' }}
                                />
                                <SmartMaskedTimeInput
                                    name="receptionStartTime"
                                    defaultValue={inputStartTime}
                                    onChange={setInputStartTime}
                                    label="開始時間"
                                    style={{ flex: 1, minWidth: '120px' }}
                                />
                                <span className="text-muted" style={{ fontSize: '0.9rem', whiteSpace: 'nowrap', marginBottom: '12px' }}>から受付開始</span>
                            </div>
                            <p className="text-muted" style={{ fontSize: '0.85rem' }}>※未入力の場合は、保存した直後から受付が開始されます。</p>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                disabled={isUpdating || isCurrentlyOpen}
                                onClick={() => setModalType('SAVE_START')}
                                style={{ width: 'fit-content', padding: '0.5rem 1.5rem', fontSize: '0.9rem' }}
                            >
                                開始日時のみを確定
                            </button>
                        </div>
                    </div>

                    {/* End Setting Section */}
                    <div className="form-group" style={{ padding: '1.5rem', border: '1px solid var(--card-border)', borderRadius: '8px', background: '#fcfcfc' }}>
                        <label style={{ display: 'block', fontSize: '1rem', fontWeight: 'bold', marginBottom: '1rem' }}>2. 受付終了の設定</label>
                        <div style={{ display: 'grid', gap: '1.25rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                                    <input type="radio" name="endMode" value="MANUAL" checked={endMode === 'MANUAL'} onChange={(e) => setEndMode(e.target.value)} />
                                    <span style={{ fontSize: '0.95rem' }}>日時を個別に指定する</span>
                                </label>
                                {endMode === 'MANUAL' && (
                                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap', marginLeft: '1.75rem' }}>
                                        <SmartMaskedDatePicker
                                            name="receptionEndDate"
                                            defaultValue={inputEndDate ? new Date(inputEndDate).toISOString() : undefined}
                                            onChange={setInputEndDate}
                                            label="終了日"
                                            style={{ flex: 2, minWidth: '180px' }}
                                        />
                                        <SmartMaskedTimeInput
                                            name="receptionEndTime"
                                            defaultValue={inputEndTime}
                                            onChange={setInputEndTime}
                                            label="終了時間"
                                            style={{ flex: 1, minWidth: '120px' }}
                                        />
                                    </div>
                                )}
                            </div>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                                <input type="radio" name="endMode" value="PERFORMANCE_START" checked={endMode === 'PERFORMANCE_START'} onChange={(e) => setEndMode(e.target.value)} />
                                <span style={{ fontSize: '0.95rem' }}>各公演回の開始時刻まで受付</span>
                            </label>

                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
                                <input type="radio" name="endMode" value="BEFORE_PERFORMANCE" checked={endMode === 'BEFORE_PERFORMANCE'} onChange={(e) => setEndMode(e.target.value)} style={{ marginTop: '0.4rem' }} />
                                <div style={{ display: 'grid', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '0.95rem' }}>各公演開始の前まで受付（余裕時間を設定）</span>
                                    {endMode === 'BEFORE_PERFORMANCE' && (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginLeft: '0.5rem', marginTop: '0.5rem', maxWidth: '400px' }}>
                                            <NumberStepper
                                                value={endHours}
                                                min={0}
                                                max={72}
                                                onChange={setEndHours}
                                                label="時間"
                                            />
                                            <NumberStepper
                                                value={endMinutesPart}
                                                min={0}
                                                max={59}
                                                onChange={setEndMinutesPart}
                                                label="分前"
                                            />
                                        </div>
                                    )}
                                </div>
                            </label>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                                <input type="radio" name="endMode" value="DAY_BEFORE" checked={endMode === 'DAY_BEFORE'} onChange={(e) => setEndMode(e.target.value)} />
                                <span style={{ fontSize: '0.95rem' }}>各公演日の前日23:59まで受付</span>
                            </label>

                            <button
                                type="button"
                                className="btn btn-secondary"
                                disabled={isUpdating}
                                onClick={() => setModalType('SAVE_END')}
                                style={{ width: 'fit-content', padding: '0.5rem 1.5rem', fontSize: '0.9rem', marginTop: '0.5rem' }}
                            >
                                終了条件のみを確定
                            </button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            {hasSavedSchedule && (
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    disabled={isUpdating}
                                    onClick={() => setModalType('CLEAR_SCHEDULE')}
                                    style={{ padding: '0.75rem 1.5rem' }}
                                >
                                    スケジュール設定をすべて解除
                                </button>
                            )}
                        </div>

                        {scheduleMessage && (
                            <div style={{
                                fontSize: '0.9rem', color: scheduleMessage.type === 'success' ? 'var(--success)' : 'var(--primary)',
                                fontWeight: 'bold', padding: '0.5rem 0', animation: 'fadeIn 0.3s'
                            }}>
                                {scheduleMessage.text}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Link Manager Card with QR Code */}
            <div className="card" style={{ padding: '2rem' }}>
                <h3 className="heading-md" style={{ marginBottom: '1.5rem', fontSize: '1.25rem' }}>一般予約フォーム URL</h3>
                <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--secondary)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--card-border)', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <input type="text" readOnly value={reservationUrl} style={{ flex: 1, border: 'none', background: 'transparent', fontSize: '0.95rem', outline: 'none', color: 'var(--foreground)' }} />
                    <button onClick={handleCopy} className={`btn ${copied ? 'btn-success' : 'btn-secondary'}`} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', minWidth: '80px' }}>{copied ? 'コピー済' : 'コピー'}</button>
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                    <button onClick={handleOpen} className="btn btn-primary" style={{ flex: 1, padding: '1rem', fontWeight: 'bold' }}>予約フォームを開く ↗</button>
                    <button
                        onClick={() => setShowQRCode(!showQRCode)}
                        className="btn btn-secondary"
                        style={{ padding: '1rem', fontWeight: 'bold', minWidth: '140px' }}
                    >
                        {showQRCode ? 'QRコードを閉じる' : 'QRコードを表示'}
                    </button>
                </div>

                {showQRCode && (
                    <div style={{
                        marginTop: '2rem',
                        padding: '2rem',
                        backgroundColor: '#f8f9fa',
                        borderRadius: '12px',
                        border: '1px solid var(--card-border)',
                        textAlign: 'center',
                        animation: 'fadeIn 0.3s'
                    }}>
                        <div style={{ marginBottom: '1.5rem', display: 'inline-block', backgroundColor: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                            <QRCodeSVG
                                value={reservationUrl}
                                size={180}
                                level="H"
                                includeMargin={false}
                                ref={svgRef}
                            />
                            {/* Hidden canvas for PNG export */}
                            <div style={{ display: 'none' }}>
                                <QRCodeCanvas
                                    id="qr-canvas"
                                    value={reservationUrl}
                                    size={1024} // High resolution for PNG
                                    level="H"
                                    includeMargin={true}
                                />
                            </div>
                        </div>

                        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                            チラシやポスター等にご自由にお使いください。
                        </p>

                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                            <button onClick={downloadPNG} className="btn btn-primary" style={{ padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span>📥</span> PNG画像として保存
                            </button>
                            <button onClick={downloadSVG} className="btn btn-secondary" style={{ padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span>📐</span> SVG形式として保存
                            </button>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '1rem' }}>
                            ※SVG形式は拡大してもぼやけない、印刷物に適したデータです。
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
