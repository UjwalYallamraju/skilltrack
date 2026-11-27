// The ONLY module that talks to Supabase. Everything the UI reads or writes goes
// through here (the preview build swaps this file for src/demo/data.js).
import { supabase } from './supabase'
import { addDays, todayIST } from './dates'

async function q(promise) {
  const { data, error } = await promise
  if (error) throw new Error(cleanError(error.message))
  return data
}
// Postgres raise messages come through as-is; keep them readable
const cleanError = (m = '') => m.replace(/^.*?ERROR:\s*/, '').replace(/\s*CONTEXT:.*$/s, '')

// ---------- identity ----------
export const ensureProfile = (fullName) => q(supabase.rpc('ensure_profile', { p_full_name: fullName || '' }))

// ---------- people & groups ----------
export const getProfiles = () => q(supabase.from('profiles').select('*').order('full_name'))
export const updateProfile = (id, fields) => q(supabase.from('profiles').update(fields).eq('id', id).select().single())

export const getGroups = () =>
  q(supabase.from('groups').select('*, members:group_members(user_id, is_lead)').order('name'))
export const getMyMemberships = (userId) =>
  q(supabase.from('group_members').select('group_id, is_lead, group:groups(name)').eq('user_id', userId))
export const saveGroup = ({ id, name, description }) =>
  id
    ? q(supabase.from('groups').update({ name, description }).eq('id', id).select().single())
    : q(supabase.from('groups').insert({ name, description }).select().single())
export const deleteGroup = (id) => q(supabase.from('groups').delete().eq('id', id))
export const addGroupMembers = (groupId, userIds) =>
  q(supabase.from('group_members').upsert(userIds.map((user_id) => ({ group_id: groupId, user_id })), { onConflict: 'group_id,user_id', ignoreDuplicates: true }))
export const removeGroupMember = (groupId, userId) =>
  q(supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId))
export const setGroupLead = (groupId, userId, isLead) =>
  q(supabase.from('group_members').update({ is_lead: isLead }).eq('group_id', groupId).eq('user_id', userId))

// ---------- skill areas ----------
export const getSkillAreas = () => q(supabase.from('skill_areas').select('*').order('sort_order').order('name'))
export const addSkillArea = (name, sortOrder) => q(supabase.from('skill_areas').insert({ name, sort_order: sortOrder }))
export const renameSkillArea = (id, name) => q(supabase.from('skill_areas').update({ name }).eq('id', id))
export const deleteSkillArea = (id) => q(supabase.from('skill_areas').delete().eq('id', id))

// ---------- goals ----------
export const getGoals = (userId) => {
  let query = supabase.from('goals_with_status').select('*').order('target_date')
  if (userId) query = query.eq('user_id', userId)
  return q(query)
}
export const saveGoal = (goal) => {
  const { id, ...fields } = goal
  return id
    ? q(supabase.from('goals').update(fields).eq('id', id).select().single())
    : q(supabase.from('goals').insert(fields).select().single())
}
export const deleteGoal = (id) => q(supabase.from('goals').delete().eq('id', id))
export const addGoals = (rows) => q(supabase.from('goals').insert(rows))
export const deleteChallenge = (challengeId) => q(supabase.from('goals').delete().eq('challenge_id', challengeId))
export const submitGoal = (id, evidenceUrl, note) => q(supabase.rpc('submit_goal', { p_goal: id, p_evidence_url: evidenceUrl || '', p_note: note || '' }))
export const reviewGoal = (id, approve, comment) => q(supabase.rpc('review_goal', { p_goal: id, p_approve: approve, p_comment: comment || '' }))
export const reopenGoal = (id) => q(supabase.rpc('reopen_goal', { p_goal: id }))

export const getGoalUpdates = (goalIds) =>
  goalIds.length
    ? q(supabase.from('goal_updates').select('*').in('goal_id', goalIds).order('created_at', { ascending: false }))
    : Promise.resolve([])
export const getRecentGoalUpdates = (days) =>
  q(supabase.from('goal_updates').select('*, goal:goals(title, skill)')
    .gte('created_at', new Date(addDays(todayIST(), -(days - 1)) + 'T00:00:00+05:30').toISOString())
    .order('created_at', { ascending: false }))
export const addGoalUpdate = (row) => q(supabase.from('goal_updates').insert(row))

export const getGoalComments = (goalId) =>
  q(supabase.from('goal_comments').select('*').eq('goal_id', goalId).order('created_at'))
export const addGoalComment = (goalId, authorId, body) =>
  q(supabase.from('goal_comments').insert({ goal_id: goalId, author_id: authorId, body }))

// ---------- 1:1 notes & action items ----------
export const getNotes = (trainerId) =>
  q(supabase.from('notes').select('*').eq('trainer_id', trainerId).order('meeting_date', { ascending: false }).order('created_at', { ascending: false }))
export const addNote = (row) => q(supabase.from('notes').insert(row).select().single())
export const updateNote = (id, fields) => q(supabase.from('notes').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id))
export const deleteNote = (id) => q(supabase.from('notes').delete().eq('id', id))

export const getActionItems = () => q(supabase.from('action_items').select('*').order('done').order('due_date', { nullsFirst: false }))
export const addActionItem = (row) => q(supabase.from('action_items').insert(row))
export const updateActionItem = (id, fields) => q(supabase.from('action_items').update(fields).eq('id', id))
export const deleteActionItem = (id) => q(supabase.from('action_items').delete().eq('id', id))

// ---------- LeetCode ----------
export const getLeetcodeSummary = () => q(supabase.from('leetcode_summary').select('*').order('full_name'))
export const getSolvesSince = (days = 7, userId) => {
  let query = supabase.from('leetcode_solves').select('*')
    .gte('solved_on', addDays(todayIST(), -(days - 1)))
    .order('created_at', { ascending: false })
  if (userId) query = query.eq('user_id', userId)
  return q(query)
}
export const addSolve = (row) => q(supabase.from('leetcode_solves').insert({ ...row, source: 'manual' }))
export const deleteSolve = (id) => q(supabase.from('leetcode_solves').delete().eq('id', id))

// Ask the server to pull fresh numbers from LeetCode (Edge Function "leetcode-sync")
export async function syncLeetcode(userId) {
  const { data, error } = await supabase.functions.invoke('leetcode-sync', { body: userId ? { user_id: userId } : {} })
  if (error) throw new Error('LeetCode sync is unavailable right now. Manual entries still count.')
  return data
}

// ---------- helpers ----------
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
