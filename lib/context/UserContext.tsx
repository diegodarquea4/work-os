'use client'

import { createContext, useContext } from 'react'

type UserCtxValue = {
  canEditRegion:      (regionNombreOrCod: string) => boolean
  canEditAny:         boolean  // true for admin/editor; gates "estructural" edits.
  canEditOperational: boolean  // true for any authenticated user; gates día-a-día.
  isAdmin:            boolean  // true only for admin (gates bulk import + proposal review)
  userEmail:          string   // email del usuario actual; auto-fill de autor/subido_por.
}

const UserCtx = createContext<UserCtxValue>({
  canEditRegion:      () => true,
  canEditAny:         true,
  canEditOperational: true,
  isAdmin:            true,
  userEmail:          '',
})

export function UserProvider({
  canEditRegion,
  canEditAny,
  canEditOperational,
  isAdmin,
  userEmail,
  children,
}: {
  canEditRegion:      (r: string) => boolean
  canEditAny:         boolean
  canEditOperational: boolean
  isAdmin:            boolean
  userEmail:          string
  children:           React.ReactNode
}) {
  return (
    <UserCtx.Provider value={{ canEditRegion, canEditAny, canEditOperational, isAdmin, userEmail }}>
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
