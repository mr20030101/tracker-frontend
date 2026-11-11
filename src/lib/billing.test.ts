import { describe, expect, it } from 'vitest'
import { billStatus, dueDate, manilaToday, monthOf, parseAmount, paypalLink, paypalMeName, paypalRef, shiftMonth } from './billing'

describe('billing months', () => {
  it('shifts across year boundaries', () => {
    expect(shiftMonth('2026-11-01', 1)).toBe('2026-12-01')
    expect(shiftMonth('2026-12-01', 1)).toBe('2027-01-01')
    expect(shiftMonth('2026-01-01', -1)).toBe('2025-12-01')
    expect(shiftMonth('2026-11-01', -14)).toBe('2025-09-01')
  })

  it('finds the month a date falls in and its due date', () => {
    expect(monthOf('2026-11-23')).toBe('2026-11-01')
    expect(dueDate('2026-11-01')).toBe('2026-11-07')
  })

  it('uses Manila time for today', () => {
    expect(manilaToday(new Date('2026-11-30T17:00:00Z'))).toBe('2026-12-01')
  })
})

describe('billStatus', () => {
  it('is unpaid through the 7th and overdue after', () => {
    expect(billStatus({ month: '2026-12-01', paidAt: null, reportedPaidAt: null }, '2026-12-07')).toBe('unpaid')
    expect(billStatus({ month: '2026-12-01', paidAt: null, reportedPaidAt: null }, '2026-12-08')).toBe('overdue')
    expect(billStatus({ month: '2026-12-01', paidAt: '2026-12-09T01:00:00Z', reportedPaidAt: null }, '2026-12-10')).toBe('paid')
  })

  it('waits for confirmation once the lead reports paying, even past the due date', () => {
    expect(billStatus({ month: '2026-12-01', paidAt: null, reportedPaidAt: '2026-12-09T01:00:00Z' }, '2026-12-20')).toBe('reported')
    expect(billStatus({ month: '2026-12-01', paidAt: '2026-12-10T01:00:00Z', reportedPaidAt: '2026-12-09T01:00:00Z' }, '2026-12-20')).toBe('paid')
  })
})

describe('parseAmount', () => {
  it('reads typed amounts', () => {
    expect(parseAmount('1,250.50')).toBe(1250.5)
    expect(parseAmount(' ₱300 ')).toBe(300)
    expect(parseAmount('0')).toBe(0)
  })

  it('rejects anything else', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('-5')).toBeNull()
    expect(parseAmount('1.234')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('2000000')).toBeNull()
  })
})

describe('PayPal', () => {
  it('reads the PayPal.Me name however it is typed', () => {
    expect(paypalMeName('sheanm')).toBe('sheanm')
    expect(paypalMeName('@sheanm')).toBe('sheanm')
    expect(paypalMeName('https://www.paypal.me/sheanm/5')).toBe('sheanm')
    expect(paypalMeName('paypal.me/sheanm')).toBe('sheanm')
    expect(paypalMeName('not a name')).toBeNull()
    expect(paypalMeName('https://evil.example/x')).toBeNull()
  })

  it('fills in the amount', () => {
    expect(paypalLink('sheanm', 4.67, 'USD')).toBe('https://paypal.me/sheanm/4.67USD')
    expect(paypalLink('sheanm', 250, 'PHP')).toBe('https://paypal.me/sheanm/250.00PHP')
  })
})

describe('paypalRef', () => {
  it('cleans up a pasted transaction ID', () => {
    expect(paypalRef(' 5ty05013rg002845m ')).toBe('5TY05013RG002845M')
    expect(paypalRef('5TY0 5013 RG00 2845M')).toBe('5TY05013RG002845M')
  })

  it('rejects anything that cannot be one', () => {
    expect(paypalRef('')).toBeNull()
    expect(paypalRef('abc')).toBeNull()
    expect(paypalRef('<script>')).toBeNull()
  })
})
