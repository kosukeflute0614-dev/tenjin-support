/**
 * デモ公演データ投入スクリプト
 * Firebase CLIのリフレッシュトークンを使ってFirestore REST APIに書き込む
 *
 * Usage: node scripts/seed-demo.mjs
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const PROJECT_ID = 'tenjin-support';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Firebase CLIのリフレッシュトークンを取得
function getRefreshToken() {
    const configPath = path.join(os.homedir(), '.config/configstore/firebase-tools.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config.tokens.refresh_token;
}

// リフレッシュトークンからアクセストークンを取得
async function getAccessToken(refreshToken) {
    // Firebase CLIが使うOAuthクライアントID
    const clientId = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
    const clientSecret = 'j9iVZfS8kkCEFUPaAeJV0sAi';

    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
        }),
    });
    const data = await res.json();
    if (!data.access_token) throw new Error('Failed to get access token: ' + JSON.stringify(data));
    return data.access_token;
}

// Firestore REST API helpers
async function firestoreGet(accessToken, collectionPath, pageSize = 10) {
    const url = `${FIRESTORE_BASE}/${collectionPath}?pageSize=${pageSize}`;
    const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`GET ${collectionPath} failed: ${res.status} ${await res.text()}`);
    return res.json();
}

async function firestoreCreate(accessToken, collectionPath, fields) {
    const url = `${FIRESTORE_BASE}/${collectionPath}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields }),
    });
    if (!res.ok) throw new Error(`POST ${collectionPath} failed: ${res.status} ${await res.text()}`);
    return res.json();
}

// Firestore value helpers
const strVal = (s) => ({ stringValue: s });
const intVal = (n) => ({ integerValue: String(n) });
const dblVal = (n) => ({ doubleValue: n });
const boolVal = (b) => ({ booleanValue: b });
const tsVal = (date) => ({ timestampValue: date.toISOString() });
const mapVal = (fields) => ({ mapValue: { fields } });
const arrVal = (values) => ({ arrayValue: { values } });

// Firestoreドキュメントからフィールド値を取得
function extractString(doc, field) {
    return doc.fields?.[field]?.stringValue || '';
}

// ===== Main =====
async function main() {
    console.log("🔑 Firebase CLIの認証情報を取得中...");
    const refreshToken = getRefreshToken();
    const accessToken = await getAccessToken(refreshToken);
    console.log("   ✅ アクセストークン取得完了");

    // Step 1: 既存ユーザー情報取得
    console.log("\n🔍 既存ユーザー情報を取得中...");
    const prodsResult = await firestoreGet(accessToken, 'productions', 1);
    if (!prodsResult.documents || prodsResult.documents.length === 0) {
        throw new Error("既存の公演が見つかりません。");
    }
    const existingProd = prodsResult.documents[0];
    const userId = extractString(existingProd, 'userId');
    const troupeId = extractString(existingProd, 'troupeId') || extractString(existingProd, 'organizationId');
    const organizationId = extractString(existingProd, 'organizationId');
    console.log(`   userId: ${userId}`);
    console.log(`   troupeId: ${troupeId}`);

    const now = new Date();

    // 公演日時: 2026/6/13(土), 6/14(日) 各2回
    const performanceTimes = [
        new Date('2026-06-13T13:00:00+09:00'),
        new Date('2026-06-13T18:00:00+09:00'),
        new Date('2026-06-14T13:00:00+09:00'),
        new Date('2026-06-14T17:00:00+09:00'),
    ];

    // 券種
    const ticketTypes = [
        { id: 'ticket_student', name: '学生', price: 1500, advancePrice: 1500, doorPrice: 2000, isPublic: true },
        { id: 'ticket_general', name: '一般', price: 3000, advancePrice: 3000, doorPrice: 3500, isPublic: true },
    ];

    // ===== 公演作成 =====
    console.log("\n🎭 デモ公演を作成中...");
    const ticketTypesArr = ticketTypes.map(t => mapVal({
        id: strVal(t.id),
        name: strVal(t.name),
        price: intVal(t.price),
        advancePrice: intVal(t.advancePrice),
        doorPrice: intVal(t.doorPrice),
        isPublic: boolVal(t.isPublic),
    }));

    const prodDoc = await firestoreCreate(accessToken, 'productions', {
        title: strVal('デモ公演「星降る夜に」'),
        description: strVal('デモデータとして自動生成された公演です。'),
        venue: strVal('シアター天神ホール'),
        organizerEmail: strVal(''),
        organizationId: strVal(organizationId),
        troupeId: strVal(troupeId),
        userId: strVal(userId),
        ticketTypes: arrVal(ticketTypesArr),
        actors: arrVal([
            mapVal({ id: strVal('actor1'), name: strVal('山田 太郎'), role: strVal('主演') }),
            mapVal({ id: strVal('actor2'), name: strVal('佐藤 花子'), role: strVal('助演') }),
            mapVal({ id: strVal('actor3'), name: strVal('鈴木 一郎'), role: strVal('演出') }),
        ]),
        receptionStatus: strVal('OPEN'),
        staffTokens: mapVal({}),
        formFields: arrVal([]),
        createdAt: tsVal(now),
        updatedAt: tsVal(now),
    });

    const productionId = prodDoc.name.split('/').pop();
    console.log(`   ✅ 公演作成完了: ${productionId}`);

    // ===== 公演回作成 =====
    console.log("\n📅 公演回を作成中...");
    const performanceIds = [];
    for (const time of performanceTimes) {
        const perfDoc = await firestoreCreate(accessToken, 'performances', {
            productionId: strVal(productionId),
            startTime: tsVal(time),
            capacity: intVal(50),
            receptionEndHours: intVal(0),
            receptionEndMinutes: intVal(0),
            userId: strVal(userId),
            createdAt: tsVal(now),
            updatedAt: tsVal(now),
        });
        const perfId = perfDoc.name.split('/').pop();
        performanceIds.push(perfId);
        const label = time.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' })
            + ' ' + time.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        console.log(`   ✅ ${label} (定員50) → ${perfId}`);
    }

    // ===== 予約データ作成 =====
    console.log("\n📝 予約データを作成中...");

    const lastNames = ['田中', '山田', '佐藤', '鈴木', '高橋', '伊藤', '渡辺', '中村', '小林', '加藤',
        '吉田', '山本', '松本', '井上', '木村', '林', '斎藤', '清水', '山口', '阿部',
        '池田', '橋本', '石川', '前田', '藤田', '岡田', '後藤', '長谷川', '村上', '近藤',
        '石井', '遠藤', '坂本', '青木', '藤井', '西村', '太田', '三浦', '福田', '岡本'];
    const firstNames = ['太郎', '花子', '一郎', '美咲', '健太', '由美', '翔', '愛', '大輔', '恵',
        '拓也', 'さくら', '直樹', '真由美', '誠', '千尋', '亮', '彩', '和也', '陽子',
        '隼人', '結衣', '大地', '莉子', '悠太', '美月', '蓮', '凛', '陸', '葵'];

    let reservationCount = 0;

    for (let perfIndex = 0; perfIndex < performanceIds.length; perfIndex++) {
        const perfId = performanceIds[perfIndex];
        const perfTime = performanceTimes[perfIndex];
        const numReservations = 28 + Math.floor(Math.random() * 5); // 28〜32人

        const label = perfTime.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
            + ' ' + perfTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        console.log(`\n   📌 公演回 ${perfIndex + 1} (${label}): ${numReservations}件`);

        // 並列でリクエスト（5件ずつ）
        const promises = [];
        for (let i = 0; i < numReservations; i++) {
            const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
            const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
            const customerName = `${lastName} ${firstName}`;

            const isStudent = Math.random() < 0.35;
            const ticketType = isStudent ? ticketTypes[0] : ticketTypes[1];

            const daysAgo = Math.floor(Math.random() * 30);
            const reservedAt = new Date();
            reservedAt.setDate(reservedAt.getDate() - daysAgo);

            const promise = firestoreCreate(accessToken, 'reservations', {
                productionId: strVal(productionId),
                performanceId: strVal(perfId),
                customerName: strVal(customerName),
                customerEmail: strVal(`demo${reservationCount + 1}@example.com`),
                customerPhone: strVal(''),
                tickets: arrVal([
                    mapVal({
                        ticketTypeId: strVal(ticketType.id),
                        ticketTypeName: strVal(ticketType.name),
                        count: intVal(1),
                        price: intVal(ticketType.advancePrice),
                    })
                ]),
                totalAmount: intVal(ticketType.advancePrice),
                status: strVal('CONFIRMED'),
                paymentStatus: strVal('UNPAID'),
                checkinStatus: strVal('NOT_CHECKED_IN'),
                source: strVal('PRE_RESERVATION'),
                notes: strVal(''),
                userId: strVal(userId),
                createdAt: tsVal(reservedAt),
                updatedAt: tsVal(reservedAt),
            });

            promises.push(promise);
            reservationCount++;

            // 5件ずつ並列実行
            if (promises.length >= 5) {
                await Promise.all(promises);
                promises.length = 0;
                process.stdout.write('.');
            }
        }
        // 残りを実行
        if (promises.length > 0) {
            await Promise.all(promises);
            process.stdout.write('.');
        }
        console.log(` done`);
    }

    console.log(`\n🎉 デモデータ投入完了！`);
    console.log(`   ─────────────────────────`);
    console.log(`   公演名: デモ公演「星降る夜に」`);
    console.log(`   会場:   シアター天神ホール`);
    console.log(`   券種:   学生 ¥1,500 / 一般 ¥3,000`);
    console.log(`   公演回: ${performanceIds.length}回 (6/13 土 - 6/14 日)`);
    console.log(`   予約:   ${reservationCount}件`);
    console.log(`   ─────────────────────────`);
    console.log(`\n   公演一覧からこの公演を選択して確認してください。`);
}

main().then(() => process.exit(0)).catch((err) => {
    console.error("❌ エラー:", err.message || err);
    process.exit(1);
});
