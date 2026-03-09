'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { SurveyQuestion } from '@/components/SurveyBuilder';
import QRCode from 'qrcode';

/* =========================================
   物理単位定数 & 変換ユーティリティ
   ========================================= */
const DPI = 96;
const MM_PER_INCH = 25.4;
const PX_PER_MM = DPI / MM_PER_INCH;
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const A4_WIDTH_PX = Math.round(A4_WIDTH_MM * PX_PER_MM);
const A4_HEIGHT_PX = Math.round(A4_HEIGHT_MM * PX_PER_MM);
const MARGIN_MM = 15;

const CONTENT_AREA = {
    x: MARGIN_MM,
    y: MARGIN_MM,
    width: A4_WIDTH_MM - MARGIN_MM * 2,
    height: A4_HEIGHT_MM - MARGIN_MM * 2,
    right: A4_WIDTH_MM - MARGIN_MM,
    bottom: A4_HEIGHT_MM - MARGIN_MM,
} as const;

export const mmToPx = (mm: number) => mm * PX_PER_MM;

/* =========================================
   固定コンテンツ定義 (E-1)
   ========================================= */
const FIXED_PRODUCTION = {
    troupe: '天神幕劇',
    title: '試験'
};

const FIXED_QUESTIONS: SurveyQuestion[] = [
    {
        id: 'q1', order: 1, label: '性別', type: 'single_choice', required: false,
        options: [{ id: 'm', label: '男性' }, { id: 'f', label: '女性' }, { id: 'o', label: 'その他・回答しない' }],
        category: 'demographic', layout: null
    },
    {
        id: 'q2', order: 2, label: '年齢', type: 'single_choice', required: false,
        options: [
            { id: '10', label: '10代以下' }, { id: '20', label: '20代' }, { id: '30', label: '30代' },
            { id: '40', label: '40代' }, { id: '50', label: '50代' }, { id: '60', label: '60代以上' }
        ],
        category: 'demographic', layout: null
    },
    {
        id: 'q3', order: 3, label: '本公演を何で知りましたか？', type: 'multi_choice', required: false,
        options: [
            { id: 't', label: '劇場・他公演のチラシ' }, { id: 's', label: 'SNS (X/Instagram)' },
            { id: 'w', label: '公式サイト' }, { id: 'k', label: '知人・出演者の紹介' }
        ],
        category: 'behavior', layout: null
    },
    {
        id: 'q4', order: 4, label: '本日の公演の満足度を教えてください', type: 'single_choice', required: false,
        options: [
            { id: '5', label: '大変満足' }, { id: '4', label: '満足' },
            { id: '3', label: '普通' }, { id: '2', label: 'やや不満' }, { id: '1', label: '不満' }
        ],
        category: 'satisfaction', layout: null
    }
];

const NEWSLETTER_QUESTION: SurveyQuestion = {
    id: 'q_newsletter_optin', order: 99,
    label: '今後の公演情報やお知らせの配信を希望しますか？',
    type: 'newsletter_optin', required: false,
    options: [{ id: 'yes', label: '希望する' }, { id: 'no', label: '希望しない' }],
    category: 'behavior', layout: null,
    subFields: {
        name: { id: 'q_name', label: 'お名前', required: true },
        email: { id: 'q_email', label: 'メールアドレス', required: true },
    },
};

const QR_SIZE_MM = 18;
const HEADER_START_Y_MM = MARGIN_MM + 2;

// OMR メタデータ
interface OMRBoxMeta {
    questionId: string;
    optionId: string;
    type: 'OMR_BOX';
    boundingBox: { x: number; y: number; w: number; h: number };
}
interface OCRBoxMeta {
    questionId: string;
    fieldKey?: string;
    type: 'OCR_BOX';
    boundingBox: { x: number; y: number; w: number; h: number };
}

interface QuestionLayout {
    question: SurveyQuestion;
    questionIndex: number;
    x: number; y: number; width: number; height: number;
    titleHeight: number;
    boxes?: OMRBoxMeta[];
    ocrBoxes?: OCRBoxMeta[];
}

interface HeaderLayout {
    troupeName: string;
    productionName: string;
    greeting: string;
    qrUrl: string;
    boundingBoxes: {
        titleGroup: { x: number; y: number; w: number; h: number };
        greeting: { x: number; y: number; w: number; h: number };
        qrGroup: { x: number; y: number; w: number; h: number };
    };
}

