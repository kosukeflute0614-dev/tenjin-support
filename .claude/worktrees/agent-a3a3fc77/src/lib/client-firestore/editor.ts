import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { timestampToDate } from './_utils';
import type { SurveyLayoutDocument } from '@/components/PrintLayoutEditor';

// ─────────────────────────────────────────────────────────────
// 編集状態ドラフト保存 (surveyLayoutDrafts コレクション)
// JSON座標データは作らない。fontSizeMode / freeTextHeights のみ保存・復元する。
// ─────────────────────────────────────────────────────────────

export interface EditorDraftData {
    font_size_mode: '小' | '中' | '大';
    free_text_heights: Record<string, number>;
}

/**
 * 編集状態だけを一時保存する（JSON座標データは作成しない）
 * templateId をドキュメント ID として使い、常に上書きする。
 */
export async function saveEditorDraft(
    templateId: string,
    draft: EditorDraftData,
    userId: string
): Promise<void> {
    if (!templateId || !userId) throw new Error('Missing required parameters');

    const { setDoc } = await import('firebase/firestore');
    const ref = doc(db, 'surveyLayoutDrafts', templateId);
    const snap = await getDoc(ref);

    const data = {
        ...draft,
        user_id: userId,
        template_id: templateId,
        updated_at: serverTimestamp(),
    };

    if (snap.exists()) {
        if (snap.data().user_id !== userId) throw new Error('Unauthorized');
        await updateDoc(ref, data);
    } else {
        await setDoc(ref, { ...data, created_at: serverTimestamp() });
    }
}

/**
 * 保存済みの編集状態を取得する（エディタ起動時の復元用）
 * 存在しない場合は null を返す。
 */
export async function loadEditorDraft(
    templateId: string,
    userId: string
): Promise<EditorDraftData | null> {
    if (!templateId || !userId) return null;

    const ref = doc(db, 'surveyLayoutDrafts', templateId);
    const snap = await getDoc(ref);

    if (!snap.exists()) return null;
    const data = snap.data();
    if (data.user_id !== userId) return null;

    return {
        font_size_mode: data.font_size_mode ?? '中',
        free_text_heights: data.free_text_heights ?? {},
    };
}

// ─────────────────────────────────────────────────────────────
// バージョン管理 (surveyLayouts/{templateId}/versions/{layout_id})
// 確定するたびに新バージョンをサブコレクションに「追記」する。
// 既存バージョンの update / delete は Firestore ルールで禁止済み。
// ─────────────────────────────────────────────────────────────

/**
 * レイアウトを新バージョンとして確定保存する。
 * 毎回新しいドキュメントが作成される（バージョン管理）。
 * @returns 生成された layout_id（QRコードに埋め込む）と、当日の連番（ファイル名用）
 */
export async function finalizeSurveyLayoutVersion(
    templateId: string,
    layoutDoc: SurveyLayoutDocument,
    userId: string
): Promise<{ layoutId: string; serial: string }> {
    if (!templateId || !userId) throw new Error('Missing required parameters');

    const { setDoc, collection: fsCollection, getDocs: fsGetDocs } = await import('firebase/firestore');
    const versionsRef = fsCollection(db, 'surveyLayouts', templateId, 'versions');

    // 1. 全バージョンを取得して連番を決める
    const totalSnap = await fsGetDocs(versionsRef);
    const nextVersionNumber = totalSnap.size + 1;

    // 2. 「当日」の作成件数をカウントしてファイル名用の連番を生成
    //    インデックスエラー回避のため、クライアントサイドでフィルタリングを行う
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    const todayDocs = totalSnap.docs.filter(d => {
        const data = d.data();
        if (data.user_id !== userId) return false;
        // created_at が null（保存直後）の場合は当日のものとして扱う
        if (!data.created_at) return true;
        const createdAtDate = timestampToDate(data.created_at);
        return createdAtDate && createdAtDate.getTime() >= todayStart;
    });

    const serialNumber = todayDocs.length + 1;
    const serialStr = serialNumber.toString().padStart(2, '0');

    // バージョン固有のランダムID（= layout_id = QRに埋め込む値）
    const layoutId = crypto.randomUUID().replace(/-/g, '').slice(0, 8);

    const finalDoc: SurveyLayoutDocument = {
        ...layoutDoc,
        metadata: {
            ...layoutDoc.metadata,
            layout_id: layoutId,
            is_final: true,
            updated_at: now.toISOString(),
        },
    };

    const versionRef = doc(db, 'surveyLayouts', templateId, 'versions', layoutId);
    await setDoc(versionRef, {
        ...finalDoc,
        version_number: nextVersionNumber,
        serial_of_day: serialStr, // 当日の連番を保存（デバッグ用）
        user_id: userId,
        created_at: serverTimestamp(),
    });

    return { layoutId, serial: serialStr };
}
