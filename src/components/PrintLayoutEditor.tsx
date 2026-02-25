'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { SurveyQuestion } from '@/components/SurveyBuilder';
import QRCode from 'qrcode';

/* =========================================
   物理単位定数 & 変換ユーティリティ
   ========================================= */

const DPI = 96;
const MM_PER_INCH = 25.4;
const PX_PER_MM = DPI / MM_PER_INCH; // ≈ 3.7795
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const A4_WIDTH_PX = Math.round(A4_WIDTH_MM * PX_PER_MM);   // 794
const A4_HEIGHT_PX = Math.round(A4_HEIGHT_MM * PX_PER_MM); // 1123

const RULER_SIZE = 30; // px — ルーラーの幅/高さ

// L字マーカー定数
const MARKER_ARM_MM = 10;       // L字の各辺の長さ (mm)
const MARKER_STROKE_MM = 0.5;   // L字の線幅 (mm)

// 印刷不可領域（デッドゾーン）定数
const MARGIN_MM = 15;           // D-3要件: 15mm固定マージン

// プライマリ・コンテンツエリア（L字マーカーで囲まれた配置可能範囲）
const CONTENT_AREA = {
    x: MARGIN_MM,
    y: MARGIN_MM,
    width: A4_WIDTH_MM - MARGIN_MM * 2,       // 180mm 固定
    height: A4_HEIGHT_MM - MARGIN_MM * 2,     // 267mm
    right: A4_WIDTH_MM - MARGIN_MM,           // 195mm
    bottom: A4_HEIGHT_MM - MARGIN_MM,         // 282mm
} as const;

// QRコード配置定数
// ──────────────────────────────────────────
// ※ 将来「用紙内の別の位置に移動」する場合は、
//    QR_X_MM / QR_Y_MM の値を変えるだけで対応可能。
//    isInContentArea() でマージン内に収まることを検証推奨。
// ──────────────────────────────────────────
const QR_SIZE_MM = 18;                                       // 18mmに拡大（視認性向上）
const QR_QUIET_ZONE_MM = 1.5;                                // 余白もわずかに調整
const QR_X_MM = CONTENT_AREA.right - QR_SIZE_MM;
const QR_Y_MM = CONTENT_AREA.y;

// D-5.1 要件に基づくレイアウト定数
const HEADER_GAP_RECOMMENDED = 7.0;
const HEADER_GAP_MIN = 3.0;

const SECTION_GAP_RECOMMENDED = 4.0;
const SECTION_GAP_MIN = 1.0;

const INNER_GAP_RECOMMENDED = 3.0;
const INNER_GAP_MIN = 1.0;

const FREE_TEXT_HEIGHT_RECOMMENDED = 30.0;
const FREE_TEXT_HEIGHT_MIN = 10.0;

// 描画・計測用必須定数 (復元)
const HEADER_START_Y_MM = MARGIN_MM + 2;
const HEADER_HEIGHT_MM = 41;
const HEADER_MARGIN_BOTTOM_MM = 0;
const HEADER_TITLE_FONT_SIZE_MM = 6.5;
const HEADER_TEXT_FONT_SIZE_MM = 3.2;

const OMR_BOX_SIZE_MM = 4;
const OMR_STROKE_MM = 0.2;
const OMR_GAP_MM = 2;
const OMR_LINE_HEIGHT_MM = 8;
const OMR_FONT_SIZE_MM = 3.5;
const OMR_H_OPTION_GAP_MM = 6;

const OCR_BOX_STROKE_MM = 0.2;
const OCR_GUIDE_STROKE_MM = 0.1;
const RATING_LABEL_FONT_SIZE_MM = 3.2;

// OMRメタデータ型
export interface OMRBoxMeta {
    questionId: string;
    optionId: string;
    type: 'OMR_BOX';
    boundingBox: { x: number; y: number; w: number; h: number }; // mm絶対座標
}
export interface OCRBoxMeta {
    questionId: string;
    fieldKey?: string; // subFields用 (name, email等)
    type: 'OCR_BOX';
    boundingBox: { x: number; y: number; w: number; h: number }; // mm絶対座標
}

// 各設問ブロックのレイアウト情報
interface QuestionLayout {
    question: SurveyQuestion;
    questionIndex: number; // 1始まりの設啎番号
    x: number;   // mm
    y: number;   // mm
    width: number; // レイアウトブロックの幅 (mm)
    height: number; // D-3追加: ブロック全体の高さ (mm)
    titleHeight?: number; // 動的に計測された見出しの高さ
    boxes?: OMRBoxMeta[];
    ocrBoxes?: OCRBoxMeta[];
}

// ヘッダーのレイアウト情報
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

export const mmToPx = (mm: number) => mm * PX_PER_MM;
export const pxToMm = (px: number) => px / PX_PER_MM;

/**
 * テキストの幅を推定するヘルパー (mm単位)
 * @param text テキスト
 * @param fontSizeMM フォントサイズ (mm)
 * @returns 推定される幅 (mm)
 */
export const estimateTextWidth = (text: string, fontSizeMM: number): number => {
    if (!text) return 0;
    // 日本語文字（全角）を1.1、英数字（半角）を0.6として計測（安全マージン込）
    return [...text].reduce((sum, char) => sum + (char.match(/[ -~]/) ? 0.6 : 1.1), 0) * fontSizeMM;
};

/**
 * テキストの高さを推定するヘルパー (mm単位)
 * 行数 = ceil(合計幅 / 最大幅)
 * 高さ = 行数 * (フォントサイズ * 行間)
 */
export const estimateTextHeight = (text: string, fontSizeMM: number, maxWidthMM: number, lineWeight: number = 1.5): number => {
    if (!text) return 0;
    const totalWidthMM = estimateTextWidth(text, fontSizeMM);
    const lines = Math.ceil(totalWidthMM / maxWidthMM);
    // フォントサイズ * 行間 * 行数 + 2.0mm (Descentバッファ)
    return (lines * fontSizeMM * lineWeight) + 2.0;
};

/* =========================================
   座標系定義
   -----------------------------------------
   • 絶対原点 (0,0) = 用紙左上端
   • 基準点 = L字マーカー位置 (6,6), (204,6), (6,291), (204,291)
   • JSON出力時: 座標は絶対原点(mm)で記録、マーカー位置を別フィールドで保持
   • CV補正時: マーカー4点を探索 → パース補正 → 絶対座標で各要素を特定
   ========================================= */

/**
 * 指定された矩形がプライマリ・コンテンツエリア内に完全に収まるか検証
 * @param x 左上X (mm, 絶対座標)
 * @param y 左上Y (mm, 絶対座標)
 * @param w 幅 (mm)
 * @param h 高さ (mm)
 * @returns エリア内なら true
 */
export function isInContentArea(x: number, y: number, w: number, h: number): boolean {
    return (
        x >= CONTENT_AREA.x &&
        y >= CONTENT_AREA.y &&
        x + w <= CONTENT_AREA.right &&
        y + h <= CONTENT_AREA.bottom
    );
}

