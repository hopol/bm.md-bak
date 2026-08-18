import { describe, expect, it } from 'vitest'
import { createSvgPageSnapshot, findSafePageBreaks } from './export-pdf'

interface MockRect {
  top: number
  bottom: number
  height: number
  width: number
}

interface MockElement {
  rect: MockRect
  selector: 'block' | 'heading'
}

function createContent(rect: MockRect, elements: MockElement[] = []): HTMLElement {
  return {
    getBoundingClientRect: () => rect,
    querySelectorAll: (selectors: string) => elements
      .filter((element) => {
        if (selectors.startsWith('h')) {
          return element.selector === 'heading'
        }
        return element.selector === 'block'
      })
      .map(element => ({
        getBoundingClientRect: () => element.rect,
      })),
  } as unknown as HTMLElement
}

describe('findSafePageBreaks', () => {
  it('单页内容不生成分页断点', () => {
    const content = createContent({ top: 100, bottom: 900, width: 1000, height: 800 })

    expect(findSafePageBreaks(content, 1000)).toEqual([])
  })

  it('多页内容生成严格递增的断点', () => {
    const content = createContent({ top: 100, bottom: 2600, width: 1000, height: 2500 })
    const breaks = findSafePageBreaks(content, 1000)

    expect(breaks).toEqual([1000, 2000])
    expect(breaks[1]).toBeGreaterThan(breaks[0])
  })

  it('跨页块将断点移动到块顶部', () => {
    const content = createContent(
      { top: 100, bottom: 2600, width: 1000, height: 2500 },
      [{ selector: 'block', rect: { top: 1000, bottom: 1300, width: 1000, height: 300 } }],
    )

    expect(findSafePageBreaks(content, 1000)[0]).toBe(900)
  })

  it('嵌套跨页块优先采用较早边界', () => {
    const content = createContent(
      { top: 100, bottom: 2600, width: 1000, height: 2500 },
      [
        { selector: 'block', rect: { top: 900, bottom: 1300, width: 1000, height: 400 } },
        { selector: 'block', rect: { top: 1000, bottom: 1200, width: 1000, height: 200 } },
      ],
    )

    expect(findSafePageBreaks(content, 1000)[0]).toBe(800)
  })

  it('页尾标题移动到下一页', () => {
    const content = createContent(
      { top: 100, bottom: 2600, width: 1000, height: 2500 },
      [{ selector: 'heading', rect: { top: 1060, bottom: 1080, width: 1000, height: 20 } }],
    )

    expect(findSafePageBreaks(content, 1000)[0]).toBe(960)
  })

  it('后续段落跨页时将断点继续移动到标题顶部', () => {
    const content = createContent(
      { top: 100, bottom: 2600, width: 1000, height: 2500 },
      [
        { selector: 'heading', rect: { top: 950, bottom: 980, width: 1000, height: 30 } },
        { selector: 'block', rect: { top: 1000, bottom: 1200, width: 1000, height: 200 } },
      ],
    )

    expect(findSafePageBreaks(content, 1000)[0]).toBe(850)
  })

  it('超长块退化为理想分页位置', () => {
    const content = createContent(
      { top: 100, bottom: 2600, width: 1000, height: 2500 },
      [{ selector: 'block', rect: { top: 300, bottom: 1600, width: 1000, height: 1300 } }],
    )

    expect(findSafePageBreaks(content, 1000)).toEqual([1000, 2000])
  })
})

function createSvgUrl(markup: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
}

function readSnapshotSvg(url: string): string {
  return decodeURIComponent(url.slice(url.indexOf(',') + 1))
}

describe('createSvgPageSnapshot', () => {
  const snapshotUrl = createSvgUrl('<svg width="1000" height="2000" viewBox="0 0 1000 2000"><rect /></svg>')

  it('按页面范围更新尺寸和 viewBox', () => {
    const page = createSvgPageSnapshot(snapshotUrl, 0, 500, 2000)

    expect(page.width).toBe(2000)
    expect(page.height).toBe(1000)
    expect(readSnapshotSvg(page.url)).toContain('<svg width="2000" height="1000" viewBox="0 0 1000 500">')
  })

  it('第二页 viewBox 包含纵向偏移', () => {
    const page = createSvgPageSnapshot(snapshotUrl, 500, 500, 2000)

    expect(readSnapshotSvg(page.url)).toContain('viewBox="0 500 1000 500"')
  })

  it('拒绝非法快照 URL', () => {
    expect(() => createSvgPageSnapshot('https://example.com/a.svg', 0, 500, 2000))
      .toThrow('SnapDOM 未返回有效的 SVG 快照')
  })

  it('拒绝缺失或非法的 viewBox', () => {
    expect(() => createSvgPageSnapshot(createSvgUrl('<svg width="1000" />'), 0, 500, 2000))
      .toThrow('SnapDOM SVG 缺少有效的 viewBox')
    expect(() => createSvgPageSnapshot(createSvgUrl('<svg viewBox="0 0 nope 2000" />'), 0, 500, 2000))
      .toThrow('SnapDOM SVG 缺少有效的 viewBox')
  })

  it('拒绝非正数分页尺寸', () => {
    expect(() => createSvgPageSnapshot(snapshotUrl, 0, 0, 2000)).toThrow('PDF 分页尺寸无效')
    expect(() => createSvgPageSnapshot(snapshotUrl, 0, 500, 0)).toThrow('PDF 分页尺寸无效')
  })
})
