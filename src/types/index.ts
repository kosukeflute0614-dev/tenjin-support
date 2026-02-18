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
    checkedInAt?: any;
    performance?: Performance; // Joined data
    createdAt?: any;
    updatedAt?: any;
}

export interface Production {
    id: string;
    title: string;
    description?: string | null;
    organizationId: string;
    ticketTypes: TicketType[];
    actors: Actor[];
    receptionStatus: 'OPEN' | 'CLOSED';
    receptionStart?: any | null;
    receptionEnd?: any | null;
    receptionEndMode?: 'MANUAL' | 'AUTO_PERFORMANCE_START' | 'AUTO_TIME_BEFORE';
    receptionEndMinutes?: number;
    performances?: Performance[];
    userId: string; // Owner ID
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
