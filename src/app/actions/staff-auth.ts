'use server'

import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { cookies } from "next/headers";
import crypto from 'crypto';

function hashPasscode(passcode: string): string {
    return crypto.createHash('sha256').update(passcode).digest('hex');
}

/**
 * スタッフ用パスコードを検証し、セッションを確立する
 * セッション情報は Cookie に保存する。Firestore (staffSessions) はクライアント側で同期する。
 */
export async function verifyStaffPasscode(
    productionId: string,
    token: string,
    passcode: string,
    uid?: string // クライアント側の匿名認証 UID
): Promise<{ success: boolean; error?: string; passcodeHashed?: string }> {
    try {
        const prodRef = doc(db, "productions", productionId);
        const prodSnap = await getDoc(prodRef);

        if (!prodSnap.exists()) {
            return { success: false, error: "公演が見つかりません" };
        }

        const data = prodSnap.data();

        // トークンの有効性確認
        const staffTokens = data.staffTokens || {};
        const tokenData = staffTokens[token];
        if (!tokenData) {
            return { success: false, error: "有効なトークンではありません" };
        }

        // パスコードの照合 (トークン個別のハッシュを使用)
        const passcodeHashedInDb = typeof tokenData === 'string' ? null : tokenData.passcodeHashed;

        if (!passcodeHashedInDb) {
            return { success: false, error: "このトークンはパスコードが設定されていません。" };
        }

        const hashedInput = hashPasscode(passcode);
        if (passcodeHashedInDb !== hashedInput) {
            return { success: false, error: "パスコードが一致しません" };
        }

        // セッション Cookie の保持 (24時間有効)
        const sessionPayload = JSON.stringify({
            productionId,
            token,
            expires: Date.now() + 24 * 60 * 60 * 1000
        });

        const cookieStore = await cookies();
        cookieStore.set(`staff_session_${productionId}`, sessionPayload, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60
        });

        return { success: true, passcodeHashed: hashedInput };
    } catch (error: any) {
        console.error("verifyStaffPasscode error:", error);
        return { success: false, error: "認証処理中にエラーが発生しました" };
    }
}

/**
 * スタッフセッションが有効か確認する (Cookieのみ)
 */
export async function checkStaffSession(
    productionId: string,
    token: string,
    uid?: string
): Promise<boolean> {
    const cookieStore = await cookies();
    const session = cookieStore.get(`staff_session_${productionId}`);

    if (!session) return false;

    try {
        const payload = JSON.parse(session.value);
        return payload.productionId === productionId && payload.token === token && payload.expires > Date.now();
    } catch {
        return false;
    }
}
