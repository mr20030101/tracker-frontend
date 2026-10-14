import { describe, expect, it } from 'vitest'
import { chunkArray } from './chunkQuery'

describe('chunkArray', () => {
  it('returns empty array for empty input', () => {
    expect(chunkArray([], 200)).toEqual([])
  })

  it('returns a single chunk when items fit within size', () => {
    expect(chunkArray([1, 2, 3], 5)).toEqual([[1, 2, 3]])
  })

  it('splits exactly at the chunk boundary', () => {
    expect(chunkArray([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ])
  })

  it('handles a remainder', () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('returns one chunk per item when size is 1', () => {
    expect(chunkArray(['a', 'b', 'c'], 1)).toEqual([['a'], ['b'], ['c']])
  })

  it('keeps 200 items in one chunk', () => {
    const items = Array.from({ length: 200 }, (_, i) => i)
    expect(chunkArray(items, 200)).toEqual([items])
  })

  it('splits 201 items into two chunks: 200 and 1', () => {
    const items = Array.from({ length: 201 }, (_, i) => i)
    const chunks = chunkArray(items, 200)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toHaveLength(200)
    expect(chunks[1]).toHaveLength(1)
  })

  it('handles 500 items chunked at 200: three chunks (200, 200, 100)', () => {
    const items = Array.from({ length: 500 }, (_, i) => `id-${i}`)
    const chunks = chunkArray(items, 200)
    expect(chunks).toHaveLength(3)
    expect(chunks[0]).toHaveLength(200)
    expect(chunks[1]).toHaveLength(200)
    expect(chunks[2]).toHaveLength(100)
  })
})
