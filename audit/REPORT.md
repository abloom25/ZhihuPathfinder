# ZhihuPathfinder 对抗式安全审计报告

**日期**: 2026-09-14 · **对象**: abloom25/ZhihuPathfinder（backend `server.mjs`/`shares.mjs` ＋ frontend lib）
**方法**: 递归变参数对抗样本生成（不定深度×不定宽度×病态 Unicode/数值/原型键）＋ 混沌工程场景（并发洪泛、悬挂上游、上游投毒、容量耗尽、流式超限、畸形请求目标）＋ 定向回归钉住
**合规**: 全程无真实外联。上游以注入的 mock `fetchImpl` 模拟（含 SSRF/投毒/超时/重定向/体积攻击画像）；客户端流量仅指向本进程 127.0.0.1 临时端口。

## 工件

| 文件 | 内容 |
|---|---|
| `audit/gen.mjs` | 递归对抗样本生成器（种子化，可复现） |
| `audit/fuzz.mjs` | 模糊执行器：R0 基线 / R1 搜索×300 / R2 分享×300 / R3 mapItems×400 / R4 定向混沌×10 场景，共 **4355 条不变量断言** |
| `audit/targeted.test.mjs` | 12 条定向回归（`node --test`），每条发现与防线各一测 |

运行：`node audit/fuzz.mjs`、`node --test audit/targeted.test.mjs`（Node ≥22，零依赖，不改仓库任何文件）

## 发现（全部有可执行复现）

### F1【高】畸形/`null` Origin → 误报"分享存储暂不可用"（503）
- 位置：`backend/shares.mjs:21`
- 机制：`new URL(req.headers.origin)` 对非绝对 URL 抛 `TypeError`（`Origin: null`、`::1`、`http://[` 等），落入兜底 catch → 503 ＋文案"分享存储暂不可用，请保留本地记录后重试"
- 影响：`Origin: null` 是**合法浏览器形态**（沙箱 iframe、隐私模式下的跳转、部分 WebView）。真实用户分享/撤回会被拒，且错误文案谎称存储故障，诱导用户放弃重试。随机轮独立复现 55 次＋定向用例 3 种形态。
- 次级（**审计期误判，已更正**）：初版报告称"合法 origin 含显式默认端口（`https://host:443`）时 `.host` 带 `:443` 与 Host 不等 → 同源被误拒"——实测 WHATWG URL 会自动剥除默认端口（`new URL('https://host:443/x').host === 'host'`），该问题**不存在**，无需修复。
- 修复：解析失败按 403 处理（`try{...}catch{ throw fail(403,'来源不匹配') }`）；比较时归一化默认端口
- 证据：`targeted.test.mjs` 用例 1（钉住现状 503；修复后应反转为 403）

### F2【中】悬挂上游 → `active` 永久卡死 → 全局搜索永久 429
- 位置：`backend/server.mjs:62-101`
- 机制：节流守卫依赖 `active` 标志，复位只在 fetch 结算后（`finally`）。若上游 fetch 实现**不尊重 abort 信号且永不结算**，`active=true` 永久成立，此后一切搜索（含缓存未命中的）永久 429。
- **证据边界（必读）**: 复现用的是无视 signal 的 mock。生产 undici 遵循 `AbortSignal.timeout`（含 body 读中断），故现实触发面窄——属于**纵深缺失**而非现行必现故障。但该模式对"替换 fetchImpl／keep-alive 死锁／非标准运行时"零容忍，一次即全局锁死且无自愈。
- 修复：给上游阶段加硬看门狗（`Promise.race` 限期，超时按 504 收尾并强制 `active=false`）
- 证据：`targeted.test.mjs` 用例 2

### F3【中】撤回墓碑永久占用 500 容量 → 试运行期可用性 DoS
- 位置：`backend/shares.mjs:34`（`rows.length>=500`）
- 机制：撤回行（`revoked:true`）永不清理且计入容量。管理 token 是客户端自生成的，任何匿名访客可循环"创建→撤回"500 次把容量永久耗尽；此后 `GET /api/v1/shares` 显示空存储，但所有新分享永远 429"容量已满"。
- 影响：试运行服务可被单方不可逆关闭（写入口），且"存储显示为空却拒绝写入"的表象极难排查。
- 修复：容量只计未撤回行 `rows.filter(r=>!r.revoked).length`，或撤回时物理清除/归档
- 证据：`targeted.test.mjs` 用例 3（直写 500 条墓碑后 POST → 201 变 429）；fuzz C5 全流程 500 创建＋撤回后同结果

