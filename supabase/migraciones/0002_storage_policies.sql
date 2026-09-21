-- Políticas de Storage para los buckets `selfies-turnos` y
-- `comprobantes-venta` — RLS de storage.objects es independiente de las
-- políticas de tablas normales (0001_turnos_y_comprobantes.sql). El upload
-- con `upsert: true` desde el cliente (src/sync/motor.ts) requiere INSERT
-- Y UPDATE sobre storage.objects, no solo INSERT — un upsert real es
-- "insertar o actualizar si ya existe".
--
-- Prerrequisito: los dos buckets deben existir ya (creados a mano en
-- Storage → New bucket, ambos privados, "Public bucket" apagado).

create policy "selfies_turnos_insert_auth"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'selfies-turnos');

create policy "selfies_turnos_select_auth"
  on storage.objects for select to authenticated
  using (bucket_id = 'selfies-turnos');

create policy "selfies_turnos_update_auth"
  on storage.objects for update to authenticated
  using (bucket_id = 'selfies-turnos')
  with check (bucket_id = 'selfies-turnos');

create policy "comprobantes_venta_insert_auth"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'comprobantes-venta');

create policy "comprobantes_venta_select_auth"
  on storage.objects for select to authenticated
  using (bucket_id = 'comprobantes-venta');

create policy "comprobantes_venta_update_auth"
  on storage.objects for update to authenticated
  using (bucket_id = 'comprobantes-venta')
  with check (bucket_id = 'comprobantes-venta');

-- Sin política de DELETE en ninguno de los dos buckets: nadie puede borrar
-- una foto ya subida.
