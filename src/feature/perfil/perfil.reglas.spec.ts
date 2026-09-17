import { leerImagen, MAXIMO_BYTES_FOTO, versionDeFoto } from './perfil.reglas';

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01,
]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from('WEBPVP8 '),
]);

const dataUrl = (tipo: string, datos: Buffer) =>
  `data:${tipo};base64,${datos.toString('base64')}`;

describe('leerImagen', () => {
  it('acepta PNG y WebP con su firma', () => {
    const png = leerImagen(dataUrl('image/png', PNG));
    expect(png).toMatchObject({ ok: true, tipo: 'image/png' });
    expect(leerImagen(dataUrl('image/webp', WEBP))).toMatchObject({
      ok: true,
      tipo: 'image/webp',
    });
  });

  it('rechaza un tipo que no es de foto', () => {
    expect(leerImagen(dataUrl('image/svg', PNG))).toMatchObject({ ok: false });
    expect(leerImagen('data:text/html;base64,PGgxPg==')).toMatchObject({
      ok: false,
    });
  });

  it('rechaza bytes que no coinciden con el tipo declarado', () => {
    expect(leerImagen(dataUrl('image/jpeg', PNG))).toEqual({
      ok: false,
      motivo: 'El archivo no es una imagen válida',
    });
  });

  it('rechaza lo que no es data URL y lo que pesa de más', () => {
    expect(leerImagen('https://ejemplo.com/foto.png')).toMatchObject({
      ok: false,
    });
    const grande = Buffer.concat([PNG, Buffer.alloc(MAXIMO_BYTES_FOTO)]);
    expect(leerImagen(dataUrl('image/png', grande))).toMatchObject({
      ok: false,
    });
  });
});

describe('versionDeFoto', () => {
  it('sale de la fecha de la foto, o null si no hay', () => {
    expect(versionDeFoto({ updatedAt: new Date(1234) })).toBe(1234);
    expect(versionDeFoto(null)).toBeNull();
  });
});
