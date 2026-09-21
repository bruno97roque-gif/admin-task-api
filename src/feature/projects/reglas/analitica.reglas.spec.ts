import { EstadoProyecto, Grupo } from '../../../lib/generated/prisma/client';
import {
  calcularAnaliticaAvanzada,
  cumplimiento,
  diaEnLima,
  esRetroceso,
  promedio,
  rangoDeAntiguedad,
  type FilaHistorial,
  type ProyectoParaAnalitica,
} from './analitica.reglas';

const AHORA = new Date('2026-09-21T15:00:00Z');
const dia = (iso: string) => new Date(`${iso}T15:00:00Z`);

const proyecto = (
  over: Partial<ProyectoParaAnalitica> = {},
): ProyectoParaAnalitica => ({
  id: 1,
  name: 'Uno',
  createdAt: dia('2026-08-01'),
  estadoProyecto: EstadoProyecto.Diseno,
  grupo: Grupo.A,
  fechaUltimoCambioEstado: null,
  fechaEntrega: null,
  fechaEntregaDiseno: null,
  disenadorId: 10,
  disenadorNombre: 'Ana',
  desarrolladorId: 20,
  desarrolladorNombre: 'Bruno',
  ...over,
});

const fila = (
  proyectoId: number,
  estadoAnterior: EstadoProyecto | null,
  estadoNuevo: EstadoProyecto,
  fecha: string,
): FilaHistorial => ({
  proyectoId,
  estadoAnterior,
  estadoNuevo,
  createdAt: dia(fecha),
});

describe('piezas de la analítica', () => {
  it('rangoDeAntiguedad reparte en 0–7, 8–14 y 15+', () => {
    expect(rangoDeAntiguedad(0)).toBe('0–7');
    expect(rangoDeAntiguedad(7)).toBe('0–7');
    expect(rangoDeAntiguedad(8)).toBe('8–14');
    expect(rangoDeAntiguedad(14)).toBe('8–14');
    expect(rangoDeAntiguedad(15)).toBe('15+');
    expect(rangoDeAntiguedad(200)).toBe('15+');
  });

  it('esRetroceso solo cuenta volver a una etapa anterior del recorrido', () => {
    expect(esRetroceso(EstadoProyecto.Desarrollo, EstadoProyecto.Diseno)).toBe(
      true,
    );
    expect(esRetroceso(EstadoProyecto.Diseno, EstadoProyecto.Desarrollo)).toBe(
      false,
    );
    expect(esRetroceso(EstadoProyecto.Diseno, EstadoProyecto.Diseno)).toBe(
      false,
    );
    // Archivar y reactivar no son retrocesos.
    expect(
      esRetroceso(EstadoProyecto.Desarrollo, EstadoProyecto.Archivado),
    ).toBe(false);
    expect(esRetroceso(EstadoProyecto.Archivado, EstadoProyecto.Brief)).toBe(
      false,
    );
    expect(esRetroceso(null, EstadoProyecto.Brief)).toBe(false);
  });

  it('promedio redondea a un decimal y da 0 sin datos', () => {
    expect(promedio([])).toBe(0);
    expect(promedio([10, 11, 11])).toBe(10.7);
  });

  it('diaEnLima corre el instante a UTC−5', () => {
    expect(diaEnLima(new Date('2026-09-21T03:00:00Z'))).toBe('2026-09-20');
    expect(diaEnLima(new Date('2026-09-21T06:00:00Z'))).toBe('2026-09-21');
  });

  it('cumplimiento compara por día calendario', () => {
    const meta = new Date('2026-09-10T00:00:00Z');
    expect(cumplimiento(meta, dia('2026-09-10'), AHORA)).toEqual({
      resultado: 'aTiempo',
      diasDiferencia: 0,
    });
    expect(cumplimiento(meta, dia('2026-09-08'), AHORA)).toEqual({
      resultado: 'aTiempo',
      diasDiferencia: -2,
    });
    expect(cumplimiento(meta, dia('2026-09-13'), AHORA)).toEqual({
      resultado: 'tarde',
      diasDiferencia: 3,
    });
    // Sin cerrar: vencido si la fecha ya pasó; nada si todavía no llega.
    expect(cumplimiento(meta, null, AHORA)).toEqual({
      resultado: 'vencido',
      diasDiferencia: 11,
    });
    expect(
      cumplimiento(new Date('2026-09-30T00:00:00Z'), null, AHORA),
    ).toBeNull();
  });
});

