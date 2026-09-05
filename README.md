# PureIP — IP 纯净度、场景评估与网络测速

一个可自托管的场景化 IP 与网络检测站。可以检测当前出口，也可以手动输入公网 IPv4 / IPv6，
然后按 **AI 工具、轻松上网、账号/邮箱、看剧、打游戏** 五种用途重新评估同一份证据。
结果会明确区分完整实测与 IP 侧预评估，并显示可信度、缺失权重和合理分数区间。

页面另有独立的 **网络测速** 入口：使用 Cloudflare 官方开源测速引擎测量公网下载、上传、空闲/负载延迟，
再结合 PureIP 的 Oregon、Singapore、Frankfurt 区域探针判断游戏、看剧、AI 工具和视频会议体验。

## 快速开始

```bash
npm ci
npm start                 # 默认 http://0.0.0.0:3210
npm run check             # 全量语法检查 + 自动化测试
```

打开页面后可在「IP 场景评估 / 网络测速」之间切换。IP 评估页选择用途和「当前网络 / 输入指定 IP」，
再开始检测即可。运营者本人还可展开「高级」面板，填入
`socks5://…` 或 `http://…` 代理去检测其他地区节点（新加坡等），高级模式会额外做
AI / 流媒体公开入口路径实测。

## 检测模块

| 模块 | 数据源 | 说明 |
|---|---|---|
| 场景化评分 | 六类底层证据 | 五种用途统一标注硬门槛、强/中证据、弱上下文和仅信息项；缺失项按中性值估算并显示完整区间 |
| 手动 IP | 现有 IP 情报接口 | 支持公网 IPv4 / IPv6；拒绝私网、回环、保留及无效地址；不伪造浏览器和网络实测 |
| 结论与建议 | 汇总各项 | 按当前用途总结能不能用，优先列出最相关的风险点与操作建议 |
| 浏览器环境 | 客户端可观测信号 | 检查 **WebRTC 公网 IP 泄漏** 与 `navigator.webdriver` 自动化标志；时区、语言和字体只展示、不扣分。它不等同于 Claude Code 进程检查，也不预测官方封号 |
| 公网测速 | `@cloudflare/speedtest` | 快速/完整两档；下载、上传、空闲延迟、抖动、下载/上传负载延迟、Bufferbloat 评分与实时采样图 |
| 网络稳定性 | 浏览器到 PureIP/区域探针 | 空闲与负载双阶段采样、P95、抖动、HTTP 请求失败率、3 路并发下载，并显示美国/新加坡/欧洲等可配置区域节点 |
| 测速场景建议 | 公网测速 + 区域探针 | 分别判断 AI 工具、4K 看剧、在线游戏、视频会议体验；最近 10 次结果仅保存在浏览器本地 |
| IP 详情 | ipapi.is + 客户端 | IP 属性(住宅/机房/移动)、AS 域名、IP 网段、路由前缀、带国旗位置、滥用评分、**浏览器指纹**、WebRTC 泄漏 |
| 多源地理核对 | ip-api / ipwho.is / ipapi.is / **ipinfo Lite** | 4 源交叉验证位置、ASN、ISP、rDNS、机房/住宅/移动标记 |
| 风险评分 | ProxyCheck.io / AbuseIPDB / IPQualityScore / ipapi.is / Shodan | 已确认滥用与通用代理分类分开解释；代理/VPN/机房标签不冒充封号概率 |
| DNS 黑名单 | **Spamhaus ZEN(DQS)** / SpamCop / DroneBL / PSBL / s5h 等 | 走 DoH 查询规避云端拒查；显示有效覆盖度，避免假阴性 |
| 服务路径实测（仅高级） | 走代理直连目标 | Claude 网页 + 官方 API 入口、ChatGPT、Gemini、Netflix、YouTube Premium、Disney+、TikTok；不携带账号，因此只能说明入口可达/受限，不能证明订阅、登录或账号状态 |

