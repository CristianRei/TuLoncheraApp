import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

// Prueba del SQL de supabase/migraciones contra un Postgres REAL (PGlite, en
// memoria, sin instalar nada): que 0009 corra en un proyecto nuevo y sobre uno
// con 0003-0008 ya aplicadas, que sea idempotente, y que los triggers/RLS/
// Realtime hagan lo que la app espera. El SQL se pega a mano en el dashboard
// de Supabase — un error ahí no lo detecta nada más. `npm run test:sql`.
const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../supabase/migraciones').replaceAll('\\', '/');
const leer = (f) => readFileSync(`${DIR}/${f}`, 'utf8');
let fallos = 0;
async function paso(nombre, fn) {
  try { await fn(); console.log('OK   ', nombre); }
  catch (e) { fallos++; console.log('FALLA', nombre, '\n      ', String(e.message).split('\n').slice(0, 4).join('\n       ')); }
}

async function nuevaBase() {
  const db = new PGlite();
  // Lo que Supabase ya trae de fábrica:
  await db.exec(`create role authenticated nologin; create role anon nologin; create publication supabase_realtime;`);
  await db.exec(`grant usage on schema public to authenticated; alter default privileges in schema public grant all on tables to authenticated;`);
  return db;
}

console.log('\n== Camino 1: proyecto NUEVO — solo 0001 y luego 0009 ==');
const a = await nuevaBase();
await paso('0001 (turnos y comprobantes)', async () => { await a.exec(leer('0001_turnos_y_comprobantes.sql')); });
await paso('0009 (todo lo demás)', async () => { await a.exec(leer('0009_sincronizacion_completa.sql')); });
await paso('0009 otra vez (idempotente)', async () => { await a.exec(leer('0009_sincronizacion_completa.sql')); });

console.log('\n== Camino 2: proyecto con 0003-0008 ya aplicadas, luego 0009 ==');
const b = await nuevaBase();
await paso('0001, 0003, 0004, 0005, 0006, 0007, 0008', async () => {
  for (const f of ['0001_turnos_y_comprobantes.sql', '0003_mensajes.sql', '0004_ventas_movimientos_cargues_conteos.sql', '0005_arqueos_caja.sql', '0006_usuarios.sql', '0007_catalogo.sql', '0008_politicas_update_reintentos.sql'])
    await b.exec(leer(f));
});
await paso('0009 encima', async () => { await b.exec(leer('0009_sincronizacion_completa.sql')); });

console.log('\n== 0010 (seguridad de PIN) encima de 0009, en ambos proyectos ==');
for (const [nombre, db] of [['nuevo', a], ['con 0003-0008', b]]) {
  await paso(`0010 aplica sin error (proyecto ${nombre})`, async () => { await db.exec(leer('0010_seguridad_pin.sql')); });
  await paso(`existen las 3 tablas de seguridad de PIN (proyecto ${nombre})`, async () => {
    const r = await db.query(`select table_name from information_schema.tables where table_schema='public'`);
    const tablas = new Set(r.rows.map((x) => x.table_name));
    for (const t of ['intentos_pin_fallidos', 'desbloqueos_pin', 'logins_exitosos_pin']) assert.ok(tablas.has(t), `falta la tabla ${t}`);
  });
}

console.log('\n== 0011 (traslados entre promotores) encima de 0010, en ambos proyectos ==');
for (const [nombre, db] of [['nuevo', a], ['con 0003-0008', b]]) {
  await paso(`0011 aplica sin error (proyecto ${nombre})`, async () => { await db.exec(leer('0011_traslados.sql')); });
  await paso(`existen traslados/traslado_lineas (proyecto ${nombre})`, async () => {
    const r = await db.query(`select table_name from information_schema.tables where table_schema='public'`);
    const tablas = new Set(r.rows.map((x) => x.table_name));
    for (const t of ['traslados', 'traslado_lineas']) assert.ok(tablas.has(t), `falta la tabla ${t}`);
  });
  await paso(`Realtime habilitado en traslados (proyecto ${nombre})`, async () => {
    const r = await db.query(`select tablename from pg_publication_tables where pubname='supabase_realtime'`);
    assert.ok(r.rows.some((x) => x.tablename === 'traslados'), 'no está traslados');
  });
}

