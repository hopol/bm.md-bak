import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

// 产物统一写到调用方指定的临时目录，复用同一 fixture 验证真实 bundle 与 HTTP。
const [mode, target, outputDir] = process.argv.slice(2)
assert.ok(['cli', 'http'].includes(mode) && target && outputDir, '用法：node scripts/verify-pele/check.mjs cli <bundle> <临时目录> 或 http <baseURL> <临时目录>')
const markdown = await readFile(new URL('./fixture.md', import.meta.url), 'utf8')
await mkdir(outputDir, { recursive: true })

function checkHtml(html, theme) {
  assert.equal(typeof html, 'string')
  assert.equal((html.match(/<svg[\s>]/g) ?? []).length, 3)
  const svgs = html.match(/<svg\b[^>]*>/g) ?? []
  for (const svg of svgs)
    assert.match(svg, new RegExp(`background-color:\\s*${theme === 'dark' ? '#18181b' : '#ffffff'}(?:[;\\s"])`))
  assert.ok(html.includes('中文入口'))
  assert.ok(html.includes('中文用户'))
  assert.ok(html.includes('中文统计'))
  assert.ok(!html.includes('figure-mermaid-error'))
  assert.ok(!/var\(|currentColor|color-mix\(/i.test(html))
}

async function mcp(params) {
  const response = await fetch(new URL('/mcp', target), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
    body: JSON.stringify(params),
  })
  assert.equal(response.status, 200)
  const text = await response.text()
  const json = response.headers.get('Content-Type')?.includes('text/event-stream')
    ? JSON.parse(text.split(/\r?\n/).find(line => line.startsWith('data:'))?.slice(5) ?? '{}')
    : JSON.parse(text)
  assert.ok(!json.error, JSON.stringify(json))
  return json.result
}

const results = []
for (const mermaidTheme of ['', 'dark']) {
  const label = mermaidTheme || 'default'
  if (mode === 'cli') {
    const child = spawnSync(process.execPath, [resolve(target), 'render', '--platform', 'wechat', ...(mermaidTheme ? ['--mermaid-theme', mermaidTheme] : [])], { input: markdown, encoding: 'utf8' })
    assert.equal(child.status, 0, child.stderr)
    checkHtml(child.stdout, mermaidTheme)
    await writeFile(resolve(outputDir, `cli-${label}.html`), child.stdout)
    results.push({ entry: 'cli', theme: label, node: process.version, svgCount: 3 })
  }
  else {
    const response = await fetch(new URL('/api/markdown/render', target), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown, mermaidTheme, platform: 'wechat' }),
    })
    assert.equal(response.status, 200)
    const { result } = await response.json()
    checkHtml(result, mermaidTheme)
    await writeFile(resolve(outputDir, `rest-${label}.html`), result)
    const tool = await mcp({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'render', arguments: { markdown, mermaidTheme, platform: 'wechat' } } })
    assert.ok(!tool.isError)
    const html = tool.structuredContent?.result ?? JSON.parse(tool.content.find(item => item.type === 'text').text).result
    checkHtml(html, mermaidTheme)
    await writeFile(resolve(outputDir, `mcp-${label}.html`), html)
    results.push({ entry: 'rest+mcp', theme: label, svgCount: 3 })
  }
}
if (mode === 'cli') {
  const child = spawnSync(process.execPath, [resolve(target), 'render', '--mermaid-theme', 'github-dark'], { input: markdown, encoding: 'utf8' })
  assert.notEqual(child.status, 0)
  assert.match(child.stderr, /mermaidTheme/)
}
else {
  const response = await fetch(new URL('/api/markdown/render', target), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markdown, mermaidTheme: 'github-dark' }) })
  assert.equal(response.status, 400)
  assert.match(await response.text(), /mermaidTheme/)
}
await writeFile(resolve(outputDir, 'result.json'), JSON.stringify({ script: fileURLToPath(import.meta.url), results, oldThemeRejected: true }, null, 2))
console.info(JSON.stringify({ results, oldThemeRejected: true }))
