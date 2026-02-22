export interface TicketType {
    id: string;
    name: string;
    price: number;
    advancePrice: number;
    doorPrice: number;
    isPublic: boolean;
    organizationId?: string;
}

export interface Actor {
    id: string;
    name: string;
}

export interface ReservationTicket {
    ticketTypeId: string;
    ticketType?: any;
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
    tickets: ReservationTicket[];
    status: 'PENDING' | 'CONFIRMED' | 'CANCELED';
    paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID';
    paidAmount: number;
    source: 'PRE_RESERVATION' | 'SAME_DAY';
    remarks?: string | null;
    userId: string; // Organizer ID
    staffToken?: string; // Access token for this reservation (copied from production)
    checkedInAt?: any;
    performance?: Performance; // Joined data
    createdAt?: any;
    updatedAt?: any;
}

export interface Troupe {
    id: string;
    name: string;
    customId: string; // URL slug: tenjin-support.com/t/[customId]
    ownerId: string;
    description?: string | null;
    logoUrl?: string | null;
    createdAt: any;
    updatedAt: any;
}

export interface Membership {
    id: string;
    userId: string;
    troupeId: string;
    role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
    joinedAt: any;
    updatedAt: any;
}

export interface Production {
    id: string;
    title: string;
    description?: string | null;
    organizationId: string; // Legacy: will be replaced by troupeId
    troupeId?: string;      // New: Reference to Troupe.id
    customId?: string;      // New: URL slug for this production
    ticketTypes: TicketType[];
    actors: Actor[];
    receptionStatus: 'OPEN' | 'CLOSED';
    receptionStart?: any | null;
    receptionEnd?: any | null;
    receptionEndMode?: 'MANUAL' | 'AUTO_PERFORMANCE_START' | 'AUTO_TIME_BEFORE';
    receptionEndMinutes?: number;
    performances?: Performance[];
    userId: string; // Owner ID (Legacy)
    staffTokens?: { [token: string]: string }; // Map of token to role (e.g., { "uuid": "manager" })
    staffPasscodeHashed?: string; // Hashed 4-digit passcode
    createdAt?: any;
    updatedAt?: any;
}

export interface Performance {
    id: string;
    productionId: string;
    startTime: any; // Firestore Timestamp or Date
    capacity: number;
    receptionEndHours: number;
    receptionEndMinutes: number;
    userId: string; // Owner ID
    createdAt?: any;
    updatedAt?: any;
}

export interface PerformanceStats {
    id: string;
    startTime: any;
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
    createdAt: any;
    updatedAt: any;
}
