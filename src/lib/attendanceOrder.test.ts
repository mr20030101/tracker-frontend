import { describe, expect, it } from 'vitest'
import { compareAttendanceOrder } from './attendanceOrder'

describe('compareAttendanceOrder', () => {
  it('follows the list, and puts anyone off it last by name', () => {
    const people = [
      { name: 'Zed New', email: 'zed@example.com' },
      { name: 'Lester', email: 'macasaylester@gmail.com' },
      { name: 'Amy New', email: 'amy@example.com' },
      { name: 'Shaa', email: 'SHMargallo.26@gmail.com' },
      { name: 'Zsophia', email: 'gomez.zsophiaarabelle@gmail.com' },
    ]
    expect(people.sort(compareAttendanceOrder).map((p) => p.name)).toEqual(['Shaa', 'Zsophia', 'Lester', 'Amy New', 'Zed New'])
  })
})
