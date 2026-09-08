/**
 * Cola de escrituras por clave: garantiza que dos guardados de la MISMA fila no
 * viajen en paralelo.
 *
 * Por qué existe (bug 08-sep-2026, acta del Comité Policial): los campos de una
 * fila se guardan al salir de cada uno (`onBlur`). Tabular entre el número, el
 * texto y las observaciones dispara varios guardados de la misma fila con
 * milisegundos de diferencia. Eso rompía de dos maneras:
 *
 *   1. El componente decidía INSERT o UPDATE mirando su estado local, que el
 *      primer guardado todavía no había actualizado → los dos INSERTABAN y el
 *      segundo reventaba con «duplicate key ... sesion_id_metrica_id». Eso se
 *      arregló pasando a UPSERT, que no depende del estado local.
 *   2. Aun con UPSERT, dos escrituras en vuelo pueden llegar DESORDENADAS y
 *      dejar guardado el valor viejo. Para eso es esta cola.
 *
 * Es por clave a propósito: guardar dos métricas distintas en paralelo está
 * bien y es más rápido; lo que no puede pasar es que se pisen dos guardados de
 * la misma.
 */

/**
 * Devuelve una función `encolar(clave, tarea)` que corre las tareas de una
 * misma clave estrictamente en orden. Las de claves distintas corren en
 * paralelo. Una tarea que falla NO frena a las que vienen detrás: la siguiente
 * arranca igual (el guardado siguiente suele ser justamente el reintento).
 */
export function crearColaPorClave<K>() {
  const enCurso = new Map<K, Promise<unknown>>()

  return function encolar<T>(clave: K, tarea: () => Promise<T>): Promise<T> {
    const previa = enCurso.get(clave) ?? Promise.resolve()
    // `then(tarea, tarea)`: la siguiente corre haya salido bien o mal la anterior.
    const siguiente = previa.then(tarea, tarea)
    enCurso.set(clave, siguiente)

    // Se saca la clave cuando esta fue la última: si no, el Map crece por cada
    // métrica tocada y nunca se vacía. El `catch` es solo para no dejar un
    // rechazo sin manejar en ESTA rama — el del llamador sigue intacto.
    siguiente.catch(() => {}).then(() => {
      if (enCurso.get(clave) === siguiente) enCurso.delete(clave)
    })

    return siguiente
  }
}

export type ColaPorClave<K> = ReturnType<typeof crearColaPorClave<K>>
