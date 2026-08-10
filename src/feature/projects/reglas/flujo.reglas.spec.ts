import {
  EstadoProyecto,
  Grupo,
  HitoCobro,
  TipoProyecto,
  TipoRecordatorio,
} from '../../../lib/generated/prisma/client';
import {
  aplicaCargaDeProductos,
  compuertasFaltantes,
  conservaLoAbonado,
  debeArchivarse,
  derivarGrupo,
  esEstadoTerminal,
  estadoAlReactivar,
  estaEnFlujoNuevo,
  hitoQueHabilita,
  hostingEsExigible,
  porcentajeDeReactivacion,
  recordatorioQueCorresponde,
  requiereTaxonomia,
  responsableDe,
  siguienteEtapa,
  transicionInvalida,
  validarPlanDeCobros,
} from './flujo.reglas';

const planValido = [
  { hito: HitoCobro.AbonoInicial, porcentaje: 50 },
  { hito: HitoCobro.AprobacionDiseno, porcentaje: 30 },
  { hito: HitoCobro.Entrega, porcentaje: 20 },
];

const cobrosDe = (
  ...pares: [HitoCobro, boolean][]
): { hito: HitoCobro; cobrado: boolean }[] =>
  pares.map(([hito, cobrado]) => ({ hito, cobrado }));

const planCompleto = (cobrado: boolean) =>
  cobrosDe(
    [HitoCobro.AbonoInicial, cobrado],
    [HitoCobro.AprobacionDiseno, cobrado],
    [HitoCobro.Entrega, cobrado],
  );

describe('validarPlanDeCobros', () => {
  it('acepta el plan típico 50 / 30 / 20', () => {
    expect(validarPlanDeCobros(planValido)).toBeNull();
  });

  it('rechaza si los porcentajes no suman 100', () => {
    const plan = [
      ...planValido.slice(0, 2),
      { hito: HitoCobro.Entrega, porcentaje: 25 },
    ];

    expect(validarPlanDeCobros(plan)).toMatch(/suman 105/);
  });

  it('rechaza un abono inicial por debajo del 30%', () => {
    const plan = [
      { hito: HitoCobro.AbonoInicial, porcentaje: 20 },
      { hito: HitoCobro.AprobacionDiseno, porcentaje: 50 },
      { hito: HitoCobro.Entrega, porcentaje: 30 },
    ];

    expect(validarPlanDeCobros(plan)).toMatch(/jefatura/);
  });

  it('deja pasar el abono bajo si lo aprobó jefatura', () => {
    const plan = [
      { hito: HitoCobro.AbonoInicial, porcentaje: 20 },
      { hito: HitoCobro.AprobacionDiseno, porcentaje: 50 },
      { hito: HitoCobro.Entrega, porcentaje: 30 },
    ];

    expect(validarPlanDeCobros(plan, true)).toBeNull();
  });

  it('exige los tres hitos', () => {
    expect(validarPlanDeCobros(planValido.slice(0, 2))).toMatch(
      /Faltan los hitos/,
    );
  });
});

describe('hitoQueHabilita', () => {
  it('cubre las tres compuertas de cobro del diagrama', () => {
    expect(hitoQueHabilita(EstadoProyecto.Brief)).toBe(HitoCobro.AbonoInicial);
    expect(hitoQueHabilita(EstadoProyecto.Desarrollo)).toBe(
      HitoCobro.AprobacionDiseno,
    );
    expect(hitoQueHabilita(EstadoProyecto.ProyectoFinalizado)).toBe(
      HitoCobro.Entrega,
    );
  });

  it('no pide cobro para las etapas que no son compuerta', () => {
    expect(hitoQueHabilita(EstadoProyecto.Taxonomia)).toBeNull();
    expect(hitoQueHabilita(EstadoProyecto.Diseno)).toBeNull();
  });
});