console.log('\n== 0012 (empresas y puntos) encima de 0011, en ambos proyectos ==');
for (const [nombre, db] of [['nuevo', a], ['con 0003-0008', b]]) {
  await paso(`0012 aplica sin error y es idempotente (proyecto ${nombre})`, async () => {
    await db.exec(leer('0012_empresas_puntos.sql'));
    await db.exec(leer('0012_empresas_puntos.sql'));
  });
  await paso(`como usuario autenticado: crear empresa + punto, reenviarlos (upsert) y desactivar el punto (proyecto ${nombre})`, async () => {
    await db.exec('set role authenticated');
    try {
      const e = crypto.randomUUID(), p = crypto.randomUUID(), d = crypto.randomUUID();
      const ahora = new Date().toISOString();
      const sqlE = `insert into empresas (id, nombre, ts_cliente, dispositivo_id) values ($1, 'Falabella', $2, $3)
                    on conflict (id) do update set nombre = excluded.nombre`;
      await db.query(sqlE, [e, ahora, d]);
      await db.query(sqlE, [e, ahora, d]);
      const sqlP = `insert into puntos (id, empresa_id, nombre, activo, ts_cliente, dispositivo_id) values ($1, $2, 'Norte', $3, $4, $5)
                    on conflict (id) do update set activo = excluded.activo`;
      await db.query(sqlP, [p, e, true, ahora, d]);
      await db.query(sqlP, [p, e, false, ahora, d]);
      const f = await db.query(`select p.activo, e.nombre from puntos p join empresas e on e.id = p.empresa_id where p.id = $1`, [p]);
      assert.deepEqual([f.rows[0].activo, f.rows[0].nombre], [false, 'Falabella']);
    } finally { await db.exec('reset role'); }
  });
  await paso(`sin política de DELETE en empresas/puntos (proyecto ${nombre})`, async () => {
    const r = await db.query(`select tablename, cmd from pg_policies where tablename in ('empresas', 'puntos') and cmd = 'DELETE'`);
    assert.equal(r.rows.length, 0);
  });
}

