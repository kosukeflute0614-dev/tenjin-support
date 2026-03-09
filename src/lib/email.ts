import { Resend } from 'resend';
import { FirestoreReservation, TicketType, EmailTemplateData } from '@/types';
import { toDate } from './firestore-utils';
import type { DateLike } from './format';

const resend = process.env.RESEND_API_KEY
    ? new Resend(process.env.RESEND_API_KEY)
    : null;

const FROM_EMAIL = 'Tenjin-Support <no-reply@tenjin-support.com>';
const REPLY_TO = process.env.REPLY_TO_EMAIL || 'kosuke.flute0614@gmail.com';

interface ReservationEmailData {
    reservation: FirestoreReservation;
    reservationId: string;
    productionTitle: string;
    performanceStartTime: DateLike;
    ticketTypes: TicketType[];
    organizerName?: string;
    organizerEmail?: string;
    venue?: string;
    template?: EmailTemplateData | null;
    confirmationEnabled?: boolean;
    ccToOrganizer?: boolean;
}

/**
 * テンプレート変数を実際の値に置換する
 */
export function replaceTemplateVariables(
    text: string,
    vars: {
        customerName: string;
        productionTitle: string;
        performanceDate: string;
        venue?: string;
        ticketDetails: string;
        totalAmount: string;
        ticketCount: string;
        organizerName: string;
        organizerEmail?: string;
    }
): string {
    return text
        .replace(/\{\{customer_name\}\}/g, vars.customerName)
        .replace(/\{\{production_title\}\}/g, vars.productionTitle)
        .replace(/\{\{performance_date\}\}/g, vars.performanceDate)
        .replace(/\{\{venue\}\}/g, vars.venue || '')
        .replace(/\{\{ticket_details\}\}/g, vars.ticketDetails)
        .replace(/\{\{total_amount\}\}/g, vars.totalAmount)
        .replace(/\{\{ticket_count\}\}/g, vars.ticketCount)
        .replace(/\{\{organizer_name\}\}/g, vars.organizerName)
        .replace(/\{\{organizer_email\}\}/g, vars.organizerEmail || '');
}

/**
 * デフォルトの予約確認メール本文（テンプレート未設定時）
 */
function buildDefaultConfirmationText(
    customerName: string,
    productionTitle: string,
    performanceDate: string,
    reservationId: string,
    ticketDetailsText: string,
    totalAmount: string,
): string {
    return `${customerName} 様

この度は「${productionTitle}」にご予約いただき、誠にありがとうございます。
以下の内容でご予約を承りました。

━━━━━━━━━━━━━━━━━━
予約番号: ${reservationId.slice(0, 8).toUpperCase()}
公演名: ${productionTitle}
日時: ${performanceDate} 開演
お名前: ${customerName}
━━━━━━━━━━━━━━━━━━

【チケット明細】
${ticketDetailsText}

合計: ${totalAmount}

━━━━━━━━━━━━━━━━━━

【ご来場時のお願い】
・開演時間の10分前までに受付をお済ませください。
・お支払いは当日受付にてお願いいたします。

──────────────────
※ このメールは送信専用アドレスから配信しています。
※ ご不明な点がございましたら ${REPLY_TO} までお問い合わせください。`;
}

