'use client'

import { createContext, useContext } from 'react'

type UserCtxValue = {
  canEditRegion: (regionNombreOrCod: string) => boolean
  canEditAny: boolean  // true for admin/editor; false for viewer/regional
  isAdmin:    boolean  // true only for admin (gates bulk import + proposal review)
}

const UserCtx = createContext<UserCtxValue>({
  canEditRegion: () => true,
  canEditAny: true,
  isAdmin:    true,
})

export function UserProvider({
  canEditRegion,
  canEditAny,
  isAdmin,
  children,
}: {
  canEditRegion: (r: string) => boolean
  canEditAny: boolean
  isAdmin:    boolean
  children: React.ReactNode
}) {
  return <UserCtx.Provider value={{ canEditRegion, canEditAny, isAdmin }}>{children}</UserCtx.Provider>
}

export function useCanEdit() {
  return useContext(UserCtx).canEditRegion
}

export function useCanEditAny() {
  return useContext(UserCtx).canEditAny
}

export function useIsAdmin() {
  return useContext(UserCtx).isAdmin
}
