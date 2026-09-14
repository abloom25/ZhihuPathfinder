// 递归对抗样本生成器：种子化 PRNG ＋ 递归变参数（不定深度/不定宽度）生成极端 JSON 值。
// 目标是覆盖：边界逻辑、类型混淆、Unicode 病态输入、原型污染键、数值边界。

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
export const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));

// —— 病态字符串池：空白/控制字符/孤立代理对/组合符/Zalgo/零宽/超长重复/注入片段 ——
export const STRING_POOL = [
  '', ' ', '\t', '\n', '\u0000', '\u0000\u0000', 'null', 'undefined', 'true', 'NaN', 'Infinity',
  '\ud800', '\udfff', '\ud83d\ude00', '👨‍👩‍👧‍👦', 'e\u0301', '가', // 孤立代理对、ZWJ 序列、分解式组合
  'a\u200bb', '\ufeff', '\u200d', 'Z̸̡̢a̯l̕g̜o͘ͅ', // 零宽与 Zalgo
  '𝕏'.repeat(4), '一'.repeat(6), '0'.repeat(10), 'A'.repeat(31),
  '%', '%%', '..', '../..', '%2e%2e%2f', '&', '&#x0;', '<script>', '\"><svg onload=alert(1)>',
  '${7*7}', '{{.}}', '{{constructor.constructor("return 1")()}}',
  'https://zhihu.com', 'https://www.zhihu.com/question/1/answer/2', 'http://zhihu.com',
  'https://zhihu.com.evil.com', 'https://evil-zhihu.com', 'https://user:pass@zhihu.com',
  'https://ZHÎHU.com', 'javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd',
  'https://zhihu.com/x?a=1#frag', '//zhihu.com/x', 'https://[::1]/', 'https://127.0.0.1.nip.io',
  '\u6570\u636e'.repeat(3), '查询', '再次第二次又一次另一个另一家', // 命中 possibleMultipleEvents 关键词
];

// —— 键池：语义键 ＋ 原型污染键 ＋ 类型混淆键 ——
export const KEY_POOL = [
  'query', 'id', 'text', 'situation', 'demo', 'consent', 'sourceUrl', 'sourceExcerpt',
  'ContentText', 'AuthorName', 'Title', 'Url', 'EditTime', 'Code', 'Data', 'Items',
  '__proto__', 'constructor', 'prototype', 'length', '0', '-1', 'hasOwnProperty', 'toString',
];

// —— 数值池：整数/浮点/安全边界/特殊值 ——
export const NUMBER_POOL = [
  0, -0, 1, -1, 0.5, -0.5, NaN, Infinity, -Infinity,
  Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, 2 ** 53, 2 ** 53 + 1, -(2 ** 53),
  1e308, 1e-308, 5e-324, 0.1 + 0.2, 1 / 3, -1 / 0, 4294967295, -2147483648,
];

export function adversarialString(r, maxLen = 6000) {
  let s = '';
  const n = int(r, 1, 4);
  for (let i = 0; i < n; i++) {
    const piece = pick(r, STRING_POOL);
    s += r() < 0.2 ? piece.repeat(int(r, 2, 40)) : piece;
    if (s.length > maxLen) break;
  }
  return s.slice(0, maxLen);
}

export function leaf(r) {
  switch (int(r, 0, 5)) {
    case 0: case 1: return adversarialString(r, 300);
    case 2: return pick(r, NUMBER_POOL);
    case 3: return null;
    case 4: return r() < 0.5;
    case 5: return adversarialString(r, 2); // 短串，更容易凑成“接近合法”的值
  }
}

/** 递归生成不定参数（变参数）结构：深度、宽度、类型全部随机。 */
export function deepValue(r, depth = 0, maxDepth = 5) {
  const roll = r();
  if (depth >= maxDepth || roll < 0.4) return leaf(r);
  if (roll < 0.7) {
    return Array.from({ length: int(r, 0, 6) }, () => deepValue(r, depth + 1, maxDepth));
  }
  const o = {};
  const n = int(r, 0, 6);
  for (let i = 0; i < n; i++) o[pick(r, KEY_POOL)] = deepValue(r, depth + 1, maxDepth);
  return o;
}

/** 生成“接近合法”的搜索 body：合法 query ＋ 随机数量的非法附加键。 */
export function nearMissSearch(r, validQuery) {
  const body = {};
  if (r() < 0.8) body.query = r() < 0.5 ? validQuery : leaf(r);
  const extras = int(r, 0, 3);
  for (let i = 0; i < extras; i++) body[pick(r, KEY_POOL)] = leaf(r);
  return body;
}

/** 生成“接近合法”的分享 body。 */
export function nearMissShare(r) {
  const uuid = () => crypto.randomUUID();
  const hex64 = () => Array.from({ length: 64 }, () => '0123456789abcdef'[int(r, 0, 15)]).join('');
  const body = { id: uuid() };
  if (r() < 0.9) body.situation = r() < 0.6 ? adversarialString(r, 80) : leaf(r);
  if (r() < 0.9) body.text = r() < 0.6 ? adversarialString(r, 2000) : leaf(r);
  if (r() < 0.8) body.demo = r() < 0.5 ? r() < 0.5 : leaf(r);
  if (r() < 0.8) body.consent = r() < 0.3 ? true : leaf(r);
  if (r() < 0.4) body.sourceUrl = r() < 0.6 ? pick(r, [null, 'https://www.zhihu.com/q/1', adversarialString(r, 60)]) : leaf(r);
  if (r() < 0.3) body.sourceExcerpt = r() < 0.6 ? pick(r, [null, adversarialString(r, 500)]) : leaf(r);
  if (r() < 0.15) body[pick(r, KEY_POOL)] = leaf(r);
  return { body, token: r() < 0.7 ? hex64() : adversarialString(r, 70) };
}

/** 生成上游返回的病态 item（用于 mapItems 单元模糊）。 */
export function adversarialItem(r) {
  const urlPool = [
    'https://www.zhihu.com/question/1/answer/2', 'https://zhihu.com/p/3',
    'https://zhihu.com.evil.com/x', 'https://evil-zhihu.com/x', 'http://zhihu.com/x',
    'https://user:pass@zhihu.com/x', 'HTTPS://ZHIHU.COM/X', 'https://xn--zhhu-woa.com/x',
    'https://zhihu.com./x', 'https://sub.zhihu.com/x?utm=1#f', 'not a url', '',
    'https://[::1]/x', 'javascript:alert(1)', 'https://zhihu.com:443/x', 'https://zhihu.com:8443/x',
  ];
  return {
    ContentText: r() < 0.7 ? adversarialString(r, 300) : leaf(r),
    AuthorName: r() < 0.7 ? adversarialString(r, 30) : leaf(r),
    Title: r() < 0.7 ? adversarialString(r, 40) : leaf(r),
    Url: r() < 0.7 ? pick(r, urlPool) : leaf(r),
    EditTime: r() < 0.5 ? pick(r, NUMBER_POOL) : leaf(r),
    ...(r() < 0.2 ? { [pick(r, KEY_POOL)]: leaf(r) } : {}),
  };
}

export const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
