# 问津 Pathfinder——等消息的这一周

用知乎上的真实经历作为参照，让人在看见别人的"后来"之前，先留下自己的判断；看过之后再回看、修正，并把自己愿意分享的变化留给下一位。

## 解决什么问题

等 offer 审批、等面试结果的那一周，人会反复搜别人的经历，却很少记下自己当时的判断。事后回看，分不清"我当时怎么想的"和"我后来才知道的"。

《问津 Pathfinder》把这两件事拆开：**先记录，再看后续，并排保留前后想法，自愿分享**。

## 核心体验（一条路径走完）

1. 面对一个具体处境（等审批的这一周，我打算怎么办）
2. 先留下自己的选择和理由（原话冻结，揭晓后不可改写）
3. 主动查看不同人的"后来"（知乎真实经历，逐字引用、标注不确定）
4. 看见条件差异与未知（每张卡片带 conditionDifferences 与 unknowns）
5. 留下现在的想法（与起初的判断并排保存）
6. 以后追加变化（同一条记录可持续追加，标注时间）
7. 自愿选择一部分分享给下一位（可随时撤回，撤回后不可读）

## 技术方案

- **前端**：React 18 + Vite，无 UI 框架依赖；记录存储于 localStorage，跨标签 Web Locks 独占写、版本冲突拒绝覆盖
- **后端**：Node 22 原生 `http`，零运行时依赖；分享数据文件存储（临时写＋原子 rename，0600 权限）
- **部署**：docker compose（api + nginx 同源反代），read_only 文件系统、cap_drop ALL、非 root 运行
- **安全**：内容安全边界与对抗测试详见 [`audit/REPORT.md`](audit/REPORT.md)（两轮对抗＋混沌，约 4400 条断言）

## 使用的知乎开放能力

| 能力 | 用法 | 合规措施 |
|---|---|---|
| 知乎搜索 API（`zhihu_search`） | 用户输入处境关键词，拉取真实经历候选 | 应用层 5 分钟缓存＋单飞节流＋最小间隔去重（呼应官方"额度能力应缓存去重"要求） |
| 内容溯源 | 候选与卡片逐字引用原文 | 剥离 UTM 后 canonical 化；来源登记于 [`backend/contract/素材来源.json`](backend/contract/素材来源.json)，含原文摘要 sha256 |
| 不确定性保留 | 每条经历标注 unknowns | 不把"拿到 offer"写成"已入职"，不把建议当成亲历 |

## 已验证 与 实验性（诚实边界）

**已验证**：核心七步流程 · 记录并发安全与冲突拒绝 · 分享创建/幂等重试/撤回后不可读 · 容器重启后分享仍在 · 真实知乎搜索端到端（live 200＋缓存命中） · 两轮对抗与混沌测试（fuzz 4354 / deep 61 / targeted 12 / 前端 13，全部零违例）

**实验性（页面如实标注）**：三个辅助入口（真实搜索、故事库、问津路由）为探索功能；演示中的"跨时间追加"为演示标注，非长期数据。

## 运行

```bash
# 前端构建
cd frontend && npm ci && npm run build

# 密钥：仅环境注入，不进仓库（二选一）
echo -n '你的AccessSecret' > /tmp/zhihu-secret && chmod 600 /tmp/zhihu-secret

# 起栈（含搜索能力）
cd backend && ACCEPTANCE_PROJECT=later-demo FRONTEND_DIST=../frontend/dist \
  ZHIHU_SECRET_FILE=/tmp/zhihu-secret WEB_PORT=8089 \
  docker compose -p later-demo -f compose.yaml -f compose.search.yaml up -d --wait

# 验收
node scripts/verify-container-search.mjs   # BASE_URL 默认 127.0.0.1:8089
node --test ../audit/targeted.test.mjs     # 12 条回归
```

线上部署（HTTPS、公网、跨设备验收）见 [`docs/DEPLOY.md`](docs/DEPLOY.md)。

## 文档索引

- [`docs/产品说明.md`](docs/产品说明.md)——提交用主说明（必交材料）
- [`docs/演示脚本.md`](docs/演示脚本.md)——3 分钟演示路线
- [`docs/DEPLOY.md`](docs/DEPLOY.md)——部署与验收手册
- [`audit/REPORT.md`](audit/REPORT.md)——对抗测试与修复全记录（附件）
