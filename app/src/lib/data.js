import { supabase } from './supabase'
import { addDays, todayIST } from './dates'

async function q(promise) {
  const { data, error } = await promise
  if (error) throw error
  return data
}

export const getSkillAreas = () =>
  q(supabase.from('skill_areas').select('*').order('sort_order').order('name'))

export const getProfiles = () =>
  q(supabase.from('profiles').select('*').order('full_name'))

export const getGoals = (userId) => {
  let query = supabase.from('goals_with_status').select('*').order('target_date')
  if (userId) query = query.eq('user_id', userId)
  return q(query)
}

export const getGoalUpdates = (goalIds) =>
  goalIds.length
    ? q(supabase.from('goal_updates').select('*').in('goal_id', goalIds).order('created_at', { ascending: false }))
    : Promise.resolve([])

export const saveGoal = (goal) => {
  const { id, ...fields } = goal
  return id
    ? q(supabase.from('goals').update(fields).eq('id', id).select().single())
    : q(supabase.from('goals').insert(fields).select().single())
}

export const deleteGoal = (id) => q(supabase.from('goals').delete().eq('id', id))

export const addGoalUpdate = (row) => q(supabase.from('goal_updates').insert(row))

export const getLeetcodeSummary = () =>
  q(supabase.from('leetcode_summary').select('*').order('full_name'))

export const getSolvesSince = (days = 7, userId) => {
  let query = supabase.from('leetcode_solves').select('*')
    .gte('solved_on', addDays(todayIST(), -(days - 1)))
    .order('created_at', { ascending: false })
  if (userId) query = query.eq('user_id', userId)
  return q(query)
}

export const addSolve = (row) => q(supabase.from('leetcode_solves').insert({ ...row, source: 'manual' }))
export const deleteSolve = (id) => q(supabase.from('leetcode_solves').delete().eq('id', id))

export const updateProfile = (id, fields) =>
  q(supabase.from('profiles').update(fields).eq('id', id).select().single())

// Ask the server to pull fresh numbers from LeetCode (Edge Function "leetcode-sync")
export async function syncLeetcode(userId) {
  const { data, error } = await supabase.functions.invoke('leetcode-sync', { body: userId ? { user_id: userId } : {} })
  if (error) throw new Error('Sync is not available yet. Your manual entries still count.')
  return data
}

export function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function toCsv(rows, columns) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  return [columns.map((c) => esc(c.label)).join(','), ...rows.map((r) => columns.map((c) => esc(c.get(r))).join(','))].join('\r\n')
}

export function download(filename, text) {
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
