import type { ContextRule } from '../types/context'
import { STRICT_RULE_DELETE_LOCK_MS } from '../constants/thresholds'

export function isStrictRuleDeleteLocked(rule: ContextRule, now = Date.now()): boolean {
  if (rule.mode !== 'strict' || rule.createdAt == null) return false
  return now - rule.createdAt < STRICT_RULE_DELETE_LOCK_MS
}
