// Client-side mirror of the database rules (the database still enforces them).
export function leadsPerson(me, personId, groups) {
  return groups.some((g) => g.members.some((m) => m.user_id === me.profile.id && m.is_lead) && g.members.some((m) => m.user_id === personId))
}
export function canReview(me, personId, groups) {
  return me.isAdmin || (personId !== me.profile.id && leadsPerson(me, personId, groups))
}
