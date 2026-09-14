// 行为测试环境：模拟 localStorage 与 Web Locks（与参考实现测试同一套语义）。
// 真实浏览器的并发由 P0 验收实测，这里验证模块级行为。

let map = new Map()
let failRead = false
let failWrite = false
let queue = Promise.resolve()

export const KEY = 'later.records.v1'

export const locks = {
  request: (_key, _opts, fn) => {
    const result = queue.then(fn)
    queue = result.catch(() => {})
    return result
  },
}

export const storageMock = {
  getItem(k) {
    if (failRead) throw new Error('denied')
    return map.get(k) ?? null
  },
  setItem(k, v) {
    if (failWrite) throw new Error('quota')
    map.set(k, v)
  },
  removeItem(k) {
    map.delete(k)
  },
  clear() {
    map.clear()
  },
}

export function setStorage({ read = false, write = false } = {}) {
  failRead = read
  failWrite = write
}

export function getRaw() {
  return map.get(KEY) ?? null
}

export function setRaw(v) {
  if (v === null) map.delete(KEY)
  else map.set(KEY, v)
}

Object.defineProperty(globalThis, 'navigator', { value: { locks }, configurable: true, writable: true })
Object.defineProperty(globalThis, 'localStorage', { value: storageMock, configurable: true, writable: true })
Object.defineProperty(globalThis, 'sessionStorage', { value: storageMock, configurable: true, writable: true })

export function beforeEachReset() {
  map = new Map()
  failRead = false
  failWrite = false
  queue = Promise.resolve()
  globalThis.navigator.locks = locks
}
