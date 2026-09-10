import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

/**
 * Cifrado del refresh token de Google.
 *
 * Ese token no expira solo y da acceso continuo al calendario de la cuenta
 * conectada, así que guardarlo en texto plano convierte un volcado de la base
 * en acceso permanente al Google de administración. Se cifra con AES-256-GCM,
 * que además autentica: si alguien edita la fila a mano, el descifrado falla
 * en vez de devolver basura.
 *
 * La llave sale de `GOOGLE_TOKEN_SECRET` pasada por SHA-256, para aceptar un
 * secreto de cualquier largo sin pedirle al equipo que genere 32 bytes exactos.
 */

const ALGORITMO = 'aes-256-gcm';
const LARGO_IV = 12; // El recomendado para GCM.
const SEPARADOR = ':';

function llaveDesde(secreto: string): Buffer {
  return createHash('sha256').update(secreto, 'utf8').digest();
}

/** Devuelve `iv:tag:cifrado`, todo en base64. */
export function cifrar(texto: string, secreto: string): string {
  const iv = randomBytes(LARGO_IV);
  const cipher = createCipheriv(ALGORITMO, llaveDesde(secreto), iv);

  const cifrado = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);

  return [
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    cifrado.toString('base64'),
  ].join(SEPARADOR);
}

/**
 * Revierte `cifrar`. Lanza si el texto fue manipulado, si la llave no es la
 * misma con la que se cifró, o si el formato no es el esperado.
 */
export function descifrar(guardado: string, secreto: string): string {
  const partes = guardado.split(SEPARADOR);
  if (partes.length !== 3) {
    throw new Error('El token guardado no tiene el formato iv:tag:cifrado');
  }

  const [iv, tag, cifrado] = partes;
  const decipher = createDecipheriv(
    ALGORITMO,
    llaveDesde(secreto),
    Buffer.from(iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(cifrado, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
