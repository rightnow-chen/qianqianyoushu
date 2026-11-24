# 签前有数 · 腾讯云 CloudBase 部署清单

> 目标：朋友点开网址 → 能上传真实合同 → 跑 AI 审查。用腾讯云 CloudBase，微信/支付宝实名即可，**不碰 Stripe 绑卡**。
> 本清单基于 2026-11-24 查证的腾讯云官方口径与已验证的代码改造，每一步都有出处或实测依据。

---

## 0. 先讲清楚这是什么、要花多少钱

- **架构**：前端（Vite 静态页面）+ 后端（Express 云函数 `/api/*`），同一域名，朋友无感。
- **域名**：平台送 `https://xxx.tcloudbaseapp.com`，**免备案、免买域名**，直接能访问。
- **成本**（2026-11-24 查证官方口径）：
  - 云托管：CloudBase FREE 档 3000 资源点/月，按官方换算（云函数调用约 13.3 点/次）约合 225 次调用/月；个人版 ¥19.9/月。
  - AI 调用：DeepSeek 按量，你已设 30 次/天上限，满额约 ¥25–55/月，真实轻度用几块到十几块。
  - 结论：**先用 FREE 档跑，一个月看真实账单**，几十块以内。

---

## 1. 已替你做好的代码改造（无需你动手）

这些已改完、本地实测通过、已推 GitHub（`e5072dd` 之后的待提交改动会一并推）：

| 文件 | 作用 |
|---|---|
| `app/cloudfunctions/api/index.mjs` | HTTP 云函数入口，复用现有 Express，兼容网关传/不传 `/api` 前缀 |
| `app/cloudfunctions/api/scf_bootstrap` | 启动脚本（`#!/bin/bash` + `node index.mjs`），已给可执行权限 |
| `app/scripts/deploy/pack-cloudbase.mjs` | 打包脚本：把 `app/server` 同步进函数目录 + 生成只含生产依赖的 package.json |
| `app/server/ai-proxy.mjs` | CORS 改为放行同源（CloudBase 前端域名是动态的，写不进静态白名单） |

**本地已验证**：build 通过、单测 8 组全过、模拟 CloudBase（PORT=9000）起服务，路由带/不带 `/api` 前缀全命中、同源放行、跨域 403、smoke 实测打通 DeepSeek。

---

## 2. 部署前：本地打包函数代码（我可直接帮你生成 ZIP）

在函数目录生成一份「只含生产依赖」的代码包：

```bash
cd G:/qianqianyoushu/app
node scripts/deploy/pack-cloudbase.mjs
```

产出 `app/cloudfunctions/api/`：
- `index.mjs`（函数入口）
- `scf_bootstrap`（启动脚本）
- `server/`（从 app/server 同步）
- `package.json`（10 个生产依赖）

> 生成物已在 `.gitignore` 排除，不会污染仓库。源码永远只改 `app/server` 一处。

---

## 3. 创建 CloudBase 环境

1. 打开 https://console.cloud.tencent.com/tcb
2. 用微信/QQ 扫码登录（支付宝实名也行）
3. 新建环境 → 计费方式选 **按量计费 / FREE 档** → 环境名随意（如 `qianqianyoushu`）
4. 记下**环境 ID**（形如 `qianqianyoushu-1gxxxxxx`），后面处处要用

---

## 4. 部署后端云函数

1. 进入你的环境 → 左侧 **云函数** → 新建
2. 创建方式选 **代码包创建 / 上传 ZIP 包**（不用模板，用我们自己的代码）
3. 函数类型选 **HTTP 触发函数 / HTTP 云函数**
4. 函数名叫 `api`（**必须叫这个**，跟路径映射对应）
5. 运行环境 **Node.js 18.15**
6. **监听端口填 `9000`**（关键！官方文档要求 HTTP 云函数监听 9000）
7. 执行方法：`index.mjs` 是入口，无需改（我们的 `scf_bootstrap` 里写的是 `node index.mjs`）
8. 上传：把 `app/cloudfunctions/api/` 整个目录压缩成 `api.zip`，**ZIP 根目录直接是这几个文件**（不是套一层 api/ 文件夹），上传
9. 点 **保存并安装依赖** —— 控制台会读 package.json 自动 npm install

> **注意**：CloudBase 在线安装依赖已禁用 install 脚本。我们的 10 个依赖都是纯 JS（express/cors/dotenv/multer/mammoth/pdfjs-dist/docx/tesseract.js + 两个语言包），不含 preinstall/postinstall，正常能装。
> 万一某个依赖装失败：退路是本地在 `cloudfunctions/api/` 里跑 `npm install`，把 `node_modules` 一起打进 ZIP 上传，部署时选「**不安装依赖**」。

### 配环境变量（在函数详情 → 配置 → 环境变量）

