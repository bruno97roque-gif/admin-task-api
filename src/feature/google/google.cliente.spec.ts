import { configurarGrabacion, leerArtefactos } from './google.cliente';

interface Llamada {
  url: string;
  metodo: string;
  cuerpo: unknown;
}

/** Simula a Google: responde en orden y deja registradas las llamadas. */
function simularGoogle(respuestas: { status: number; cuerpo?: unknown }[]) {
  const llamadas: Llamada[] = [];
  const fetchFalso = jest.fn((url: string, init: RequestInit = {}) => {
    llamadas.push({
      url,
      metodo: init.method ?? 'GET',
      cuerpo: init.body ? JSON.parse(init.body as string) : undefined,
    });
    const r = respuestas.shift() ?? { status: 500 };
    return Promise.resolve(
      new Response(r.cuerpo === undefined ? null : JSON.stringify(r.cuerpo), {
        status: r.status,
      }),
    );
  });
  global.fetch = fetchFalso;
  return llamadas;
}

describe('configurarGrabacion', () => {
  const fetchOriginal = global.fetch;
  afterEach(() => {
    global.fetch = fetchOriginal;
  });

  it('ubica el espacio por el código y edita por su nombre, sin máscara', async () => {
    const llamadas = simularGoogle([
      { status: 200, cuerpo: { name: 'spaces/jQCFfuBOdN5z' } },
      { status: 200, cuerpo: {} },
      { status: 200, cuerpo: {} },
      { status: 200, cuerpo: {} },
    ]);

    const r = await configurarGrabacion('token', 'dcq-rwbr-giy', true);

    expect(r).toEqual({
      grabacion: null,
      transcripcion: null,
      notasDeGemini: null,
    });
    expect(llamadas[0]).toMatchObject({
      metodo: 'GET',
      url: 'https://meet.googleapis.com/v2/spaces/dcq-rwbr-giy',
    });
    // Google rechaza las máscaras con rutas internas: no se manda ninguna.
    for (const patch of llamadas.slice(1)) {
      expect(patch.metodo).toBe('PATCH');
      expect(patch.url).toBe(
        'https://meet.googleapis.com/v2/spaces/jQCFfuBOdN5z',
      );
    }
    expect(llamadas.slice(1).map((l) => l.cuerpo)).toEqual([
      {
        config: {
          artifactConfig: {
            recordingConfig: { autoRecordingGeneration: 'ON' },
          },
        },
      },
      {
        config: {
          artifactConfig: {
            transcriptionConfig: { autoTranscriptionGeneration: 'ON' },
          },
        },
      },
      {
        config: {
          artifactConfig: {
            smartNotesConfig: { autoSmartNotesGeneration: 'ON' },
          },
        },
      },
    ]);
  });

  it('si Google no deja grabar, igual pide transcripción y notas', async () => {
    simularGoogle([
      { status: 200, cuerpo: { name: 'spaces/abc' } },
      {
        status: 403,
        cuerpo: { error: { code: 403, message: 'Recording not allowed' } },
      },
      { status: 200, cuerpo: {} },
      { status: 200, cuerpo: {} },
    ]);

    await expect(
      configurarGrabacion('token', 'dcq-rwbr-giy', true),
    ).resolves.toEqual({
      grabacion: '403: Recording not allowed',
      transcripcion: null,
      notasDeGemini: null,
    });
  });

  it('si no se puede ubicar el espacio, el error sube', async () => {
    simularGoogle([{ status: 404, cuerpo: { error: 'no existe' } }]);

    await expect(
      configurarGrabacion('token', 'dcq-rwbr-giy', true),
    ).rejects.toMatchObject({ estado: 404 });
  });
});

describe('leerArtefactos', () => {
  const fetchOriginal = global.fetch;
  afterEach(() => {
    global.fetch = fetchOriginal;
  });

  it('traduce lo que guarda Google, y lo que falta queda sin definir', async () => {
    simularGoogle([
      {
        status: 200,
        cuerpo: {
          name: 'spaces/abc',
          config: {
            artifactConfig: {
              recordingConfig: { autoRecordingGeneration: 'ON' },
              transcriptionConfig: { autoTranscriptionGeneration: 'OFF' },
            },
          },
        },
      },
    ]);

    await expect(leerArtefactos('token', 'dcq-rwbr-giy')).resolves.toEqual({
      grabacion: 'ON',
      transcripcion: 'OFF',
      notasDeGemini: 'SIN_DEFINIR',
    });
  });
});
