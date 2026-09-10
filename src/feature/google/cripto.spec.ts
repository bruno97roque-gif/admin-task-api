import { cifrar, descifrar } from './cripto';

const SECRETO = 'un-secreto-cualquiera-de-la-variable-de-entorno';
const TOKEN = '1//0abcDEF-ghiJKL_mnoPQR.stuVWX-yz1234567890';

describe('cifrar / descifrar', () => {
  it('devuelve el mismo texto al ir y volver', () => {
    expect(descifrar(cifrar(TOKEN, SECRETO), SECRETO)).toBe(TOKEN);
  });

  it('no deja el token legible en lo guardado', () => {
    expect(cifrar(TOKEN, SECRETO)).not.toContain(TOKEN);
  });

  it('cifra distinto cada vez, aunque el texto sea el mismo', () => {
    // El IV es aleatorio: dos filas con el mismo token no se ven iguales.
    expect(cifrar(TOKEN, SECRETO)).not.toBe(cifrar(TOKEN, SECRETO));
  });

  it('falla si la llave no es la misma', () => {
    const guardado = cifrar(TOKEN, SECRETO);
    expect(() => descifrar(guardado, 'otro-secreto')).toThrow();
  });

  it('falla si alguien manipuló lo guardado', () => {
    const [iv, tag, cifrado] = cifrar(TOKEN, SECRETO).split(':');
    const alterado = Buffer.from(cifrado, 'base64');
    alterado[0] ^= 0xff;

    expect(() =>
      descifrar([iv, tag, alterado.toString('base64')].join(':'), SECRETO),
    ).toThrow();
  });

  it('falla si el formato no es iv:tag:cifrado', () => {
    expect(() => descifrar('cualquier-cosa', SECRETO)).toThrow(
      /formato iv:tag:cifrado/,
    );
  });

  it('aguanta textos con acentos y emojis', () => {
    const raro = 'Reunión de diseño · 🎨 café';
    expect(descifrar(cifrar(raro, SECRETO), SECRETO)).toBe(raro);
  });
});
