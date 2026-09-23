-- Corrección: dos tablas solo tenían política de INSERT (`comprobantes_venta`
-- desde 0001, `arqueos_caja` desde 0005). El cliente sube con `upsert`
-- (INSERT ... ON CONFLICT DO UPDATE): si la subida llegó a Supabase pero la
-- app no alcanzó a marcar la tarea como completada (app cerrada, red que se
-- cae justo después), el reintento choca con la fila ya existente, Postgres
-- necesita una política de UPDATE para resolver ese conflicto, y sin ella el
-- reintento falla para siempre — la tarea queda "pendiente" en
-- app/admin/sync/ aunque el dato ya esté allá.
--
-- Mismo criterio que ya se aplicó a las demás tablas append-only en 0004
-- ("igual reciben UPDATE por si un reintento de red repite un upsert").
-- Reenviar exactamente los mismos valores es inocuo; ningún flujo de la app
-- modifica estas filas una vez creadas.
--
-- Se aplica a mano en el SQL editor del dashboard de Supabase.

create policy "comprobantes_update_auth" on comprobantes_venta
  for update to authenticated using (true) with check (true);

create policy "arqueos_caja_update_auth" on arqueos_caja
  for update to authenticated using (true) with check (true);
