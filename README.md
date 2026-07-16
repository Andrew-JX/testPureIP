# PureIP — IP 纯净度 & AI Agent 可用性检测

一个可自托管的场景化 IP 与网络检测站。可以检测当前出口，也可以手动输入公网 IPv4 / IPv6，
然后按 **AI 工具、轻松上网、账号/邮箱、看剧、打游戏** 五种用途重新评估同一份证据。
结果会明确区分完整实测与 IP 侧预评估，并显示可信度、缺失权重和合理分数区间。

## 快速开始

```bash
npm install
npm start                 # 默认 http://0.0.0.0:3210
```

打开页面选择用途和「当前网络 / 输入指定 IP」，再开始检测即可。运营者本人还可展开「高级」面板，填入
`socks5://…` 或 `http://…` 代理去检测其他地区节点（新加坡等），高级模式会额外做
AI / 流媒体解锁实测。

## 检测模块

| 模块 | 数据源 | 说明 |
|---|---|---|
| 场景化评分 | 六类底层证据 | 五种用途使用不同权重；缺失项不按满分处理，指定 IP 显示预评估区间与可信度 |
| 手动 IP | 现有 IP 情报接口 | 支持公网 IPv4 / IPv6；拒绝私网、回环、保留及无效地址；不伪造浏览器和网络实测 |
| 结论与建议 | 汇总各项 | 按当前用途总结能不能用，优先列出最相关的风险点与操作建议 |
| AI Agent 可用性 | 客户端指纹 + IP 侧信号 | 时区/IP 一致性、简中语言、中文字体、**WebRTC 泄漏**、`navigator.webdriver` 自动化标志、机房/代理/Tor/滥用标记，综合判断 AI 服务是否会风控 |
| 网络稳定性 | 浏览器到 PureIP/区域探针 | 空闲与负载双阶段采样、P95、抖动、HTTP 请求失败率、3 路并发下载，并显示美国/新加坡/欧洲等可配置区域节点 |
| IP 详情 | ipapi.is + 客户端 | IP 属性(住宅/机房/移动)、AS 域名、IP 网段、路由前缀、带国旗位置、滥用评分、**浏览器指纹**、WebRTC 泄漏 |
| 多源地理核对 | ip-api / ipwho.is / ipapi.is / **ipinfo Lite** | 5 源交叉验证位置、ASN、ISP、rDNS、机房/住宅/移动标记 |
| 风险评分 | ProxyCheck.io / AbuseIPDB / ipapi.is 滥用 / Shodan 暴露面 | 0-100 欺诈/信誉分聚合；Shodan 查暴露的代理端口 |
| DNS 黑名单 | **Spamhaus ZEN(DQS)** / SpamCop / DroneBL / PSBL / s5h 等 | 走 DoH 查询规避云端拒查；显示有效覆盖度，避免假阴性 |
| 解锁实测（仅高级） | 走代理直连目标 | Claude、ChatGPT、Gemini、Netflix、YouTube Premium、Disney+、TikTok，识别地区码 |

场景档位：≥85 非常适合 / ≥70 适合 / ≥55 勉强可用 / <55 不推荐。

> **能力边界（诚实说明）**：本工具聚合免费公开数据源，适合做多源交叉的直观参考，
> 不等于权威认证。免费档**无法识别伪装成住宅的超售代理（“万人骑”）**——那需要付费行为数据；
> 公开自测模式的「AI Agent」分是基于 IP 与浏览器环境的**推断**，非真去访问 Claude 实测。
> 网络检测反映的是浏览器到当前 PureIP 部署节点的网页体验；HTTP 请求失败率不等同于 ICMP 丢包，
> 结果还会受节点距离和服务端瞬时负载影响。

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

### 其他部署方式

Docker（Railway / Fly.io / 自建 VPS 通用）：

```bash
docker build -t pureip .
docker run -d -p 3210:3210 -e TRUST_PROXY=1 -e IPQS_KEY=xxx --name pureip pureip
```

安全与性能：代理/解锁端点在公开部署默认禁用（防 SSRF）；IP 输入校验；每 IP 每分钟 40 次
+ 全局每分钟上限双层限流；查询结果按 IP 缓存 10 分钟。检测数据不落库，历史记录仅存访客浏览器本地。

## 参考

- [xykt/IPQuality](https://github.com/xykt/IPQuality) — bash 版 IP 质量检测脚本
- [jason5ng32/MyIP](https://github.com/jason5ng32/myip) — ipcheck.ing 开源版
