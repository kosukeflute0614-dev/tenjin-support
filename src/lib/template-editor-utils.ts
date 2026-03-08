/** テンプレートに挿入できる変数 */
export const TEMPLATE_VARIABLES = [
    { key: '{{customer_name}}', label: 'お客様名', icon: '👤', description: '予約者のお名前' },
    { key: '{{production_title}}', label: '公演名', icon: '🎭', description: '公演のタイトル' },
    { key: '{{performance_date}}', label: '公演日時', icon: '📅', description: '開演の日付と時刻' },
    { key: '{{venue}}', label: '会場名', icon: '📍', description: '会場の名前' },
    { key: '{{ticket_details}}', label: 'チケット詳細', icon: '🎫', description: '券種・枚数・金額の一覧' },
    { key: '{{total_amount}}', label: '合計金額', icon: '💰', description: '予約の合計金額' },
    { key: '{{ticket_count}}', label: 'チケット枚数', icon: '🔖', description: '予約のチケット総枚数' },
    { key: '{{organizer_name}}', label: '主催者名', icon: '🏢', description: '主催者・劇団名' },
    { key: '{{organizer_email}}', label: '主催者メールアドレス', icon: '📧', description: '主催者の問い合わせ先メールアドレス' },
] as const;

/** 変数キーからラベルを取得 */
export function getVariableLabel(key: string): string | null {
    const v = TEMPLATE_VARIABLES.find(tv => tv.key === key);
    return v ? v.label : null;
}

export function getVariableIcon(key: string): string {
    const v = TEMPLATE_VARIABLES.find(tv => tv.key === key);
    return v ? v.icon : '📎';
}

/** チップのインラインスタイル（共通） */
export const CHIP_STYLE = 'display:inline-flex;align-items:center;gap:3px;padding:1px 8px;margin:0 1px;border:1px solid #d0d0d0;border-radius:5px;background:#fff;color:#333;font-size:0.82em;font-weight:600;white-space:nowrap;vertical-align:baseline;cursor:default;user-select:all;line-height:1.6';

/** チップ span を DOM 要素として作成 */
export function createChipElement(variableKey: string, displayText: string): HTMLSpanElement {
    const chip = document.createElement('span');
    chip.contentEditable = 'false';
    chip.setAttribute('data-variable', variableKey);
    chip.style.cssText = CHIP_STYLE;
    chip.textContent = displayText;
    return chip;
}

/** テキスト内の変数を HTML チップに変換する共通処理 */
export function replaceVariablesWithChips(escaped: string): string {
    return escaped.replace(/\{\{([^}]+)\}\}/g, (_match, varName) => {
        const key = `{{${varName}}}`;
        const label = getVariableLabel(key);
        const icon = getVariableIcon(key);
        if (!label) return _match;
        return `<span contenteditable="false" data-variable="${key}" style="${CHIP_STYLE}">${icon} ${label}</span>`;
    });
}

/** プレーンテキスト（{{var}} 形式）→ HTML（チップ表示、複数行）に変換 */
export function textToHtml(text: string): string {
    const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const html = replaceVariablesWithChips(escaped);
    return html.replace(/\n/g, '<br>');
}

/** プレーンテキスト（{{var}} 形式）→ HTML（チップ表示、1行 / 件名用）に変換 */
export function textToInlineHtml(text: string): string {
    const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    return replaceVariablesWithChips(escaped);
}

/** HTML（チップ表示）→ プレーンテキスト（{{var}} 形式）に変換 */
export function htmlToText(container: HTMLElement): string {
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
            if (el.tagName === 'BR') {
                result += '\n';
                return;
            }
            if (el.tagName === 'DIV' && el.previousSibling) {
                result += '\n';
            }
            el.childNodes.forEach(walk);
        }
    };
    container.childNodes.forEach(walk);
    return result;
}

/** HTML（チップ表示）→ プレーンテキスト（{{var}} 形式、1行 / 件名用）に変換 */
export function htmlToInlineText(container: HTMLElement): string {
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