// 簡易計測用
const estimateW = (text: string, fs: number) => {
    if (!text) return 0;
    return [...text].reduce((s, c) => s + (c.match(/[ -~]/) ? 0.6 : 1.1), 0) * fs;
};
const estimateH = (text: string, fs: number, maxW: number) => {
    if (!text) return 0;
    const segments = text.split('\n');
    let totalLines = 0;
    segments.forEach(seg => {
        if (seg === '') totalLines += 1;
        else totalLines += Math.max(1, Math.ceil(estimateW(seg, fs) / maxW));
    });
    return (totalLines * fs * 1.5) + 2.0;
};

interface Props {
    onBack: () => void;
}

export default function UltimateLayoutTuner({ onBack }: Props) {
    // 1. パラメーター状態
    const [fontSizeMode, setFontSizeMode] = useState<'S' | 'M' | 'L'>('M');
    const [feedbackWeight, setFeedbackWeight] = useState<'normal' | 'wide' | 'full'>('normal');

    // 2. フォントサイズ設定 (pt -> mm)
    const fontSizes = {
        S: { title: 3.175, text: 2.8, headerTitle: 6.0 },
        M: { title: 3.704, text: 3.2, headerTitle: 6.5 },
        L: { title: 4.233, text: 3.6, headerTitle: 7.0 }
    };
    const curFonts = fontSizes[fontSizeMode];

    // 3. QRコード生成
    const [qrDataUrl, setQrDataUrl] = useState<string>('');
    useEffect(() => {
        QRCode.toDataURL('https://example.com/survey', { width: 400, margin: 0 }).then(setQrDataUrl);
    }, []);

    // 4. 動的スタッキング・エンジン
    const { headerLayout, questionLayouts, isOverflow, finalParams } = useMemo(() => {
        const blockW = CONTENT_AREA.width;
        const greeting = 'ご来場いただき誠にありがとうございます。\n今後の活動の参考にさせていただきたく、アンケートにご協力ください。';
        const greetingH = estimateH(greeting, curFonts.text, blockW);
        const headerH = 33 + greetingH;

        // [Measure]
        const qParts = FIXED_QUESTIONS;
        const qHeights = qParts.map(q => {
            const label = q.label + (q.type === 'multi_choice' ? '（複数選択可）' : '');
            const titleH = estimateH(label, curFonts.title, blockW);
            const itemH = q.options.length * (curFonts.text * 2.2);
            return { titleH, itemH };
        });

        const newsTitle = NEWSLETTER_QUESTION.label;
        const newsTitleH = estimateH(newsTitle, curFonts.title, blockW);
        const footerH = newsTitleH + 18.0;

        // [Target]
        let targetFT = feedbackWeight === 'normal' ? 30.0 : feedbackWeight === 'wide' ? 50.0 : 80.0;

        const H_MAX = CONTENT_AREA.height;
        const hFixedTotal = headerH + qHeights.reduce((s, c) => s + c.titleH + c.itemH, 0) + footerH + 5.0;

        let sGap = 4.0;
        let iGap = 2.0;
        let h2cGap = 7.0;
        let curFT = targetFT;

        const getReqH = (S: number, FH: number) => {
            const I = Math.max(1.0, S * 0.5);
            const H = 3.0 + (S - 1.0) * (4 / 3);
            const contentH = qHeights.reduce((s, c) => s + c.titleH + I + c.itemH, 0);
            return headerH + H + contentH + (qParts.length * S) + FH + footerH;
        };

        let totalH = getReqH(sGap, curFT);
        let overflow = false;

        if (totalH > H_MAX) {
            sGap = 1.0; iGap = 1.0; h2cGap = 3.0;
            curFT = Math.max(10.0, H_MAX - getReqH(1.0, 0));
            if (getReqH(1.0, curFT) > H_MAX + 0.1) overflow = true;
        } else if (feedbackWeight === 'full') {
            curFT += (H_MAX - totalH);
        }

        // 配置確定
        const layouts: QuestionLayout[] = [];
        let curY = HEADER_START_Y_MM + headerH + h2cGap;

        qParts.forEach((q, idx) => {
            const { titleH, itemH } = qHeights[idx];
            const blockH = titleH + iGap + itemH;
            const boxes: OMRBoxMeta[] = q.options.map((opt, i) => ({
                questionId: q.id, optionId: opt.id, type: 'OMR_BOX',
                boundingBox: { x: MARGIN_MM, y: curY + titleH + iGap + i * (curFonts.text * 2.2), w: 4, h: 4 }
            }));
            layouts.push({ question: q, questionIndex: idx + 1, x: MARGIN_MM, y: curY, width: blockW, height: blockH, titleHeight: titleH, boxes });
            curY += blockH + sGap;
        });

        // 自由記述欄
        const ftLabel = 'ご感想・ご要望';
        const ftTitleH = estimateH(ftLabel, curFonts.title, blockW);
        const ftBlockH = ftTitleH + iGap + curFT;
        layouts.push({
            question: { id: 'q_free', order: 5, label: ftLabel, type: 'free_text', required: false, options: [], category: 'custom', layout: null },
            questionIndex: 5, x: MARGIN_MM, y: curY, width: blockW, height: ftBlockH, titleHeight: ftTitleH,
            ocrBoxes: [{ questionId: 'q_free', type: 'OCR_BOX', boundingBox: { x: MARGIN_MM, y: curY + ftTitleH + iGap, w: blockW, h: curFT } }]
        });

        // フッター
        const fY = CONTENT_AREA.bottom - footerH;
        const newsBoxes: OMRBoxMeta[] = [{ questionId: NEWSLETTER_QUESTION.id, optionId: 'yes', type: 'OMR_BOX', boundingBox: { x: MARGIN_MM, y: fY + newsTitleH + 2.5, w: 4, h: 4 } }];
        layouts.push({ question: NEWSLETTER_QUESTION, questionIndex: 6, x: MARGIN_MM, y: fY, width: blockW, height: footerH, titleHeight: newsTitleH, boxes: newsBoxes });

        const header: HeaderLayout = {
            troupeName: FIXED_PRODUCTION.troupe, productionName: FIXED_PRODUCTION.title, greeting, qrUrl: 'https://example.com/survey',
            boundingBoxes: {
                titleGroup: { x: MARGIN_MM, y: HEADER_START_Y_MM + 2, w: blockW, h: 26 },
                greeting: { x: MARGIN_MM, y: HEADER_START_Y_MM + 33, w: blockW, h: greetingH },
                qrGroup: { x: CONTENT_AREA.right - QR_SIZE_MM - 5, y: HEADER_START_Y_MM + 2, w: QR_SIZE_MM + 4, h: 26 }
            }
        };

        return { headerLayout: header, questionLayouts: layouts, isOverflow: overflow, finalParams: { sGap, iGap, h2cGap, fH: curFT } };
    }, [fontSizeMode, feedbackWeight, curFonts]);

    // 5. 出力
    const handlePrint = () => window.print();
    const handleExportJSON = () => {
        const data = { header: headerLayout, questions: questionLayouts };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'layout_coords.json'; a.click();
    };

    return (
        <div style={{ display: 'flex', height: '100vh', backgroundColor: '#1a1a1a', color: '#eee' }}>
            <style>{`
                @media print {
                    @page { size: A4; margin: 0; }
                    body * { visibility: hidden; }
                    .print-area, .print-area * { visibility: visible; }
                    .print-area { position: absolute; left: 0; top: 0; width: 210mm; height: 297mm; }
                    .no-print { display: none !important; }
                }
            `}</style>

            <aside className="no-print" style={{ width: '320px', borderRight: '1px solid #333', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button
                        onClick={onBack}
                        style={{
                            background: '#333', border: '1px solid #444', color: '#ccc',
                            padding: '0.4rem 0.6rem', borderRadius: '6px', cursor: 'pointer',
                            fontSize: '0.8rem'
                        }}
                    >
                        ← 戻る
                    </button>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>🎛️ Tuner MVP</h2>
                </div>

                <section>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#888', marginBottom: '0.75rem' }}>フォントサイズ</label>
                    <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid #444' }}>
                        {(['S', 'M', 'L'] as const).map(size => (
                            <button
                                key={size}
                                onClick={() => setFontSizeMode(size)}
                                style={{
                                    flex: 1, padding: '0.75rem 0', border: 'none', cursor: 'pointer',
                                    backgroundColor: fontSizeMode === size ? '#3b82f6' : 'transparent',
                                    color: fontSizeMode === size ? 'white' : '#777',
                                    fontWeight: fontSizeMode === size ? 'bold' : 'normal',
                                    transition: 'all 0.2s', fontSize: '0.9rem'
                                }}
                            >
                                {size}
                            </button>
                        ))}
                    </div>
                </section>

                <section>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#888', marginBottom: '0.75rem' }}>感想欄の重み</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        {(['normal', 'wide', 'full'] as const).map(w => (
                            <label key={w} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem', borderRadius: '10px', backgroundColor: feedbackWeight === w ? '#2d3748' : '#252525', border: `1px solid ${feedbackWeight === w ? '#4a5568' : '#333'}`, cursor: 'pointer' }}>
                                <input type="radio" checked={feedbackWeight === w} onChange={() => setFeedbackWeight(w)} style={{ accentColor: '#3b82f6' }} />
                                <span style={{ fontSize: '0.9rem', color: feedbackWeight === w ? '#fff' : '#aaa' }}>
                                    {w === 'normal' ? '標準 (30mm)' : w === 'wide' ? '広め (50mm)' : '最大 (Full)'}
                                </span>
                            </label>
                        ))}
                    </div>
                </section>

                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <button onClick={handlePrint} style={{ padding: '0.9rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}>
                        📄 高品質PDFを出力
                    </button>
                    <button onClick={handleExportJSON} style={{ padding: '0.9rem', backgroundColor: 'transparent', color: '#aaa', border: '1px solid #444', borderRadius: '10px', cursor: 'pointer' }}>
                        💾 座標JSONを保存
                    </button>
                </div>
            </aside>

            <main style={{ flex: 1, padding: '2.5rem', overflow: 'auto', display: 'flex', justifyContent: 'center', backgroundColor: '#222' }}>
                <div className="print-area" style={{ width: `${A4_WIDTH_PX}px`, height: `${A4_HEIGHT_PX}px`, backgroundColor: 'white', position: 'relative', flexShrink: 0 }}>
                    <svg width="100%" height="100%" viewBox={`0 0 ${A4_WIDTH_MM} ${A4_HEIGHT_MM}`}>
                        <g transform={`translate(${A4_WIDTH_MM / 2}, ${headerLayout.boundingBoxes.titleGroup.y})`}>
                            <text x="0" y="0" fontSize={curFonts.headerTitle * 0.8} fontWeight="bold" textAnchor="middle" dominantBaseline="hanging">[[{headerLayout.troupeName}]]</text>
                            <text x="0" y="10" fontSize={curFonts.headerTitle} fontWeight="bold" textAnchor="middle" dominantBaseline="middle">『{headerLayout.productionName}』</text>
                            <text x="0" y="20" fontSize={curFonts.headerTitle * 0.9} fontWeight="bold" textAnchor="middle" dominantBaseline="alphabetic">来場者アンケート</text>
                        </g>
                        {qrDataUrl && (
                            <image x={CONTENT_AREA.right - QR_SIZE_MM} y={CONTENT_AREA.y} width={QR_SIZE_MM} height={QR_SIZE_MM} href={qrDataUrl} />
                        )}
                        <foreignObject x={headerLayout.boundingBoxes.greeting.x} y={headerLayout.boundingBoxes.greeting.y} width={headerLayout.boundingBoxes.greeting.w} height={headerLayout.boundingBoxes.greeting.h}>
                            <div style={{ fontSize: `${curFonts.text}mm`, lineHeight: 1.5, whiteSpace: 'pre-wrap', color: '#000', fontFamily: 'sans-serif' }}>{headerLayout.greeting}</div>
                        </foreignObject>

                        {questionLayouts.map(ql => (
                            <g key={ql.question.id} transform={`translate(${ql.x}, ${ql.y})`}>
                                <text x="0" y="0" fontSize={`${curFonts.title}mm`} fontWeight="bold" dominantBaseline="hanging">
                                    {ql.questionIndex}. {ql.question.label}{ql.question.type === 'multi_choice' ? '（複数選択可）' : ''}
                                </text>
                                {ql.boxes?.map(box => (
                                    <g key={box.optionId} transform={`translate(${box.boundingBox.x - ql.x}, ${box.boundingBox.y - ql.y})`}>
                                        <rect width="4" height="4" fill="none" stroke="#000" strokeWidth="0.2" />
                                        <text x="6" y="2" fontSize={`${curFonts.text}mm`} dominantBaseline="middle">
                                            {ql.question.options.find(o => o.id === box.optionId)?.label || (box.optionId === 'yes' ? '希望する' : '')}
                                        </text>
                                    </g>
                                ))}
                                {ql.ocrBoxes?.map(box => (
                                    <rect key={box.fieldKey || 'ocr'} x={box.boundingBox.x - ql.x} y={box.boundingBox.y - ql.y} width={box.boundingBox.w} height={box.boundingBox.h} fill="none" stroke="#000" strokeWidth="0.2" />
                                ))}
                            </g>
                        ))}
                    </svg>
                    {isOverflow && (
                        <div className="no-print" style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#ef4444', color: 'white', padding: '0.5rem 1rem', borderRadius: '6px', fontWeight: 'bold' }}>
                            ⚠️ 1ページに収まりません
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