### F4【中】前端行为测试与实现漂移，`npm test` 开箱 5/13 失败
- 位置：`frontend/test/flow.test.mjs` vs `frontend/src/lib/flow.js:34`
- 机制：`buildInitialText` 签名已演进为单对象参数（`{frozen,after,context,disagreement}`，生产调用方 `App.jsx:69` 为准）并新增文件头行，测试仍按旧的位置参数调用 → 5 个用例 TypeError 直接崩；空选择语义从 `''` 变为 `'仍未决定'`、固定长度算术（36 码点）也已过期。
- 影响：交接包声明的核心行为保证（原话保护、不编造结局、长度边界）**当前没有任何有效测试看护**；红灯常态化会训练贡献者忽略测试结果。
- 修复：按现签名重写 flow.test.mjs（本审计的 targeted 套件已覆盖后端等价保证，可作模板）
- 证据：`cd frontend && npm test` → `# pass 8 / # fail 5`

### F5【低】429 从不携带等待时间（`retryAfterSeconds` 恒 null）
- 位置：`backend/server.mjs:76,88`（`new Failure(429,'RATE_LIMITED')` 未传第三参，虽然 `blockedUntil` 明确是 +60s）
- 影响：前端 `search.js` 读取 `retryAfterSeconds ?? null` 只能拿到 null，无法向用户展示可信的等待时长；响应也无 `Retry-After` 头。
- 修复：`new Failure(429,'RATE_LIMITED',60)` ＋ reply 层对 429 附 `Retry-After`

### F6【低】shares 与 search 的 Content-Type 判别不一致
- 位置：`backend/shares.mjs:22`（不 trim 不 lowercase）vs `backend/server.mjs:126`（两者都做）
- 影响：`Application/JSON`、`application/json ` 在 shares 被拒 400，在 search 被收。浏览器默认小写无实害，但代理/非标客户端易踩。
- 证据：`targeted.test.mjs` 用例 4

### F7【低】mapItems 消毒后 canonical 保留端口
- 位置：`backend/server.mjs:32-35`（剥 search/hash 但不剥 port）
- 影响：`https://zhihu.com:8443/x` 通过消毒并原样展示；前端 `isZhihuUrl` 同样放行端口。仍限 zhihu.com 主机，风险很低，记录在案。
- 证据：`targeted.test.mjs` 用例 5

### F8【信息】单条上游投毒 → 整查询 fail-closed 502，且失败不缓存
- 一条坏 item（如 `zhihu.com.evil.com`）令整次查询 502（无部分结果），用户立即重试会撞上 `minInterval` 节流变成 429——连续两次挫败。fail-closed 本身是正确的安全取舍；可考虑对坏 item 跳过（仍标注）或对失败做短负缓存。
- 证据：fuzz C9（502 → 立即重试 429，且无 Retry-After）

### F9【信息】缓存 key 与上游实际查询的 Unicode 细差
- 孤立代理对（`\ud800`）进 `URLSearchParams` 被替换为 U+FFFD 发给上游，但缓存 key 保留原串——同一"视觉查询"可能产生两个缓存条目。无安全影响，记录在案。

## 被证伪的假设（诚实报告，防止后续重复劳动）

1. **"畸形 req.url 会误归类 502"** — 证伪。`GET :x` 在 llhttp 解析层即 400；`*`、`//evil.com/path`、`/%zz` 经 WHATWG URL 解析后安全落 404，未发现误分类路径。
2. **"超限流式请求体的 400 响应客户端收不到"** — 证伪。8KB/16KB 限流中途应答后，裸套接字客户端完整收到 400 ＋ JSON 信封。
3. **原型污染 / tokenHash 泄漏 / 秘密泄漏 / 堆栈泄漏 / 信封破坏** — 1000＋随机用例零违例。`__proto__` 键被 shares 的 allowlist 拦截（400），`Object.prototype` 全程干净。

## 经对抗验证后确认成立的正面防线（建议保留为回归基线）

上游 URL 消毒（400 随机样本零漏网：http/后缀伪装/连字符伪装/内嵌凭据/IDN 同形/尾点域全拒，query/hash 剥离、canonical 去重）· 上游 2MB 体积上限 · `redirect:'error'` 不跟随 · 错误体/凭据不透传 · 同 id 并发创建原子（一个 201、同 token 幂等 200、异 token 403、篡改重放 409）· 缓存命中可绕过节流 · tokenHash 任何响应不外泄 · 单进程 read-modify-write 原子性成立 · 200 搜索响应全部通过前端 `validSearch` 镜像校验。

## 对账：考虑了什么、忽略了什么

