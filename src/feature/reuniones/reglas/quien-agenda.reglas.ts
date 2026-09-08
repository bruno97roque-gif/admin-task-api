import { EstadoProyecto } from '../../../lib/generated/prisma/client';
import { esEtapaDeDiseno } from '../../projects/reglas/flujo.reglas';

/**
 * Sobre qué proyecto puede agendar cada quien.
 *
 * La idea es que nadie convoque reuniones sobre proyectos ajenos: el
 * diseñador sobre los suyos y mientras sean cosa de diseño, el desarrollador
 * sobre los suyos en cualquier etapa (su pipeline entero), y administración
 * sobre todo, porque es la que coordina.
 */

/** El rol reducido a lo único que importa acá. */
export type RolQueAgenda =
  'administracion' | 'disenador' | 'programador' | 'otro';

/** Lo mínimo del proyecto para decidir. */
export interface ProyectoParaAgendar {
  estadoProyecto: EstadoProyecto;
  disenadorId: number | null;
  desarrolladorId: number | null;
  /** Ids del join `usuarios_proyectos`, que es la otra forma de estar asignado. */
  equipoIds: number[];
}

/** ¿El usuario figura en el proyecto, por columna o por el join? */
export function estaAsignado(
  proyecto: ProyectoParaAgendar,
  usuarioId: number,
): boolean {
  return (
    proyecto.disenadorId === usuarioId ||
    proyecto.desarrolladorId === usuarioId ||
    proyecto.equipoIds.includes(usuarioId)
  );
}

export function puedeAgendarSobre(
  rol: RolQueAgenda,
  proyecto: ProyectoParaAgendar,
  usuarioId: number,
): boolean {
  switch (rol) {
    // Coordina la agenda del equipo: no se le acota nada.
    case 'administracion':
      return true;

    // Solo sobre el diseño que está haciendo. Un proyecto que ya pasó a
    // desarrollo dejó de ser asunto suyo, aunque figure como su diseñador.
    case 'disenador':
      return (
        proyecto.disenadorId === usuarioId &&
        esEtapaDeDiseno(proyecto.estadoProyecto)
      );

    // Su pipeline entero: el desarrollo arranca mucho antes de `Desarrollo`
    // (brief, taxonomía) y sigue después de entregar.
    case 'programador':
      return (
        proyecto.desarrolladorId === usuarioId ||
        proyecto.equipoIds.includes(usuarioId)
      );

    // Cualquier otro rol que se cree más adelante: mientras esté asignado.
    default:
      return estaAsignado(proyecto, usuarioId);
  }
}

/** Traduce el nombre del rol al que usa la regla. */
export function rolQueAgenda(
  nombreDelRol: string | null | undefined,
  rolesDeAdministracion: readonly string[],
): RolQueAgenda {
  const nombre = nombreDelRol ?? '';
  if (rolesDeAdministracion.includes(nombre)) return 'administracion';
  if (nombre === 'Diseñador') return 'disenador';
  if (nombre === 'Programador') return 'programador';
  return 'otro';
}
