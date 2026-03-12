// Firestore Timestamp / サーバーシリアライズ後の ISO 文字列 / JS Date の共用型
export type FirestoreTimestamp = string | Date | { seconds: number; nanoseconds: number; toDate?(): Date };

export interface TicketType {
    id: string;
    name: string;
    price: number;
    advancePrice: number;
    doorPrice: number;
    isPublic: boolean;
    isInvitation?: boolean;
    organizationId?: string;
}

export interface Actor {
    id: string;
    name: string;
}

export interface FormFieldConfig {
    id: string;
    label: string;
    type: 'text' | 'textarea' | 'select' | 'checkbox';
    enabled: boolean;
    required: boolean;
    placeholder?: string;
    isCustom?: boolean;
    options?: string[];
    templateType?: 'phone' | 'newsletter';
    validation?: string;
}

export interface ReservationTicket {
    ticketTypeId: string;
    ticketType?: TicketType;
    count: number;
    price: number;
    paidCount?: number;
}

export interface FirestoreReservation {
    id: string;
    productionId: string; // The production this reservation belongs to
    performanceId: string;
    customerName: string;
    customerNameKana?: string | null;
    customerEmail?: string | null;
    checkedInTickets: number;
    checkinStatus: string;
    checkedIn?: boolean; // 新規追加：高速チェックイン用フラグ
    tickets: ReservationTicket[];
    status: 'PENDING' | 'CONFIRMED' | 'CANCELED';
    paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID';
    paidAmount: number;
    source: 'PRE_RESERVATION' | 'SAME_DAY';
    remarks?: string | null;
    userId: string; // Organizer ID
    promoterId?: string | null; // Introduction by (Actor ID)
    staffToken?: string; // Access token for this reservation (copied from production)
    checkedInAt?: FirestoreTimestamp | null;
    customFieldValues?: Record<string, string | boolean>;
    performance?: Performance; // Joined data
    createdAt?: FirestoreTimestamp;
    updatedAt?: FirestoreTimestamp;
}

export interface Troupe {
    id: string;
    name: string;
    customId: string; // URL slug: tenjin-support.com/t/[customId]
    ownerId: string;
    description?: string | null;
    logoUrl?: string | null;
    createdAt: FirestoreTimestamp;
    updatedAt: FirestoreTimestamp;
}

export interface Membership {
    id: string;
    userId: string;
    troupeId: string;
    role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
    joinedAt: FirestoreTimestamp;
    updatedAt: FirestoreTimestamp;
}

export interface EmailTemplateData {
    subject: string;
    body: string;
    timing?: string;
}

export interface EmailTemplates {
    confirmation?: EmailTemplateData;
    confirmationEnabled?: boolean;
    reminder?: EmailTemplateData;
    reminderEnabled?: boolean;
    ccToOrganizer?: boolean;
}

export interface Production {
    id: string;
    title: string;
    description?: string | null;
    venue?: string;         // 会場名
    organizerEmail?: string; // 主催者メールアドレス
    organizationId: string; // Legacy: will be replaced by troupeId
    troupeId?: string;      // New: Reference to Troupe.id
    customId?: string;      // New: URL slug for this production
    ticketTypes: TicketType[];
    actors: Actor[];
    receptionStatus: 'OPEN' | 'CLOSED';
    receptionStart?: FirestoreTimestamp | null;
    receptionEnd?: FirestoreTimestamp | null;
    receptionEndMode?: 'MANUAL' | 'AUTO_PERFORMANCE_START' | 'AUTO_TIME_BEFORE';
    receptionEndMinutes?: number;
    performances?: Performance[];
    userId: string; // Owner ID (Legacy)
    staffTokens?: {
        [token: string]: {
            role: string;
            passcode?: string; // Legacy: 平文パスコード（新規発行では保存しない）
            passcodeHashed: string;
        } | string; // string is for legacy support during migration
    };
    staffPasscodeHashed?: string; // Legacy: Common passcode
    formFields?: FormFieldConfig[];
    emailTemplates?: EmailTemplates;
    // 物販関連
    merchandiseMode?: 'SIMPLE' | 'INDEPENDENT';
    merchandiseInventoryEnabled?: boolean;
    merchandiseSets?: MerchandiseSet[];
    createdAt?: FirestoreTimestamp;
    updatedAt?: FirestoreTimestamp;
}

export interface Performance {
    id: string;
    productionId: string;
    startTime: FirestoreTimestamp; // Firestore Timestamp or Date
    capacity: number;
    bookedCount?: number;
    receptionEndHours: number;
    receptionEndMinutes: number;
    userId: string; // Owner ID
    createdAt?: FirestoreTimestamp;
    updatedAt?: FirestoreTimestamp;
}

export interface PerformanceStats {
    id: string;
    startTime: FirestoreTimestamp;
    capacity: number;
    bookedCount: number;
    remainingCount: number;
    occupancyRate: number;
}

export interface DuplicateGroup {
    id: string;
    reservations: FirestoreReservation[];
}

export interface ProductionDetails {
    production: Production;
    performances: Performance[];
}

export interface AppUser {
    uid: string;
    email: string | null;
    troupeName: string;
    createdAt: FirestoreTimestamp;
    updatedAt: FirestoreTimestamp;
}
export interface CashDenomination {
    denomination: number;  // 10000, 5000, 1000, 500, 100, 50, 10, 5, 1
    count: number;
}

