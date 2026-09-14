# 部署与验收手册

目标：把一个链接发给评委，他不需要联系你、不需要本地安装，就能完成核心体验，且服务重启后分享仍在、撤回后不可读。

## 0. 前置

- 一台公网服务器（docker ≥ 24）＋域名
- 知乎 Access Secret（仅放在服务器上的密钥文件，**不进仓库、不进镜像、不进前端**）
- HTTPS：推荐两层方案任选
  - **Cloudflare（最快）**：DNS 橙云代理 → Origin 用 80 端口（本 compose 默认），边缘自动 HTTPS
  - **自管证书**：外层再加一层反代做 443 终结，转发到 `WEB_PORT`

## 1. 构建

```bash
git clone https://github.com/abloom25/ZhihuPathfinder && cd ZhihuPathfinder
cd frontend && npm ci && npm run build && cd ../backend
```

## 2. 密钥（只走文件/环境，0600）

```bash
echo -n '你的AccessSecret' > /etc/zhihu/access-secret   # 服务器上执行
chmod 600 /etc/zhihu/access-secret                       # 属主为部署用户
```

`compose.search.yaml` 以 docker secrets 挂载为 `ZHIHU_ACCESS_SECRET_FILE`，进程读后即用，不写日志。

## 3. 起栈

```bash
WEB_PORT=80 \
FRONTEND_DIST=../frontend/dist \
ZHIHU_SECRET_FILE=/etc/zhihu/access-secret \
docker compose -p later-prod -f compose.yaml -f compose.search.yaml up -d --wait
```

nginx 已内置：同源 `/api/` 转发（CSRF Origin 校验天然通过）、SPA 刷新路由回退、16k 请求体上限、关闭访问日志（不记录查询与个人路由标识）。

## 4. 验收清单（逐条过完再提交）

**官方提交前检查对应项：**

- [ ] 公网 HTTPS 打开首页，完成"阅读 → 选择 → 保存 → 追加 → 分享 → 接收 → 撤回"全流程（用**另一台设备**）
- [ ] `curl -s https://域名/healthz` 返回 `{"status":"ok",...}`
- [ ] `docker restart <api容器>` 后：分享链接仍可读（文件卷持久化）
- [ ] 撤回后链接返回 404，列表不再出现
- [ ] 深链刷新（如直接打开分享路径）不 404（SPA 回退）
- [ ] 限流/超时/空结果页面有真实降级提示（官方检查单第 6 条）
- [ ] 仓库/日志/截图中无 Access Secret（`grep -r <secret前8位> .` 自查）
- [ ] 队长在活动页面核对所属场次（`zhihu_hackathon_2026_p2`）与截止时间（包载 9-15 10:00），以页面为准

**自动化验收（服务器上执行）：**

```bash
BASE_URL=https://域名 ACCEPTANCE_PROJECT=later-prod node scripts/verify-container-search.mjs
# 官方脚本：live/cached 搜索 → 重启 api → 缓存重建 → 前端可用，全过则 passed:true
node --test ../audit/targeted.test.mjs   # 12 条回归
```

注意：官方脚本会真实调用上游并重启 api，请在低峰期跑，且不自动重试（配额保护是设计行为）。

## 5. 密钥纪律

- 赛后在知乎开放平台轮换 Access Secret（演示期间它出现在过终端环境变量）
- 密钥文件权限 0600，不进 git；`.env` 已在 backend/.gitignore
- 若接入 OAuth（可选）：app_key 同样只放后端；回调地址须与活动页面登记完全一致

## 6. 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 搜索 429 且响应带 retryAfterSeconds | 上游配额/退避（设计行为） | 等待所示秒数；演示用已核验关卡 |
| 搜索 502 | 上游异常或返回了不合规数据（fail-closed） | 稍后重试；不做部分渲染 |
| 搜索 504 | 上游悬挂，看门狗强制收尾 | 稍后重试 |
| 分享 429 | 活行 500/总行 2000 上限 | 预期内（试运行容量） |
