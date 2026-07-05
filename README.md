# PureIP — IP 纯净度 & AI Agent 可用性检测

一个可自托管的公开 IP 检测站：访客打开页面，点一下「检测我的 IP」，即可对自己当前
出口 IP 给出**纯净度评分**——多源风险评分、住宅/机房识别、DNS 黑名单，外加招牌的
**AI Agent 可用性强力检测**（评估 Claude / ChatGPT 等服务是否会拦截或风控该环境）。

## 快速开始

```bash
npm install
npm start                 # 默认 http://0.0.0.0:3210
```

打开页面直接点「检测我的 IP」即可。运营者本人还可展开「高级」面板，填入
`socks5://…` 或 `http://…` 代理去检测其他地区节点（新加坡等），高级模式会额外做
AI / 流媒体解锁实测。

## 检测模块

| 模块 | 数据源 | 说明 |
|---|---|---|
| 综合评分 | 下列各项加权 | 自测：风险 36% + IP 类型 26% + 黑名单 14% + AI Agent 24% |
| AI Agent 可用性 | 客户端指纹 + IP 侧信号 | 时区/IP 一致性、简中语言、中文字体、**WebRTC 泄漏**、`navigator.webdriver` 自动化标志、机房/代理/Tor/滥用标记，综合判断 AI 服务是否会风控 |
| 基础信息 | ip-api / ipwho.is / ipapi.is / ipinfo.io | 多源交叉验证位置、ASN、ISP、rDNS、机房/住宅/移动标记 |
| 风险评分 | ProxyCheck.io / AbuseIPDB / IPQS / ipapi.is | 0-100 欺诈分聚合，代理/VPN/Tor/近期滥用标记 |
| 暴露面 | Shodan InternetDB（免费无限制） | 住宅 IP 挂着 1080/3128 等代理端口 = 共享/滥用的硬信号 |
| DNS 黑名单 | Spamhaus / SpamCop / Barracuda 等 8 个 | 该 IP 有没有发垃圾/滥用历史 |
| 解锁实测（仅高级） | 走代理直连目标 | Claude、ChatGPT、Gemini、Netflix、YouTube Premium、Disney+、TikTok，识别地区码 |

评分档位：≥85 纯净 / ≥70 良好 / ≥55 一般 / ≥35 较差 / <35 高风险预警。

## API key（可选，注册后风险维度更全）

复制 `config.example.json` 为 `config.json`，填哪个用哪个（都有免费额度）：

- AbuseIPDB — 1000 次/天：https://www.abuseipdb.com/account/api
- IPQualityScore — 5000 次/月：https://www.ipqualityscore.com/create-account
- ipinfo.io — 50000 次/月：https://ipinfo.io/signup
- ipapi.is — 1000 次/天：https://ipapi.is/app/signup
- ProxyCheck.io — 1000 次/天：https://proxycheck.io/dashboard

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
| `IPQS_KEY` | IPQualityScore |
| `ABUSEIPDB_KEY` | AbuseIPDB |
| `PROXYCHECK_KEY` | ProxyCheck.io |
| `IPINFO_KEY` | ipinfo.io |
| `IPAPIIS_KEY` | ipapi.is |

环境变量优先于 `config.json`；本地开发仍可用 `config.json`。

### 运行时环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | 3210 | 监听端口（Render 会自动注入） |
| `HOST` | 0.0.0.0 | 监听地址 |
| `TRUST_PROXY` | 关 | **反代后必须设为 `1`**，否则取到的是反代 IP 而非访客真实 IP（取 `X-Forwarded-For` 最左值） |

### 其他部署方式

Docker（Railway / Fly.io / 自建 VPS 通用）：

```bash
docker build -t pureip .
docker run -d -p 3210:3210 -e TRUST_PROXY=1 -e IPQS_KEY=xxx --name pureip pureip
```

内置每 IP 每分钟 40 次的简易限流；检测数据不落库，历史记录仅存在访客浏览器本地。

## 参考

- [xykt/IPQuality](https://github.com/xykt/IPQuality) — bash 版 IP 质量检测脚本
- [jason5ng32/MyIP](https://github.com/jason5ng32/myip) — ipcheck.ing 开源版