export async function sendReservationConfirmation(data: ReservationEmailData): Promise<void> {
    if (!resend) {
        console.warn('[Email] RESEND_API_KEY が未設定のためメール送信をスキップしました');
        return;
    }

    // メール送信が無効化されている場合はスキップ
    if (data.confirmationEnabled === false) {
        console.log('[Email] 予約確認メールが無効化されているためスキップしました');
        return;
    }

    const { reservation, reservationId, productionTitle, performanceStartTime, ticketTypes, template, organizerName, organizerEmail, venue } = data;

    if (!reservation.customerEmail) return;

    const startDate = toDate(performanceStartTime);
    const formattedDate = startDate.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'short',
    });
    const formattedTime = startDate.toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
    });
    const performanceDate = `${formattedDate} ${formattedTime}`;

    // 券種ごとの明細
    const ticketRows = reservation.tickets
        .filter(t => t.count > 0)
        .map(t => {
            const tt = ticketTypes.find(type => type.id === t.ticketTypeId);
            const name = tt?.name || '不明な券種';
            const price = t.price || 0;
            const subtotal = price * t.count;
            return { name, count: t.count, price, subtotal };
        });

    const totalAmount = ticketRows.reduce((sum, r) => sum + r.subtotal, 0);
    const totalTicketCount = ticketRows.reduce((sum, r) => sum + r.count, 0);

    // テキスト形式のチケット詳細
    const ticketDetailsText = ticketRows
        .map(r => `${r.name} × ${r.count}枚  ¥${r.subtotal.toLocaleString()}`)
        .join('\n');

    let subject: string;
    let text: string;

    if (template?.subject && template?.body) {
        const templateVars = {
            customerName: reservation.customerName,
            productionTitle,
            performanceDate,
            venue: venue || '',
            ticketDetails: ticketDetailsText,
            totalAmount: `¥${totalAmount.toLocaleString()}`,
            ticketCount: `${totalTicketCount}枚`,
            organizerName: organizerName || '',
            organizerEmail: organizerEmail || '',
        };
        subject = replaceTemplateVariables(template.subject, templateVars);
        text = replaceTemplateVariables(template.body, templateVars);
    } else {
        subject = `【予約完了】${productionTitle}`;
        text = buildDefaultConfirmationText(
            reservation.customerName,
            productionTitle,
            performanceDate,
            reservationId,
            ticketDetailsText,
            `¥${totalAmount.toLocaleString()}`,
        );
    }

    const sendPayload: Record<string, unknown> = {
        from: FROM_EMAIL,
        to: reservation.customerEmail,
        replyTo: REPLY_TO,
        subject,
        text,
    };

    console.log('[Email] 送信パラメータ:', JSON.stringify({
        from: sendPayload.from,
        to: sendPayload.to,
        replyTo: sendPayload.replyTo,
        subject: sendPayload.subject,
        textLength: text.length,
        usingTemplate: !!(template?.subject && template?.body),
    }, null, 2));

    try {
        const result = await resend.emails.send(sendPayload as any);
        console.log('[Email] 予約確認メール送信成功:', result.data?.id || 'no id');
        if (result.error) {
            console.warn('[Email] レスポンスにエラー:', JSON.stringify(result.error, null, 2));
        }

        // 主催者へのコピー送信
        if (data.ccToOrganizer && organizerEmail?.trim()) {
            try {
                await resend.emails.send({
                    from: FROM_EMAIL,
                    to: organizerEmail.trim(),
                    replyTo: REPLY_TO,
                    subject: `[コピー] ${subject}`,
                    text: `※ このメールは主催者コピーです（送信先: ${reservation.customerEmail}）\n\n${text}`,
                });
                console.log('[Email] 主催者コピー送信成功');
            } catch (ccError) {
                console.error('[Email] 主催者コピー送信失敗:', ccError);
            }
        }
    } catch (error: unknown) {
        console.error('[Email] 予約確認メール送信失敗');
        if (error instanceof Error) {
            console.error('[Email] エラー:', error.message);
        }
        console.error('[Email] エラー全体:', JSON.stringify(error, Object.getOwnPropertyNames(error as object), 2));
    }
}

/**
 * 一斉送信用の変数を置換する（宛先ごとに異なる値）
 */
function replaceBroadcastVariables(
    text: string,
    vars: { customerName: string; productionTitle: string; organizerName: string; organizerEmail: string },
): string {
    return text
        .replace(/\{\{customer_name\}\}/g, vars.customerName)
        .replace(/\{\{production_title\}\}/g, vars.productionTitle)
        .replace(/\{\{organizer_name\}\}/g, vars.organizerName)
        .replace(/\{\{organizer_email\}\}/g, vars.organizerEmail)
        .replace(/\{\{venue\}\}/g, '') // 未実装
        .replace(/\{\{performance_date\}\}/g, '') // 一斉送信では宛先ごとに異なるため空文字
        .replace(/\{\{ticket_details\}\}/g, '')
        .replace(/\{\{total_amount\}\}/g, '')
        .replace(/\{\{ticket_count\}\}/g, '');
}

/**
 * 一斉送信メールを送信する
 */
export async function sendBroadcastEmail(params: {
    to: string;
    subject: string;
    body: string;
    customerName: string;
    productionTitle: string;
    organizerName: string;
    organizerEmail: string;
}): Promise<{ success: boolean; error?: string }> {
    if (!resend) {
        return { success: false, error: 'RESEND_API_KEY が未設定です' };
    }

    const vars = {
        customerName: params.customerName,
        productionTitle: params.productionTitle,
        organizerName: params.organizerName,
        organizerEmail: params.organizerEmail,
    };
    const subject = replaceBroadcastVariables(params.subject, vars);
    const text = replaceBroadcastVariables(params.body, vars);

    try {
        const result = await resend.emails.send({
            from: FROM_EMAIL,
            to: params.to,
            replyTo: REPLY_TO,
            subject,
            text,
        });
        if (result.error) {
            return { success: false, error: JSON.stringify(result.error) };
        }
        return { success: true };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : '不明なエラー';
        return { success: false, error: message };
    }
}