describe('derivarGrupo', () => {
  const base = {
    estadoProyecto: EstadoProyecto.Diseno,
    materialMarcaRecibido: true,
    catalogoRecibido: true,
    cobroPendiente: false,
    hostingPendiente: false,
  };

  it('sin bloqueos queda en A', () => {
    expect(derivarGrupo(base)).toBe(Grupo.A);
  });

  it('el pago manda: va a C aunque además falte información', () => {
    expect(
      derivarGrupo({
        ...base,
        cobroPendiente: true,
        materialMarcaRecibido: false,
      }),
    ).toBe(Grupo.C);
  });

  it('el hosting pendiente también manda a C', () => {
    expect(derivarGrupo({ ...base, hostingPendiente: true })).toBe(Grupo.C);
  });

  it('falta el material de marca → B', () => {
    expect(derivarGrupo({ ...base, materialMarcaRecibido: false })).toBe(
      Grupo.B,
    );
  });

  it('si lo único que falta es el catálogo sigue en A', () => {
    expect(derivarGrupo({ ...base, catalogoRecibido: false })).toBe(Grupo.A);
  });
});

describe('transicionInvalida', () => {
  it('permite avanzar de a una etapa', () => {
    expect(
      transicionInvalida(EstadoProyecto.Registro, EstadoProyecto.Brief, null),
    ).toBeNull();
  });

  it('no deja saltear etapas hacia adelante', () => {
    expect(
      transicionInvalida(
        EstadoProyecto.Registro,
        EstadoProyecto.ProyectoFinalizado,
        null,
      ),
    ).toMatch(/No se puede saltar/);
  });

  it('permite retroceder: el diagrama tiene ciclos de «volver a presentar»', () => {
    expect(
      transicionInvalida(
        EstadoProyecto.Desarrollo,
        EstadoProyecto.Diseno,
        null,
      ),
    ).toBeNull();
  });

  it('una web informativa saltea taxonomía', () => {
    expect(
      transicionInvalida(
        EstadoProyecto.Brief,
        EstadoProyecto.Diseno,
        TipoProyecto.Informativa,
      ),
    ).toBeNull();
  });

  it('una web informativa no puede entrar a taxonomía', () => {
    expect(
      transicionInvalida(
        EstadoProyecto.Brief,
        EstadoProyecto.Taxonomia,
        TipoProyecto.Informativa,
      ),
    ).toMatch(/no pasa por taxonomía/);
  });

  it('un e-commerce no puede saltear la taxonomía', () => {
    expect(
      transicionInvalida(
        EstadoProyecto.Brief,
        EstadoProyecto.Diseno,
        TipoProyecto.Ecommerce,
      ),
    ).toMatch(/taxonomía antes del diseño/);
  });

  it('no se archiva ni se reactiva con un cambio de etapa a mano', () => {
    expect(
      transicionInvalida(EstadoProyecto.Diseno, EstadoProyecto.Archivado, null),
    ).toMatch(/POST \/projects\/:id\/archivar/);

    expect(
      transicionInvalida(EstadoProyecto.Archivado, EstadoProyecto.Brief, null),
    ).toMatch(/reactivar/);
  });

  it('quedarse en la misma etapa siempre vale', () => {
    expect(
      transicionInvalida(EstadoProyecto.Diseno, EstadoProyecto.Diseno, null),
    ).toBeNull();
  });
});