console.log('\n== 0013 (push enviado desde Supabase) encima de 0012, en ambos proyectos ==');
// PGlite no trae pg_net: se reemplaza por un `net.http_post` falso que anota
// cada llamada, con la misma firma que el real. El esquema `net` no se le
// comparte a `authenticated` (igual que en Supabase): si el trigger no fuera
// SECURITY DEFINER, el insert de la app fallaría.
const sql0013 = leer('0013_push_desde_servidor.sql');
const sql0013SinExtension = sql0013.replace(/create extension if not exists pg_net[^;]*;/i, '');
async function prepararPgNetFalso(db) {
  await db.exec(`
    create schema if not exists extensions;
    create schema if not exists net;
    create table if not exists net._llamadas (n serial primary key, url text, body jsonb, headers jsonb);
    create or replace function net.http_post(
      url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
      headers jsonb default '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds integer default 5000
    ) returns bigint language sql as $$ insert into net._llamadas (url, body, headers) values (url, body, headers) returning n::bigint $$;
    revoke all on schema net from public;
  `);
}
const llamadasPush = async (db) => (await db.query(`select url, body from net._llamadas order by n`)).rows;
await paso('0013 activa pg_net en el proyecto real (la línea que el arnés reemplaza existe)', async () => {
  assert.notEqual(sql0013SinExtension, sql0013, 'falta create extension if not exists pg_net');
});
for (const [nombre, db] of [['nuevo', a], ['con 0003-0008', b]]) {
  const U = () => crypto.randomUUID();
  const ahora = new Date().toISOString();
  await paso(`0013 aplica sin error y es idempotente (proyecto ${nombre})`, async () => {
    await prepararPgNetFalso(db);
    await db.exec(sql0013SinExtension);
    await db.exec(sql0013SinExtension);
  });
  await paso(`un mensaje a varios destinatarios = UNA llamada a Expo con sus tokens activos, sin repetir (proyecto ${nombre})`, async () => {
    await db.exec('truncate net._llamadas');
    const [u1, u2, u3, u4, u5] = [U(), U(), U(), U(), U()];
    const m = U();
    await db.exec('set role authenticated');
    try {
      const token = `insert into push_tokens (usuario_id, dispositivo_id, expo_push_token, rol, activo) values ($1,$2,$3,'PROMOTOR',$4)`;
      await db.query(token, [u1, U(), 'ExponentPushToken[uno]', true]);
      await db.query(token, [u2, U(), 'ExponentPushToken[dos]', true]);
      await db.query(token, [u3, U(), 'ExponentPushToken[inactivo]', false]);
      await db.query(token, [u4, U(), 'ExponentPushToken[uno]', true]); // mismo celular que u1
      await db.query(`insert into mensajes (id, cuerpo, tipo, creado_por, creado_por_nombre, ts_cliente) values ($1,'Hola equipo','MANUAL',$2,'Admin',$3)`, [m, U(), ahora]);
      // Igual que la app: todos los destinatarios en un solo insert (u5 no tiene token).
      await db.query(`insert into mensaje_destinatarios (mensaje_id, destinatario_id) values ($1,$2),($1,$3),($1,$4),($1,$5),($1,$6)`, [m, u1, u2, u3, u4, u5]);
    } finally { await db.exec('reset role'); }
    const llamadas = await llamadasPush(db);
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0].url, 'https://exp.host/--/api/v2/push/send');
    assert.deepEqual([...llamadas[0].body.to].sort(), ['ExponentPushToken[dos]', 'ExponentPushToken[uno]']);
    assert.equal(llamadas[0].body.title, 'Mensaje del administrador');
    assert.equal(llamadas[0].body.body, 'Hola equipo');
  });
  await paso(`progreso de meta usa su propio título; sin tokens no se llama a Expo (proyecto ${nombre})`, async () => {
    await db.exec('truncate net._llamadas');
    const u = U(), m = U(), m2 = U();
    await db.exec('set role authenticated');
    try {
      await db.query(`insert into push_tokens (usuario_id, dispositivo_id, expo_push_token, rol) values ($1,$2,'ExponentPushToken[meta]','PROMOTOR')`, [u, U()]);
      await db.query(`insert into mensajes (id, cuerpo, tipo, creado_por, creado_por_nombre, ts_cliente) values ($1,'Vas en 50%','META_PROGRESO',$2,'Admin',$3)`, [m, U(), ahora]);
      await db.query(`insert into mensaje_destinatarios (mensaje_id, destinatario_id) values ($1,$2)`, [m, u]);
      await db.query(`insert into mensajes (id, cuerpo, tipo, creado_por, creado_por_nombre, ts_cliente) values ($1,'Nadie','MANUAL',$2,'Admin',$3)`, [m2, U(), ahora]);
      await db.query(`insert into mensaje_destinatarios (mensaje_id, destinatario_id) values ($1,$2)`, [m2, U()]);
    } finally { await db.exec('reset role'); }
    const llamadas = await llamadasPush(db);
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0].body.title, 'Progreso de tu meta');
    assert.deepEqual(llamadas[0].body.to, ['ExponentPushToken[meta]']);
  });
  await paso(`150 destinatarios se parten en lotes de 100 tokens (proyecto ${nombre})`, async () => {
    await db.exec('truncate net._llamadas');
    const m = U();
    const ids = Array.from({ length: 150 }, U);
    for (const [i, id] of ids.entries())
      await db.query(`insert into push_tokens (usuario_id, dispositivo_id, expo_push_token, rol) values ($1,$2,$3,'PROMOTOR')`, [id, U(), `ExponentPushToken[t${i}]`]);
    await db.query(`insert into mensajes (id, cuerpo, tipo, creado_por, creado_por_nombre, ts_cliente) values ($1,'Todos','MANUAL',$2,'Admin',$3)`, [m, U(), ahora]);
    await db.query(`insert into mensaje_destinatarios (mensaje_id, destinatario_id) select $1::uuid, unnest($2::uuid[])`, [m, ids]);
    const llamadas = await llamadasPush(db);
    assert.deepEqual(llamadas.map((l) => l.body.to.length), [100, 50]);
  });
}

