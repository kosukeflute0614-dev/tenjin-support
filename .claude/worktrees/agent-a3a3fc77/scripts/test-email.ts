/**
 * Resend メール送信テストスクリプト
 *
 * 実行方法:
 *   set RESEND_API_KEY=re_xxx && npx tsx scripts/test-email.ts
 *   または cross-env RESEND_API_KEY=re_xxx npx tsx scripts/test-email.ts
 */

import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;

if (!apiKey) {
  console.error("ERROR: RESEND_API_KEY 環境変数が設定されていません");
  process.exit(1);
}

console.log("API Key (先頭10文字):", apiKey.substring(0, 10) + "...");

const resend = new Resend(apiKey);

const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

async function main() {
  console.log("--- Resend テスト送信開始 ---");
  console.log("送信先: kosuke.flute0614@gmail.com");
  console.log("送信元: no-reply@tenjin-support.com");
  console.log("日時:", now);
  console.log("");

  try {
    const response = await resend.emails.send({
      from: "Tenjin-Support <no-reply@tenjin-support.com>",
      to: "kosuke.flute0614@gmail.com",
      subject: `[テスト送信] Resend到達性テスト - ${now}`,
      text: `これはResend APIからの直接テスト送信です。\n\n送信日時: ${now}\n\nこのメールが届いていれば、Resend API経由のメール送信は正常に機能しています。`,
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>Resend テスト送信</h2>
          <p>これはResend APIからの直接テスト送信です。</p>
          <p><strong>送信日時:</strong> ${now}</p>
          <hr />
          <p style="color: #666; font-size: 12px;">
            このメールが届いていれば、Resend API経由のメール送信は正常に機能しています。
          </p>
        </div>
      `,
    });

    console.log("=== APIレスポンス ===");
    console.log(JSON.stringify(response, null, 2));

    if (response.data) {
      console.log("\n送信成功! Email ID:", response.data.id);
    }
    if (response.error) {
      console.error("\nAPIエラー:", JSON.stringify(response.error, null, 2));
    }
  } catch (err: unknown) {
    console.error("=== 例外発生 ===");
    if (err instanceof Error) {
      console.error("Message:", err.message);
      console.error("Name:", err.name);
      console.error("Stack:", err.stack);
    }
    console.error("Full error:", JSON.stringify(err, null, 2));
  }
}

main();
