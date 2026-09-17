import { estadoDe, problemaDe, sePuedeCerrar } from './comunicados.reglas';

const AHORA = new Date('2026-09-20T15:00:00.000Z');
const en = (minutos: number) => new Date(AHORA.getTime() + minutos * 60_000);

describe('estadoDe', () => {
  it('vigente si ya empezó y no terminó', () => {
    expect(estadoDe({ desde: en(-10), hasta: null }, AHORA)).toBe('vigente');
    expect(estadoDe({ desde: en(-10), hasta: en(10) }, AHORA)).toBe('vigente');
  });

  it('programado si todavía no empieza', () => {
    expect(estadoDe({ desde: en(5), hasta: null }, AHORA)).toBe('programado');
  });

  it('finalizado desde el instante exacto del fin', () => {
    expect(estadoDe({ desde: en(-10), hasta: AHORA }, AHORA)).toBe(
      'finalizado',
    );
  });
});

describe('problemaDe', () => {
  const base = { enLogin: true, enSistema: false, desde: AHORA, hasta: null };

  it('sin problemas si se muestra en algún lado', () => {
    expect(problemaDe(base)).toBeNull();
  });

  it('exige al menos un lugar donde mostrarse', () => {
    expect(problemaDe({ ...base, enLogin: false })).toMatch(/Elige dónde/);
  });

  it('el fin tiene que ser posterior al inicio', () => {
    expect(problemaDe({ ...base, hasta: AHORA })).toMatch(/posterior/);
    expect(problemaDe({ ...base, hasta: en(1) })).toBeNull();
  });
});

describe('sePuedeCerrar', () => {
  it('solo los urgentes no se cierran', () => {
    expect(sePuedeCerrar('Info')).toBe(true);
    expect(sePuedeCerrar('Importante')).toBe(true);
    expect(sePuedeCerrar('Urgente')).toBe(false);
  });
});
