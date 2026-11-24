# 签前有数 · Vercel 部署操作清单

> 生成时间：2026-11-23　对应代码：`master` @ `e5072dd`
> 目标：把网址发给朋友，点开能上传真实合同、跑 AI 审查。

## 一、开始前你要准备的东西

| 项目 | 说明 |
|---|---|
| Vercel 账号 | 用 GitHub 账号登录 https://vercel.com（一键授权，不用另注册） |
| DeepSeek API Key | 你本地 `.env` 里那个，**只填到 Vercel 后台，绝不能提交到 GitHub** |
| GitHub 仓库 | `rightnow-chen/qianqianyoushu`（已公开、代码已推到最新） |

## 二、导入仓库（约 1 分钟）

1. 打开 https://vercel.com/new ，用 GitHub 登录。
2. 选择仓库 **`rightnow-chen/qianqianyoushu`**，点 Import。
3. 关键配置按下面填（其他保持默认）：

| 设置项 | 值 | 为什么 |
|---|---|---|
| Root Directory | **`app`** | 代码在 app/ 子目录，不是仓库根 |
| Framework | Vite（`vercel.json` 已声明，通常自动识别） | 前端是 Vite |
| Build Command | `npm run build` | 已写在 vercel.json，一般自动带出 |
| Output Directory | `dist` | 已写在 vercel.json |

4. **先不要点 Deploy** —— 先把下面的环境变量填了。

## 三、填环境变量（最关键一步，别漏）

在同一个配置页面展开 **Environment Variables**，添加：

| Name | Value | 说明 |
|---|---|---|
| `DEEPSEEK_API_KEY` | 你的真实 key | AI 审查的核心；不填则 AI 功能不可用 |
| `AI_DAILY_QUOTA` | `30` | 每日额度 30，防止被人刷爆 token |

> 代码已自动识别 Vercel 注入的域名（`VERCEL_URL`），**不需要**手动配 `AI_PROXY_ALLOWED_ORIGIN` 白名单。

## 四、部署

点 **Deploy**，等 1–3 分钟。成功后会得到一个网址，形如：

```
https://qianqianyoushu-xxxx.vercel.app
```

这就是发给朋友的链接。

## 五、部署后必做的验证（3 分钟）

按顺序测，任何一步异常都先停下来查：

1. **健康检查**：浏览器打开 `https://<你的域名>/api/health`
   应看到 `{"ok":true,...,"provider":"DeepSeek",...}`。
   - 若 404 → Root Directory 没设成 `app`，去 Project Settings 改。
   - 若 500 → 环境变量没填或填错。

2. **AI 接口冒烟**：打开 `https://<你的域名>/api/ai/smoke`
   应看到含 `"success":true` 的 JSON。这一步会真实调用一次 DeepSeek 并消耗一点额度，用来确认 key 有效。

3. **首页 + 演示**：打开根网址，点「用示例合同试一下 →」，能看到完整工作台（5 屏 + 5 Tab）。

4. **真实审查**：粘贴一段真实租房合同文字 → 点开始审查 → 应拿到风险清单。
   - 若提示「AI 深度审查没跑完」，说明只有规则引擎在跑，检查第 3 步的 key。

5. **拍照上传（已知限制）**：服务端 OCR 在 Vercel 上写不了缓存文件，拍照识别会失败。
   - 朋友请改用**粘贴文字 / 上传 PDF / 上传 Word**，这三条链路正常。
   - 这是你之前拍板"OCR 先不动、以后再看云端识别"的直接结果，不是 bug。

## 六、常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 页面能开，但点审查报 403 | 域名白名单没生效 | 在 Vercel 环境变量加 `AI_PROXY_ALLOWED_ORIGIN=https://<你的域名>`，Redeploy |
| `/api/health` 404 | Root Directory 错了 | Settings → General → Root Directory 改成 `app`，Redeploy |
| AI 说没配置 provider | `DEEPSEEK_API_KEY` 没填 | 环境变量补上，Redeploy（改环境变量后必须重新部署） |
| 超过 4.5MB 的上传失败 | Vercel 函数请求体上限 | 正常合同远小于此；如遇超大扫描件请拆分 |
| 额度用完 | 30/天上限 | 后台调大 `AI_DAILY_QUOTA`，或等次日 0 点（UTC）重置 |

## 七、改了环境变量后

Vercel **不会**自动重跑已部署的函数。改完环境变量后必须：
Deployments → 最新一条 → `...` → **Redeploy**。

## 八、这次改造改了什么（技术备忘）

- `app/api/[...path].mjs`：catch-all 函数，把 `/api/*` 全部交给 Express（保留原始 URL）。
- `app/vercel.json`：声明 build 命令、dist 输出、Vite 框架。
- `app/server/ai-proxy.mjs`：加 `export default app`，Vercel 能加载；本地 `npm start` 不受影响。
- `app/server/config.mjs`：把 `VERCEL_URL` / `VERCEL_PROJECT_PRODUCTION_URL` 自动加入 CORS 白名单。
- `app/server/lib/guards.mjs`：加同源判断，同源请求通过鉴权，第三方跨域仍拒绝。
- 本地验证：单测全过、build 通过、`/api/health` 与各核心路由在模拟环境全部命中。

## 九、日常迭代：让朋友自动看到新版

