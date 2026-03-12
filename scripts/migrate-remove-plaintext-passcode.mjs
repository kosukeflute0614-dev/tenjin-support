/**
 * M-1: staffTokens から平文パスコード (passcode フィールド) を削除するマイグレーション
 *
 * 使い方:
 *   1. Firebase CLI でログイン済みであることを確認
 *   2. node scripts/migrate-remove-plaintext-passcode.mjs
 *
 * ドライランモード (デフォルト):
 *   DRY_RUN=false node scripts/migrate-remove-plaintext-passcode.mjs
 */

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// サービスアカウントキーがあればそれを使い、なければ ADC を使う
try {
    initializeApp({ projectId: 'tenjin-support', credential: applicationDefault() });
} catch {
    initializeApp({ projectId: 'tenjin-support' });
}

const db = getFirestore();
const DRY_RUN = process.env.DRY_RUN !== 'false';

async function migrate() {
    console.log(`=== M-1: 平文パスコード削除マイグレーション ===`);
    console.log(`モード: ${DRY_RUN ? 'ドライラン（変更なし）' : '本番実行'}\n`);

    const prodSnap = await db.collection('productions').get();
    let updatedCount = 0;
    let skippedCount = 0;

    for (const prodDoc of prodSnap.docs) {
        const data = prodDoc.data();
        const staffTokens = data.staffTokens;
        if (!staffTokens) {
            skippedCount++;
            continue;
        }

        let needsUpdate = false;
        const cleaned = { ...staffTokens };

        for (const [token, tokenData] of Object.entries(staffTokens)) {
            if (typeof tokenData === 'object' && tokenData !== null && 'passcode' in tokenData) {
                needsUpdate = true;
                const { passcode, ...rest } = tokenData;
                cleaned[token] = rest;
                console.log(`  [${prodDoc.id}] トークン ${token.slice(0, 8)}... から passcode を削除`);
            }
        }

        if (needsUpdate) {
            if (!DRY_RUN) {
                await db.collection('productions').doc(prodDoc.id).update({ staffTokens: cleaned });
            }
            updatedCount++;
        } else {
            skippedCount++;
        }
    }

    console.log(`\n完了: ${updatedCount} 件更新, ${skippedCount} 件スキップ`);
    if (DRY_RUN) {
        console.log('※ ドライランのため実際の変更は行われていません。DRY_RUN=false で再実行してください。');
    }
}

migrate().catch(console.error);