console.log('\n== 0014 (eventos del calendario) encima de 0013, en ambos proyectos ==');
for (const [nombre, db] of [['nuevo', a], ['con 0003-0008', b]]) {
  const U = () => crypto.randomUUID();
  const ahora = new Date().toISOString();
  await paso(`0014 aplica sin error y es idempotente (proyecto ${nombre})`, async () => {
    await db.exec(leer('0014_eventos.sql'));
    await db.exec(leer('0014_eventos.sql'));
  });
  await paso(`como usuario autenticado: subir un evento con promotores, reasignarlo y cancelarlo (upsert); subido_ts avanza (proyecto ${nombre})`, async () => {
    await db.exec('set role authenticated');
    try {
      const id = U(), p1 = U(), p2 = U(), disp = U();
      const sql = `insert into eventos (id, empresa_id, punto_id, fecha, estado, motivo_cancelacion, creado_por, creado_por_nombre, promotores, ts_cliente, dispositivo_id)
                   values ($1,$2,$3,'2026-09-24',$4,$5,$6,'Admin',$7::jsonb,$8,$6)
                   on conflict (id) do update set estado = excluded.estado, motivo_cancelacion = excluded.motivo_cancelacion, promotores = excluded.promotores`;
      const [e, p] = [U(), U()];
      await db.query(sql, [id, e, p, 'PLANEADO', null, disp, JSON.stringify([{ promotor_id: p1, promotor_nombre: 'Laura', meta_diaria: 1800000 }, { promotor_id: p2, promotor_nombre: 'Pedro', meta_diaria: null }]), ahora]);
      const antes = (await db.query(`select subido_ts from eventos where id=$1`, [id])).rows[0].subido_ts;
      await new Promise((r) => setTimeout(r, 15));
      await db.query(sql, [id, e, p, 'CANCELADO', 'Lluvia', disp, JSON.stringify([{ promotor_id: p1, promotor_nombre: 'Laura', meta_diaria: 1800000 }]), ahora]);
      const f = (await db.query(`select estado, motivo_cancelacion, fecha::text as fecha, promotores, subido_ts from eventos where id=$1`, [id])).rows[0];
      assert.deepEqual([f.estado, f.motivo_cancelacion, f.fecha], ['CANCELADO', 'Lluvia', '2026-09-24']);
      assert.deepEqual(f.promotores, [{ promotor_id: p1, promotor_nombre: 'Laura', meta_diaria: 1800000 }]);
      assert.ok(new Date(f.subido_ts) > new Date(antes), 'subido_ts no cambió al actualizar');
    } finally { await db.exec('reset role'); }
  });
  await paso(`Realtime habilitado en eventos y sin política de DELETE (proyecto ${nombre})`, async () => {
    const r = await db.query(`select tablename from pg_publication_tables where pubname='supabase_realtime'`);
    assert.ok(r.rows.some((x) => x.tablename === 'eventos'), 'no está eventos');
    const d = await db.query(`select 1 from pg_policies where tablename = 'eventos' and cmd = 'DELETE'`);
    assert.equal(d.rows.length, 0);
  });
}

