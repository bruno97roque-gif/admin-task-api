import {
  correspondeAvisar,
  limiteDeAviso,
  MINUTOS_DE_AVISO,
  minutosQueFaltan,
  naceDentroDeLaVentana,
} from './aviso-previo.reglas';

const AHORA = new Date('2026-09-08T15:00:00.000Z');

/** Un instante corrido `minutos` respecto de `AHORA`. */
const en = (minutos: number) => new Date(AHORA.getTime() + minutos * 60_000);

describe('limiteDeAviso', () => {
  it('mira cinco minutos hacia adelante', () => {
    expect(MINUTOS_DE_AVISO).toBe(5);
    expect(limiteDeAviso(AHORA)).toEqual(en(5));
  });
});

describe('correspondeAvisar', () => {
  it('avisa por la reunión que empieza justo en el límite', () => {
    expect(
      correspondeAvisar({ fecha: en(5), avisoPrevioAt: null }, AHORA),
    ).toBe(true);
  });

  it('avisa por la que empieza dentro de la ventana', () => {
    expect(
      correspondeAvisar({ fecha: en(2), avisoPrevioAt: null }, AHORA),
    ).toBe(true);
  });

  it('no avisa por la que todavía está lejos', () => {
    expect(
      correspondeAvisar({ fecha: en(5.5), avisoPrevioAt: null }, AHORA),
    ).toBe(false);
    expect(
      correspondeAvisar({ fecha: en(60), avisoPrevioAt: null }, AHORA),
    ).toBe(false);
  });

  it('no avisa por una reunión que ya empezó', () => {
    expect(
      correspondeAvisar({ fecha: en(-1), avisoPrevioAt: null }, AHORA),
    ).toBe(false);
  });

  it('avisa por la que arranca en este mismo instante', () => {
    expect(
      correspondeAvisar({ fecha: en(0), avisoPrevioAt: null }, AHORA),
    ).toBe(true);
  });

  it('no repite el aviso si ya se mandó', () => {
    expect(
      correspondeAvisar({ fecha: en(3), avisoPrevioAt: en(-1) }, AHORA),
    ).toBe(false);
  });
});

describe('minutosQueFaltan', () => {
  it('redondea hacia arriba', () => {
    expect(minutosQueFaltan(en(4.2), AHORA)).toBe(5);
    expect(minutosQueFaltan(en(2), AHORA)).toBe(2);
  });

  it('nunca dice menos de un minuto', () => {
    expect(minutosQueFaltan(en(0.3), AHORA)).toBe(1);
    expect(minutosQueFaltan(en(0), AHORA)).toBe(1);
  });
});

describe('naceDentroDeLaVentana', () => {
  it('reconoce la reunión agendada para dentro de un rato corto', () => {
    expect(naceDentroDeLaVentana(en(3), AHORA)).toBe(true);
  });

  it('deja pasar la que se agenda con tiempo', () => {
    expect(naceDentroDeLaVentana(en(30), AHORA)).toBe(false);
  });
});