describe('compuertasFaltantes', () => {
  const base = {
    estadoDestino: EstadoProyecto.Diseno,
    tipoProyecto: null,
    materialMarcaRecibido: true,
    hostingContratado: true,
    subidoProduccionAt: new Date(),
    capacitacionAt: new Date(),
    cobros: planCompleto(true),
  };

  it('un proyecto sin plan de cobros no se traba con nada', () => {
    expect(
      compuertasFaltantes({
        ...base,
        cobros: [],
        materialMarcaRecibido: false,
        hostingContratado: false,
      }),
    ).toEqual([]);
  });

  it('frena el paso a diseño si falta el material de marca', () => {
    expect(
      compuertasFaltantes({ ...base, materialMarcaRecibido: false }),
    ).toEqual([
      'falta el material de marca (logo, fotos de banners y secciones)',
    ]);
  });

  it('frena el paso a desarrollo si no se cobró la aprobación de diseño', () => {
    const motivos = compuertasFaltantes({
      ...base,
      estadoDestino: EstadoProyecto.Desarrollo,
      cobros: cobrosDe(
        [HitoCobro.AbonoInicial, true],
        [HitoCobro.AprobacionDiseno, false],
        [HitoCobro.Entrega, false],
      ),
    });

    expect(motivos).toEqual([
      'el hito AprobacionDiseno todavía no está cobrado',
    ]);
  });

  it('para dar por entregado exige cobro, hosting, producción y capacitación', () => {
    const motivos = compuertasFaltantes({
      ...base,
      estadoDestino: EstadoProyecto.ProyectoFinalizado,
      hostingContratado: false,
      subidoProduccionAt: null,
      capacitacionAt: null,
      cobros: planCompleto(false),
    });

    expect(motivos).toHaveLength(4);
    expect(motivos.join(' ')).toMatch(/hosting/);
    expect(motivos.join(' ')).toMatch(/producción/);
    expect(motivos.join(' ')).toMatch(/capacitación/);
  });

  it('no pone trabas cuando está todo cumplido', () => {
    expect(compuertasFaltantes(base)).toEqual([]);
  });
});

describe('estaEnFlujoNuevo', () => {
  it('distingue los proyectos migrados por el plan de cobros', () => {
    expect(estaEnFlujoNuevo([])).toBe(false);
    expect(estaEnFlujoNuevo(planValido)).toBe(true);
  });
});

describe('bifurcación por tipo de proyecto', () => {
  it('la taxonomía y el catálogo son solo de e-commerce', () => {
    expect(requiereTaxonomia(TipoProyecto.Ecommerce)).toBe(true);
    expect(requiereTaxonomia(TipoProyecto.Informativa)).toBe(false);
    expect(aplicaCargaDeProductos(TipoProyecto.Ecommerce)).toBe(true);
    expect(aplicaCargaDeProductos(TipoProyecto.Informativa)).toBe(false);
  });

  it('un proyecto sin tipo cargado no se fuerza a ninguna rama', () => {
    expect(requiereTaxonomia(null)).toBe(false);
    expect(aplicaCargaDeProductos(null)).toBe(false);
  });
});

describe('recordatorioQueCorresponde', () => {
  const base = {
    estadoProyecto: EstadoProyecto.Diseno,
    tipoProyecto: TipoProyecto.Ecommerce,
    materialMarcaRecibido: true,
    catalogoRecibido: true,
    hostingContratado: true,
    cobros: planCompleto(true),
  };

  it('sin bloqueos no abre ninguno', () => {
    expect(recordatorioQueCorresponde(base)).toBeNull();
  });

  it('el cobro tiene prioridad sobre el material', () => {
    expect(
      recordatorioQueCorresponde({
        ...base,
        materialMarcaRecibido: false,
        cobros: cobrosDe(
          [HitoCobro.AbonoInicial, true],
          [HitoCobro.AprobacionDiseno, false],
          [HitoCobro.Entrega, false],
        ),
      }),
    ).toBe(TipoRecordatorio.CobroAprobacionDiseno);
  });

  it('abre el de material de marca cuando falta', () => {
    expect(
      recordatorioQueCorresponde({ ...base, materialMarcaRecibido: false }),
    ).toBe(TipoRecordatorio.MaterialMarca);
  });

  it('abre el de catálogo solo en e-commerce', () => {
    expect(
      recordatorioQueCorresponde({ ...base, catalogoRecibido: false }),
    ).toBe(TipoRecordatorio.Catalogo);

    expect(
      recordatorioQueCorresponde({
        ...base,
        tipoProyecto: TipoProyecto.Informativa,
        catalogoRecibido: false,
      }),
    ).toBeNull();
  });

  it('el hosting recién se persigue en desarrollo', () => {
    expect(
      recordatorioQueCorresponde({ ...base, hostingContratado: false }),
    ).toBeNull();

    expect(
      recordatorioQueCorresponde({
        ...base,
        estadoProyecto: EstadoProyecto.Desarrollo,
        hostingContratado: false,
        cobros: planCompleto(true),
      }),
    ).toBe(TipoRecordatorio.Hosting);
  });
});

