import { estaAsignado, ordenSiguiente, puedeLeer } from './pendientes.reglas';

describe('estaAsignado', () => {
  const proyecto = { disenadorId: 13, desarrolladorId: 12, equipoIds: [11] };

  it('diseñador, desarrollador o del equipo', () => {
    expect(estaAsignado(proyecto, 13)).toBe(true);
    expect(estaAsignado(proyecto, 12)).toBe(true);
    expect(estaAsignado(proyecto, 11)).toBe(true);
  });

  it('nadie más', () => {
    expect(estaAsignado(proyecto, 99)).toBe(false);
  });
});

describe('puedeLeer', () => {
  it('el dueño y administración', () => {
    expect(puedeLeer(12, 12, false)).toBe(true);
    expect(puedeLeer(12, 3, true)).toBe(true);
  });

  it('otro del equipo, no', () => {
    expect(puedeLeer(12, 13, false)).toBe(false);
  });
});

describe('ordenSiguiente', () => {
  it('al final, o 0 si la lista está vacía', () => {
    expect(ordenSiguiente([])).toBe(0);
    expect(ordenSiguiente([0, 4, 2])).toBe(5);
  });
});
