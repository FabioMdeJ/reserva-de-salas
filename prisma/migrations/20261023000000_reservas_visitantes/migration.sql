-- Visitor reservations do not require creating a user account.
ALTER TABLE "Reserva" ALTER COLUMN "usuarioId" DROP NOT NULL;
ALTER TABLE "Reserva" ADD COLUMN "visitanteNome" TEXT;
ALTER TABLE "Reserva" ADD COLUMN "visitanteEmail" TEXT;
ALTER TABLE "Reserva" ADD COLUMN "visitanteTelefone" TEXT;
ALTER TABLE "Reserva" ADD COLUMN "expiraEm" TIMESTAMP(3);
CREATE INDEX "Reserva_salaId_data_status_idx" ON "Reserva"("salaId", "data", "status");

-- Existing pending reservations retain their original 15-minute hold window.
UPDATE "Reserva"
SET "expiraEm" = "createdAt" + INTERVAL '15 minutes'
WHERE "status" = 'PENDENTE';

UPDATE "Reserva"
SET "status" = 'EXPIRADA', "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'PENDENTE' AND "expiraEm" <= CURRENT_TIMESTAMP;
