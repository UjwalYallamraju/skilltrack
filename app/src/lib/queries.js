// Cached data hooks (TanStack Query). Pages read through these; mutations call
// useRefresh() afterwards so every screen shows fresh numbers.
import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from './data'

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: true, retry: 1 } },
})

export const HISTORY_DAYS = 190

export const useProfiles = () => useQuery({ queryKey: ['profiles'], queryFn: api.getProfiles })
export const useGroups = () => useQuery({ queryKey: ['groups'], queryFn: api.getGroups })
export const useSkillAreas = () => useQuery({ queryKey: ['skillAreas'], queryFn: api.getSkillAreas, staleTime: 10 * 60_000 })
export const useGoals = () => useQuery({ queryKey: ['goals'], queryFn: () => api.getGoals() })
export const useSolves = () => useQuery({ queryKey: ['solves'], queryFn: () => api.getSolvesSince(HISTORY_DAYS) })
export const useUpdates = () => useQuery({ queryKey: ['updates'], queryFn: () => api.getRecentGoalUpdates(HISTORY_DAYS) })
export const useLcSummary = () => useQuery({ queryKey: ['lcSummary'], queryFn: api.getLeetcodeSummary })
export const useActionItems = () => useQuery({ queryKey: ['actions'], queryFn: api.getActionItems })
export const useNotes = (trainerId) => useQuery({ queryKey: ['notes', trainerId], queryFn: () => api.getNotes(trainerId), enabled: !!trainerId })
export const useGoalComments = (goalId, enabled = true) =>
  useQuery({ queryKey: ['comments', goalId], queryFn: () => api.getGoalComments(goalId), enabled: !!goalId && enabled })
export const useGoalUpdates = (goalIds) =>
  useQuery({ queryKey: ['goalUpdates', goalIds.join(',')], queryFn: () => api.getGoalUpdates(goalIds), enabled: goalIds.length > 0 })

// Everything a lead screen needs, loaded in parallel and cached
export function useTeamData() {
  const r = [useProfiles(), useGroups(), useGoals(), useSolves(), useUpdates(), useLcSummary(), useActionItems()]
  const error = r.find((x) => x.error)?.error
  const loading = r.some((x) => x.isLoading)
  const [people, groups, goals, solves, updates, lc, actions] = r.map((x) => x.data)
  return { loading, error, data: loading || error ? null : { people, groups, goals, solves, updates, lc, actions } }
}

// Invalidate after a change. Pass keys to narrow it, or nothing to refresh all.
export function useRefresh() {
  const qc = useQueryClient()
  return (...keys) => (keys.length ? Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] }))) : qc.invalidateQueries())
}
