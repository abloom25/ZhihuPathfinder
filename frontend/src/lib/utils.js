// 通用工具（自参考实现 src/utils.ts 移植）：Unicode 码点计数、知乎 URL 校验。

/** 按 Unicode 码点计数（契约要求，避免中文/emoji 计数不一致） */
export function codePointLength(s) {
  return Array.from(s).length
}

/** 只接收 https 的 zhihu.com 或其子域，精确检查 hostname，拒绝用户名/密码内嵌凭据 */
export function isZhihuUrl(raw) {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:' || u.username || u.password) return false
    return u.hostname === 'zhihu.com' || u.hostname.endsWith('.zhihu.com')
  } catch {
    return false
  }
}