场景档位：≥85 非常适合 / ≥70 适合 / ≥55 勉强可用 / <55 不推荐。下面的权重是 PureIP 的用途模型，
不是任何平台公布的风控公式：

| 场景 | 信誉 | 网络身份 | 浏览器环境 | 地区 | 网络 | 服务实测 |
|---|---:|---:|---:|---:|---:|---:|
| AI 工具 | 25 | 8 | 7 | 25 | 15 | 20 |
| 轻松上网 | 5 | 0（仅信息） | 0（仅信息） | 10 | 70 | 15 |
| 账号 / 邮箱 | 30 | 15 | 10 | 15 | 15 | 15 |
| 看剧 | 5 | 5 | 0（仅信息） | 15 | 40 | 35 |
| 打游戏 | 3 | 2 | 0（仅信息） | 20 | 70 | 5 |

AI 场景可选具体目标，默认 **Claude Code / Claude**；Claude、ChatGPT、Gemini 的地区门槛与服务结果分别计算。
“任一已测 AI 服务”仅适合真的只关心任意一个服务的情况，不能用 Gemini 或 ChatGPT 的成功替 Claude Code 背书。

机房、企业代理、VPN、共享出口和第三方通用风险分会在 AI、账号、看剧、游戏中作为有上限的弱上下文，
但不进入“已确认滥用”分，也不能单独推出封号或不可用。轻松上网不因这些标签、时区、语言或字体扣分；
游戏也只给网络身份极低权重。真实服务结果、地区资格、滥用记录和网络测量始终拥有更高优先级。

地区可达性优先于 IP 纯净度：中国大陆出口在 AI 工具、跨境浏览和国际流媒体场景下，如没有取得相应服务
的真实成功结果，场景总分最高为 45。账号/邮箱没有共用一个中国大陆硬门槛，因为 Gmail、Outlook、社媒等
服务政策不同；在没有选择并实测具体服务前，地区与服务共 30% 会明确标记为未测，不再凭“IP 很干净”补成高分。

> **能力边界（诚实说明）**：本工具聚合免费公开数据源，适合做多源交叉的直观参考，
> 不等于权威认证。免费档**无法识别伪装成住宅的超售代理（“万人骑”）**——那需要付费行为数据；
> 公开自测模式的「浏览器环境」只反映 WebRTC 与自动化标志，非 Claude Code 进程检查，也非真去访问 Claude 实测。
> 网络检测反映的是浏览器到当前 PureIP 部署节点的网页体验；HTTP 请求失败率不等同于 ICMP 丢包，
> 结果还会受节点距离和服务端瞬时负载影响。公网下载/上传测速反映的是浏览器到 Cloudflare 边缘节点的
> 应用层吞吐，不等同于运营商实验室或 ICMP 测试，也不能替手动输入的远程 IP 测速。

## Claude Code 本机路径只读检查

