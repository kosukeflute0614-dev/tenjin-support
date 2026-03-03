'use server'

import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { cookies } from "next/headers";
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { SignJWT, jwtVerify } from 'jose';

const SALT_ROUNDS = 10;
const SESSION_SECRET = new TextEncoder().encode(
    process.env.SESSION_SECRET || 'fallback-dev-secret-change-in-production'
);

// SEC-05: SHA-256 は後方互換用のみ。新規は bcrypt を使用
function hashPasscodeLegacy(passcode: string): string {
    return crypto.createHash('sha256').update(passcode).digest('hex');
}

/**
 * パスコードを bcrypt でハッシュ化する（サーバーサイド）
 * クライアント側の generateStaffTokenClient から呼び出される
 */
export async function hashPasscodeSecure(passcode: string): Promise<string> {
    return bcrypt.hash(passcode, SALT_ROUNDS);
}

/**
 * スタッフトークンの有効性をサーバーサイドで検証する
 * クライアントに staffTokens の中身を返さず、ロール情報のみ返す
 */
export async function validateStaffToken(
    productionId: string,
    token: string
): Promise<{ valid: boolean; role?: string }> {
    try {
        const prodRef = doc(db, "productions", productionId);
        const prodSnap = await getDoc(prodRef);

        if (!prodSnap.exists()) return { valid: false };

        const staffTokens = prodSnap.data().staffTokens || {};
        const tokenData = staffTokens[token];

        if (!tokenData) return { valid: false };

        const role = typeof tokenData === 'string' ? tokenData : tokenData.role;
        return { valid: true, role: role || 'reception' };
    } catch {
        return { valid: false };
    }
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

        // SEC-05: bcrypt を優先、SHA-256 レガシーにフォールバック
        let isValid = false;
        if (passcodeHashedInDb.startsWith('$2b$') || passcodeHashedInDb.startsWith('$2a$')) {
            // bcrypt ハッシュ
            isValid = await bcrypt.compare(passcode, passcodeHashedInDb);
        } else {
            // レガシー SHA-256 ハッシュ（後方互換）
            const hashedInput = hashPasscodeLegacy(passcode);
            isValid = passcodeHashedInDb === hashedInput;
        }

        if (!isValid) {
            return { success: false, error: "パスコードが一致しません" };
        }

        // SEC-08: セッション Cookie を JWT 署名付きに変更
        const jwt = await new SignJWT({ productionId, token })
            .setProtectedHeader({ alg: 'HS256' })
            .setExpirationTime('24h')
            .setIssuedAt()
            .sign(SESSION_SECRET);

        const cookieStore = await cookies();
        cookieStore.set(`staff_session_${productionId}`, jwt, {
            httpOnly: true,
            secure: true,
            sameSite: 'strict',
            maxAge: 24 * 60 * 60,
            path: '/',
        });

        return { success: true, passcodeHashed: passcodeHashedInDb };
    } catch (error: any) {
        console.error("verifyStaffPasscode error:", error);
        return { success: false, error: "認証処理中にエラーが発生しました" };
    }
}

/**
 * スタッフセッションが有効か確認する (JWT署名付きCookie)
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
        // SEC-08: JWT 署名検証
        const { payload } = await jwtVerify(session.value, SESSION_SECRET);
        return payload.productionId === productionId && payload.token === token;
    } catch {
        // JWT 検証失敗（改ざん・期限切れ）
        return false;
    }
}
