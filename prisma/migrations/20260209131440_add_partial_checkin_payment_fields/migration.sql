-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Reservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "performanceId" TEXT NOT NULL,
    "actorId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerNameKana" TEXT,
    "customerEmail" TEXT,
    "remarks" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'PRE_RESERVATION',
    "checkedInAt" DATETIME,
    "checkedInTickets" INTEGER NOT NULL DEFAULT 0,
    "checkinStatus" TEXT NOT NULL DEFAULT 'NOT_CHECKED_IN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Reservation_performanceId_fkey" FOREIGN KEY ("performanceId") REFERENCES "Performance" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Reservation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Reservation" ("actorId", "checkedInAt", "createdAt", "customerEmail", "customerName", "customerNameKana", "id", "paidAmount", "paymentStatus", "performanceId", "remarks", "source", "status", "updatedAt") SELECT "actorId", "checkedInAt", "createdAt", "customerEmail", "customerName", "customerNameKana", "id", "paidAmount", "paymentStatus", "performanceId", "remarks", "source", "status", "updatedAt" FROM "Reservation";
DROP TABLE "Reservation";
ALTER TABLE "new_Reservation" RENAME TO "Reservation";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