有些宿主环境不会提供 `/status`。这时可在 Claude Code 正常发出请求期间运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\audit-claude-route.ps1
```

脚本只报告 Claude Code 是否建立到本机 Clash 端口（默认 `7897`）的连接，以及是否还存在其他已建立连接；
不会输出远端 IP、命令行参数或凭据。看到 `LocalClashLeg = CONFIRMED` 只证明“Claude Code → 本机 Clash”这一段，
还要在 Clash 的连接日志中确认 `api.anthropic.com` 命中预期规则链和最终出口。看到 `UNVERIFIED` 或
`NOT_OBSERVED` 也不能直接判定旁路，可能只是采样时进程没有正在请求。脚本优先识别桌面版内置或独立安装的
`claude-code` 可执行文件，避免把 Claude Desktop 的多个辅助进程混成 Claude Code 结果。

PureIP 的“DNS 黑名单”检查 IP 是否出现在滥用名单中，不是 DNS 泄漏检测。网页检测可以识别最终出口及其
国家、ASN、运营商和网络类型；Clash 内部使用哪个 DNS 上游、该上游是否跟随 AI 规则，则需要本机配置和
连接日志共同判断。

## 数据与隐私

- 检测「当前网络」时，服务端会把当前公网 IP 查询发送给 ip-api、ipwho.is、ipapi.is、IPinfo、
  AbuseIPDB、ProxyCheck、Shodan，以及 DNSBL/DoH 服务；这些第三方会看到被查询的公网 IP。
- 检测「输入指定 IP」时，只会查询用户输入的地址，不会把浏览器环境或当前网络测速结果伪装成该地址的数据。
- 公网测速由浏览器直接连接 Cloudflare 边缘节点。快速模式预计传输 20–40 MB，完整模式预计传输
  80–180 MB；测速不会自动开始。
- PureIP 服务端不保存检测结果。场景评估历史和最近测速结果只保存在当前浏览器 `localStorage`，可随时清空。

## 网络测速说明

- **快速模式**：约 10–15 秒，按网络状况自适应停止，预计消耗 20–40 MB。
- **完整模式**：约 20–30 秒，使用更大的渐进样本，预计消耗 80–180 MB。
- 测速不会自动开始；检测到浏览器流量节省或较慢移动网络时默认使用快速模式。
- Cloudflare SDK 的 `logAimApiUrl` 已显式关闭，PureIP 不提交最终 AIM 报告；测速 HTTP 流量仍会直达
  Cloudflare 边缘节点。结果和最近历史只写入当前浏览器 `localStorage`。
- UDP 丢包没有伪装成 HTTP 指标：在部署自有 TURN 服务前，页面只报告 HTTP 请求失败率。
- 最近一次 30 分钟内的完整测速可参与看剧、浏览、AI 和云游戏场景的网络权重计算。

## API key（全部可选，注册后维度更全）

复制 `config.example.json` 为 `config.json`，填哪个用哪个（都有免费档）：

- **Spamhaus DQS** — 让金标准黑名单真正生效：https://www.spamhaus.com （注册 Data Query Service 免费档，签 datafeed 协议后在 Dashboard 拿 DQS key）
- AbuseIPDB — 1000 次/天：https://www.abuseipdb.com/account/api
- ipinfo Lite — 免费国家+ASN 级：https://ipinfo.io/signup
- ipapi.is — 1000 次/天：https://ipapi.is/app/signup
- ProxyCheck.io — 1000 次/天：https://proxycheck.io/dashboard
- IPQualityScore（可选）— 5000 次/月：https://www.ipqualityscore.com/create-account

## 部署到 Render（推荐）

仓库已含 [`render.yaml`](render.yaml) 蓝图，常驻容器、代理与解锁实测功能完整保留。

1. 把本仓库推到 GitHub。
2. Render → **New → Blueprint**，选中该仓库，它会自动读取 `render.yaml`。
3. 部署时 Render 会提示填 `IPQS_KEY` / `ABUSEIPDB_KEY` / `PROXYCHECK_KEY` 等（`sync:false`
   的密钥不写进仓库）——填了就启用对应风险源，留空也能跑。`TRUST_PROXY=1` 已在蓝图里设好。
4. 部署完成后访问 Render 给的 `https://<name>.onrender.com` 即可，可再绑自定义域名。

> 免费套餐闲置会休眠，首次访问冷启动约 30 秒；要一直在线可升级到付费实例。

### 密钥用环境变量（托管平台）

托管环境不要提交 `config.json`，改用环境变量（在 Render 后台或蓝图里设）：

| 变量 | 对应数据源 |
|---|---|
| `SPAMHAUS_DQS_KEY` | Spamhaus ZEN（DQS 金标准黑名单） |
| `ABUSEIPDB_KEY` | AbuseIPDB |
| `IPINFO_KEY` | ipinfo Lite |
| `IPAPIIS_KEY` | ipapi.is |
| `PROXYCHECK_KEY` | ProxyCheck.io |
| `IPQS_KEY` | IPQualityScore（可选） |

