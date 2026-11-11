import { describe, expect, it } from 'vitest'
import { TOP_PLACES, topWithMine } from './topPlaces'

const board = Array.from({ length: 25 }, (_, i) => ({ id: `cb${i + 1}` }))

describe('topWithMine', () => {
  it('shows the top 10 and your place when you are further down', () => {
    const { top, mine } = topWithMine(board, (row) => row.id === 'cb17')
    expect(top.map((row) => row.id)).toEqual(board.slice(0, TOP_PLACES).map((row) => row.id))
    expect(mine).toEqual({ item: { id: 'cb17' }, index: 16 })
  })

  it("doesn't repeat you when you are already in the top 10", () => {
    expect(topWithMine(board, (row) => row.id === 'cb10').mine).toBeNull()
    expect(topWithMine(board, (row) => row.id === 'cb1').mine).toBeNull()
  })

  it('places you 11th right under the top 10', () => {
    expect(topWithMine(board, (row) => row.id === 'cb11').mine?.index).toBe(10)
  })

  it('shows everyone on a team of 10 or fewer, and nothing extra if you are not on the board', () => {
    const small = board.slice(0, 6)
    expect(topWithMine(small, (row) => row.id === 'cb6')).toEqual({ top: small, mine: null })
    expect(topWithMine(board, () => false).mine).toBeNull()
  })
})
