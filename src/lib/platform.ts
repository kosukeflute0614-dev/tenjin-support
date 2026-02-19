import { Troupe, Membership, AppUser } from '@/types';
import { db } from './firebase';
import { User } from 'firebase/auth';
import {
    collection,
    query,
    where,
    getDocs,
    doc,
    runTransaction,
    serverTimestamp,
    writeBatch,
    limit
} from 'firebase/firestore';

/**
 * カスタムID（URLスラッグ）から劇団情報を取得する
 */
export async function getTroupeByCustomId(customId: string): Promise<Troupe | null> {
    const q = query(collection(db, 'troupes'), where('customId', '==', customId), limit(1));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Troupe;
}

/**
 * 指定したユーザーの現在の劇団所属情報を取得する
 */
export async function getCurrentUserMembership(userId: string): Promise<Membership | null> {
    const q = query(collection(db, 'memberships'), where('userId', '==', userId), limit(1));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Membership;
}

/**
 * 劇団に紐付いた全公演を取得する
 */
export async function getProductionsByTroupeId(troupeId: string): Promise<any[]> {
    const q = query(collection(db, 'productions'), where('troupeId', '==', troupeId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * ユーザーの劇団所属を保証する（存在しない場合は自動生成し、既存公演を移行する）
 * Phase 1-B: 裏側の自動生成・マイグレーション
 */
export async function ensureUserTroupe(userId: string, profile: AppUser): Promise<void> {
    // 1. すでに所属があるか確認
    const existingMembership = await getCurrentUserMembership(userId);
    if (existingMembership) return;

    console.log('[Platform] Starting automatic troupe generation for:', userId);

    try {
        let newTroupeId = '';

        // 2. トランザクションで劇団と所属を作成
        await runTransaction(db, async (transaction) => {
            const troupeRef = doc(collection(db, 'troupes'));
            const membershipRef = doc(collection(db, 'memberships'));
            newTroupeId = troupeRef.id;

            const troupeData = {
                name: profile.troupeName || 'デフォルト劇団',
                customId: `t-${Math.random().toString(36).substring(2, 8)}`, // ランダムな初期スラグ
                ownerId: userId,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };

            const membershipData = {
                userId: userId,
                troupeId: newTroupeId,
                role: 'OWNER',
                joinedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };

            transaction.set(troupeRef, troupeData);
            transaction.set(membershipRef, membershipData);
        });

        // 3. 既存公演のマイグレーション
        await migrateProductionsToTroupe(userId, newTroupeId);

        console.log('[Platform] Automatic generation and migration completed successfully.');
    } catch (error) {
        console.error('[Platform] Failed to ensure user troupe:', error);
    }
}

/**
 * 劇団と所属情報を同期的に初期化する（オンボーディング用）
 * Phase 1-C: 完全同期と初期データ投入
 */
export async function initializeTroupeAndMembership(user: User, troupeName: string): Promise<void> {
    const userId = user.uid;

    try {
        // 1. すでに所属があるか確認
        const existingMembership = await getCurrentUserMembership(userId);
        if (existingMembership) {
            console.log('[Platform] User already has a membership. Skipping initialization.');
            return;
        }

        await runTransaction(db, async (transaction) => {
            const troupeRef = doc(collection(db, 'troupes'));
            const membershipRef = doc(collection(db, 'memberships'));
            const userRef = doc(db, 'users', userId);

            const troupeId = troupeRef.id;

            // 劇団ドキュメント
            transaction.set(troupeRef, {
                name: troupeName,
                customId: `t-${Math.random().toString(36).substring(2, 8)}`,
                ownerId: userId,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            // 所属ドキュメント
            transaction.set(membershipRef, {
                userId: userId,
                troupeId: troupeId,
                role: 'OWNER',
                joinedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            // ユーザードキュメント（Google情報を最新に）
            transaction.set(userRef, {
                uid: userId,
                email: user.email,
                displayName: user.displayName,
                photoURL: user.photoURL,
                troupeName: troupeName,
                updatedAt: serverTimestamp()
            }, { merge: true });
        });

        // 片付け: 所属した劇団のIDを取得し直してマイグレーション
        const newMembership = await getCurrentUserMembership(userId);
        if (newMembership) {
            await migrateProductionsToTroupe(userId, newMembership.troupeId);
        }

        console.log('[Platform] Full initialization completed.');
    } catch (error) {
        console.error('[Platform] Failed to initialize troupe and membership:', error);
        throw error;
    }
}

/**
 * 指定したユーザーの全公演に troupeId を付与する（内部用）
 */
async function migrateProductionsToTroupe(userId: string, troupeId: string): Promise<void> {
    const qProd = query(collection(db, 'productions'), where('userId', '==', userId));
    const prodSnapshot = await getDocs(qProd);

    if (!prodSnapshot.empty) {
        console.log(`[Platform] Migrating ${prodSnapshot.size} productions to troupe: ${troupeId}`);
        const batch = writeBatch(db);
        prodSnapshot.docs.forEach((prodDoc) => {
            const data = prodDoc.data();
            if (data.troupeId !== troupeId) {
                batch.update(prodDoc.ref, {
                    troupeId: troupeId,
                    updatedAt: serverTimestamp()
                });
            }
        });
        await batch.commit();
    }
}
