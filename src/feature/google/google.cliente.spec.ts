import { configurarGrabacion } from './google.cliente';

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

  it('ubica el espacio por el código y edita por su nombre interno', async () => {
    const llamadas = simularGoogle([
      { status: 200, cuerpo: { name: 'spaces/jQCFfuBOdN5z' } },
      { status: 200, cuerpo: {} },
      { status: 200, cuerpo: {} },
    ]);

    const r = await configurarGrabacion('token', 'dcq-rwbr-giy', true);

    expect(r).toEqual({ notasDeGemini: true });
    expect(llamadas[0]).toMatchObject({
      metodo: 'GET',
      url: 'https://meet.googleapis.com/v2/spaces/dcq-rwbr-giy',
    });
    // El PATCH nunca va con el código: Google lo ignora.
    expect(llamadas[1].url).toContain('/v2/spaces/jQCFfuBOdN5z?');
    expect(llamadas[1].metodo).toBe('PATCH');
    expect(llamadas[1].cuerpo).toEqual({
      config: {
        artifactConfig: {
          recordingConfig: { autoRecordingGeneration: 'ON' },
          transcriptionConfig: { autoTranscriptionGeneration: 'ON' },
        },
      },
    });
    expect(llamadas[2].cuerpo).toEqual({
      config: {
        artifactConfig: {
          smartNotesConfig: { autoSmartNotesGeneration: 'ON' },
        },
      },
    });
  });

  it('si Google rechaza las notas, la grabación queda igual', async () => {
    simularGoogle([
      { status: 200, cuerpo: { name: 'spaces/abc' } },
      { status: 200, cuerpo: {} },
      { status: 400, cuerpo: { error: 'sin Gemini' } },
    ]);

    await expect(
      configurarGrabacion('token', 'dcq-rwbr-giy', true),
    ).resolves.toEqual({ notasDeGemini: false });
  });

  it('si falla la grabación, el error sube', async () => {
    simularGoogle([
      { status: 200, cuerpo: { name: 'spaces/abc' } },
      { status: 403, cuerpo: { error: 'sin permiso' } },
    ]);

    await expect(
      configurarGrabacion('token', 'dcq-rwbr-giy', true),
    ).rejects.toMatchObject({ estado: 403 });
  });
});