describe('calcularAnaliticaAvanzada', () => {
  it('mide estancados desde el último cambio de etapa y los ordena', () => {
    const r = calcularAnaliticaAvanzada(
      [
        proyecto({ id: 1, fechaUltimoCambioEstado: dia('2026-09-19') }),
        proyecto({
          id: 2,
          estadoProyecto: EstadoProyecto.Desarrollo,
          fechaUltimoCambioEstado: dia('2026-09-01'),
        }),
        proyecto({ id: 3, estadoProyecto: EstadoProyecto.ProyectoFinalizado }),
      ],
      [],
      AHORA,
    );
    expect(r.estancados.proyectos.map((p) => [p.proyectoId, p.dias])).toEqual([
      [2, 20],
      [1, 2],
    ]);
    expect(r.estancados.proyectos[0].responsableNombre).toBe('Bruno');
    expect(r.estancados.rangos.map((x) => x.cantidad)).toEqual([1, 0, 1]);
  });

  it('sin fecha de último cambio usa el historial y, si no, el alta', () => {
    const r = calcularAnaliticaAvanzada(
      [proyecto({ id: 1 }), proyecto({ id: 2, createdAt: dia('2026-09-11') })],
      [fila(1, EstadoProyecto.Brief, EstadoProyecto.Diseno, '2026-09-16')],
      AHORA,
    );
    const dias = Object.fromEntries(
      r.estancados.proyectos.map((p) => [p.proyectoId, p.dias]),
    );
    expect(dias).toEqual({ 1: 5, 2: 10 });
  });

  it('carga por responsable: cerrados, promedio, activos y estancados', () => {
    const r = calcularAnaliticaAvanzada(
      [
        proyecto({
          id: 1,
          estadoProyecto: EstadoProyecto.Desarrollo,
          fechaUltimoCambioEstado: dia('2026-09-20'),
        }),
        proyecto({ id: 2, fechaUltimoCambioEstado: dia('2026-09-01') }),
      ],
      [
        fila(1, EstadoProyecto.Brief, EstadoProyecto.Diseno, '2026-09-01'),
        fila(
          1,
          EstadoProyecto.AvanceDiseno,
          EstadoProyecto.DisenoFinalizado,
          '2026-09-11',
        ),
        fila(
          1,
          EstadoProyecto.DisenoFinalizado,
          EstadoProyecto.Desarrollo,
          '2026-09-20',
        ),
      ],
      AHORA,
    );
    expect(r.porResponsable).toEqual([
      {
        usuarioId: 20,
        nombre: 'Bruno',
        rol: 'desarrollador',
        cerrados: 0,
        promedioDias: null,
        activos: 1,
        estancados: 0,
      },
      {
        usuarioId: 10,
        nombre: 'Ana',
        rol: 'disenador',
        cerrados: 1,
        promedioDias: 10,
        activos: 1,
        estancados: 1,
      },
    ]);
  });

  it('tendencia y tiempo total por mes de cierre', () => {
    const r = calcularAnaliticaAvanzada(
      [
        proyecto({
          id: 1,
          createdAt: dia('2026-08-01'),
          estadoProyecto: EstadoProyecto.ProyectoFinalizado,
        }),
      ],
      [
        fila(1, EstadoProyecto.Brief, EstadoProyecto.Diseno, '2026-08-05'),
        fila(
          1,
          EstadoProyecto.AvanceDiseno,
          EstadoProyecto.DisenoFinalizado,
          '2026-08-15',
        ),
        fila(
          1,
          EstadoProyecto.DisenoFinalizado,
          EstadoProyecto.Desarrollo,
          '2026-08-20',
        ),
        fila(
          1,
          EstadoProyecto.Desarrollo,
          EstadoProyecto.DesarrolloFinalizado,
          '2026-09-05',
        ),
        fila(
          1,
          EstadoProyecto.DesarrolloFinalizado,
          EstadoProyecto.ProyectoFinalizado,
          '2026-09-10',
        ),
      ],
      AHORA,
    );
    expect(r.tendencia).toEqual([
      {
        mes: '2026-08',
        promedioDiseno: 10,
        promedioDesarrollo: null,
        promedioTotal: null,
      },
      {
        mes: '2026-09',
        promedioDiseno: null,
        promedioDesarrollo: 16,
        promedioTotal: 40,
      },
    ]);
    expect(r.tiempoTotal).toEqual({
      promedioDias: 40,
      cantidadProyectos: 1,
      proyectos: [{ proyectoId: 1, nombre: 'Uno', dias: 40 }],
    });
  });

  it('cumplimiento: a tiempo, tarde, vencido y sin fecha', () => {
    const r = calcularAnaliticaAvanzada(
      [
        proyecto({
          id: 1,
          fechaEntregaDiseno: new Date('2026-09-10T00:00:00Z'),
        }),
        proyecto({
          id: 2,
          fechaEntregaDiseno: new Date('2026-09-05T00:00:00Z'),
        }),
        proyecto({
          id: 3,
          fechaEntregaDiseno: new Date('2026-09-15T00:00:00Z'),
        }),
        proyecto({ id: 4 }),
        // Archivado sin cerrar: no se persigue.
        proyecto({
          id: 5,
          estadoProyecto: EstadoProyecto.Archivado,
          fechaEntregaDiseno: new Date('2026-09-01T00:00:00Z'),
        }),
      ],
      [
        fila(
          1,
          EstadoProyecto.AvanceDiseno,
          EstadoProyecto.DisenoFinalizado,
          '2026-09-09',
        ),
        fila(
          2,
          EstadoProyecto.AvanceDiseno,
          EstadoProyecto.DisenoFinalizado,
          '2026-09-08',
        ),
        fila(
          4,
          EstadoProyecto.AvanceDiseno,
          EstadoProyecto.DisenoFinalizado,
          '2026-09-08',
        ),
      ],
      AHORA,
    );
    expect(r.cumplimiento.diseno).toEqual({
      aTiempo: 1,
      tarde: 1,
      vencidos: 1,
      sinFecha: 1,
    });
    expect(
      r.cumplimiento.proyectos.map((p) => [
        p.proyectoId,
        p.resultado,
        p.diasDiferencia,
      ]),
    ).toEqual([
      [3, 'vencido', 6],
      [2, 'tarde', 3],
      [1, 'aTiempo', -1],
    ]);
  });

  it('retrocesos por mes, del más reciente al más viejo', () => {
    const r = calcularAnaliticaAvanzada(
      [proyecto({ id: 1 })],
      [
        fila(1, EstadoProyecto.Brief, EstadoProyecto.Diseno, '2026-08-02'),
        fila(
          1,
          EstadoProyecto.AvanceDiseno,
          EstadoProyecto.Diseno,
          '2026-08-20',
        ),
        fila(
          1,
          EstadoProyecto.Desarrollo,
          EstadoProyecto.DisenoFinalizado,
          '2026-09-03',
        ),
        fila(
          1,
          EstadoProyecto.Desarrollo,
          EstadoProyecto.Archivado,
          '2026-09-04',
        ),
      ],
      AHORA,
    );
    expect(r.retrocesos.porMes).toEqual([
      { mes: '2026-08', cantidad: 1 },
      { mes: '2026-09', cantidad: 1 },
    ]);
    expect(r.retrocesos.proyectos.map((x) => [x.desde, x.hacia])).toEqual([
      [EstadoProyecto.Desarrollo, EstadoProyecto.DisenoFinalizado],
      [EstadoProyecto.AvanceDiseno, EstadoProyecto.Diseno],
    ]);
  });
});