环境变量优先于 `config.json`；本地开发仍可用 `config.json`。

### 运行时环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | 3210 | 监听端口（Render 会自动注入） |
| `HOST` | 0.0.0.0 | 监听地址 |
| `TRUST_PROXY` | 关 | **反代后必须设为 `1`**，否则取到的是反代 IP 而非访客真实 IP（取 `X-Forwarded-For` 最左值） |
| `ENABLE_PROXY_MODE` | 跟随 `!TRUST_PROXY` | 代理/解锁实测端点开关。公开部署默认关闭防 SSRF；⚠️ **切勿在公网服务器上开启** |
| `GLOBAL_MAX` | 300 | 全局每分钟请求上限（兜底 XFF 伪造绕过单 IP 限流） |
| `NETWORK_PROBES_JSON` | 当前节点 | 区域探针数组，例如 `[{"id":"singapore","label":"新加坡","url":"https://probe.example.com"}]`；生产仅接受 HTTPS |
| `PROBE_ONLY` | 关 | 设为 `1` 后只开放根健康信息与 `/api/network/*`，不暴露 IP 情报接口 |
| `PROBE_REGION` | 当前节点 | 区域探针显示名称 |

仓库的 `render.yaml` 已包含 Oregon、Singapore、Frankfurt 三个免费区域探针。Render 免费服务闲置后会休眠，
因此区域节点的第一次采样可能包含冷启动时间；前端会将不可达节点标记为未测，不会静默按满分计算。

仓库同时包含 GitHub Actions 校验流程。推送前应确保 `npm run check` 与 `npm audit --omit=dev` 通过；
推送 `main` 后，Render Blueprint 中启用 `autoDeploy` 的服务会自动使用 `npm ci` 进行可复现构建。

### 其他部署方式

Docker（Railway / Fly.io / 自建 VPS 通用）：

```bash
docker build -t pureip .
docker run -d -p 3210:3210 -e TRUST_PROXY=1 -e IPQS_KEY=xxx --name pureip pureip
```

安全与性能：代理/解锁端点在公开部署默认禁用（防 SSRF）；IP 输入校验；每 IP 每分钟 40 次
+ 全局每分钟上限双层限流；查询结果按 IP 缓存 10 分钟。检测数据不落库，历史记录仅存访客浏览器本地。

前后端共用同一套公网 IPv4 / IPv6 校验，拒绝私网、CGNAT、链路本地、组播、文档和其他保留地址。
风险评分只使用服务端查询或缓存的证据，不接受客户端回传的信誉标记；同一 IP 的并发查询会合并，避免击穿
第三方 API 配额。服务端还会限制 JSON 请求体大小，并返回基础安全响应头。

## 开发验证

```bash
npm ci
npm run check
npm audit --omit=dev
```

自动化测试覆盖公网 IP 边界、风险证据信任边界、五场景证据角色/弱信号/缺失区间、代理 dispatcher、静态资源、
安全响应头和本地服务冒烟流程。涉及真实第三方 API、平台解锁和大流量公网测速的测试仍应按需手动执行，
以免无意消耗配额或流量。

## 参考

- [xykt/IPQuality](https://github.com/xykt/IPQuality) — bash 版 IP 质量检测脚本
- [jason5ng32/MyIP](https://github.com/jason5ng32/myip) — ipcheck.ing 开源版
- [cloudflare/speedtest](https://github.com/cloudflare/speedtest) — MIT 开源公网测速引擎
- [librespeed/speedtest](https://github.com/librespeed/speedtest) — 多节点与稳定性测试设计参考
- [Claude Code 网络、地区与账号风控：证据复核](docs/research/claude-code-network-risk.md) — X 长文、官方规则、开源复现与本机 Clash 二跳审计