export interface CashClosing {
    id: string;
    productionId: string;
    performanceId: string;
    userId: string;
    closedBy: string;
    closedByType: 'ORGANIZER' | 'STAFF';
    changeFloat: number;
    denominations: CashDenomination[];
    cashTotal: number;
    expectedSales: number;
    actualSales: number;
    discrepancy: number;
    inventoryCheck?: InventoryCheckItem[] | null;
    remarks?: string | null;
    createdAt?: FirestoreTimestamp;
    updatedAt?: FirestoreTimestamp;
}

export interface SalesReport {
    totalRevenue: number;
    totalTickets: number;
    ticketTypeBreakdown: {
        [id: string]: {
            name: string;
            count: number;
            revenue: number;
        }
    };
    performanceSummaries: {
        id: string;
        startTime: FirestoreTimestamp;
        bookedCount: number;
        checkedInCount: number;
        revenue: number;
    }[];
}

// ── 物販関連型定義 ──

export interface MerchandiseVariant {
    id: string;
    name: string;
    price: number;
    stock: number;
    isActive: boolean;
}

export interface BulkDiscount {
    minQuantity: number;
    discountedPrice: number;
}

export interface MerchandiseProduct {
    id: string;
    productionId: string;
    userId: string;
    name: string;
    category: string | null;
    price: number;
    isSellableAlone: boolean;
    hasVariants: boolean;
    variants: MerchandiseVariant[];
    stock: number;
    bulkDiscount: BulkDiscount | null;
    sortOrder: number;
    isActive: boolean;
    createdAt?: FirestoreTimestamp;
    updatedAt?: FirestoreTimestamp;
}

export interface MerchandiseSetItem {
    productId: string;
    variantId?: string;
    quantity: number;
}

export interface MerchandiseSet {
    id: string;
    name: string;
    items: MerchandiseSetItem[];
    setPrice: number;
    isActive: boolean;
}

export interface MerchandiseSaleItem {
    productId: string;
    productName: string;
    variantId: string | null;
    variantName: string | null;
    quantity: number;
    canceledQuantity: number;
    unitPrice: number;
    subtotal: number;
}

export interface MerchandiseSaleSetDiscount {
    setId: string;
    setName: string;
    discountAmount: number;
}

export interface MerchandiseSaleBulkDiscount {
    productId: string;
    productName: string;
    discountAmount: number;
}

export interface MerchandiseCancellationItem {
    productId: string;
    variantId: string | null;
    quantity: number;
}

export interface MerchandiseCancellationRefundBreakdown {
    itemRefund: number;
    discountAdjustment: number;
}

export interface MerchandiseCancellation {
    id: string;
    canceledAt: FirestoreTimestamp;
    canceledBy: string;
    canceledByType: 'ORGANIZER' | 'STAFF';
    reason: string | null;
    items: MerchandiseCancellationItem[];
    refundAmount: number;
    refundBreakdown: MerchandiseCancellationRefundBreakdown;
}

export interface MerchandiseSale {
    id: string;
    localId?: string | null;
    productionId: string;
    performanceId: string;
    userId: string;
    items: MerchandiseSaleItem[];
    setDiscounts: MerchandiseSaleSetDiscount[];
    bulkDiscounts: MerchandiseSaleBulkDiscount[];
    subtotal: number;
    totalDiscount: number;
    totalAmount: number;
    refundedAmount: number;
    effectiveAmount: number;
    status: 'COMPLETED' | 'PARTIALLY_CANCELED' | 'CANCELED';
    cancellations: MerchandiseCancellation[];
    canceledAt?: FirestoreTimestamp | null;
    cancelReason?: string | null;
    soldBy: string;
    soldByType: 'ORGANIZER' | 'STAFF';
    createdAt?: FirestoreTimestamp;
    updatedAt?: FirestoreTimestamp;
}

export interface MerchandiseInventoryLog {
    id: string;
    productionId: string;
    userId: string;
    productId: string;
    variantId: string | null;
    type: 'SALE' | 'CANCEL_RESTORE' | 'PARTIAL_CANCEL_RESTORE' | 'MANUAL_ADJUST';
    quantityChange: number;
    previousStock: number;
    newStock: number;
    saleId: string | null;
    cancellationId: string | null;
    remarks: string | null;
    createdAt?: FirestoreTimestamp;
}

export interface MerchandiseCashClosing {
    id: string;
    productionId: string;
    performanceId: string;
    userId: string;
    closedBy: string;
    closedByType: 'ORGANIZER' | 'STAFF';
    changeFloat: number;
    denominations: CashDenomination[];
    cashTotal: number;
    expectedSales: number;
    actualSales: number;
    discrepancy: number;
    inventoryCheck: InventoryCheckItem[] | null;
    remarks?: string | null;
    createdAt?: FirestoreTimestamp;
    updatedAt?: FirestoreTimestamp;
}

export interface InventoryCheckItem {
    productId: string;
    productName: string;
    variantId: string | null;
    variantName: string | null;
    expectedRemaining: number;
    actualRemaining: number;
    discrepancy: number;
    baseStock: number;                          // 基準在庫（前回実数 or 初期在庫）
    baseSource: 'INITIAL' | 'PREVIOUS_CHECK';   // 基準の出所
    soldSinceBase: number;                      // 基準以降の販売数
}
