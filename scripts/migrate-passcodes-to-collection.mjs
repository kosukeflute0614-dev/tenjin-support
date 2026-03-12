/**
 * 既存の staffTokens.*.passcode を staffPasscodes コレクションに移行する
 * ※ M-1 で平文が削除される前に実行すること
 *
 * 使い方:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/key.json node scripts/migrate-passcodes-to-collection.mjs
 *
 * ドライランモード (デフォルト):
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/key.json DRY_RUN=false node scripts/migrate-passcodes-to-collection.mjs
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
    console.log(`=== パスコード → staffPasscodes コレクション移行 ===`);
    console.log(`モード: ${DRY_RUN ? 'ドライラン（変更なし）' : '本番実行'}\n`);

    const prodSnap = await db.collection('productions').get();
    let migratedCount = 0;

    for (const prodDoc of prodSnap.docs) {
        const data = prodDoc.data();
        const staffTokens = data.staffTokens;
        if (!staffTokens) continue;

        const passcodes = {};
        for (const [token, tokenData] of Object.entries(staffTokens)) {
            if (typeof tokenData === 'object' && tokenData !== null && 'passcode' in tokenData) {
                passcodes[token] = tokenData.passcode;
                console.log(`  [${prodDoc.id}] トークン ${token.slice(0, 8)}... のパスコードを移行`);
            }
        }

        if (Object.keys(passcodes).length > 0) {
            if (!DRY_RUN) {
                await db.collection('staffPasscodes').doc(prodDoc.id).set({
                    userId: data.userId,
                    passcodes,
                    updatedAt: new Date()
                }, { merge: true });
            }
            migratedCount++;
        }
    }

    console.log(`\n完了: ${migratedCount} 件の公演のパスコードを移行`);
    if (DRY_RUN) {
        console.log('※ ドライランのため実際の変更は行われていません。DRY_RUN=false で再実行してください。');
    }
}

migrate().catch(console.error);
