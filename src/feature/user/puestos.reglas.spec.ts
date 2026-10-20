import { Puesto } from '../../lib/generated/prisma/client';
import { ordenar, puestosDe, puestosDelRol, trabajaEn } from './puestos.reglas';

describe('puestosDelRol', () => {
  it('el diseñador diseña y el programador desarrolla', () => {
    expect(puestosDelRol('Diseñador')).toEqual([Puesto.Diseno]);
    expect(puestosDelRol('Programador')).toEqual([Puesto.Desarrollo]);
  });

  it('el Supervisor sigue desarrollando pese a sus permisos de administración', () => {
    expect(puestosDelRol('Supervisor')).toEqual([Puesto.Desarrollo]);
  });

  it('administración no trabaja en un puesto por el solo hecho de su rol', () => {
    expect(puestosDelRol('Admin')).toEqual([]);
    expect(puestosDelRol('Owner')).toEqual([]);
    expect(puestosDelRol(null)).toEqual([]);
  });
});

describe('puestosDe', () => {
  it('sin puestos cargados, los que implica el rol', () => {
    expect(puestosDe('Diseñador', [])).toEqual([Puesto.Diseno]);
    expect(puestosDe('Programador', null)).toEqual([Puesto.Desarrollo]);
  });

  it('con puestos cargados, mandan esos', () => {
    expect(puestosDe('Programador', [Puesto.Diseno])).toEqual([Puesto.Diseno]);
  });

  it('una persona puede tener los dos, en el orden del recorrido', () => {
    expect(
      puestosDe('Programador', [Puesto.Desarrollo, Puesto.Diseno]),
    ).toEqual([Puesto.Diseno, Puesto.Desarrollo]);
  });

  it('un Admin que además diseña aparece en diseño', () => {
    expect(puestosDe('Admin', [Puesto.Diseno])).toEqual([Puesto.Diseno]);
  });
});

describe('trabajaEn', () => {
  it('reconoce el puesto propio y el agregado', () => {
    expect(trabajaEn(Puesto.Desarrollo, 'Programador', [])).toBe(true);
    expect(trabajaEn(Puesto.Diseno, 'Programador', [])).toBe(false);
    expect(
      trabajaEn(Puesto.Diseno, 'Programador', [
        Puesto.Diseno,
        Puesto.Desarrollo,
      ]),
    ).toBe(true);
  });
});

describe('ordenar', () => {
  it('saca repetidos y deja diseño antes que desarrollo', () => {
    expect(
      ordenar([Puesto.Desarrollo, Puesto.Diseno, Puesto.Desarrollo]),
    ).toEqual([Puesto.Diseno, Puesto.Desarrollo]);
  });
});
