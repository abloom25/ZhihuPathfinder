// 新版实现的保护机制消融（对应交接包"接新前端后应重做三项消融"）：
// 在一次性副本中每次移除一个保护 → 行为测试必须以断言失败抓住退化；
// 基线必须先全绿；结束后核对源文件哈希未变。不修改源码。
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, cpSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const root = fileURLToPath(new URL('./', import.meta.url))
const out = resolve(process.argv[2] || join(root, 'ablation-results'))
mkdirSync(out, { recursive: true })

const specs = [
  [
    'source-snapshot',
    'src/lib/records.js',
    '...(input.sourceExcerpt?.trim() ? { sourceExcerpt: input.sourceExcerpt.trim() } : {}),',
    '',
  ],
  ['stale-write', 'src/lib/records.js', '\n    match(records, expected)', ''],
  [
    'initial-words',
    'src/lib/flow.js',
    "'看后续前，我倾向：' + frozen.text",
    "'看后续前，我倾向：自动改写'",
  ],
]

const hash = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')
const srcOf = (file) => join(root, file)
const before = Object.fromEntries(specs.map(([, file]) => [file, hash(srcOf(file))]))
const results = []

const dir = mkdtempSync(join(tmpdir(), 'later-new-ablation-'))
try {
  const dest = join(dir, 'proj')
  for (const file of ['src/lib/records.js', 'src/lib/utils.js', 'src/lib/flow.js', 'src/data/cases.js', 'test/helpers.js', 'test/records.test.mjs', 'test/flow.test.mjs']) {
    mkdirSync(resolve(dest, file, '..'), { recursive: true })
    cpSync(srcOf(file), join(dest, file))
  }
  const run = () =>
    spawnSync(process.execPath, ['--test', 'test/records.test.mjs', 'test/flow.test.mjs'], {
      cwd: dest,
      encoding: 'utf8',
      timeout: 60000,
    })

  const baseline = run()
  writeFileSync(join(out, 'baseline.log'), (baseline.stdout || '') + (baseline.stderr || ''))
  if (baseline.status !== 0) throw new Error('基线测试未通过；不允许在红基线上做消融判定')

  for (const [name, file, from, to] of specs) {
    const target = join(dest, file)
    const original = readFileSync(target, 'utf8')
    if (!original.includes(from)) throw new Error(name + ' 变异锚点缺失')
    writeFileSync(target, original.replaceAll(from, to))
    const result = run()
    writeFileSync(target, original)
    const log = (result.stdout || '') + (result.stderr || '')
    writeFileSync(join(out, name + '.log'), log)
    // Node 22 默认 TAP（# fail N）；Node 23+ 默认 spec（ℹ fail N）
    const fails = Number(log.match(/(?:#|ℹ) fail (\d+)/)?.[1] || 0)
    const infrastructureFailure =
      !!result.error || /SyntaxError|ERR_MODULE_NOT_FOUND|Cannot find package|Unknown file extension/.test(log)
    const killed = result.status === 1 && fails > 0 && !infrastructureFailure
    results.push({ name, file, killed, failedTests: fails, infrastructureFailure })
    console.log(name + ': ' + (killed ? 'detected' : 'SURVIVED / INVALID'))
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}

const sourceUnchanged = specs.every(([, file]) => hash(srcOf(file)) === before[file])
const report = {
  at: new Date().toISOString(),
  kind: 'guard-ablation on new frontend implementation; not an AI quality or user-benefit experiment',
  sourceUnchanged,
  total: results.length,
  killed: results.filter((r) => r.killed).length,
  results,
}
writeFileSync(join(out, 'ablation.json'), JSON.stringify(report, null, 2))
if (!sourceUnchanged || results.some((r) => !r.killed)) process.exitCode = 1
