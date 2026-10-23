import { describe, it, expect } from 'vitest'
import { describeLevels, describeRule, levelBreakdown, myStandingLine, scoreText, usesPoints, type Reward, type RewardStanding } from './rewards'

// Each task level (Attempter, L0, L1) is worth a number of points on a reward; 0 leaves it out.

const reward = (overrides: Partial<Reward> = {}): Reward => ({
  id: 1,
  created_by: 'lead',
  team_lead_id: 'lead',
  title: 'Top of the week',
  description: null,
  rule: 'top_submitters',
  threshold: null,
  places: 1,
  project_id: null,
  prize_amounts: [1000],
  currency: 'PHP',
  prize_note: null,
  starts_on: '2026-10-27',
  ends_on: '2026-11-02',
  status: 'active',
  points_attempt: 1,
  points_l0: 1,
  points_l1: 1,
  awarded_at: null,
  created_at: '2026-10-23T00:00:00Z',
  ...overrides,
})

const standing = (overrides: Partial<RewardStanding>): RewardStanding => ({
  user_id: 'me',
  name: 'Me',
  avatar_url: null,
  cb_email: null,
  submitted: 0,
  attempt_tasks: 0,
  l0_tasks: 0,
  l1_tasks: 0,
  points: 0,
  weeks_hit: 0,
  weeks_total: 0,
  reached_at: null,
  place: null,
  qualifies: false,
  ...overrides,
})

const weighted = { points_attempt: 1, points_l0: 2, points_l1: 3 }

describe('levels', () => {
  it('scores in tasks when every counted level is worth 1', () => {
    expect(usesPoints(reward())).toBe(false)
    expect(usesPoints(reward({ points_attempt: 0 }))).toBe(false)
    expect(scoreText(reward(), 12)).toBe('12 tasks')
    expect(scoreText(reward(), 1)).toBe('1 task')
  })

  it('scores in points when the levels are worth different amounts', () => {
    expect(usesPoints(reward(weighted))).toBe(true)
    expect(scoreText(reward(weighted), 42)).toBe('42 points')
  })

  it('says nothing about levels for the default, and names them otherwise', () => {
    expect(describeLevels(reward())).toBeUndefined()
    expect(describeLevels(reward({ points_attempt: 0 }))).toBe('L0 and L1 tasks only')
    expect(describeLevels(reward({ points_attempt: 0, points_l0: 0 }))).toBe('L1 tasks only')
    expect(describeLevels(reward(weighted))).toBe('Attempter 1 pt · L0 2 pts · L1 3 pts')
    expect(describeLevels(reward({ points_attempt: 0, points_l0: 2, points_l1: 5 }))).toBe('L0 2 pts · L1 5 pts')
  })

  it('breaks a standing down by the counted levels only', () => {
    const s = standing({ attempt_tasks: 10, l0_tasks: 7, l1_tasks: 6 })
    expect(levelBreakdown(reward(), s)).toBe('Attempter 10 · L0 7 · L1 6')
    expect(levelBreakdown(reward({ points_attempt: 0 }), s)).toBe('L0 7 · L1 6')
  })

  it('words the rule in points when the reward scores in points', () => {
    expect(describeRule(reward({ threshold: 20 }))).toBe('Whoever submits the most tasks (at least 20 tasks to qualify). A tie goes to whoever got there first.')
    expect(describeRule(reward({ ...weighted, threshold: 20 }))).toBe('Whoever scores the most points (at least 20 points to qualify). A tie goes to whoever got there first.')
    expect(describeRule(reward({ ...weighted, rule: 'min_tasks', threshold: 60 }))).toBe('Everyone who scores at least 60 points.')
  })

  it('tells you how far off you are in points', () => {
    const r = reward({ ...weighted, places: 1 })
    const leader = standing({ user_id: 'them', points: 30, place: 1, qualifies: true })
    const me = standing({ points: 25, place: 2 })
    expect(myStandingLine(r, [leader, me], 'me')).toBe('6 more points to reach 1st place.')
    const minimum = reward({ ...weighted, rule: 'min_tasks', threshold: 60 })
    expect(myStandingLine(minimum, [me], 'me')).toBe('35 more points to go (25 of 60).')
  })

  it('handles fractional points', () => {
    const r = reward({ points_attempt: 1, points_l0: 2, points_l1: 1.5 })
    expect(describeLevels(r)).toBe('Attempter 1 pt · L0 2 pts · L1 1.5 pts')
    expect(scoreText(r, 12.5)).toBe('12.5 points')
    const leader = standing({ user_id: 'them', points: 30, place: 1, qualifies: true })
    const me = standing({ points: 25.5, place: 2 })
    expect(myStandingLine(r, [leader, me], 'me')).toBe('4.5 points behind 1st place.')
  })
})
