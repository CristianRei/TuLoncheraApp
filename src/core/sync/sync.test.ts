import assert from 'node:assert/strict';
import test from 'node:test';

import { explicarErrorSync } from './index.ts';

test('columna que falta: nombra la columna y la migración a repetir (el caso real de eventos)', () => {
  const r = explicarErrorSync('eventos', "Could not find the 'hora_inicio' column of 'eventos' in the schema cache");
  assert.match(r.titulo, /hora_inicio/);
  assert.match(r.accion, /0014_eventos\.sql/);
  const pg = explicarErrorSync('eventos', 'column eventos.hora_inicio does not exist');
  assert.match(pg.titulo, /hora_inicio/);
});

test('tabla que no existe: dice qué migración correr', () => {
  const r = explicarErrorSync('traslados', "Could not find the table 'public.traslados' in the schema cache");
  assert.match(r.accion, /0011_traslados\.sql/);
});

test('personal sin admin en sesión o con PIN no registrado', () => {
  assert.match(
    explicarErrorSync('usuarios', 'Hace falta que un administrador inicie sesión en este dispositivo para subir el cambio.').accion,
    /Inicia sesión como administrador/
  );
  assert.match(
    explicarErrorSync('usuarios', 'Supabase no reconoce el PIN de este administrador. Regístralo con registrar_admin').accion,
    /registrar_admin/
  );
});

test('sin red: se reintenta solo', () => {
  assert.match(explicarErrorSync('ventas', 'TypeError: Network request failed').accion, /reintenta solo/);
});

test('error desconocido: no inventa una causa', () => {
  assert.match(explicarErrorSync('ventas', 'algo raro').accion, /detalle técnico/);
});
