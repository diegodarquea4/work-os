'use client'

import { createContext, useContext } from 'react'
import { can, type CapabilityKey, type UserCapability } from '@/lib/permissions'

type UserCtxValue = {
  canEditRegion:      (regionNombreOrCod: string) => boolean
  canEditAny:         boolean  // true for admin/editor; gates "estructural" edits.
  canEditOperational: boolean  // true for any authenticated user; gates día-a-día.
  isAdmin:            boolean  // true only for admin (gates bulk import + proposal review)
  userEmail:          string   // email del usuario actual; auto-fill de autor/subido_por.
  /** Capas de usuarios (Fase 0): capacidades del usuario, base de `useCan`. */
  capabilities:       UserCapability[]
}

const UserCtx = createContext<UserCtxValue>({
  canEditRegion:      () => true,
  canEditAny:         true,
  canEditOperational: true,
  isAdmin:            true,
  userEmail:          '',
  capabilities:       [],
})

export function UserProvider({
  canEditRegion,
  isAdmin,
  userEmail,
  capabilities = [],
  children,
}: {
  canEditRegion:      (r: string) => boolean
  isAdmin:            boolean
  userEmail:          string
  capabilities?:      UserCapability[]
  children:           React.ReactNode
}) {
  // Fase 2: los gates de edición se DERIVAN de las capacidades (no del rol), así
  // el editor de permisos se refleja en la UI — ocultar lo revocado en vez de
  // mostrarlo y errorear en la BD. Neutro hoy (las caps son el espejo del rol) y
  // sin regresión de carga (pre-perfil las caps están vacías → false, igual que
  // antes). Region-agnóstico: true si tiene la cap en ALGUNA región; los controles
  // que necesitan precisión por-región usan useCan(cap, cod) directamente.
  const canEditOperational = can(capabilities, 'iniciativa.editar_operativo')
  const canEditAny         = can(capabilities, 'iniciativa.editar_definicional')
  return (
    <UserCtx.Provider value={{ canEditRegion, canEditAny, canEditOperational, isAdmin, userEmail, capabilities }}>
      {children}
    </UserCtx.Provider>
  )
}

export function useCanEdit() {
  return useContext(UserCtx).canEditRegion
}

export function useCanEditAny() {
  return useContext(UserCtx).canEditAny
}

/** Gate de capacidades "operativas" (día a día): semáforo, %avance, responsable,
 *  seguimientos, documentos. true para cualquier usuario autenticado. */
export function useCanEditOperational() {
  return useContext(UserCtx).canEditOperational
}

export function useIsAdmin() {
  return useContext(UserCtx).isAdmin
}

/** Email del usuario actual — base para auto-fill de autor/subido_por
 *  y para "lo propio vs ajeno" en seguimientos/documentos. */
export function useCurrentUserEmail() {
  return useContext(UserCtx).userEmail
}

/**
 * Capas de usuarios (Fase 0): ¿el usuario tiene la capacidad `key` en `region`
 * (o en '*' = todas)? Sin `region`, true si la tiene en cualquier región.
 *
 * ADITIVO — los 5 hooks legacy de arriba siguen siendo la barrera de UI hoy;
 * `useCan` convivirá con ellos hasta que las Fases 2/3 migren los call-sites.
 */
export function useCan(key: CapabilityKey, region?: string): boolean {
  return can(useContext(UserCtx).capabilities, key, region)
}