/* =========================================
   Props
   ========================================= */

interface Props {
    questions: SurveyQuestion[];
    templateTitle: string; // 本来の公演名が渡される
    templateId: string;
    productionId: string;
    troupeName: string;
    onBack: () => void;
}

interface FinalParams {
    sGap: number;
    h2cGap: number;
    iGap: number;
    fH: number;
    hTotalIdeal: number;
}

/* =========================================
   メインコンポーネント
   ========================================= */

export default function PrintLayoutEditor({ questions, templateTitle, templateId, productionId, troupeName, onBack }: Props) {
    const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
    const [showMarkers, setShowMarkers] = useState(true);
    const [layoutMode, setLayoutMode] = useState<'vertical' | 'horizontal'>('horizontal');
    const canvasAreaRef = useRef<HTMLDivElement>(null);

    // QRコード用URL生成
    const qrUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/book/${productionId}/survey?tid=${templateId}&mode=paper_scan`
        : '';

    // 自動レイアウト計算：Header + questions → 配置座標
    // 自動レイアウト計算：Header + questions → 配置座標
    const { headerLayout, questionLayouts, isOverflow, finalParams } = useMemo(() => {
        const blockW = A4_WIDTH_MM - MARGIN_MM * 2; // 180mm固定
        const greetingText = 'ご来場いただき誠にありがとうございます。今後の活動の励みとなりますのでアンケートへのご回答をお願い致します。';
        const greetingH = estimateTextHeight(greetingText, HEADER_TEXT_FONT_SIZE_MM, blockW);

        // 1. Measure (パーツの固定高度を算出)
        // ──────────────────────────────────────────
        const headerH = 33 + greetingH + HEADER_MARGIN_BOTTOM_MM; // HEADER_START_Y_MM からの相対
        const qParts = questions.filter(
            q => q.type === 'single_choice' || q.type === 'multi_choice' || q.type === 'free_text'
        );
        const newsQ = questions.find(q => q.type === 'newsletter_optin');

        const qHeights = qParts.map(q => {
            const fullTitle = q.label + (q.type === 'multi_choice' ? '（複数選択可）' : '');
            const titleH = estimateTextHeight(fullTitle, OMR_FONT_SIZE_MM, blockW);
            let itemH = 0;
            if (q.type === 'free_text') {
                itemH = 0; // fH で後から加算
            } else {
                if (layoutMode === 'vertical') {
                    itemH = q.options.length * OMR_LINE_HEIGHT_MM;
                } else {
                    // 物理幅に基づく Flex-wrap シミュレーション
                    const boxPlusTextGap = OMR_BOX_SIZE_MM + OMR_GAP_MM;
                    const optionRightGap = OMR_H_OPTION_GAP_MM;
                    const rowGap = 2.5; // 行間の追加余白

                    let rows = 1;
                    let curRowW = 0;
                    q.options.forEach(opt => {
                        const labelW = estimateTextWidth(opt.label, OMR_FONT_SIZE_MM);
                        const optW = boxPlusTextGap + labelW + optionRightGap;

                        if (curRowW + optW > blockW && curRowW > 0) {
                            rows++;
                            curRowW = optW;
                        } else {
                            curRowW += optW;
                        }
                    });
                    itemH = (rows * OMR_LINE_HEIGHT_MM) + (rows > 1 ? (rows - 1) * rowGap : 0);
                }
            }
            return { titleH, itemH };
        });

        let footerH = 0;
        let newsTitleH = 0;
        if (newsQ) {
            const title = '今後の公演情報やお知らせの配信を希望しますか？';
            newsTitleH = estimateTextHeight(title, OMR_FONT_SIZE_MM, blockW);
            footerH = newsTitleH + 4.0 + OMR_BOX_SIZE_MM + 6;
            if (newsQ.subFields) {
                if (newsQ.subFields.name) footerH += 10 + 4;
                if (newsQ.subFields.email) footerH += 10 + 4;
            }
        }

        const FOOTER_MARGIN_MM = 5.0; // フッター（配信希望）直前のセーフティマージン
        // 2. 3段階配置アルゴリズム (D-5.1)
        const H_MAX = 267.0;
        const gapCount = qParts.length;
        const freeTextCount = qParts.filter(q => q.type === 'free_text').length;
        const hFixedTotal = headerH + qHeights.reduce((s, c) => s + c.titleH + c.itemH, 0) + footerH + (newsQ ? FOOTER_MARGIN_MM : 0);

        // 【STEP 1: 理想の配置】
        let curH2C = HEADER_GAP_RECOMMENDED;
        let curSG = SECTION_GAP_RECOMMENDED;
        let curIG = INNER_GAP_RECOMMENDED;
        let curFT = FREE_TEXT_HEIGHT_RECOMMENDED;

        let totalH = hFixedTotal + curH2C + (gapCount * curSG) + (qParts.length * curIG) + (freeTextCount * curFT);

        if (totalH <= H_MAX) {
            if (freeTextCount > 0) {
                const surplus = H_MAX - totalH;
                curFT += surplus / freeTextCount;
            }
        } else {
            // 【STEP 2: 余白の圧縮】
            const idealVarH = curH2C + (gapCount * curSG) + (qParts.length * curIG);
            const minVarH = HEADER_GAP_MIN + (gapCount * SECTION_GAP_MIN) + (qParts.length * INNER_GAP_MIN);
            const overflow = totalH - H_MAX;
            const canShrink = idealVarH - minVarH;

            if (overflow <= canShrink && canShrink > 0) {
                const ratio = (canShrink - overflow) / canShrink;
                curH2C = HEADER_GAP_MIN + (HEADER_GAP_RECOMMENDED - HEADER_GAP_MIN) * ratio;
                curSG = SECTION_GAP_MIN + (SECTION_GAP_RECOMMENDED - SECTION_GAP_MIN) * ratio;
                curIG = INNER_GAP_MIN + (INNER_GAP_RECOMMENDED - INNER_GAP_MIN) * ratio;
            } else {
                // 【STEP 3: 緊急圧縮】
                curH2C = HEADER_GAP_MIN;
                curSG = SECTION_GAP_MIN;
                curIG = INNER_GAP_MIN;
                const hWithMinMargins = hFixedTotal + curH2C + (gapCount * curSG) + (qParts.length * curIG) + (freeTextCount * curFT);
                const overflowRel = hWithMinMargins - H_MAX;
                if (freeTextCount > 0) {
                    curFT = Math.max(FREE_TEXT_HEIGHT_MIN, curFT - (overflowRel / freeTextCount));
                }
            }
        }

        // 3. Draw (配置の確定)
        // ──────────────────────────────────────────
        const layouts: QuestionLayout[] = [];
        let curY = HEADER_START_Y_MM + headerH + curH2C;

        qParts.forEach((q, idx) => {
            const { titleH, itemH: fixedItemH } = qHeights[idx];
            const itemActualH = (q.type === 'free_text') ? curFT : fixedItemH;
            const blockHeight = titleH + curIG + itemActualH;

            if (q.type === 'free_text') {
                const ocrBoxes: OCRBoxMeta[] = [{
                    questionId: q.id, type: 'OCR_BOX' as const,
                    boundingBox: { x: MARGIN_MM, y: curY + titleH + curIG, w: blockW, h: curFT }
                }];
                layouts.push({ question: q, questionIndex: idx + 1, x: MARGIN_MM, y: curY, width: blockW, height: blockHeight, titleHeight: titleH, ocrBoxes });
            } else {
                const boxes: OMRBoxMeta[] = [];
                const internalY = curY + titleH + curIG;
                if (layoutMode === 'vertical') {
                    q.options.forEach((opt, i) => {
                        boxes.push({ questionId: q.id, optionId: opt.id, type: 'OMR_BOX' as const, boundingBox: { x: MARGIN_MM, y: internalY + i * OMR_LINE_HEIGHT_MM, w: OMR_BOX_SIZE_MM, h: OMR_BOX_SIZE_MM } });
                    });
                } else {
                    let cX = 0;
                    let cY = 0;
                    const boxPlusTextGap = OMR_BOX_SIZE_MM + OMR_GAP_MM;
                    const optionRightGap = OMR_H_OPTION_GAP_MM;
                    const rowGap = 2.5;

                    q.options.forEach((opt) => {
                        const labelW = estimateTextWidth(opt.label, OMR_FONT_SIZE_MM);
                        const optW = boxPlusTextGap + labelW + optionRightGap;

                        if (cX + optW > blockW && cX > 0) {
                            cX = 0;
                            cY += OMR_LINE_HEIGHT_MM + rowGap;
                        }

                        boxes.push({
                            questionId: q.id, optionId: opt.id, type: 'OMR_BOX' as const,
                            boundingBox: {
                                x: MARGIN_MM + cX,
                                y: internalY + cY,
                                w: OMR_BOX_SIZE_MM,
                                h: OMR_BOX_SIZE_MM
                            }
                        });
                        cX += optW;
                    });
                }
                layouts.push({ question: q, questionIndex: idx + 1, x: MARGIN_MM, y: curY, width: blockW, height: blockHeight, titleHeight: titleH, boxes });
            }
            curY += blockHeight + curSG;
        });

        if (newsQ) {
            const fY = CONTENT_AREA.bottom - footerH;
            const ocrBoxes: OCRBoxMeta[] = [];
            const boxes: OMRBoxMeta[] = [];
            const optInY = fY + newsTitleH + 4.0;
            boxes.push({ questionId: newsQ.id, optionId: 'opt_in', type: 'OMR_BOX' as const, boundingBox: { x: MARGIN_MM, y: optInY, w: OMR_BOX_SIZE_MM, h: OMR_BOX_SIZE_MM } });
            let subY = optInY + OMR_BOX_SIZE_MM + 6;
            if (newsQ.subFields) {
                if (newsQ.subFields.name) {
                    ocrBoxes.push({ questionId: newsQ.id, fieldKey: 'name', type: 'OCR_BOX' as const, boundingBox: { x: MARGIN_MM + 40, y: subY, w: 120, h: 10 } });
                    subY += 10 + curIG * 0.8;
                }
                if (newsQ.subFields.email) {
                    ocrBoxes.push({ questionId: newsQ.id, fieldKey: 'email', type: 'OCR_BOX' as const, boundingBox: { x: MARGIN_MM + 40, y: subY, w: 120, h: 10 } });
                }
            }
            layouts.push({ question: newsQ, questionIndex: qParts.length + 1, x: MARGIN_MM, y: fY, width: blockW, height: footerH, titleHeight: newsTitleH, ocrBoxes, boxes });
        }

        let overlappingFound = false;
        for (let i = 0; i < layouts.length - 1; i++) {
            if (layouts[i].y + layouts[i].height > layouts[i + 1].y + 0.01) {
                overlappingFound = true;
                break;
            }
        }
        const lastLayout = layouts[layouts.length - 1];
        if (lastLayout && lastLayout.y + lastLayout.height > CONTENT_AREA.bottom + 0.1) {
            overlappingFound = true;
        }

        const header: HeaderLayout = {
            troupeName: troupeName || '劇団名', productionName: templateTitle || '公演名', greeting: greetingText, qrUrl,
            boundingBoxes: {
                titleGroup: { x: MARGIN_MM, y: HEADER_START_Y_MM + 2, w: blockW, h: 26 },
                greeting: { x: MARGIN_MM, y: HEADER_START_Y_MM + 33, w: blockW, h: greetingH },
                qrGroup: { x: CONTENT_AREA.right - QR_SIZE_MM - 15, y: HEADER_START_Y_MM + 2, w: QR_SIZE_MM + 12, h: 26 }
            }
        };

        const fParams: FinalParams = { sGap: curSG, h2cGap: curH2C, iGap: curIG, fH: curFT, hTotalIdeal: totalH };
        return { headerLayout: header, questionLayouts: layouts, isOverflow: overlappingFound, finalParams: fParams };
    }, [questions, layoutMode, qrUrl, templateTitle, troupeName]);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.currentTarget.querySelector('[data-canvas]') as HTMLElement | null;
        if (!target) return;
        const rect = target.getBoundingClientRect();
        const x = pxToMm(e.clientX - rect.left);
        const y = pxToMm(e.clientY - rect.top);
        if (x >= 0 && x <= A4_WIDTH_MM && y >= 0 && y <= A4_HEIGHT_MM) {
            setMousePos({ x, y });
        } else {
            setMousePos(null);
        }
    }, []);

    const handleMouseLeave = useCallback(() => setMousePos(null), []);

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 50,
            backgroundColor: '#1e1e1e',
            display: 'flex', flexDirection: 'column',
            fontFamily: "'Inter', 'Segoe UI', sans-serif",
        }}>
            {/* ── ヘッダーバー ── */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 1rem', height: '48px', flexShrink: 0,
                backgroundColor: '#2d2d2d', borderBottom: '1px solid #404040',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button
                        onClick={onBack}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                            padding: '0.35rem 0.75rem', borderRadius: '6px',
                            border: '1px solid #555', backgroundColor: 'transparent',
                            color: '#ccc', fontSize: '0.8rem', cursor: 'pointer',
                            transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#404040'; e.currentTarget.style.borderColor = '#777'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = '#555'; }}
                    >
                        ← ハブに戻る
                    </button>
                    <div style={{ width: '1px', height: '24px', backgroundColor: '#404040' }} />
                    <span style={{ color: '#999', fontSize: '0.8rem' }}>🖨️ 印刷レイアウトエディタ</span>
                    <span style={{ color: '#666', fontSize: '0.75rem' }}>— {templateTitle}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                    {/* オーバーフロー警告 */}
                    {isOverflow && (
                        <div style={{
                            backgroundColor: '#ef4444', color: '#fff',
                            padding: '0.3rem 0.75rem', borderRadius: '4px',
                            fontSize: '0.75rem', fontWeight: 'bold',
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            animation: 'pulse 2s infinite'
                        }}>
                            <span>⚠️ 設問が1枚に収まりきりません。内容を削るか調整が必要です</span>
                            <style>{`@keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.7; } 100% { opacity: 1; } }`}</style>
                        </div>
                    )}

                    {/* マーカー表示トグル */}
                    <label style={{
                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                        cursor: 'pointer', userSelect: 'none',
                    }}>
                        <span style={{ fontSize: '0.75rem', color: '#999' }}>📐 マーカー</span>
                        <span
                            onClick={() => setShowMarkers(v => !v)}
                            style={{
                                position: 'relative', display: 'inline-block',
                                width: '32px', height: '18px', borderRadius: '9px',
                                backgroundColor: showMarkers ? '#3b82f6' : '#555',
                                cursor: 'pointer', transition: 'background-color 0.2s',
                            }}
                        >
                            <span style={{
                                position: 'absolute',
                                top: '2px',
                                left: showMarkers ? '16px' : '2px',
                                width: '14px', height: '14px', borderRadius: '50%',
                                backgroundColor: '#fff',
                                transition: 'left 0.2s',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                            }} />
                        </span>
                    </label>
                    <div style={{ width: '1px', height: '20px', backgroundColor: '#404040' }} />
                    <CoordinateDisplay mousePos={mousePos} />
                </div>
            </div>

            {/* ── キャンバスエリア（スクロール可能） ── */}
            <div
                ref={canvasAreaRef}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                style={{
                    flex: 1, overflow: 'auto',
                    display: 'flex', justifyContent: 'center',
                    padding: '2rem',
                    backgroundColor: '#2a2a2a',
                }}
            >
                {/* デバッグ情報オーバーレイ (右上へ移動) */}
                <div style={{
                    position: 'fixed', top: '20px', right: '20px',
                    background: 'rgba(0,0,0,0.85)', color: '#00ff00',
                    padding: '12px', borderRadius: '4px', fontSize: '13px',
                    zIndex: 10000, pointerEvents: 'none', fontFamily: 'monospace',
                    boxShadow: '0 0 10px rgba(0,0,0,0.5)',
                    border: '1px solid #00ff00'
                }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px', borderBottom: '1px solid #00ff00' }}>--- DEBUG LAYOUT ---</div>
                    <div>H_max: 267.00 mm</div>
                    <div>H_total (Ideal): {finalParams.hTotalIdeal.toFixed(2)} mm</div>
                    <div style={{ color: finalParams.sGap < 1.0 ? '#ffff00' : '#00ff00' }}>Applied SG: {finalParams.sGap.toFixed(2)} mm</div>
                    <div style={{ color: finalParams.iGap < 1.0 ? '#ffff00' : '#00ff00' }}>Applied IG: {finalParams.iGap.toFixed(2)} mm</div>
                    <div style={{ color: finalParams.h2cGap < 1.0 ? '#ffff00' : '#00ff00' }}>Applied H2C: {finalParams.h2cGap.toFixed(2)} mm</div>
                    <div style={{ color: finalParams.fH < 20.0 ? '#ffff00' : '#00ff00' }}>Applied FH: {finalParams.fH.toFixed(2)} mm</div>
                    <div style={{ color: isOverflow ? '#ff4444' : '#00ff00', fontWeight: isOverflow ? 'bold' : 'normal' }}>
                        Overlapping: {isOverflow ? 'YES' : 'NO'}
                    </div>
                    <div style={{ fontSize: '10px', marginTop: '4px', color: '#ffaa00' }}>
                        * Gaps scaled using Sub-0mm Scaling
                    </div>
                </div>

                <div style={{ position: 'relative', flexShrink: 0 }}>
                    {/* ルーラーコーナー（左上の空白） */}
                    <div style={{
                        position: 'absolute', top: 0, left: 0,
                        width: `${RULER_SIZE}px`, height: `${RULER_SIZE}px`,
                        backgroundColor: '#353535', borderRight: '1px solid #555',
                        borderBottom: '1px solid #555', zIndex: 3,
                    }} />

                    {/* 上部ルーラー */}
                    <div style={{
                        position: 'absolute', top: 0, left: `${RULER_SIZE}px`,
                        width: `${A4_WIDTH_PX}px`, height: `${RULER_SIZE}px`,
                        zIndex: 2,
                    }}>
                        <HorizontalRuler widthMm={A4_WIDTH_MM} mouseX={mousePos?.x ?? null} />
                    </div>

                    {/* 左ルーラー */}
                    <div style={{
                        position: 'absolute', top: `${RULER_SIZE}px`, left: 0,
                        width: `${RULER_SIZE}px`, height: `${A4_HEIGHT_PX}px`,
                        zIndex: 2,
                    }}>
                        <VerticalRuler heightMm={A4_HEIGHT_MM} mouseY={mousePos?.y ?? null} />
                    </div>

                    {/* A4 キャンバス */}
                    <div
                        data-canvas
                        style={{
                            position: 'relative',
                            marginTop: `${RULER_SIZE}px`,
                            marginLeft: `${RULER_SIZE}px`,
                            width: `${A4_WIDTH_PX}px`,
                            height: `${A4_HEIGHT_PX}px`,
                            backgroundColor: '#ffffff',
                            boxShadow: '0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
                            cursor: 'crosshair',
                        }}
                    >
                        <GridOverlay widthPx={A4_WIDTH_PX} heightPx={A4_HEIGHT_PX} />
                        <DeadZoneOverlay />
                        {showMarkers && <CornerMarkers />}

                        {/* オーバーフロー・ハイライトエリア */}
                        {isOverflow && (
                            <svg
                                width={A4_WIDTH_PX} height={A4_HEIGHT_PX}
                                style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 4 }}
                            >
                                <rect
                                    x={0} y={mmToPx(CONTENT_AREA.bottom)}
                                    width={mmToPx(A4_WIDTH_MM)} height={mmToPx(A4_HEIGHT_MM - CONTENT_AREA.bottom)}
                                    fill="rgba(239, 68, 68, 0.25)"
                                />
                            </svg>
                        )}
                        {/* ヘッダーセクション（svgコンポーネント） */}
                        <HeaderBlock layout={headerLayout} />

                        {/* メインコンテンツエリア（設問svgのコンテナ） */}
                        <div className="MainContentArea" style={{ position: 'relative' }}>
                            {questionLayouts.map((ql: QuestionLayout) => {
                                if (ql.question.type === 'free_text') {
                                    return <FreeTextBlock key={ql.question.id} layout={ql} />;
                                } else if (ql.question.type === 'newsletter_optin') {
                                    return <NewsletterBlock key={ql.question.id} layout={ql} />;
                                } else {
                                    return <QuestionBlock key={ql.question.id} layout={ql} mode={layoutMode} />;
                                }
                            })}
                        </div>

                        {/* ルーラー追従ライン（水平） */}
                        {mousePos && (
                            <div style={{
                                position: 'absolute', top: `${mmToPx(mousePos.y)}px`, left: 0,
                                width: '100%', height: '1px',
                                backgroundColor: 'rgba(59, 130, 246, 0.4)',
                                pointerEvents: 'none', zIndex: 5,
                            }} />
                        )}
                        {/* ルーラー追従ライン（垂直） */}
                        {mousePos && (
                            <div style={{
                                position: 'absolute', left: `${mmToPx(mousePos.x)}px`, top: 0,
                                width: '1px', height: '100%',
                                backgroundColor: 'rgba(59, 130, 246, 0.4)',
                                pointerEvents: 'none', zIndex: 5,
                            }} />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

/* =========================================
   ヘッダーブロック
   ========================================= */

function HeaderBlock({ layout }: { layout: HeaderLayout }) {
    const { troupeName, productionName, greeting, qrUrl, boundingBoxes } = layout;

    const titleFS = mmToPx(HEADER_TITLE_FONT_SIZE_MM);
    const textFS = mmToPx(HEADER_TEXT_FONT_SIZE_MM);

    return (
        <svg
            width={A4_WIDTH_PX} height={mmToPx(HEADER_HEIGHT_MM + 10)}
            style={{ position: 'absolute', top: mmToPx(HEADER_START_Y_MM), left: 0, pointerEvents: 'none', zIndex: 6 }}
        >
            <g className="HeaderBlock">
                {/* 3段タイトル（中央揃え・QRブロックと高さを一致：約18mmスパン） */}
                <g transform={`translate(${mmToPx(A4_WIDTH_MM / 2)}, ${mmToPx(boundingBoxes.titleGroup.y - HEADER_START_Y_MM)})`}>
                    {/* 劇団名 (印刷可能範囲を考慮し y=0 から開始) */}
                    <text
                        x={0} y={0}
                        fontSize={titleFS * 0.8} fontWeight="bold" fill="#000000" textAnchor="middle"
                        fontFamily="'Hiragino Kaku Gothic ProN', 'MS Gothic', 'Noto Sans JP', sans-serif"
                        dominantBaseline="hanging"
                    >
                        {troupeName}
                    </text>
                    {/* 公演名 (垂直中央) */}
                    <text
                        x={0} y={mmToPx(QR_SIZE_MM / 2 + 1)}
                        fontSize={titleFS} fontWeight="bold" fill="#000000" textAnchor="middle"
                        fontFamily="'Hiragino Kaku Gothic ProN', 'MS Gothic', 'Noto Sans JP', sans-serif"
                        dominantBaseline="middle"
                    >
                        {`『${productionName}』`}
                    </text>
                    {/* アンケート (QR下部テキストと同じ高さ) */}
                    <text
                        x={0} y={mmToPx(QR_SIZE_MM + 6)}
                        fontSize={titleFS * 0.9} fontWeight="bold" fill="#000000" textAnchor="middle"
                        fontFamily="'Hiragino Kaku Gothic ProN', 'MS Gothic', 'Noto Sans JP', sans-serif"
                        dominantBaseline="alphabetic"
                    >
                        来場者アンケート
                    </text>
                </g>

                {/* 挨拶文（タイトル群の直下） */}
                <foreignObject
                    x={mmToPx(boundingBoxes.greeting.x)}
                    y={mmToPx(boundingBoxes.greeting.y - HEADER_START_Y_MM)}
                    width={mmToPx(boundingBoxes.greeting.w)}
                    height={mmToPx(boundingBoxes.greeting.h)}
                >
                    <div style={{
                        fontSize: `${textFS}px`, color: '#000000', lineHeight: 1.5, textAlign: 'left',
                        fontFamily: "'Hiragino Kaku Gothic ProN', 'MS Gothic', 'Noto Sans JP', sans-serif",
                        whiteSpace: 'pre-wrap'
                    }}>
                        {greeting}
                    </div>
                </foreignObject>

                {/* 右側：Web誘導ブロック（QR + 上下テキスト：右マージンを広く確保） */}
                <g transform={`translate(${mmToPx(CONTENT_AREA.right - QR_SIZE_MM / 2 - 8)}, ${mmToPx(boundingBoxes.qrGroup.y - HEADER_START_Y_MM)})`}>
                    {/* 上部テキスト削除 (整理) */}

                    {/* QRコード (中央) */}
                    {/* QRコード (中央) */}
                    <g transform={`translate(${-mmToPx(QR_SIZE_MM / 2)}, 0)`}>
                        <rect
                            x={-mmToPx(QR_QUIET_ZONE_MM / 2)}
                            y={-mmToPx(QR_QUIET_ZONE_MM / 2)}
                            width={mmToPx(QR_SIZE_MM + QR_QUIET_ZONE_MM)}
                            height={mmToPx(QR_SIZE_MM + QR_QUIET_ZONE_MM)}
                            fill="none"
                            stroke="#000000"
                            strokeWidth={mmToPx(0.15)}
                        />
                        <QRCodeSVG url={qrUrl} size={mmToPx(QR_SIZE_MM)} />
                    </g>

                    {/* 下部テキスト (拡大強調) */}
                    <text
                        x={0} y={mmToPx(QR_SIZE_MM + 6)}
                        fontSize={mmToPx(3.2)} fontWeight="bold" fill="#000000" textAnchor="middle"
                        fontFamily="'Hiragino Kaku Gothic ProN', 'MS Gothic', 'Noto Sans JP', sans-serif"
                    >
                        Webでの回答はこちらから
                    </text>
                </g>
            </g>
        </svg>
    );
}

function QRCodeSVG({ url, size }: { url: string; size: number }) {
    const [qrData, setQrData] = useState<string>('');
    useEffect(() => {
        QRCode.toDataURL(url, { margin: 1, color: { dark: '#000000', light: '#ffffff' } })
            .then(setQrData)
            .catch(console.error);
    }, [url]);

    if (!qrData) return <rect width={size} height={size} fill="#eee" />;

    return (
        <image href={qrData} width={size} height={size} />
    );
}

/* =========================================
   座標表示
   ========================================= */

function CoordinateDisplay({ mousePos }: { mousePos: { x: number; y: number } | null }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: '1rem',
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
            fontSize: '0.78rem', color: '#aaa',
        }}>
            <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                padding: '0.25rem 0.6rem', borderRadius: '4px',
                backgroundColor: mousePos ? '#3b3b3b' : '#2d2d2d',
                transition: 'background-color 0.15s',
                minWidth: '100px',
            }}>
                <span style={{ color: '#e06c75' }}>X:</span>
                <span style={{ color: mousePos ? '#e5e5e5' : '#555' }}>
                    {mousePos ? `${mousePos.x.toFixed(1)} mm` : '—'}
                </span>
            </span>
            <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                padding: '0.25rem 0.6rem', borderRadius: '4px',
                backgroundColor: mousePos ? '#3b3b3b' : '#2d2d2d',
                transition: 'background-color 0.15s',
                minWidth: '100px',
            }}>
                <span style={{ color: '#61afef' }}>Y:</span>
                <span style={{ color: mousePos ? '#e5e5e5' : '#555' }}>
                    {mousePos ? `${mousePos.y.toFixed(1)} mm` : '—'}
                </span>
            </span>
        </div>
    );
}

/* =========================================
   水平ルーラー（上端）
   ========================================= */

function HorizontalRuler({ widthMm, mouseX }: { widthMm: number; mouseX: number | null }) {
    const ticks: React.ReactNode[] = [];

    for (let mm = 0; mm <= widthMm; mm++) {
        const x = mmToPx(mm);
        const isMajor = mm % 10 === 0;
        const isMid = mm % 5 === 0 && !isMajor;
        const tickHeight = isMajor ? 12 : isMid ? 8 : 4;

        ticks.push(
            <line
                key={mm}
                x1={x} y1={RULER_SIZE}
                x2={x} y2={RULER_SIZE - tickHeight}
                stroke={isMajor ? '#bbb' : isMid ? '#888' : '#555'}
                strokeWidth={isMajor ? 1 : 0.5}
            />
        );

        if (isMajor && mm > 0) {
            ticks.push(
                <text
                    key={`t-${mm}`}
                    x={x} y={10}
                    textAnchor="middle"
                    fontSize="8"
                    fill="#999"
                    fontFamily="'JetBrains Mono', monospace"
                >
                    {mm}
                </text>
            );
        }
    }

    return (
        <svg width={`${mmToPx(widthMm)}`} height={RULER_SIZE}
            style={{ display: 'block', backgroundColor: '#353535', borderBottom: '1px solid #555' }}>
            {ticks}
            {/* マウス追従マーカー */}
            {mouseX !== null && (
                <line
                    x1={mmToPx(mouseX)} y1={0}
                    x2={mmToPx(mouseX)} y2={RULER_SIZE}
                    stroke="#3b82f6" strokeWidth={1}
                />
            )}
        </svg>
    );
}

/* =========================================
   垂直ルーラー（左端）
   ========================================= */

function VerticalRuler({ heightMm, mouseY }: { heightMm: number; mouseY: number | null }) {
    const ticks: React.ReactNode[] = [];

    for (let mm = 0; mm <= heightMm; mm++) {
        const y = mmToPx(mm);
        const isMajor = mm % 10 === 0;
        const isMid = mm % 5 === 0 && !isMajor;
        const tickWidth = isMajor ? 12 : isMid ? 8 : 4;

        ticks.push(
            <line
                key={mm}
                x1={RULER_SIZE} y1={y}
                x2={RULER_SIZE - tickWidth} y2={y}
                stroke={isMajor ? '#bbb' : isMid ? '#888' : '#555'}
                strokeWidth={isMajor ? 1 : 0.5}
            />
        );

        if (isMajor && mm > 0) {
            ticks.push(
                <text
                    key={`t-${mm}`}
                    x={RULER_SIZE / 2} y={y + 3}
                    textAnchor="middle"
                    fontSize="8"
                    fill="#999"
                    fontFamily="'JetBrains Mono', monospace"
                >
                    {mm}
                </text>
            );
        }
    }

    return (
        <svg width={RULER_SIZE} height={`${mmToPx(heightMm)}`}
            style={{ display: 'block', backgroundColor: '#353535', borderRight: '1px solid #555' }}>
            {ticks}
            {/* マウス追従マーカー */}
            {mouseY !== null && (
                <line
                    x1={0} y1={mmToPx(mouseY)}
                    x2={RULER_SIZE} y2={mmToPx(mouseY)}
                    stroke="#3b82f6" strokeWidth={1}
                />
            )}
        </svg>
    );
}

/* =========================================
   グリッドオーバーレイ
   ========================================= */

function GridOverlay({ widthPx, heightPx }: { widthPx: number; heightPx: number }) {
    const lines: React.ReactNode[] = [];

    // 垂直線
    for (let mm = 5; mm < A4_WIDTH_MM; mm += 5) {
        const x = mmToPx(mm);
        const isMajor = mm % 10 === 0;
        lines.push(
            <line key={`v-${mm}`}
                x1={x} y1={0} x2={x} y2={heightPx}
                stroke={isMajor ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.04)'}
                strokeWidth={isMajor ? 0.8 : 0.5}
            />
        );
    }

    // 水平線
    for (let mm = 5; mm < A4_HEIGHT_MM; mm += 5) {
        const y = mmToPx(mm);
        const isMajor = mm % 10 === 0;
        lines.push(
            <line key={`h-${mm}`}
                x1={0} y1={y} x2={widthPx} y2={y}
                stroke={isMajor ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.04)'}
                strokeWidth={isMajor ? 0.8 : 0.5}
            />
        );
    }

    return (
        <svg
            width={widthPx} height={heightPx}
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
        >
            {lines}
        </svg>
    );
}

/* =========================================
   OMR設啎ブロック（レ点用チェックボックス + ラベル）
   -----------------------------------------
   形状: single/multi ともに正方形（レ点・丸記入用）
   線幅: 0.3mm、テキスト: ゴシック体 ≈ 10pt
   CV最適化: 「枠内のピクセル変化」でレ点/丸を検知
   ========================================= */

function QuestionBlock({ layout, mode }: { layout: QuestionLayout; mode: 'vertical' | 'horizontal' }) {
    const { question, questionIndex, x: blockX_MM, y: blockY_MM, boxes } = layout;
    if (!boxes) return null;

    const sw = mmToPx(OMR_STROKE_MM);
    const boxSize = mmToPx(OMR_BOX_SIZE_MM);
    const fontSize = mmToPx(OMR_FONT_SIZE_MM);
    const gap = mmToPx(OMR_GAP_MM);

    const blockX = mmToPx(blockX_MM);
    const labelY = mmToPx(blockY_MM);

    return (
        <svg
            width={A4_WIDTH_PX} height={A4_HEIGHT_PX}
            style={{
                position: 'absolute', top: 0, left: 0,
                pointerEvents: 'none', zIndex: 6,
            }}
        >
            {/* 設啎ラベル（番号付き） */}
            <foreignObject
                x={blockX} y={labelY}
                width={mmToPx(A4_WIDTH_MM - MARGIN_MM * 2)}
                height={mmToPx(layout.titleHeight || fontSize)}
            >
                <div style={{
                    fontSize: `${fontSize}px`, fontWeight: 'bold', color: '#000',
                    lineHeight: 1.5, textAlign: 'left',
                    fontFamily: "'Hiragino Kaku Gothic ProN', 'MS Gothic', 'Noto Sans JP', sans-serif",
                }}>
                    {questionIndex}. {question.label}{question.type === 'multi_choice' ? '（複数選択可）' : ''}
                </div>
            </foreignObject>

            {/* 選択肢チェックボックス + テキスト */}
            {boxes.map((box) => {
                const bx = mmToPx(box.boundingBox.x);
                const by = mmToPx(box.boundingBox.y);
                const option = question.options.find(o => o.id === box.optionId);

                return (
                    <g key={box.optionId}>
                        {/* 正方形チェックボックス（レ点・丸記入用）
                            Visual Bounds を正確に反映するため、ストローク分を内側にオフセット */}
                        <rect
                            x={bx + sw / 2} y={by + sw / 2}
                            width={boxSize - sw} height={boxSize - sw}
                            fill="#ffffff"
                            stroke="#000000"
                            strokeWidth={sw}
                        />
                        {/* 選択肢ラベル */}
                        <text
                            x={bx + boxSize + gap}
                            y={by + boxSize / 2 + 1}
                            fontSize={fontSize}
                            fill="#000000"
                            fontFamily="'Hiragino Kaku Gothic ProN', 'MS Gothic', 'Noto Sans JP', sans-serif"
                            dominantBaseline="middle"
                        >
                            {option?.label ?? ''}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}


/* =========================================
   自由記述ブロック（OCR対応枠 + 補助線）
   -----------------------------------------
   用途: free_text 型。
   外枠: 0.3mm、補助線: 0.1mm (10mm間隔)
   ========================================= */

function FreeTextBlock({ layout }: { layout: QuestionLayout }) {
    const { question, x: blockX_MM, y: blockY_MM, width: blockW_MM, ocrBoxes } = layout;
    if (!ocrBoxes || ocrBoxes.length === 0) return null;

    const box = ocrBoxes[0];
    const fontSize = mmToPx(OMR_FONT_SIZE_MM);
    const blockX = mmToPx(blockX_MM);
    const labelY = mmToPx(blockY_MM);
    const bx = mmToPx(box.boundingBox.x);
    const by = mmToPx(box.boundingBox.y);
    const bw = mmToPx(box.boundingBox.w);
    const bh = mmToPx(box.boundingBox.h);
    const sw = mmToPx(OCR_BOX_STROKE_MM);
    const guideSw = mmToPx(OCR_GUIDE_STROKE_MM);

    const lines = [];
    const lineGap = (box.boundingBox.h >= 20) ? 10 : 8; // 高さがあれば10mm、低ければ8mm間隔
    for (let h = lineGap; h < box.boundingBox.h - 1; h += lineGap) {
        lines.push(mmToPx(h));
    }

    return (
        <svg
            width={A4_WIDTH_PX} height={A4_HEIGHT_PX}
            style={{
                position: 'absolute', top: 0, left: 0,
                pointerEvents: 'none', zIndex: 6,
            }}
        >
            {/* 設啎タイトル */}
            <foreignObject
                x={blockX} y={labelY}
                width={mmToPx(A4_WIDTH_MM - MARGIN_MM * 2)}
                height={mmToPx(layout.titleHeight || 8)}
            >
                <div style={{
                    fontSize: `${fontSize}px`, fontWeight: 'bold', color: '#000',
                    lineHeight: 1.5, textAlign: 'left',
                    fontFamily: "'Hiragino Kaku Gothic ProN', 'MS Gothic', 'Noto Sans JP', sans-serif",
                }}>
                    {layout.questionIndex}. {question.label}
                </div>
            </foreignObject>

            {/* 自由記述枠 (純黒) */}
            <rect
                x={bx + sw / 2} y={by + sw / 2}
                width={bw - sw} height={bh - sw}
                fill="none"
                stroke="#000000"
                strokeWidth={sw}
            />

            {/* 補助線（10mm間隔） 純黒・点線 */}
            {lines.map((yOffset, i) => (
                <line
                    key={i}
                    x1={bx + sw} y1={by + yOffset}
                    x2={bx + bw - sw} y2={by + yOffset}
                    stroke="#000000"
                    strokeWidth={guideSw}
                    strokeDasharray="1,2"
                />
            ))}
        </svg>
    );
}

/* =========================================
   個人情報・メルマガ署名ブロック（署名エリア）
   -----------------------------------------
   構成: 区切り線 + ナンバリング無し見出し + 縦並び入力枠
   ========================================= */

function NewsletterBlock({ layout }: { layout: QuestionLayout }) {
    const { x: blockX_MM, y: blockY_MM, width: blockW_MM, ocrBoxes, boxes } = layout;
    const fontSize = mmToPx(OMR_FONT_SIZE_MM);
    const labelFontSize = mmToPx(RATING_LABEL_FONT_SIZE_MM);
    const blockX = mmToPx(blockX_MM);
    const blockW = mmToPx(blockW_MM);
    const sw = mmToPx(OCR_BOX_STROKE_MM);

    const labelY = mmToPx(blockY_MM);
    const title = '今後の公演情報やお知らせの配信を希望しますか？';
    const titleH = layout.titleHeight || 8;

    return (
        <svg
            width={A4_WIDTH_PX} height={A4_HEIGHT_PX}
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 6 }}
        >
            {/* セパレーター（純黒水平線） フッタータイトルの 2.0mm 上に配置（重なり防止） */}
            <line
                x1={blockX} y1={labelY - mmToPx(2.0)}
                x2={blockX + blockW} y2={labelY - mmToPx(2.0)}
                stroke="#000000" strokeWidth={sw}
            />

            {/* セクション見出し（ナンバリング無し） */}
            <foreignObject
                x={blockX} y={labelY}
                width={blockW} height={mmToPx(titleH)}
            >
                <div style={{
                    fontSize: `${fontSize}px`, fontWeight: 'bold', color: '#000',
                    lineHeight: 1.5, textAlign: 'left',
                    fontFamily: "'Hiragino Kaku Gothic ProN', 'MS Gothic', 'Noto Sans JP', sans-serif",
                }}>
                    {title}
                </div>
            </foreignObject>

            {/* 同意チェックボックス（既に絶対座標が入っている） */}
            {boxes?.map(box => {
                const bx = mmToPx(box.boundingBox.x);
                const by = mmToPx(box.boundingBox.y);
                const bs = mmToPx(OMR_BOX_SIZE_MM);
                const swOMR = mmToPx(OMR_STROKE_MM);
                return (
                    <g key={box.optionId}>
                        <rect
                            x={bx + swOMR / 2} y={by + swOMR / 2}
                            width={bs - swOMR} height={bs - swOMR}
                            fill="#ffffff" stroke="#000000" strokeWidth={swOMR}
                        />
                        <text
                            x={bx + bs + mmToPx(2)} y={by + bs / 2}
                            fontSize={fontSize} fill="#000000" dominantBaseline="middle"
                            fontFamily="'Hiragino Kaku Gothic ProN', 'MS Gothic', 'Noto Sans JP', sans-serif"
                        >
                            希望する
                        </text>
                    </g>
                );
            })}

            {/* お名前・メールアドレス入力欄（既に絶対座標が入っている） */}
            {ocrBoxes?.map(box => {
                const bx = mmToPx(box.boundingBox.x);
                const by = mmToPx(box.boundingBox.y);
                const bw = mmToPx(box.boundingBox.w);
                const bh = mmToPx(box.boundingBox.h);
                const labelText = box.fieldKey === 'name' ? 'お名前：' : 'メールアドレス：';

                return (
                    <g key={box.fieldKey}>
                        <text
                            x={bx - mmToPx(3)} y={by + bh / 2}
                            fontSize={labelFontSize} fill="#000000"
                            textAnchor="end" dominantBaseline="middle"
                            fontFamily="'Hiragino Kaku Gothic ProN', 'MS Gothic', 'Noto Sans JP', sans-serif"
                        >
                            {labelText}
                        </text>
                        <rect
                            x={bx + sw / 2} y={by + sw / 2} width={bw - sw} height={bh - sw}
                            fill="none" stroke="#000000" strokeWidth={sw}
                        />
                    </g>
                );
            })}
        </svg>
    );
}
/* =========================================
   L字コーナーマーカー（CV補正用 + 縮尺補正基準）
   -----------------------------------------
   役割1: パース歪み補正（四隅座標から射影変換）
   役割2: 縮尺補正基準
     • TL(6,6) ↔ BL(6,291) の垂直距離 = 285mm（設計値）
     • AIが撮影画像内のこの距離を測定し、プリンター縮小率を逆算
     • 例: 実測277.45mm → 補正率 285/277.45 ≈ 1.0272
   ========================================= */

function CornerMarkers() {
    const arm = mmToPx(MARKER_ARM_MM);
    const sw = mmToPx(MARKER_STROKE_MM);
    const w = A4_WIDTH_PX;
    const h = A4_HEIGHT_PX;

    // L字マーカーは 6mm マージンの内角に配置
    // 左上: (6,6)  右上: (204,6)  左下: (6,291)  右下: (204,291)
    const m = mmToPx(MARGIN_MM);  // 6mm → px

    const corners = [
        // 左上: (6,6) — 右と下に腕が伸びる
        { id: 'tl', d: `M ${m} ${m + arm} L ${m} ${m} L ${m + arm} ${m}` },
        // 右上: (204,6) — 左と下に腕が伸びる
        { id: 'tr', d: `M ${w - m - arm} ${m} L ${w - m} ${m} L ${w - m} ${m + arm}` },
        // 左下: (6,291) — 右と上に腕が伸びる
        { id: 'bl', d: `M ${m} ${h - m - arm} L ${m} ${h - m} L ${m + arm} ${h - m}` },
        // 右下: (204,291) — 左と上に腕が伸びる
        { id: 'br', d: `M ${w - m - arm} ${h - m} L ${w - m} ${h - m} L ${w - m} ${h - m - arm}` },
    ];

    return (
        <svg
            width={w} height={h}
            style={{
                position: 'absolute', top: 0, left: 0,
                pointerEvents: 'none', zIndex: 10,
            }}
        >
            {corners.map(c => (
                <path
                    key={c.id}
                    d={c.d}
                    fill="none"
                    stroke="#000000"
                    strokeWidth={sw}
                    strokeLinecap="square"
                    strokeLinejoin="miter"
                />
            ))}
        </svg>
    );
}

/* =========================================
   固定QRコード（識別用・Web回答用）
   -----------------------------------------
   配置: 右上 (186mm, 6mm)  サイズ: 18×18mm
   クワイエットゾーン: 0.5mm（QR周囲に白い余白）
   内容: /book/[productionId]/survey?tid=[templateId]&mode=paper_scan
   ========================================= */

function FixedQRCode({ url }: { url: string }) {
    const [dataUrl, setDataUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!url) return;
        // 高解像度で生成（印刷品質確保のため大きめに生成し、表示時にmmサイズへ縮小）
        QRCode.toDataURL(url, {
            width: 400,
            margin: 0,   // クワイエットゾーンは外枠で別途確保
            color: { dark: '#000000', light: '#ffffff' },
            errorCorrectionLevel: 'H',  // 高耐性（印刷かすれ対策）
        }).then(setDataUrl).catch(console.error);
    }, [url]);

    if (!dataUrl) return null;

    const x = mmToPx(QR_X_MM);
    const y = mmToPx(QR_Y_MM);
    const size = mmToPx(QR_SIZE_MM);
    const qz = mmToPx(QR_QUIET_ZONE_MM);

    return (
        <div
            style={{
                position: 'absolute',
                left: `${x}px`,
                top: `${y}px`,
                width: `${size}px`,
                height: `${size}px`,
                pointerEvents: 'none',
                zIndex: 8,
            }}
        >
            {/* クワイエットゾーン（白い余白） */}
            <div style={{
                position: 'absolute',
                inset: `-${qz}px`,
                backgroundColor: '#ffffff',
            }} />
            {/* QRコード画像 */}
            <img
                src={dataUrl}
                alt="Survey QR"
                style={{
                    position: 'relative',
                    width: '100%',
                    height: '100%',
                    display: 'block',
                    imageRendering: 'pixelated',
                }}
            />
        </div>
    );
}

/* =========================================
   デッドゾーン（印刷不可領域）オーバーレイ
   ========================================= */

function DeadZoneOverlay() {
    const w = A4_WIDTH_PX;
    const h = A4_HEIGHT_PX;
    const m = mmToPx(MARGIN_MM);
    const patternId = 'deadzone-hatch';

    // マージン四辺の矩形（重なりなし）
    const zones = [
        { id: 'top', x: 0, y: 0, w: w, h: m },           // 上辺
        { id: 'bottom', x: 0, y: h - m, w: w, h: m },       // 下辺
        { id: 'left', x: 0, y: m, w: m, h: h - m * 2 },   // 左辺（上下除く）
        { id: 'right', x: w - m, y: m, w: m, h: h - m * 2 }, // 右辺（上下除く）
    ];

    return (
        <svg
            width={w} height={h}
            style={{
                position: 'absolute', top: 0, left: 0,
                pointerEvents: 'none', zIndex: 2,
            }}
        >
            <defs>
                <pattern
                    id={patternId}
                    width="6" height="6"
                    patternUnits="userSpaceOnUse"
                    patternTransform="rotate(45)"
                >
                    <line
                        x1="0" y1="0" x2="0" y2="6"
                        stroke="rgba(0,0,0,0.06)" strokeWidth="1"
                    />
                </pattern>
            </defs>
            {zones.map(z => (
                <rect
                    key={z.id}
                    x={z.x} y={z.y}
                    width={z.w} height={z.h}
                    fill={`url(#${patternId})`}
                />
            ))}
            {/* マージン境界線（点線） */}
            <rect
                x={m} y={m}
                width={w - m * 2} height={h - m * 2}
                fill="none"
                stroke="rgba(0,0,0,0.12)"
                strokeWidth="0.5"
                strokeDasharray="4 3"
            />
        </svg>
    );
}
