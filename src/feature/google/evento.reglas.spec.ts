import { SCOPES } from './google.cliente';
import {
  cambiaElEvento,
  codigoDeMeet,
  DURACION_MINUTOS,
  estadoDeGrabacion,
  eventoDesdeReunion,
  frontDesde,
  invitadosDe,
  limpiarCorreos,
  permisosFaltantes,
  ZONA_HORARIA,
  type ReunionParaCalendar,
} from './evento.reglas';

const base: ReunionParaCalendar = {
  titulo: 'Tienda Don Pepe — Diseño',
  descripcion: 'Revisar la paleta.',
  fecha: new Date('2026-09-20T15:00:00.000Z'),
  proyecto: { name: 'Tienda Don Pepe' },
  participantes: [
    { email: 'ana@websydev.site' },
    { email: 'dev_bruno@websydev.site' },
  ],
};

describe('invitadosDe', () => {
  it('deja afuera a quien no tiene correo', () => {
    expect(
      invitadosDe([
        { email: 'ana@websydev.site' },
        { email: null },
        { email: '  ' },
      ]),
    ).toEqual([{ email: 'ana@websydev.site' }]);
  });

  it('no repite un correo aunque cambien las mayúsculas', () => {
    expect(
      invitadosDe([
        { email: 'Ana@Websydev.site' },
        { email: 'ana@websydev.site ' },
      ]),
    ).toEqual([{ email: 'Ana@Websydev.site' }]);
  });
});

describe('eventoDesdeReunion', () => {
  it('dura una hora y usa la hora de Lima', () => {
    const e = eventoDesdeReunion(base);
    expect(e.inicio).toEqual(base.fecha);
    expect(e.fin.getTime() - e.inicio.getTime()).toBe(
      DURACION_MINUTOS * 60_000,
    );
    expect(e.zonaHoraria).toBe(ZONA_HORARIA);
  });

  it('arma la descripción con el temario y el proyecto', () => {
    expect(eventoDesdeReunion(base).descripcion).toBe(
      'Revisar la paleta.\n\nProyecto: Tienda Don Pepe\n\nAgendada desde el sistema de Websy.',
    );
  });

  it('sin temario ni proyecto, deja solo la firma', () => {
    const e = eventoDesdeReunion({
      ...base,
      descripcion: '   ',
      proyecto: null,
    });
    expect(e.descripcion).toBe('Agendada desde el sistema de Websy.');
  });
});

describe('invitados externos', () => {
  it('limpia, pasa a minúsculas y no repite', () => {
    expect(
      limpiarCorreos([' Cliente@Empresa.com', 'cliente@empresa.com', '  ']),
    ).toEqual(['cliente@empresa.com']);
  });

  it('se suman a la invitación sin duplicar a alguien del equipo', () => {
    const e = eventoDesdeReunion({
      ...base,
      invitadosExternos: ['cliente@empresa.com', 'ana@websydev.site'],
    });
    expect(e.invitados.map((i) => i.email)).toEqual([
      'ana@websydev.site',
      'dev_bruno@websydev.site',
      'cliente@empresa.com',
    ]);
  });

  it('sumar o quitar un cliente cambia el evento', () => {
    expect(
      cambiaElEvento(base, {
        ...base,
        invitadosExternos: ['cliente@empresa.com'],
      }),
    ).toBe(true);
    expect(
      cambiaElEvento(
        { ...base, invitadosExternos: [] },
        { ...base, invitadosExternos: [] },
      ),
    ).toBe(false);
  });
});

describe('estadoDeGrabacion', () => {
  const todoBien = {
    grabacion: null,
    transcripcion: null,
    notasDeGemini: null,
  };

  it('si Google acepta todo, queda activada', () => {
    expect(estadoDeGrabacion(todoBien, true)).toEqual({
      grabacion: 'activada',
    });
    expect(estadoDeGrabacion(todoBien, false)).toEqual({
      grabacion: 'desactivada',
    });
  });

  it('si solo falla grabar, es parcial y dice por qué', () => {
    expect(
      estadoDeGrabacion({ ...todoBien, grabacion: '403: sin permiso' }, true),
    ).toEqual({
      grabacion: 'parcial',
      detalleGrabacion: 'grabar: 403: sin permiso',
    });
  });

  it('si falla todo, no está disponible', () => {
    expect(
      estadoDeGrabacion(
        { grabacion: 'a', transcripcion: 'b', notasDeGemini: 'c' },
        true,
      ),
    ).toEqual({
      grabacion: 'no_disponible',
      detalleGrabacion: 'grabar: a | transcribir: b | notas de Gemini: c',
    });
  });
});

describe('codigoDeMeet', () => {
  it('saca el código del link', () => {
    expect(codigoDeMeet('https://meet.google.com/abc-defg-hij')).toBe(
      'abc-defg-hij',
    );
  });

  it('acepta barra final y parámetros', () => {
    expect(
      codigoDeMeet('https://meet.google.com/ABC-DEFG-HIJ/?authuser=0'),
    ).toBe('abc-defg-hij');
  });

  it('no inventa un código si el link no es de Meet', () => {
    expect(codigoDeMeet('https://zoom.us/j/123')).toBeNull();
    expect(codigoDeMeet('')).toBeNull();
    expect(codigoDeMeet(null)).toBeNull();
  });
});

describe('cambiaElEvento', () => {
  it('sin cambios visibles, no hay que tocar Google', () => {
    expect(cambiaElEvento(base, { ...base })).toBe(false);
  });

  it('el orden de los convocados no cuenta como cambio', () => {
    expect(
      cambiaElEvento(base, {
        ...base,
        participantes: [...base.participantes].reverse(),
      }),
    ).toBe(false);
  });

  it('detecta cambio de horario, título, temario o invitados', () => {
    expect(
      cambiaElEvento(base, {
        ...base,
        fecha: new Date('2026-09-20T16:00:00.000Z'),
      }),
    ).toBe(true);
    expect(cambiaElEvento(base, { ...base, titulo: 'Otro' })).toBe(true);
    expect(cambiaElEvento(base, { ...base, descripcion: 'Otra cosa' })).toBe(
      true,
    );
    expect(
      cambiaElEvento(base, {
        ...base,
        participantes: [{ email: 'ana@websydev.site' }],
      }),
    ).toBe(true);
  });

  it('sumar a alguien sin correo no cambia la lista de invitados', () => {
    expect(
      cambiaElEvento(base, {
        ...base,
        participantes: [...base.participantes, { email: null }],
      }),
    ).toBe(false);
  });
});

describe('permisosFaltantes', () => {
  it('con todos concedidos no falta nada', () => {
    expect(permisosFaltantes(SCOPES.join(' '))).toEqual([]);
  });

  it('marca los que Google no devolvió', () => {
    expect(permisosFaltantes(SCOPES[0])).toEqual(SCOPES.slice(1));
  });
});

describe('frontDesde', () => {
  it('toma el primer origen', () => {
    expect(
      frontDesde('https://sistema.websy.com.pe, http://localhost:5173'),
    ).toBe('https://sistema.websy.com.pe');
  });

  it('sin CORS_ORIGIN no hay a dónde volver', () => {
    expect(frontDesde(undefined)).toBeNull();
    expect(frontDesde('  ')).toBeNull();
  });

  it('ignora lo que no es una URL web', () => {
    expect(frontDesde('javascript:alert(1)')).toBeNull();
    expect(frontDesde('no-es-url')).toBeNull();
  });
});
