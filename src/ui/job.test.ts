import { describe, expect, it } from 'vitest'
import { jobView } from './job'

describe('job phase', () => {
  it('asks for a camera first', () => {
    expect(jobView([], {}).phase).toBe('connect')
  })

  it('stays on the earliest step any camera still needs', () => {
    const v = jobView(['A', 'B', 'C'], { A: 'private', B: 'global' })
    expect(v.phase).toBe('backup')
    expect(v.pending).toEqual(['C'])
    expect(v.counts).toEqual({ backup: 2, push: 1, restore: 0 })
  })

  it('moves on when every camera is through', () => {
    expect(jobView(['A', 'B'], { A: 'private', B: 'private' }).phase).toBe('push')
    expect(jobView(['A', 'B'], { A: 'global', B: 'global' }).phase).toBe('restore')
    const done = jobView(['A', 'B'], { A: 'restored', B: 'restored' })
    expect(done.phase).toBe('done')
    expect(done.pending).toEqual([])
  })

  it('a camera added mid-job pulls the job back to its first step', () => {
    expect(jobView(['A', 'B', 'NEW'], { A: 'global', B: 'global' }).phase).toBe('backup')
  })
})
