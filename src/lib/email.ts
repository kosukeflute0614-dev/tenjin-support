import { Resend } from 'resend';
import { FirestoreReservation, TicketType } from '@/types';
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
}

export async function sendReservationConfirmation(data: ReservationEmailData): Promise<void> {
    if (!resend) {
        console.warn('[Email] RESEND_API_KEY が未設定のためメール送信をスキップしました');
        return;
    }

    const { reservation, reservationId, productionTitle, performanceStartTime, ticketTypes } = data;

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

    // 券種ごとの明細を作成
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

    const ticketRowsHtml = ticketRows
        .map(r =>
            `<tr>
                <td style="padding:8px 12px;border-bottom:1px solid #eee;">${r.name}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${r.count}枚</td>
                <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">&yen;${r.subtotal.toLocaleString()}</td>
            </tr>`)
        .join('');

    const html = `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,'Hiragino Sans',sans-serif;color:#333;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.1);">
      <!-- ヘッダー -->
      <div style="background:#8b0000;padding:24px 32px;">
        <h1 style="margin:0;color:#fff;font-size:20px;font-weight:600;">ご予約完了のお知らせ</h1>
      </div>
      <!-- 本文 -->
      <div style="padding:32px;">
        <p style="margin:0 0 16px;line-height:1.8;">
          ${reservation.customerName} 様<br><br>
          この度は「<strong>${productionTitle}</strong>」にご予約いただき、誠にありがとうございます。<br>
          以下の内容でご予約を承りました。
        </p>
        <!-- 予約詳細 -->
        <div style="background:#fafafa;border:1px solid #eee;border-radius:6px;padding:20px 24px;margin:24px 0;">
          <h2 style="margin:0 0 16px;font-size:15px;color:#8b0000;border-bottom:2px solid #8b0000;padding-bottom:8px;">予約内容</h2>
          <table style="width:100%;font-size:14px;margin-bottom:12px;">
            <tr>
              <td style="padding:6px 0;color:#888;width:100px;">予約番号</td>
              <td style="padding:6px 0;font-weight:600;">${reservationId.slice(0, 8).toUpperCase()}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#888;">公演名</td>
              <td style="padding:6px 0;">${productionTitle}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#888;">日時</td>
              <td style="padding:6px 0;">${formattedDate} ${formattedTime} 開演</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#888;">お名前</td>
              <td style="padding:6px 0;">${reservation.customerName}</td>
            </tr>
          </table>
        </div>
        <!-- チケット明細 -->
        <div style="margin:24px 0;">
          <h2 style="margin:0 0 12px;font-size:15px;color:#8b0000;border-bottom:2px solid #8b0000;padding-bottom:8px;">チケット明細</h2>
          <table style="width:100%;font-size:14px;border-collapse:collapse;">
            <thead>
              <tr style="background:#f8f8f8;">
                <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #ddd;">券種</th>
                <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #ddd;">枚数</th>
                <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #ddd;">小計</th>
              </tr>
            </thead>
            <tbody>
              ${ticketRowsHtml}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2" style="padding:10px 12px;font-weight:600;text-align:right;border-top:2px solid #333;">合計</td>
                <td style="padding:10px 12px;font-weight:600;text-align:right;border-top:2px solid #333;">&yen;${totalAmount.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <!-- 注意事項 -->
        <div style="background:#fff9f0;border-left:4px solid #e8a400;padding:16px 20px;margin:24px 0;font-size:13px;line-height:1.8;">
          <strong>ご来場時のお願い</strong><br>
          ・開演時間の10分前までに受付をお済ませください。<br>
          ・お支払いは当日受付にてお願いいたします。
        </div>
        <p style="margin:24px 0 0;font-size:13px;color:#888;line-height:1.8;">
          ※ このメールは送信専用アドレスから配信しています。<br>
          ※ ご不明な点がございましたら、下記までお問い合わせください。<br>
          　 <a href="mailto:${REPLY_TO}" style="color:#8b0000;">${REPLY_TO}</a>
        </p>
      </div>
      <!-- フッター -->
      <div style="background:#f8f8f8;padding:16px 32px;text-align:center;font-size:12px;color:#aaa;border-top:1px solid #eee;">
        Tenjin-Support &mdash; 演劇公演サポートシステム
      </div>
    </div>
  </div>
</body>
</html>`;

    const sendPayload = {
        from: FROM_EMAIL,
        to: reservation.customerEmail,
        replyTo: REPLY_TO,
        subject: `【予約完了】${productionTitle}`,
        html,
    };

    console.log('[Email] 送信パラメータ:', JSON.stringify({
        from: sendPayload.from,
        to: sendPayload.to,
        replyTo: sendPayload.replyTo,
        subject: sendPayload.subject,
        htmlLength: sendPayload.html.length,
    }, null, 2));

    try {
        const result = await resend.emails.send(sendPayload);
        console.log('[Email] 予約確認メール送信成功 - レスポンス全体:', JSON.stringify(result, null, 2));
        if (result.data) {
            console.log('[Email] レスポンス data.id:', result.data.id);
        }
        if (result.error) {
            console.warn('[Email] レスポンスにエラーが含まれています:', JSON.stringify(result.error, null, 2));
        }
    } catch (error: unknown) {
        console.error('[Email] 予約確認メール送信失敗');
        if (error instanceof Error) {
            console.error('[Email] エラー名:', error.name);
            console.error('[Email] エラーメッセージ:', error.message);
            console.error('[Email] スタックトレース:', error.stack);
        }
        const resendError = error as Record<string, unknown>;
        if (resendError?.statusCode) {
            console.error('[Email] HTTPステータス:', resendError.statusCode);
        }
        if (resendError?.response) {
            console.error('[Email] エラーレスポンス:', JSON.stringify(resendError.response, null, 2));
        }
        console.error('[Email] エラー全体:', JSON.stringify(error, Object.getOwnPropertyNames(error as object), 2));
    }
}
