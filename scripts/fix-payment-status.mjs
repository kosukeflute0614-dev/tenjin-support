/**
 * M-3: paymentStatus の "PARTIALLY_PAID" → "PARTIAL" への既存データ修正
 *
 * 使い方:
 *   node scripts/fix-payment-status.mjs
 *
 * ドライランモード (デフォルト):
 *   DRY_RUN=false node scripts/fix-payment-status.mjs
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc, query, where } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDjnmQYlhJ1q7aprhANJcq8FOezLnsBQXk',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'tenjin-support.firebaseapp.com',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'tenjin-support',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const DRY_RUN = process.env.DRY_RUN !== 'false';

async function migrate() {
    console.log(`=== M-3: PARTIALLY_PAID → PARTIAL マイグレーション ===`);
    console.log(`モード: ${DRY_RUN ? 'ドライラン（変更なし）' : '本番実行'}\n`);

    const q = query(collection(db, 'reservations'), where('paymentStatus', '==', 'PARTIALLY_PAID'));
    const snap = await getDocs(q);

    console.log(`対象: ${snap.size} 件の予約\n`);

    let updatedCount = 0;
    for (const resDoc of snap.docs) {
        console.log(`  [${resDoc.id}] PARTIALLY_PAID → PARTIAL`);
        if (!DRY_RUN) {
            await updateDoc(doc(db, 'reservations', resDoc.id), { paymentStatus: 'PARTIAL' });
        }
        updatedCount++;
    }

    console.log(`\n完了: ${updatedCount} 件更新`);
    if (DRY_RUN) {
        console.log('※ ドライランのため実際の変更は行われていません。DRY_RUN=false で再実行してください。');
    }
}

migrate().catch(console.error);
