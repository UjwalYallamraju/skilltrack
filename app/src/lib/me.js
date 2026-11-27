import { createContext, useContext } from 'react'

// The signed-in user's profile + helpers, provided by App.jsx
export const MeContext = createContext(null)
export const useMe = () => useContext(MeContext)
