'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

interface Props {
    url: string;
    productionTitle: string;
    onCopy: () => void;
}

export default function SurveyQRSection({ url, productionTitle, onCopy }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        if (canvasRef.current) {
            QRCode.toCanvas(canvasRef.current, url, {
                width: 220,
                margin: 2,
                color: { dark: '#1a1a2e', light: '#ffffff' },
            }, (err) => {
                if (!err) setReady(true);
            });
        }
    }, [url]);

    const sanitize = (s: string) => s.replace(/[\\/:*?"<>|]/g, '_');

    const downloadPNG = () => {
        if (!canvasRef.current) return;
        // 高解像度で再生成してダウンロード
        const tempCanvas = document.createElement('canvas');
        QRCode.toCanvas(tempCanvas, url, { width: 600, margin: 3, color: { dark: '#1a1a2e', light: '#ffffff' } }, () => {
            const link = document.createElement('a');
            link.download = `survey_qr_${sanitize(productionTitle)}.png`;
            link.href = tempCanvas.toDataURL('image/png');
            link.click();
        });
    };

    const downloadSVG = () => {
        QRCode.toString(url, { type: 'svg', width: 600, margin: 3, color: { dark: '#1a1a2e', light: '#ffffff' } }, (err, svg) => {
            if (err || !svg) return;
            const blob = new Blob([svg], { type: 'image/svg+xml' });
            const link = document.createElement('a');
            link.download = `survey_qr_${sanitize(productionTitle)}.svg`;
            link.href = URL.createObjectURL(blob);
            link.click();
            URL.revokeObjectURL(link.href);
        });
    };

    return (
        <div style={{
            padding: '1.5rem', backgroundColor: '#fcfcfc',
            borderRadius: '8px', border: '1px solid var(--card-border)',
        }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 'bold', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>📱</span> QRコード共有
            </h4>

            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                {/* QRコード表示 */}
                <div style={{
                    backgroundColor: '#fff', padding: '0.75rem', borderRadius: '10px',
                    border: '1px solid #eee', display: 'inline-block', flexShrink: 0,
                }}>
                    <canvas ref={canvasRef} style={{ display: 'block' }} />
                </div>

                {/* 操作パネル */}
                <div style={{ flex: 1, minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {/* URL表示 + コピー */}
                    <div style={{
                        padding: '0.5rem 0.75rem', backgroundColor: '#f0fdf4',
                        borderRadius: '6px', fontSize: '0.75rem', color: '#166534',
                        wordBreak: 'break-all', lineHeight: '1.5',
                    }}>
                        🔗 {url}
                    </div>
                    <button
                        onClick={() => { navigator.clipboard.writeText(url); onCopy(); }}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.8rem', padding: '0.5rem 0.8rem' }}
                    >
                        📋 URLをコピー
                    </button>

                    {/* ダウンロードボタン */}
                    <div style={{ marginTop: '0.25rem' }}>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                            QRコードをダウンロード:
                        </p>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={downloadPNG} disabled={!ready}
                                className="btn btn-secondary"
                                style={{ flex: 1, fontSize: '0.8rem', padding: '0.5rem' }}>
                                🖼️ PNG
                            </button>
                            <button onClick={downloadSVG} disabled={!ready}
                                className="btn btn-secondary"
                                style={{ flex: 1, fontSize: '0.8rem', padding: '0.5rem' }}>
                                📐 SVG（印刷用）
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
