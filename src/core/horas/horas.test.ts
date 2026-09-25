import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  elegirHorarioVigente,
  formatearHora,
  formatearRangoHoras,
  horaActualBogota,
  horariosSeCruzan,
  parsearHora,
} from './index.ts';

test('parsearHora acepta 8, 8:00, 08:00 y 16:30', () => {
  assert.equal(parsearHora('8'), '08:00');
  assert.equal(parsearHora('8:00'), '08:00');
  assert.equal(parsearHora(' 08:00 '), '08:00');
  assert.equal(parsearHora('16:30'), '16:30');
  assert.equal(parsearHora('0'), '00:00');
});

test('parsearHora rechaza horas imposibles o mal escritas', () => {
  for (const malo of ['', '24', '7:60', '8:5', 'ocho', '8.00', '123']) assert.equal(parsearHora(malo), null, malo);
});

test('formatearHora usa a. m. / p. m. con las 12 como p. m.', () => {
  assert.equal(formatearHora('08:00'), '8:00 a. m.');
  assert.equal(formatearHora('16:30'), '4:30 p. m.');
  assert.equal(formatearHora('12:00'), '12:00 p. m.');
  assert.equal(formatearHora('00:15'), '12:15 a. m.');
});

test('formatearRangoHoras une inicio y fin, o null si falta alguno', () => {
  assert.equal(formatearRangoHoras('08:00', '16:00'), '8:00 a. m. – 4:00 p. m.');
  assert.equal(formatearRangoHoras('08:00', null), null);
  assert.equal(formatearRangoHoras(null, null), null);
});

const h = (horaInicio: string | null, horaFin: string | null) => ({ horaInicio, horaFin });

test('horariosSeCruzan: se cruzan si comparten algún minuto; terminar a la hora en que empieza el otro no cruza', () => {
  assert.equal(horariosSeCruzan(h('08:00', '12:00'), h('11:00', '15:00')), true);
  assert.equal(horariosSeCruzan(h('08:00', '16:00'), h('10:00', '11:00')), true, 'uno dentro del otro');
  assert.equal(horariosSeCruzan(h('08:00', '12:00'), h('12:00', '16:00')), false);
  assert.equal(horariosSeCruzan(h('14:00', '18:00'), h('08:00', '12:00')), false);
});

test('horariosSeCruzan: un evento sin horario ocupa todo el día', () => {
  assert.equal(horariosSeCruzan(h(null, null), h('20:00', '21:00')), true);
  assert.equal(horariosSeCruzan(h('06:00', '07:00'), h(null, null)), true);
});

test('horariosSeCruzan es simétrica', () => {
  const horas = ['06:00', '08:00', '10:00', '12:00', '14:00', '18:00'];
  for (const a of horas) for (const b of horas) for (const c of horas) for (const d of horas) {
    if (a >= b || c >= d) continue;
    assert.equal(horariosSeCruzan(h(a, b), h(c, d)), horariosSeCruzan(h(c, d), h(a, b)));
  }
});

test('horaActualBogota: UTC-5 fijo, también pasada la medianoche UTC', () => {
  assert.equal(horaActualBogota(new Date('2026-09-25T13:05:00Z')), '08:05');
  assert.equal(horaActualBogota(new Date('2026-09-26T02:30:00Z')), '21:30');
});

test('elegirHorarioVigente: Falabella de 8 a 12 y Éxito de 14 a 18', () => {
  const falabella = { nombre: 'Falabella', ...h('08:00', '12:00') };
  const exito = { nombre: 'Éxito', ...h('14:00', '18:00') };
  const elegir = (hora: string) => elegirHorarioVigente([exito, falabella], hora)?.nombre;
  assert.equal(elegir('07:30'), 'Falabella', 'antes de empezar: el primero del día');
  assert.equal(elegir('10:00'), 'Falabella');
  assert.equal(elegir('12:30'), 'Falabella', 'recogiendo: sigue siendo el último que empezó');
  assert.equal(elegir('14:00'), 'Éxito');
  assert.equal(elegir('19:00'), 'Éxito');
  assert.equal(elegirHorarioVigente([], '10:00'), null);
});

test('elegirHorarioVigente: un evento viejo sin horario siempre está en curso', () => {
  assert.equal(elegirHorarioVigente([h(null, null)], '23:00')?.horaInicio, null);
});
