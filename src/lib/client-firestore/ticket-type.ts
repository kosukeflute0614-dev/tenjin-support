import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, query, where, updateDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { Production, FirestoreReservation, TicketType } from '@/types';
import { INVITATION_TICKET_NAME, INVITATION_TICKET_ID_PREFIX } from '@/lib/constants';

/**
 * 招待チケットの固定IDを生成する（公演IDから決定的に生成）
 */
export function getInvitationTicketId(productionId: string): string {
    return INVITATION_TICKET_ID_PREFIX + productionId;
}

/**
 * 招待チケット種別を生成する（固定ID）
 */
export function createInvitationTicketType(productionId: string): TicketType {
    return {
        id: getInvitationTicketId(productionId),
        name: INVITATION_TICKET_NAME,
        price: 0,
        advancePrice: 0,
        doorPrice: 0,
        isPublic: false,
        isInvitation: true,
    };
}

/**
 * 公演に招待チケットが存在するか確認する
 */
export function hasInvitationTicket(ticketTypes: TicketType[]): boolean {
    return ticketTypes.some(tt => tt.isInvitation === true);
}

/**
 * 既存公演に招待チケットが無い場合、自動追加する
 * 固定IDを使うため、同時に複数回呼ばれても重複しない
 */
export async function ensureInvitationTicket(productionId: string, userId: string): Promise<void> {
    const docRef = doc(db, "productions", productionId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return;

    const prodData = docSnap.data() as Production;
    if (prodData.userId !== userId) return;

    const ticketTypes = prodData.ticketTypes || [];
    const expectedId = getInvitationTicketId(productionId);

    // 固定IDの招待チケットが既にあれば何もしない
    if (ticketTypes.some(tt => tt.id === expectedId)) return;

    const invitationTicket = createInvitationTicketType(productionId);
    await updateDoc(docRef, {
        ticketTypes: arrayUnion(invitationTicket),
        updatedAt: serverTimestamp()
    });
}

/**
 * 券種を追加する（クライアント側）
 */
export async function addTicketTypeClient(productionId: string, name: string, advancePrice: number, doorPrice: number, userId: string) {
    const docRef = doc(db, "productions", productionId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
        throw new Error('Production not found');
    }

    const prodData = docSnap.data();

    if (prodData.userId !== userId) {
        throw new Error('Unauthorized');
    }

    // Firestore 標準の方式で ID を生成 (ランダム文字列)
    const newId = doc(collection(db, "_temp_")).id;

    const newTicketType: TicketType = {
        id: newId,
        name,
        price: advancePrice,
        advancePrice,
        doorPrice,
        isPublic: true
    };

    await updateDoc(docRef, {
        ticketTypes: arrayUnion(newTicketType),
        updatedAt: serverTimestamp()
    });
}

/**
 * 券種を更新する（クライアント側）
 */
export async function updateTicketTypeClient(productionId: string, ticketTypeId: string, name: string, advancePrice: number, doorPrice: number, userId: string) {
    const docRef = doc(db, "productions", productionId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error('Production not found');
    if (docSnap.data().userId !== userId) throw new Error('Unauthorized');

    const production = docSnap.data() as Production;
    const updatedTicketTypes = (production.ticketTypes || []).map(tt =>
        tt.id === ticketTypeId ? { ...tt, name, price: advancePrice, advancePrice, doorPrice } : tt
    );

    await updateDoc(docRef, {
        ticketTypes: updatedTicketTypes,
        updatedAt: serverTimestamp()
    });
}

/**
 * 券種を削除する（クライアント側）
 */
export async function deleteTicketTypeClient(productionId: string, ticketTypeId: string, userId: string) {
    const docRef = doc(db, "productions", productionId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error('Production not found');
    if (docSnap.data().userId !== userId) throw new Error('Unauthorized');

    // 予約があるかチェック
    const reservationsRef = collection(db, "reservations");
    const q = query(reservationsRef, where("userId", "==", userId));
    const querySnapshot = await getDocs(q);
    const hasActiveTicket = querySnapshot.docs.some(d => {
        const res = d.data() as FirestoreReservation;
        return res.status !== 'CANCELED' && (res.tickets || []).some(t => t.ticketTypeId === ticketTypeId);
    });

    if (hasActiveTicket) {
        throw new Error('すでに予約があるため削除できません');
    }

    const updatedTicketTypes = (docSnap.data().ticketTypes || []).filter((tt: any) => tt.id !== ticketTypeId);
    await updateDoc(docRef, {
        ticketTypes: updatedTicketTypes,
        updatedAt: serverTimestamp()
    });
}
