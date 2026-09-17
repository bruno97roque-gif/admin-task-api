import { LimitadorDeIntentos, mensajeDeEspera } from './limitador-de-intentos';

const MINUTO = 60_000;

function conReloj() {
  let ahora = 1_000_000;
  const reloj = {
    ahora: () => ahora,
    avanzar: (ms: number) => {
      ahora += ms;
    },
  };
  return {
    reloj,
    limitador: new LimitadorDeIntentos(3, 15 * MINUTO, reloj.ahora),
  };
}

describe('LimitadorDeIntentos', () => {
  it('deja intentar hasta el máximo y después bloquea', () => {
    const { limitador } = conReloj();
    limitador.registrarFallo('u:ana');
    limitador.registrarFallo('u:ana');
    expect(limitador.esperaPara('u:ana')).toBe(0);
    limitador.registrarFallo('u:ana');
    expect(limitador.esperaPara('u:ana')).toBe(15 * MINUTO);
  });

  it('se libera cuando vence la ventana del fallo más viejo', () => {
    const { limitador, reloj } = conReloj();
    limitador.registrarFallo('u:ana');
    reloj.avanzar(5 * MINUTO);
    limitador.registrarFallo('u:ana');
    limitador.registrarFallo('u:ana');
    expect(limitador.esperaPara('u:ana')).toBe(10 * MINUTO);
    reloj.avanzar(10 * MINUTO);
    expect(limitador.esperaPara('u:ana')).toBe(0);
  });

  it('cada clave cuenta por separado y un acierto borra los fallos', () => {
    const { limitador } = conReloj();
    for (let i = 0; i < 3; i++) limitador.registrarFallo('u:ana');
    expect(limitador.esperaPara('u:bruno')).toBe(0);
    limitador.olvidar('u:ana');
    expect(limitador.esperaPara('u:ana')).toBe(0);
  });
});

describe('mensajeDeEspera', () => {
  it('redondea hacia arriba y nunca dice cero', () => {
    expect(mensajeDeEspera(1)).toContain('1 minuto.');
    expect(mensajeDeEspera(61_000)).toContain('2 minutos.');
  });
});
