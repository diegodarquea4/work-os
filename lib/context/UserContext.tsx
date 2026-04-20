'use client'

import { createContext, useContext } from 'react'

type UserCtxValue = {
  canEditRegion: (regionNombreOrCod: string) => boolean
  canEditAny: boolean  // true for admin/editor; false for viewer/regional
}

const UserCtx = createContext<UserCtxValue>({
  canEditRegion: () => true,
  canEditAny: true,
})

export function UserProvider({
  canEditRegion,
  canEditAny,
  children,
}: {
  canEditRegion: (r: string) => boolean
  canEditAny: boolean
  children: React.ReactNode
}) {
  return <UserCtx.Provider value={{ canEditRegion, canEditAny }}>{children}</UserCtx.Provider>
}

export function useCanEdit() {
  return useContext(UserCtx).canEditRegion
}

export function useCanEditAny() {
  return useContext(UserCtx).canEditAny
}
