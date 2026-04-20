'use client'

import { createContext, useContext } from 'react'

/**
 * Provides a canEditRegion function to the entire component tree.
 * WorkOSApp is the provider; deep components use useCanEdit().
 *
 * canEditRegion(regionNombreOrCod) returns true if the current user
 * may edit initiatives in that region.
 */
const UserCtx = createContext<(regionNombreOrCod: string) => boolean>(() => true)

export function UserProvider({
  canEditRegion,
  children,
}: {
  canEditRegion: (r: string) => boolean
  children: React.ReactNode
}) {
  return <UserCtx.Provider value={canEditRegion}>{children}</UserCtx.Provider>
}

/** Returns a function: canEdit(regionNombreOrCod) → boolean */
export function useCanEdit() {
  return useContext(UserCtx)
}
