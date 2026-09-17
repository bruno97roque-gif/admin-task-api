import {
  ipDelPedido,
  origenesDelFront,
  secretoDeSesiones,
  urlDelApi,
} from './sesion.reglas';

describe('urlDelApi', () => {
  it('usa BETTER_AUTH_URL si está, sin barra final', () => {
    expect(urlDelApi({ BETTER_AUTH_URL: 'https://api.ejemplo.com/' })).toBe(
      'https://api.ejemplo.com',
    );
  });

  it('si no, toma el host del callback de Google', () => {
    expect(
      urlDelApi({
        GOOGLE_REDIRECT_URI:
          'https://api.sistema.websy.com.pe/integraciones/google/callback',
      }),
    ).toBe('https://api.sistema.websy.com.pe');
  });

  it('en local cae al puerto', () => {
    expect(urlDelApi({ PORT: '3101' })).toBe('http://localhost:3101');
    expect(urlDelApi({ GOOGLE_REDIRECT_URI: 'no es url' })).toBe(
      'http://localhost:3000',
    );
  });
});

describe('secretoDeSesiones', () => {
  it('prefiere el propio', () => {
    expect(
      secretoDeSesiones({ BETTER_AUTH_SECRET: 'propio', JWT_SECRET: 'jwt' }),
    ).toBe('propio');
  });

  it('si no, deriva uno distinto del JWT', () => {
    const derivado = secretoDeSesiones({ JWT_SECRET: 'jwt' });
    expect(derivado).not.toBe('jwt');
    expect(derivado).toHaveLength(64);
    expect(secretoDeSesiones({ JWT_SECRET: 'jwt' })).toBe(derivado);
  });

  it('sin ninguno, no arranca', () => {
    expect(() => secretoDeSesiones({})).toThrow(/BETTER_AUTH_SECRET/);
  });
});

describe('origenesDelFront', () => {
  it('separa por comas y limpia', () => {
    expect(
      origenesDelFront(' https://a.com , http://localhost:5173,, '),
    ).toEqual(['https://a.com', 'http://localhost:5173']);
    expect(origenesDelFront(undefined)).toEqual([]);
  });
});

describe('ipDelPedido', () => {
  it('toma la última IP de x-forwarded-for (la que agrega el proxy)', () => {
    const h = new Headers({ 'x-forwarded-for': '6.6.6.6, 200.1.2.3' });
    expect(ipDelPedido(h)).toBe('200.1.2.3');
  });

  it('sin encabezado, desconocida', () => {
    expect(ipDelPedido(new Headers())).toBe('desconocida');
    expect(ipDelPedido(undefined)).toBe('desconocida');
  });
});
