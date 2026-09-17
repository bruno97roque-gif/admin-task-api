import { cambioDeEquipo, motivoDeResponsables } from './responsables.reglas';

describe('cambioDeEquipo', () => {
  it('al cambiar el desarrollador, sale el anterior y entra el nuevo', () => {
    expect(
      cambioDeEquipo(
        { disenadorId: 13, desarrolladorId: 11 },
        { disenadorId: 13, desarrolladorId: 12 },
      ),
    ).toEqual({ quedan: [13, 12], salen: [11], cambia: true });
  });

  it('sin cambios no sale nadie', () => {
    expect(
      cambioDeEquipo(
        { disenadorId: 13, desarrolladorId: 11 },
        { disenadorId: 13, desarrolladorId: 11 },
      ),
    ).toEqual({ quedan: [13, 11], salen: [], cambia: false });
  });

  it('quien sigue en el otro puesto no se saca', () => {
    expect(
      cambioDeEquipo(
        { disenadorId: 12, desarrolladorId: 12 },
        { disenadorId: 12, desarrolladorId: 11 },
      ),
    ).toEqual({ quedan: [12, 11], salen: [], cambia: true });
  });

  it('quitar un responsable lo saca sin poner a nadie', () => {
    expect(
      cambioDeEquipo(
        { disenadorId: 13, desarrolladorId: 11 },
        { disenadorId: 13, desarrolladorId: null },
      ),
    ).toEqual({ quedan: [13], salen: [11], cambia: true });
  });
});

describe('motivoDeResponsables', () => {
  it('muestra antes y después, con guion si falta', () => {
    expect(
      motivoDeResponsables(
        { disenadorId: 13, desarrolladorId: 11 },
        { disenadorId: null, desarrolladorId: 12 },
      ),
    ).toBe('Responsables: diseñador 13 → —, desarrollador 11 → 12');
  });
});
