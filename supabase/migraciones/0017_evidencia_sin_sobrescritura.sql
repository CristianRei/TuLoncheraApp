-- 0017 — Selfies de turno y comprobantes de transferencia: solo se suben,
-- nunca se sobrescriben.
--
-- Antes (0002) cualquier sesión autenticada podía hacer UPDATE en los buckets
-- `selfies-turnos` y `comprobantes-venta`: como la app entra con sesión
-- anónima y la anon key viaja en el .apk, cualquiera podía reemplazar la foto
-- del comprobante de una transferencia ya registrada (alterar la evidencia).
-- La app ya no usa `upsert` al subir (src/sync/motor.ts): cada archivo lleva
-- el id de su turno/venta y se sube una sola vez; un reintento que encuentra
-- el archivo ya subido lo da por bueno.
--
-- Idempotente: se puede correr varias veces.

drop policy if exists "selfies_turnos_update_auth" on storage.objects;
drop policy if exists "comprobantes_venta_update_auth" on storage.objects;