- **排除**（有依据不动）：React 组件 DOM XSS（无 `dangerouslySetInnerHTML` 等汇点，React 默认转义）；`analysis/`、`run-ablation.mjs` 离线脚本（不属服务面）；Docker/compose 加固已达标（非 root、read_only、cap_drop、no-new-privileges、原子写 0600、健康检查仅打 127.0.0.1）。
- **延后**（记录未测）：多实例部署下 shares 文件读-改-写无跨进程锁（compose 单实例不受影响，扩容前必须解决）；token 比较非常数时间（sha256 前缀时序，理论级）；浏览器 localStorage 配额耗尽的极端路径（前端测试已部分覆盖）。
- **待拍板**：F8 的整单 fail-closed 是否改为跳过坏 item；F1 修复后 `Origin: null` 按拒绝还是按放行处理（取决于产品是否需要沙箱 iframe 内分享）。
- **盲区**：`deploy/nginx.conf` 不在仓库（CORS/安全头/代理层无法审计）；知乎上游真实 API 行为以 mock 画像近似（限流码、字段形态按代码推断）；前端组件交互层（ChoiceScreen 等）只做了汇点扫描未逐行审。

---

## 修复实施记录（2026-09-14，按严重度逐项修复）

| # | 修复 | 位置 | 实现 |
|---|---|---|---|
| F1 | 畸形 Origin → 403 来源不匹配 | `shares.mjs`（原 :21） | `new URL(origin)` 解析失败按来源不匹配拒绝；不再落入兜底 catch 误报 503 存储故障。沙箱 iframe 的字面量 `Origin: null` 同样语义 |
| F2 | 上游阶段看门狗 | `server.mjs` search() | 整个上游交互（fetch＋体积受限读体＋解析＋缓存）包成工作 Promise，与 abort 信号触发的看门狗 Promise 赛跑。信号由本服务创建必按时触发，上游实现无视 abort 也能在 `timeoutMs` 后强制 504 收尾并释放 `active`；赛输后的后台结算由 `work.catch(()=>{})` 兜底 |
| F3 | 容量只计活行 | `shares.mjs`（原 :34） | `rows.filter(r=>!r.revoked).length>=500`：撤回墓碑不再永久占额；500 条活行上限防线保留（测试双向钉住） |
| F4 | 前端测试适配现行签名 | `frontend/test/flow.test.mjs` 全量重写 | 以生产调用方 `App.jsx`（对象参数＋文件头）为准；动作 id 统一为真实的 A/B/C；长度边界改为自适应计算固定文案开销（不再硬编码 36 码点）；新增非法动作 id、损坏 JSON、旧结构草稿的忽略行为断言。生产代码零改动 |
| F5 | 429 携带等待时间 | `server.mjs` | 上游 429 / Code:30001 → `retryAfterSeconds=60`；节流路径按 `blockedUntil` 剩余动态计算（minInterval 场景 ≥1）；429 响应附标准 `Retry-After` 头。契约允许（`retryAfterSeconds: integer\|null, minimum 1`） |
| F6 | Content-Type 归一化对齐 | `shares.mjs`（原 :22） | `.split(';')[0].trim().toLowerCase()`，与 search 侧一致 |
| F7 | 消毒层拒绝非标准端口 | `server.mjs` mapItems() | `url.port` 非空即拒（WHATWG 已自动剥 443 默认端口，残余必非标准）；与尾点域的 fail-closed 取舍一致 |

**未修复（有意保留）**：F8（单条投毒整查询 fail-closed）与 F9（孤立代理对缓存 key 细差）为待拍板的设计取舍／无安全影响项，保持原行为；fail-closed 是更安全的默认。

**修复期误报更正（诚实记录）**：重写草稿测试时曾怀疑 `validDraft` 只认 A/B/C 是生产缺陷——核实 `src/data/cases.js` 后确认真实动作 id 就是 A/B/C，是旧测试用 `wait/ask/prepare` 当替身所致，生产代码无此缺陷。

**修复后回归证据**：
- `node --test audit/targeted.test.mjs` → **12/12**（缺陷用例全部反转为修复后期望，含 F1 跨源 403 防线对照、F2 二次查询不锁死、F3 双向容量、F7 默认端口剥除）
- `node audit/fuzz.mjs` → **4354/4354 断言通过，零发现**（修复前 58 项：55×Origin-503＋3 项缺陷复现）
- `cd frontend && node --test test/*.test.mjs` → **13/13**（修复前 5/13 失败）

完整补丁见同目录 `fixes.patch`（含全部生产代码与测试变更，可直接 `git apply`）。