console.log('\n== 0015 (descuentos) encima de 0014, en ambos proyectos ==');
for (const [nombre, db] of [['nuevo', a], ['con 0003-0008', b]]) {
  const U = () => crypto.randomUUID();
  await paso(`0015 aplica sin error y es idempotente (proyecto ${nombre})`, async () => {
    await db.exec(leer('0015_descuentos.sql'));
    await db.exec(leer('0015_descuentos.sql'));
  });
  await paso(`como usuario autenticado: subir un descuento de promotor con horario y desactivarlo (upsert); subido_ts avanza (proyecto ${nombre})`, async () => {
    await db.exec('set role authenticated');
    try {
      const id = U(), admin = U(), cristian = U(), disp = U();
      const sql = `insert into descuentos (id, promotor_id, promotor_nombre, tipo, valor, desde, hasta, activo, creado_por, creado_por_nombre, ts_cliente, dispositivo_id)
                   values ($1,$2,'Cristian','PORCENTAJE',10,'2026-09-24T13:00:00Z','2026-09-24T21:00:00Z',$3,$4,'Admin',now(),$5)
                   on conflict (id) do update set activo = excluded.activo`;
      await db.query(sql, [id, cristian, true, admin, disp]);
      const antes = (await db.query(`select subido_ts from descuentos where id=$1`, [id])).rows[0].subido_ts;
      await new Promise((r) => setTimeout(r, 15));
      await db.query(sql, [id, cristian, false, admin, disp]);
      const f = (await db.query(`select activo, valor, subido_ts from descuentos where id=$1`, [id])).rows[0];
      assert.equal(f.activo, false);
      assert.equal(Number(f.valor), 10);
      assert.ok(new Date(f.subido_ts) > new Date(antes), 'subido_ts no cambió al desactivar');
    } finally { await db.exec('reset role'); }
  });
  await paso(`Realtime habilitado en descuentos y sin política de DELETE (proyecto ${nombre})`, async () => {
    const r = await db.query(`select tablename from pg_publication_tables where pubname='supabase_realtime'`);
    assert.ok(r.rows.some((x) => x.tablename === 'descuentos'), 'no está descuentos');
    const d = await db.query(`select 1 from pg_policies where tablename = 'descuentos' and cmd = 'DELETE'`);
    assert.equal(d.rows.length, 0);
  });
}

