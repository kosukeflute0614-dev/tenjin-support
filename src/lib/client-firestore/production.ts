import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, query, where, addDoc, updateDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { Production, Performance, FormFieldConfig } from '@/types';
import { serializeDocs, toDate } from '@/lib/firestore-utils';
import { timestampToDate } from './_utils';

/**
 * クライアント側で直接 Firestore から公演詳細を取得する。
 * サーバーアクション経由ではなく、ブラウザ上で実行されるため、
 * Firebase Auth の認証状態が正しく使われ、セキュリティルールに準拠する。
 */
export async function fetchProductionDetailsClient(
    productionId: string,
    userId?: string | null
): Promise<{ production: Production; performances: Performance[] } | null> {
    try {
        const productionsRef = collection(db, "productions");
        let docSnap;

        // 1. まずドキュメントIDとして試行
        const docRef = doc(db, "productions", productionId);
        docSnap = await getDoc(docRef);

        // 2. 見つからない場合は customId として検索
        if (!docSnap.exists()) {
            const qCustom = query(productionsRef, where("customId", "==", productionId));
            const customSnap = await getDocs(qCustom);
            if (!customSnap.empty) {
                docSnap = customSnap.docs[0];
            }
        }

        if (!docSnap || !docSnap.exists()) {
            return null;
        }

        const rawData = docSnap.data();

        // ログイン中の場合は所有権チェック（ADMIN用途）
        if (userId && rawData.userId !== userId) {
            return null;
        }

        const production: Production = {
            id: docSnap.id,
            title: rawData.title || '',
            description: rawData.description || null,
            organizationId: rawData.organizationId || '',
            troupeId: rawData.troupeId || null,
            customId: rawData.customId || null,
            receptionStatus: rawData.receptionStatus || 'CLOSED',
            receptionStart: timestampToDate(rawData.receptionStart)?.toISOString() || null,
            receptionEnd: timestampToDate(rawData.receptionEnd)?.toISOString() || null,
            receptionEndMode: rawData.receptionEndMode || 'MANUAL',
            receptionEndMinutes: rawData.receptionEndMinutes || 0,
            ticketTypes: (rawData.ticketTypes || []).map((tt: any) => ({
                id: tt.id,
                name: tt.name,
                price: tt.price,
                doorPrice: tt.doorPrice,
                isPublic: tt.isPublic
            })),
            actors: rawData.actors || [],
            // Only include staffTokens for authenticated admin users
            ...(userId ? { staffTokens: rawData.staffTokens || {} } : {}),
            userId: rawData.userId || '',
            formFields: rawData.formFields || undefined,
        } as Production;

        // 公演回の取得
        const realId = docSnap.id;
        const performancesRef = collection(db, "performances");
        let q;

        if (userId) {
            // ADMIN用途: 自分の公演回のみ取得（セキュリティルールに合致）
            q = query(
                performancesRef,
                where("userId", "==", userId)
            );
        } else {
            // PUBLIC用途: productionId でフィルタ
            q = query(
                performancesRef,
                where("productionId", "==", realId)
            );
        }

        const querySnapshot = await getDocs(q);
        const rawPerformances = serializeDocs<Performance>(querySnapshot.docs);

        // productionId でさらに絞り込み（userId クエリの場合用）とマッピング、ソート
        const performances = rawPerformances
            .filter(perf => perf.productionId === realId)
            .map(perf => ({
                id: perf.id,
                startTime: perf.startTime,
                capacity: perf.capacity,
                productionId: perf.productionId
            } as Performance))
            .sort((a, b) => {
                const timeA = a.startTime ? timestampToDate(a.startTime)!.getTime() : 0;
                const timeB = b.startTime ? timestampToDate(b.startTime)!.getTime() : 0;
                return timeA - timeB;
            });

        return { production, performances };
    } catch (error) {
        console.error("[client-firestore] fetchProductionDetailsClient error:", error);
        return null;
    }
}

/**
 * 公演を削除する（クライアント側）
 */
export async function deleteProductionClient(productionId: string): Promise<void> {
    if (!productionId) return;

    try {
        const productionRef = doc(db, "productions", productionId);
        await deleteDoc(productionRef);
    } catch (error) {
        console.error("[client-firestore] deleteProductionClient error:", error);
        throw error;
    }
}

/**
 * 公演のカスタムID（URLスラッグ）を更新する（クライアント側）
 */
