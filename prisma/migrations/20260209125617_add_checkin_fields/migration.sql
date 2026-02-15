/*
  Warnings:

  - You are about to drop the column `count` on the `Reservation` table. All the data in the column will be lost.
  - You are about to drop the column `ticketTypeId` on the `Reservation` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "ReservationTicket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reservationId" TEXT NOT NULL,
    "ticketTypeId" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    CONSTRAINT "ReservationTicket_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReservationTicket_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Production" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "receptionStatus" TEXT NOT NULL DEFAULT 'CLOSED',
    "receptionStart" DATETIME,
    "receptionEnd" DATETIME,
    "receptionEndMode" TEXT NOT NULL DEFAULT 'MANUAL',
    "receptionEndMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Production_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Production" ("createdAt", "id", "organizationId", "title", "updatedAt") SELECT "createdAt", "id", "organizationId", "title", "updatedAt" FROM "Production";
DROP TABLE "Production";
ALTER TABLE "new_Production" RENAME TO "Production";
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Reservation_performanceId_fkey" FOREIGN KEY ("performanceId") REFERENCES "Performance" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Reservation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Reservation" ("actorId", "createdAt", "customerEmail", "customerName", "id", "paidAmount", "paymentStatus", "performanceId", "status", "updatedAt") SELECT "actorId", "createdAt", "customerEmail", "customerName", "id", "paidAmount", "paymentStatus", "performanceId", "status", "updatedAt" FROM "Reservation";
DROP TABLE "Reservation";
ALTER TABLE "new_Reservation" RENAME TO "Reservation";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