for (const [nombre, db] of [['nuevo', a], ['con 0003-0008', b]]) {
  console.log(`\n== Comportamiento (proyecto ${nombre}) ==`);
  const U = () => crypto.randomUUID();
  const ahora = new Date().toISOString();
  await paso('existen las tablas que la app usa (incluida mensajes)', async () => {
    const r = await db.query(`select table_name from information_schema.tables where table_schema='public'`);
    const tablas = new Set(r.rows.map((x) => x.table_name));
    for (const t of ['usuarios','categorias','productos','push_tokens','mensajes','mensaje_destinatarios','ventas','venta_items','movimientos','lotes','cargues','cargue_lineas','conteos','conteo_lineas','arqueos_caja','turnos','comprobantes_venta'])
      assert.ok(tablas.has(t), `falta la tabla ${t}`);
  });
  await paso('Realtime habilitado en ventas, cargues, movimientos y conteos', async () => {
    const r = await db.query(`select tablename from pg_publication_tables where pubname='supabase_realtime'`);
    const t = new Set(r.rows.map((x) => x.tablename));
    for (const n of ['ventas','cargues','movimientos','conteos']) assert.ok(t.has(n), `no está ${n}`);
  });
  const v = U();
  await paso('como usuario autenticado: insertar venta + ítems, y las líneas "tocan" la cabecera (subido_ts sube)', async () => {
    await db.exec('set role authenticated');
    try {
      await db.query(`insert into ventas (id, numero_recibo, promotor_id, promotor_nombre, ts_cliente, metodo_pago, total, dispositivo_id) values ($1,'A-1',$2,'Pedro',$3,'EFECTIVO',6600,$2)`, [v, U(), ahora]);
      const antes = (await db.query(`select subido_ts from ventas where id=$1`, [v])).rows[0].subido_ts;
      await new Promise((r) => setTimeout(r, 15));
      await db.query(`insert into venta_items (venta_id, producto_id, producto_sku, producto_nombre, cantidad, precio_unitario, ts_cliente, dispositivo_id) values ($1,$2,'TL001','X',2,3300,$3,$2)`, [v, U(), ahora]);
      const despues = (await db.query(`select subido_ts from ventas where id=$1`, [v])).rows[0].subido_ts;
      assert.ok(new Date(despues) > new Date(antes), 'subido_ts no cambió al llegar los ítems');
    } finally { await db.exec('reset role'); }
  });
  await paso('anular una venta (upsert) actualiza subido_ts y se permite UPDATE', async () => {
    await db.exec('set role authenticated');
    try {
      const antes = (await db.query(`select subido_ts from ventas where id=$1`, [v])).rows[0].subido_ts;
      await new Promise((r) => setTimeout(r, 15));
      await db.query(`update ventas set anulada = true, motivo_anulacion='x' where id=$1`, [v]);
      const f = (await db.query(`select anulada, subido_ts from ventas where id=$1`, [v])).rows[0];
      assert.equal(f.anulada, true);
      assert.ok(new Date(f.subido_ts) > new Date(antes));
    } finally { await db.exec('reset role'); }
  });
  await paso('movimientos acepta sku y responsables de ubicación', async () => {
    await db.exec('set role authenticated');
    try {
      const r = U();
      await db.query(`insert into movimientos (id, tipo, producto_id, producto_sku, producto_nombre, cantidad, ubicacion_origen_tipo, ubicacion_destino_tipo, ubicacion_destino_responsable_id, usuario_id, usuario_nombre, ts_cliente, dispositivo_id) values ($1,'RECARGA',$2,'TL001','X',10,'BODEGA','PROMOTOR',$3,$2,'Beto',$4,$2)`, [U(), U(), r, ahora]);
      const f = await db.query(`select count(*)::int n from movimientos where ubicacion_destino_responsable_id=$1 or ubicacion_origen_tipo='BODEGA'`, [r]);
      assert.equal(f.rows[0].n, 1);
    } finally { await db.exec('reset role'); }
  });
  await paso('una línea de cargue ENTREGADA no retrocede a PENDIENTE (y el cargue tampoco)', async () => {
    await db.exec('set role authenticated');
    try {
      const c = U(), l = U();
      await db.query(`insert into cargues (id, promotor_id, promotor_nombre, estado, creado_por, ts_cliente, dispositivo_id) values ($1,$2,'Pedro','ENTREGADO',$2,$3,$2)`, [c, U(), ahora]);
      await db.query(`insert into cargue_lineas (id, cargue_id, producto_id, producto_sku, producto_nombre, cantidad_planeada, cantidad_entregada, estado, ts_cliente, dispositivo_id) values ($1,$2,$3,'TL001','X',10,10,'ENTREGADA',$4,$3)`, [l, c, U(), ahora]);
      await db.query(`update cargue_lineas set estado='PENDIENTE', cantidad_entregada=0 where id=$1`, [l]);
      await db.query(`update cargues set estado='PLANEADO' where id=$1`, [c]);
      assert.equal((await db.query(`select estado, cantidad_entregada from cargue_lineas where id=$1`, [l])).rows[0].estado, 'ENTREGADA');
      assert.equal((await db.query(`select estado from cargues where id=$1`, [c])).rows[0].estado, 'ENTREGADO');
    } finally { await db.exec('reset role'); }
  });
  await paso('mensajes: se puede crear un mensaje con destinatarios (el error reportado)', async () => {
    await db.exec('set role authenticated');
    try {
      const m = U();
      await db.query(`insert into mensajes (id, cuerpo, tipo, creado_por, creado_por_nombre, ts_cliente) values ($1,'Ánimo','MANUAL',$2,'Admin',$3)`, [m, U(), ahora]);
      await db.query(`insert into mensaje_destinatarios (mensaje_id, destinatario_id) values ($1,$2)`, [m, U()]);
      await db.query(`update mensaje_destinatarios set leida = true where mensaje_id=$1`, [m]);
    } finally { await db.exec('reset role'); }
  });
  await paso('seguridad de PIN: insertar intento fallido, login exitoso y desbloqueo como authenticated', async () => {
    // Nota: no se prueba aquí que un UPDATE sea rechazado por falta de policy
    // (append-only, mismo criterio que mensajes/turnos) — este arnés con
    // PGlite no aplica RLS de forma estricta contra el owner de la tabla
    // (confirmado con `mensajes`, que tampoco tiene policy de UPDATE y aun
    // así un UPDATE directo pasa aquí); la garantía real la da Supabase real
    // (Postgres con RLS activo de verdad), no probado end-to-end todavía
    // (ver CLAUDE.md sección 11).
    await db.exec('set role authenticated');
    try {
      const id = U();
      await db.query(`insert into intentos_pin_fallidos (id, dispositivo_id, modo, ts_cliente) values ($1,$2,'PROMOTOR',$3)`, [id, U(), ahora]);
      await db.query(`insert into logins_exitosos_pin (id, dispositivo_id, modo, ts_cliente) values ($1,$2,'PROMOTOR',$3)`, [U(), U(), ahora]);
      const admin = U();
      await db.query(`insert into desbloqueos_pin (id, dispositivo_id, modo, admin_id, ts_cliente) values ($1,$2,'PROMOTOR',$3,$4)`, [U(), U(), admin, ahora]);
    } finally { await db.exec('reset role'); }
  });
  await paso('traslados: la línea toca la cabecera (subido_ts sube) y una ENTREGADA no retrocede', async () => {
    await db.exec('set role authenticated');
    try {
      const t = U(), l = U();
      await db.query(`insert into traslados (id, promotor_origen_id, promotor_origen_nombre, promotor_destino_id, promotor_destino_nombre, estado, creado_por, ts_cliente, dispositivo_id) values ($1,$2,'Pedro',$3,'Ana','ENTREGADO',$2,$4,$2)`, [t, U(), U(), ahora]);
      const antes = (await db.query(`select subido_ts from traslados where id=$1`, [t])).rows[0].subido_ts;
      await new Promise((r) => setTimeout(r, 15));
      await db.query(`insert into traslado_lineas (id, traslado_id, producto_id, producto_sku, producto_nombre, cantidad_planeada, cantidad_entregada, estado, ts_cliente, dispositivo_id) values ($1,$2,$3,'TL001','X',10,10,'ENTREGADA',$4,$2)`, [l, t, U(), ahora]);
      const despues = (await db.query(`select subido_ts from traslados where id=$1`, [t])).rows[0].subido_ts;
      assert.ok(new Date(despues) > new Date(antes), 'subido_ts no cambió al llegar la línea');

      await db.query(`update traslado_lineas set estado='PENDIENTE', cantidad_entregada=0 where id=$1`, [l]);
      await db.query(`update traslados set estado='PLANEADO' where id=$1`, [t]);
      assert.equal((await db.query(`select estado, cantidad_entregada from traslado_lineas where id=$1`, [l])).rows[0].estado, 'ENTREGADA');
      assert.equal((await db.query(`select estado from traslados where id=$1`, [t])).rows[0].estado, 'ENTREGADO');
    } finally { await db.exec('reset role'); }
  });
  await paso('reintento tras subida exitosa: upsert sobre comprobantes_venta y arqueos_caja no falla por falta de UPDATE', async () => {
    await db.exec('set role authenticated');
    try {
      const id = U(), turno = U();
      const sql = `insert into arqueos_caja (id, turno_id, promotor_id, promotor_nombre, efectivo_teorico, efectivo_contado, diferencia, total_transferencia, total_libranza, ts_cliente, dispositivo_id) values ($1,$2,$3,'P',1,1,0,0,0,$4,$3) on conflict (id) do update set diferencia = excluded.diferencia`;
      await db.query(sql, [id, turno, U(), ahora]);
      await db.query(sql, [id, turno, U(), ahora]);
      const vid = U();
      const sql2 = `insert into comprobantes_venta (venta_id, promotor_id, promotor_nombre, numero_recibo, total, comprobante_path, ts_cliente, dispositivo_id) values ($1,$2,'P','A-1',1,'x.jpg',$3,$2) on conflict (venta_id) do update set total = excluded.total`;
      await db.query(sql2, [vid, U(), ahora]);
      await db.query(sql2, [vid, U(), ahora]);
    } finally { await db.exec('reset role'); }
  });
}

console.log(fallos === 0 ? '\nSQL OK' : `\n${fallos} FALLA(S) EN EL SQL`);
process.exit(fallos === 0 ? 0 : 1);
