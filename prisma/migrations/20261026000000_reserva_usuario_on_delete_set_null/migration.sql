-- Preserve reservations when an associated user is deleted.
-- This runs after the visitor migration makes usuarioId nullable.
ALTER TABLE "Reserva"
  DROP CONSTRAINT "Reserva_usuarioId_fkey",
  ADD CONSTRAINT "Reserva_usuarioId_fkey"
    FOREIGN KEY ("usuarioId")
    REFERENCES "Usuario"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