describe('archivado y reactivación', () => {
  const haceDias = (dias: number) =>
    new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

  it('archiva a los 3 meses sin cambio de estado', () => {
    expect(debeArchivarse(haceDias(89), EstadoProyecto.Diseno)).toBe(false);
    expect(debeArchivarse(haceDias(90), EstadoProyecto.Diseno)).toBe(true);
  });

  it('no archiva lo que ya está en un estado terminal', () => {
    expect(
      debeArchivarse(haceDias(400), EstadoProyecto.ProyectoFinalizado),
    ).toBe(false);
    expect(debeArchivarse(haceDias(400), EstadoProyecto.Archivado)).toBe(false);
  });

  it('cobra 25% antes del año y 50% desde el año', () => {
    expect(porcentajeDeReactivacion(haceDias(364))).toBe(25);
    expect(porcentajeDeReactivacion(haceDias(365))).toBe(50);
  });

  it('con 50% se rehacen inicio y diseño', () => {
    expect(estadoAlReactivar(EstadoProyecto.Desarrollo, 50)).toBe(
      EstadoProyecto.Brief,
    );
    expect(estadoAlReactivar(EstadoProyecto.Desarrollo, 25)).toBe(
      EstadoProyecto.Desarrollo,
    );
  });

  it('lo abonado se conserva solo desde desarrollo', () => {
    expect(conservaLoAbonado(EstadoProyecto.Diseno)).toBe(false);
    expect(conservaLoAbonado(EstadoProyecto.Desarrollo)).toBe(true);
  });

  it('Archivado y ProyectoFinalizado son ambos terminales', () => {
    expect(esEstadoTerminal(EstadoProyecto.Archivado)).toBe(true);
    expect(esEstadoTerminal(EstadoProyecto.ProyectoFinalizado)).toBe(true);
    expect(esEstadoTerminal(EstadoProyecto.Desarrollo)).toBe(false);
  });
});

describe('responsableDe', () => {
  it('sale de la etapa cuando el proyecto está en A', () => {
    expect(responsableDe(EstadoProyecto.Diseno, Grupo.A)).toBe('disenador');
    expect(responsableDe(EstadoProyecto.Desarrollo, Grupo.A)).toBe(
      'desarrollador',
    );
    expect(responsableDe(EstadoProyecto.Brief, Grupo.A)).toBe('administracion');
  });

  it('en B o C vuelve a administración sin importar la etapa', () => {
    expect(responsableDe(EstadoProyecto.Diseno, Grupo.B)).toBe(
      'administracion',
    );
    expect(responsableDe(EstadoProyecto.Desarrollo, Grupo.C)).toBe(
      'administracion',
    );
  });
});

describe('siguienteEtapa y hostingEsExigible', () => {
  it('sigue el orden del diagrama', () => {
    expect(siguienteEtapa(EstadoProyecto.Registro)).toBe(EstadoProyecto.Brief);
    expect(siguienteEtapa(EstadoProyecto.Desarrollo)).toBe(
      EstadoProyecto.ProyectoFinalizado,
    );
    expect(siguienteEtapa(EstadoProyecto.ProyectoFinalizado)).toBeNull();
  });

  it('el hosting solo se exige en desarrollo', () => {
    expect(hostingEsExigible(EstadoProyecto.Desarrollo)).toBe(true);
    expect(hostingEsExigible(EstadoProyecto.Diseno)).toBe(false);
  });
});
