'use server';

import { sendBroadcastEmail } from "@/lib/email";

interface BroadcastRecipient {
    email: string;
    customerName: string;
}

interface BroadcastResult {
    success: boolean;
    totalTargets: number;
    sentCount: number;
    errorCount: number;
    errors: string[];
}

/**
 * 一斉メール送信（サーバーアクション）
 * クライアント側で宛先リストを構築し、ここでは Resend API 送信のみ行う
 */
export async function sendBroadcastEmails(
    recipients: BroadcastRecipient[],
    subject: string,
    body: string,
    productionTitle: string,
    organizerName: string,
    organizerEmail: string,
    ccToOrganizer?: boolean,
): Promise<BroadcastResult> {
    if (recipients.length === 0) {
        return { success: true, totalTargets: 0, sentCount: 0, errorCount: 0, errors: [] };
    }

    let sentCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < recipients.length; i++) {
        const r = recipients[i];
        const result = await sendBroadcastEmail({
            to: r.email,
            subject,
            body,
            customerName: r.customerName,
            productionTitle,
            organizerName,
            organizerEmail,
        });

        if (result.success) {
            sentCount++;
        } else {
            errorCount++;
            errors.push(`${r.email}: ${result.error}`);
        }

        // Resend rate limit 対策: 500ms 間隔
        if (i < recipients.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    // 主催者へのコピー送信（1通のみ）
    if (ccToOrganizer && organizerEmail?.trim() && sentCount > 0) {
        try {
            await sendBroadcastEmail({
                to: organizerEmail.trim(),
                subject: `[コピー] ${subject}`,
                body: `※ このメールは主催者コピーです（${recipients.length}名に送信済み）\n\n${body}`,
                customerName: '主催者',
                productionTitle,
                organizerName,
                organizerEmail,
            });
        } catch (e) {
            console.error('[Broadcast] 主催者コピー送信失敗:', e);
        }
    }

    return {
        success: errorCount === 0,
        totalTargets: recipients.length,
        sentCount,
        errorCount,
        errors,
    };
}
