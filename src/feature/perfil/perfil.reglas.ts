/**
 * Reglas del perfil, sin base ni red. Se prueban en `perfil.reglas.spec.ts`.
 */

/**
 * Tope de la foto ya decodificada. El front la recorta a 256 px y la manda en
 * WebP, que pesa unos pocos KB; el margen es para PNG o navegadores sin WebP.
 */
export const MAXIMO_BYTES_FOTO = 300_000;

export const TIPOS_DE_FOTO = ['image/webp', 'image/jpeg', 'image/png'] as const;
export type TipoDeFoto = (typeof TIPOS_DE_FOTO)[number];

/** Los primeros bytes de cada formato: el tipo declarado tiene que coincidir. */
function coincideConLaFirma(tipo: TipoDeFoto, datos: Buffer): boolean {
  switch (tipo) {
    case 'image/png':
      return (
        datos.length > 8 &&
        datos
          .subarray(0, 8)
          .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      );
    case 'image/jpeg':
      return (
        datos.length > 3 &&
        datos[0] === 0xff &&
        datos[1] === 0xd8 &&
        datos[2] === 0xff
      );
    case 'image/webp':
      return (
        datos.length > 12 &&
        datos.subarray(0, 4).toString('ascii') === 'RIFF' &&
        datos.subarray(8, 12).toString('ascii') === 'WEBP'
      );
  }
}

export type ImagenLeida =
  { ok: true; tipo: TipoDeFoto; datos: Buffer } | { ok: false; motivo: string };

/**
 * Lee una imagen que llega como data URL (`data:image/webp;base64,...`).
 * Solo acepta los tres formatos de `TIPOS_DE_FOTO`, hasta
 * `MAXIMO_BYTES_FOTO`, y con los bytes del formato que dice ser: sin eso se
 * podría guardar cualquier cosa y servirla después como imagen.
 */
export function leerImagen(dataUrl: string): ImagenLeida {
  const partes = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
    dataUrl.trim(),
  );
  if (!partes) {
    return { ok: false, motivo: 'La foto no llegó en un formato válido' };
  }

  const tipo = partes[1] as TipoDeFoto;
  if (!TIPOS_DE_FOTO.includes(tipo)) {
    return { ok: false, motivo: 'La foto tiene que ser WebP, JPG o PNG' };
  }

  const datos = Buffer.from(partes[2], 'base64');
  if (datos.length === 0) {
    return { ok: false, motivo: 'La foto está vacía' };
  }
  if (datos.length > MAXIMO_BYTES_FOTO) {
    return {
      ok: false,
      motivo: `La foto pesa demasiado (máximo ${Math.round(MAXIMO_BYTES_FOTO / 1000)} KB)`,
    };
  }
  if (!coincideConLaFirma(tipo, datos)) {
    return { ok: false, motivo: 'El archivo no es una imagen válida' };
  }

  return { ok: true, tipo, datos };
}

/**
 * La versión de la foto para la URL (`?v=`): cambia cada vez que se sube una
 * nueva, así el navegador puede guardarla en caché sin quedarse con la vieja.
 */
export function versionDeFoto(
  foto: { updatedAt: Date } | null | undefined,
): number | null {
  return foto ? foto.updatedAt.getTime() : null;
}