export async function updateProductionCustomIdClient(productionId: string, customId: string): Promise<void> {
    if (!productionId) return;

    try {
        const productionRef = doc(db, "productions", productionId);
        await updateDoc(productionRef, {
            customId: customId || null,
            updatedAt: serverTimestamp()
        });
    } catch (error) {
        console.error("[client-firestore] updateProductionCustomIdClient error:", error);
        throw error;
    }
}

/**
 * 公演の基本情報（タイトル・会場名・主催者メールアドレス）を更新する（クライアント側）
 */
export async function updateProductionBasicInfoClient(
    productionId: string,
    data: { title?: string; venue?: string; organizerEmail?: string },
): Promise<void> {
    if (!productionId) return;

    const updateData: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (data.title !== undefined) updateData.title = data.title;
    if (data.venue !== undefined) updateData.venue = data.venue;
    if (data.organizerEmail !== undefined) updateData.organizerEmail = data.organizerEmail;

    try {
        const productionRef = doc(db, "productions", productionId);
        await updateDoc(productionRef, updateData);
    } catch (error) {
        console.error("[client-firestore] updateProductionBasicInfoClient error:", error);
        throw error;
    }
}

/**
 * カスタムIDの重複をチェックする（クライアント側）
 */
export async function checkCustomIdDuplicateClient(customId: string, excludeProductionId?: string): Promise<boolean> {
    if (!customId) return false;

    const productionsRef = collection(db, "productions");
    const q = query(productionsRef, where("customId", "==", customId));
    const snapshot = await getDocs(q);

    if (snapshot.empty) return false;

    // 自分自身を除外してチェック
    if (excludeProductionId) {
        return snapshot.docs.some(doc => doc.id !== excludeProductionId);
    }

    return true;
}

/**
 * 予約登録用の選択肢（公演・公演回）を取得する（クライアント側）
 */
export async function fetchBookingOptionsClient(
    activeProductionId?: string,
    userId?: string
): Promise<Production[]> {
    if (!userId) {
        if (!activeProductionId) return [];
        const res = await fetchProductionDetailsClient(activeProductionId);
        return res ? [{ ...res.production, performances: res.performances } as any] : [];
    }

    let prods: Production[] = [];
    if (activeProductionId) {
        const res = await fetchProductionDetailsClient(activeProductionId, userId);
        if (res) prods = [{ ...res.production, performances: res.performances } as any];
    } else {
        const productionsRef = collection(db, "productions");
        const q = query(productionsRef, where("userId", "==", userId));
        const querySnapshot = await getDocs(q);
        prods = serializeDocs<Production>(querySnapshot.docs);
        prods.sort((a, b) => {
            const timeA = a.updatedAt ? toDate(a.updatedAt).getTime() : 0;
            const timeB = b.updatedAt ? toDate(b.updatedAt).getTime() : 0;
            return timeB - timeA;
        });

        // 関連する全公演回を読み込む
        const performancesRef = collection(db, "performances");
        const qPerf = query(performancesRef, where("userId", "==", userId));
        const perfSnap = await getDocs(qPerf);
        const allPerfs = serializeDocs<any>(perfSnap.docs);

        prods = prods.map(p => ({
            ...p,
            performances: allPerfs.filter(perf => perf.productionId === p.id)
                .sort((a, b) => {
                    const tA = a.startTime ? timestampToDate(a.startTime)!.getTime() : 0;
                    const tB = b.startTime ? timestampToDate(b.startTime)!.getTime() : 0;
                    return tA - tB;
                })
        }));
    }

    return prods;
}

/**
 * 予約フォームのフィールド設定を保存する（クライアント側）
 */
export async function saveFormFieldsClient(
    productionId: string,
    formFields: FormFieldConfig[],
    userId: string
): Promise<void> {
    if (!userId) throw new Error('Unauthorized');
    const ref = doc(db, "productions", productionId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('NotFound');
    if (snap.data().userId !== userId) throw new Error('Unauthorized');

    await updateDoc(ref, {
        formFields,
        updatedAt: serverTimestamp()
    });
}

/**
 * 公演を新規作成する（クライアント側）
 */
export async function createProductionClient(title: string, userId: string) {
    if (!userId) throw new Error('Unauthorized');
    if (!title) throw new Error('Title is required');

    const productionsRef = collection(db, "productions");
    const newDoc = await addDoc(productionsRef, {
        userId,
        organizationId: "default_org_id",
        title,
        ticketTypes: [],
        actors: [],
        receptionStatus: 'CLOSED',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
    return newDoc.id;
}
