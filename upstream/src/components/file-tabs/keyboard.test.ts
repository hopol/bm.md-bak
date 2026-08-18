import { describe, expect, it } from 'vitest'

import { getFileTabKeyboardAction } from './keyboard'

describe('getFileTabKeyboardAction', () => {
  it.each([
    ['ArrowLeft', 0, 3, 2],
    ['ArrowLeft', 2, 3, 1],
    ['ArrowRight', 2, 3, 0],
    ['ArrowRight', 0, 3, 1],
    ['Home', 2, 3, 0],
    ['End', 0, 3, 2],
  ])('%s 将焦点和激活项移动到目标标签', (key, currentIndex, fileCount, index) => {
    expect(getFileTabKeyboardAction(key, currentIndex, fileCount)).toEqual({
      type: 'activate',
      index,
      moveFocus: true,
    })
  })

  it.each(['Enter', ' '])('%s 只激活当前标签', (key) => {
    expect(getFileTabKeyboardAction(key, 1, 3)).toEqual({
      type: 'activate',
      index: 1,
      moveFocus: false,
    })
  })

  it('按 F2 开始重命名', () => {
    expect(getFileTabKeyboardAction('F2', 1, 3)).toEqual({ type: 'rename' })
  })

  it('按 Delete 关闭当前标签', () => {
    expect(getFileTabKeyboardAction('Delete', 1, 3)).toEqual({ type: 'close' })
  })
})