**核心一句话：代码 push 到 `master`，Vercel 自动重新构建部署，网址不变，朋友刷新就是新版。** 不用再手动点 Deploy，也不用重新发链接。这是 Vercel 连接 GitHub 后的默认行为（每次 push 都触发部署）。

### 一次性前提：确认自动部署已连上

首次导入时检查 Project Settings → Git：

| 检查项 | 应为 |
|---|---|
| Connected repository | `rightnow-chen/qianqianyoushu` |
| Production Branch | **`master`**（Vercel 默认叫 `main`，你的仓库是 `master`，导入时通常自动识别，但要核对一眼） |
| 自动部署 | 默认开启，无需额外设置 |

推到 `master` = 更新正式网址；推到其他分支 = 只生成一个独立预览网址，**不影响正式网址**。

### 每次迭代的标准动作

1. 本地改代码（只动 `app/` 下）
2. 本地验证：`npm run test:unit` + `npm run build` 都要过
3. `commit` + `push` 到 `master`
4. 等 1–3 分钟，Vercel → Deployments 里最新那条状态变 **Ready**
5. 打开正式网址验证；让朋友**硬刷新一次**（Ctrl+F5）清掉旧缓存

### 两种「改了但线上没变」

| 情况 | 原因 | 处理 |
|---|---|---|
| 改了环境变量（key、额度） | push 不带环境变量 | Deployments → 最新一条 → `...` → **Redeploy**（见第七节） |
| 朋友说还是旧版 | 浏览器缓存 | Ctrl+F5 硬刷新。Vite 产出的 JS/CSS 带哈希名会自动更新，只有 `index.html` 可能短暂缓存 |

### 想先小范围试再放开

推到一个新分支（例如 `dev`），Vercel 会给它一个独立预览网址，只有拿到链接的人能看到，正式网址不受影响。确认没问题后再合并/推到 `master`。

### 出问题怎么回退

- **Vercel 后台**（最快）：Deployments → 找一条历史成功记录 → `...` → **Promote to Production**，秒级生效，不用改代码
- **代码方式**：本地 `git revert <commit号>` 再 push，等于撤销那次改动

### 关于 push 命令

你的 PowerShell 直接敲 `git` 找不到（PATH 没配）。两个办法：

- **最省事**：改完跟我说「发布」，我跑验证 + commit + push，你不用记命令
- **想自己来**：PowerShell 里执行一次
  `setx PATH "$env:PATH;C:\Users\cxy32\.workbuddy\binaries\PortableGit\versions\1.2.0\mingw64\bin"`，重开窗口后就能直接用 `git`。首次 push 会要求 GitHub 登录授权，之后记住。

## 十、Plan B：Vercel 账号卡死时改走 Render

**触发条件**：Vercel 登录报「邮箱已被占用」+「无法完成登录，请填写账户恢复表单」。这是 Vercel 账号层的问题，跟代码无关。恢复表单人工审核几天起步，耗不起就走这条。

> 2026-11-24 实况：GitHub 登录、Gmail 邮箱登录、**全新 QQ 邮箱登录**全部被同一个恢复表单拦住。换邮箱无效，判断是 Vercel 注册/登录环节对当前网络环境或设备的风控，**不是账号冲突那么简单**。遇到同样情况别再换邮箱试了，直接走 Render。

**已验证**：把微信、Redis、session secret 等环境变量全部置空、只留 `DEEPSEEK_API_KEY`，`config` 模块正常加载、额度正确读到 30。Render 只填那两个环境变量就够，不会有配置坑。

**优势**：Render 是另一个平台，GitHub 登录不会撞 Vercel 那个老账号；**零代码改造**（`app/render.yaml` 已配好，额度已统一为 30/天）。**拍照 OCR 在 Render 上大概率可用**（文件系统可写，能跑服务端三级识别）——这是我没实测的推断，但跟 Vercel 只读文件系统必然失败是两回事。

**代价**：免费层会休眠，朋友首次打开要等几十秒，请先跟他们打声招呼别以为挂了。

### 操作步骤

1. 打开 https://dashboard.render.com → **用 GitHub 登录**
2. 点 **New → Web Service** → 连接 GitHub，选仓库 `rightnow-chen/qianqianyoushu`
3. 按下面填（其他默认）：

| 设置项 | 值 |
|---|---|
| Root Directory | **`app`** |
| Runtime | Node |
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |
| Plan | Free |
| Health Check Path | `/api/health` |

4. 环境变量填两个：

| Name | Value |
|---|---|
| `DEEPSEEK_API_KEY` | 你的真实 key |
| `AI_DAILY_QUOTA` | `30` |

5. 点 Create Web Service，等首次构建（约 2–5 分钟）。拿到 `https://xxx.onrender.com` 就是发给朋友的链接。

> 注：仓库里的 `app/render.yaml` 是配置留档（额度已改成 30）。若在 Render 里选的是 **Blueprint / YAML 导入**而非手动建服务，注意该文件在 `app/` 子目录、不在仓库根，可能需要手动指定路径。手动建服务最省事。

### 验证（拿到网址后）

把前面第五节的 5 步验证里的域名换成 `xxx.onrender.com` 照做。重点看 `/api/health` 返回 200 且 `provider: DeepSeek`，以及粘贴真实合同能出风险清单。

### Render 的自动更新

同样是连 GitHub 后 push 自动部署——逻辑和第九节完全一样，push 到 `master` 即更新。区别只在平台后台位置不同：Render 是服务的 **Events** 页看构建状态。
