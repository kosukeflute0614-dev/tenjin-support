/**
 * M-3: paymentStatus の "PARTIALLY_PAID" → "PARTIAL" への既存データ修正
 *
 * 使い方:
 *   node scripts/fix-payment-status.mjs
 *
 * ドライランモード (デフォルト):
 *   DRY_RUN=false node scripts/fix-payment-status.mjs
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

try {
    initializeApp({ projectId: 'tenjin-support', credential: applicationDefault() });
} catch {
    initializeApp({ projectId: 'tenjin-support' });
}

const db = getFirestore();
const DRY_RUN = process.env.DRY_RUN !== 'false';

async function migrate() {
    console.log(`=== M-3: PARTIALLY_PAID → PARTIAL マイグレーション ===`);
    console.log(`モード: ${DRY_RUN ? 'ドライラン（変更なし）' : '本番実行'}\n`);

    const snap = await db.collection('reservations')
        .where('paymentStatus', '==', 'PARTIALLY_PAID')
        .get();

    console.log(`対象: ${snap.size} 件の予約\n`);

    let updatedCount = 0;
    for (const resDoc of snap.docs) {
        console.log(`  [${resDoc.id}] PARTIALLY_PAID → PARTIAL`);
        if (!DRY_RUN) {
            await db.collection('reservations').doc(resDoc.id).update({ paymentStatus: 'PARTIAL' });
        }
        updatedCount++;
    }

    console.log(`\n完了: ${updatedCount} 件更新`);
    if (DRY_RUN) {
        console.log('※ ドライランのため実際の変更は行われていません。DRY_RUN=false で再実行してください。');
    }
}

migrate().catch(console.error);
