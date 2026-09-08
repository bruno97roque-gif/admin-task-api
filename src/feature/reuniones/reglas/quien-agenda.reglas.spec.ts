import { EstadoProyecto } from '../../../lib/generated/prisma/client';
import { ROLES_ADMINISTRACION } from '../../auth/decorators/roles.decorator';
import {
  estaAsignado,
  puedeAgendarSobre,
  rolQueAgenda,
  type ProyectoParaAgendar,
} from './quien-agenda.reglas';

const ANA = 4;
const BRUNO = 7;
const AJENO = 99;

const proyecto = (
  parcial: Partial<ProyectoParaAgendar> = {},
): ProyectoParaAgendar => ({
  estadoProyecto: EstadoProyecto.Diseno,
  disenadorId: ANA,
  desarrolladorId: BRUNO,
  equipoIds: [ANA, BRUNO],
  ...parcial,
});

describe('rolQueAgenda', () => {
  it('reconoce a administración por rol, no por persona', () => {
    expect(rolQueAgenda('Admin', ROLES_ADMINISTRACION)).toBe('administracion');
    expect(rolQueAgenda('Owner', ROLES_ADMINISTRACION)).toBe('administracion');
  });

  it('reconoce los dos roles del equipo', () => {
    expect(rolQueAgenda('Diseñador', ROLES_ADMINISTRACION)).toBe('disenador');
    expect(rolQueAgenda('Programador', ROLES_ADMINISTRACION)).toBe(
      'programador',
    );
  });

  it('cae en «otro» con un rol desconocido o sin rol', () => {
    expect(rolQueAgenda('Practicante', ROLES_ADMINISTRACION)).toBe('otro');
    expect(rolQueAgenda(null, ROLES_ADMINISTRACION)).toBe('otro');
  });
});

describe('puedeAgendarSobre · administración', () => {
  it('agenda sobre cualquier proyecto, esté asignada o no', () => {
    expect(
      puedeAgendarSobre(
        'administracion',
        proyecto({ estadoProyecto: EstadoProyecto.Desarrollo }),
        AJENO,
      ),
    ).toBe(true);
  });
});

describe('puedeAgendarSobre · diseñador', () => {
  it('agenda sobre su proyecto mientras esté en diseño', () => {
    for (const etapa of [
      EstadoProyecto.Diseno,
      EstadoProyecto.AvanceDiseno,
      EstadoProyecto.DisenoFinalizado,
    ]) {
      expect(
        puedeAgendarSobre(
          'disenador',
          proyecto({ estadoProyecto: etapa }),
          ANA,
        ),
      ).toBe(true);
    }
  });

  it('no agenda sobre un proyecto que ya pasó a desarrollo', () => {
    expect(
      puedeAgendarSobre(
        'disenador',
        proyecto({ estadoProyecto: EstadoProyecto.Desarrollo }),
        ANA,
      ),
    ).toBe(false);
  });

  it('no agenda antes de que el diseño arranque', () => {
    expect(
      puedeAgendarSobre(
        'disenador',
        proyecto({ estadoProyecto: EstadoProyecto.Brief }),
        ANA,
      ),
    ).toBe(false);
  });

  it('no agenda sobre el diseño de otra persona', () => {
    expect(
      puedeAgendarSobre('disenador', proyecto({ disenadorId: AJENO }), ANA),
    ).toBe(false);
  });

  it('estar en el equipo no alcanza si no es el diseñador del proyecto', () => {
    expect(
      puedeAgendarSobre(
        'disenador',
        proyecto({ disenadorId: AJENO, equipoIds: [ANA] }),
        ANA,
      ),
    ).toBe(false);
  });
});

describe('puedeAgendarSobre · programador', () => {
  it('agenda en cualquier etapa de su pipeline', () => {
    for (const etapa of [
      EstadoProyecto.Brief,
      EstadoProyecto.Taxonomia,
      EstadoProyecto.Diseno,
      EstadoProyecto.Desarrollo,
      EstadoProyecto.ProyectoFinalizado,
    ]) {
      expect(
        puedeAgendarSobre(
          'programador',
          proyecto({ estadoProyecto: etapa }),
          BRUNO,
        ),
      ).toBe(true);
    }
  });

  it('le alcanza con estar en el equipo, sin ser el desarrollador titular', () => {
    expect(
      puedeAgendarSobre(
        'programador',
        proyecto({ desarrolladorId: AJENO, equipoIds: [BRUNO] }),
        BRUNO,
      ),
    ).toBe(true);
  });

  it('no agenda sobre un proyecto ajeno', () => {
    expect(
      puedeAgendarSobre(
        'programador',
        proyecto({ desarrolladorId: AJENO, equipoIds: [AJENO] }),
        BRUNO,
      ),
    ).toBe(false);
  });
});

describe('puedeAgendarSobre · otro rol', () => {
  it('le alcanza con estar asignado de cualquier forma', () => {
    expect(puedeAgendarSobre('otro', proyecto(), ANA)).toBe(true);
    expect(puedeAgendarSobre('otro', proyecto(), AJENO)).toBe(false);
  });
});

describe('estaAsignado', () => {
  it('mira las dos columnas y el join', () => {
    expect(estaAsignado(proyecto({ equipoIds: [] }), ANA)).toBe(true);
    expect(estaAsignado(proyecto({ equipoIds: [] }), BRUNO)).toBe(true);
    expect(
      estaAsignado(
        proyecto({
          disenadorId: null,
          desarrolladorId: null,
          equipoIds: [ANA],
        }),
        ANA,
      ),
    ).toBe(true);
    expect(estaAsignado(proyecto(), AJENO)).toBe(false);
  });
});