| 变量 | 值 |
|---|---|
| `DEEPSEEK_API_KEY` | 你本地 `.env` 里那个真实 key（**绝不提交到 GitHub**） |
| `AI_DAILY_QUOTA` | `30` |
| `AI_PROXY_ALLOWED_ORIGIN` | 第 6 步拿到的静态托管域名（保险，防止网关改写 host 导致同源判断失效） |

### 配超时

函数详情 → 配置 → **执行超时** 改到 **60 秒**（默认 3 秒太短，AI 审查跑不完）。

---

## 5. 配置 HTTP 访问服务（打通同域，关键）

1. 环境左侧 → **HTTP 访问服务**（有的版本叫「HTTP 触发」）
2. 新增路径映射：**路径 `/api/*` → 目标 `api` 云函数**
3. 这样前端和接口走同一个域名，**同源鉴权自动放行**，朋友访问不会被 403。

> 原理：浏览器发的 `Origin` 是静态域名，走同域网关转发后 `Host` 也是同域，`isSameOriginRequest` 判定同源通过。若你的网关配置让两者不一致，第 4 步配的 `AI_PROXY_ALLOWED_ORIGIN` 白名单兜底。

---

## 6. 部署前端静态页面

1. 本地已 build 好 `app/dist/`（本次已重新构建通过）
2. 环境左侧 → **静态网站托管** → 上传文件 → 把 `dist/` 里的**全部内容**传上去（不是传 dist 目录本身）
3. 部署完成后，平台给一个默认域名，形如 `https://qianqianyoushu-1gxxxxxx.tcloudbaseapp.com` —— **这就是发给朋友的网址**

> 这个域名免备案、直接能访问。想用自定义域名再说，得备案。

---

## 7. 验证（拿到网址后逐条走）

| # | 操作 | 期望 |
|---|---|---|
| 1 | 浏览器打开默认域名 | 首页正常显示 |
| 2 | 点「用示例合同试一下」 | 进入完整工作台，5 屏 5 Tab |
| 3 | 地址栏拼 `/api/health` | 返回 200 JSON |
| 4 | 粘贴一段真实合同文字 → 点开始审查 | 出风险清单，且显示 AI 深度审查结果（不是「AI 未接入」） |
| 5 | 换一个无痕窗口打开 | 仍正常（确认不是只在你的登录态下能用） |

**第 4 步是核心**：如果只出规则结果、显示 AI 降级，说明云函数或密钥没配好，回第 4 步查环境变量和函数日志。

---

## 8. 日常迭代（别人怎么一起更新）

CloudBase 不像 Vercel 那样自动监听 GitHub。你以后改代码有两步：

```bash
# 1. 后端改了才需要：重新打包函数
cd G:/qianqianyoushu/app && node scripts/deploy/pack-cloudbase.mjs
# 把 cloudfunctions/api 重新压缩成 api.zip → 控制台函数详情「上传 ZIP 包」重新部署

# 2. 前端改了才需要：重新 build + 上传
cd G:/qianqianyoushu/app && npm run build
# 把 dist/ 全部内容重新传静态托管
```

- **只改前端**：只做第 2 步。
- **只改后端**（server/）：做第 1 步。
- **环境变量改了**（换 key、调额度）：不用传代码，函数详情里改完环境变量重新部署一次。
- 每次改完，用第 7 节的 5 步重新验证一遍。

> 嫌手动上传麻烦可以装 CloudBase CLI（`npm i -g @cloudbase/cli` + `tcb login`），然后 `tcb fn deploy api --force` 一条命令部署函数；但你的 PowerShell PATH 没配 npm/git，控制台上传反而省事，所以我没把 CLI 写成必选。

---

## 9. 已知限制（诚实说明）

- **拍照 OCR**：CloudBase 文件系统可写，服务端 OCR **大概率能用**（比 Vercel 必然失败强），但我没实测。如果拍照失败，让用户改用粘贴文字 / 上传 PDF / Word，这三条链路稳定。
- **免费档休眠**：低频访问首次可能慢几秒，唤醒后正常。个人版 ¥19.9/月可不休眠。
- **额度**：30/天是防被人刷你 DeepSeek 额度，朋友轻度体验够用。

---

## 10. 出问题怎么查

1. **函数 403**：查 `AI_PROXY_ALLOWED_ORIGIN` 是否等于静态域名，或路径映射 `/api/*` 是否配好。
2. **函数 500 / 超时**：函数详情 → 日志，看是不是依赖没装全、或执行超时还是 3 秒。
3. **前端白屏**：静态托管没传 `index.html`，或传成了套一层目录。
4. **AI 降级**：函数环境变量 `DEEPSEEK_API_KEY` 没填或填错。

卡在哪一步截图给我，我照着定位。
