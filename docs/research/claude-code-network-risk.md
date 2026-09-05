# Claude Code 网络、地区与账号风控：证据复核

> 调研日期：2026-09-04
> 目的：复核 [@app_sail 的 X 帖](https://x.com/app_sail/status/2072494971643715658)、Claude Code 账号封禁讨论、Anthropic 官方规则和相关开源检查实现，并给 PureIP 的场景判断提供证据边界。
> 安全边界：本文不提供伪造地区、身份、支付资料或绕过平台风控的做法；网络建议只面向合规接入、路由完整性和故障诊断。

## 结论先行

1. **中国大陆出口可以是“低滥用、很纯净的 IP”，但仍不具备 Claude 服务地区资格。** Anthropic 当前支持地区列表包含台湾、新加坡、美国等，但不包含中国大陆；官方申诉说明也把“从不支持地区创建账号”列为可能封禁原因之一。因此 PureIP 不能用一个总分混淆“IP 信誉”和“服务可用资格”。来源：[支持地区](https://www.anthropic.com/supported-countries)、[警告与申诉](https://support.claude.com/en/articles/8241253-safeguards-warnings-and-appeals)。
2. **代理或 VPN 本身不是官方公布的违规项。** Claude Code 官方文档明确支持 `HTTP_PROXY` / `HTTPS_PROXY`、企业代理、自定义 CA 和多数常见 VPN/LLM proxy。风险来自所在地区是否受支持、账号/访问是否符合条款、是否使用未授权转售或批量滥用网络，以及链路是否意外直连，而不能简化成“检测到 VPN/机房 IP = 高风险”。来源：[企业网络配置](https://code.claude.com/docs/en/corporate-proxy)、[数据使用与网络流](https://code.claude.com/docs/en/data-usage)。
3. **Claude Code 历史版本确有一段未公开的端点/时区标记逻辑，但不能把它外推为当前封号公式。** 官方仓库 issue 展示了旧二进制中对第三方 `ANTHROPIC_BASE_URL`、`Asia/Shanghai` / `Asia/Urumqi` 和特定域名/关键词的编码；Claude Code 工程师称其为 2026 年 3 月启动的反转售、反蒸馏实验，并称已合并回滚。没有官方资料证明“时区一命中就进入封号队列”，也没有公开任何 40/35/25 风险权重。来源：[官方仓库 issue #67120](https://github.com/anthropics/claude-code/issues/67120)、[工程师回应](https://x.com/trq212/status/2072079729331777817)、[Claude Code changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)。
4. **X 长文中“改台北时区、TUN 隐身、全套美国身份/支付”属于个人经验与规避性推断，不是官方规则。** 尤其是提供不准确账号或账单信息、伪装位置、绕过保护措施，可能与“资料正确、当前、完整”及不得绕过保护措施的条款相冲突。来源：[Consumer Terms 第 2、3 节](https://www.anthropic.com/legal/consumer-terms)。
5. **对 PureIP，当前最重要的修正不是增加更多“指纹扣分”，而是拆分结论并降低无证据规则的权威感。** “信誉”“地区资格”“传输路径”“服务实测”“证据可信度”应分别显示；浏览器时区与 IP 不一致不应影响“轻松上网”，简中语言、中文字体不应被表述为 Claude 风控事实，单个 403 也不能直接归因为 IP 信誉差。

## 证据等级

- **官方明确**：Anthropic 条款、支持/隐私/产品文档、Anthropic 公开说明。
- **官方人员或官方仓库中的可复核材料**：能证明某段历史实现或人员表态，但 GitHub issue 本身仍可能由社区用户提交，不能自动视作正式政策。
- **开源复现**：可审查其源码和方法；只能证明该工具对特定版本或样本的观察，作者自定权重不是 Anthropic 权重。
- **社区观察/推测**：账号案例、相关性和个人经验；不能据此推出因果关系或完整风控规则。

## 1. 用户给出的 X 帖到底说了什么

[该 X 帖](https://x.com/app_sail/status/2072494971643715658)本身只有一个 X Article 链接，长文标题为“Claude Code 最新防封号完全指南（2026 年 7 月）”。公开嵌入元数据显示，作者称自己曾被封 6 个账号，之后使用“美国 VPS + 美国手机号 + 美区 Apple Pay”的新账号数月未再被封。完整文章在未登录 X 页面上不能稳定读取；[可检索到的转载](https://cbshs.com/ChatGPT/claude-code-ban-prevention-guide/)用于核对其具体主张，不能替代官方证据。

文章的主要主张及复核结果如下：

| 长文主张 | 复核结论 | 证据级别 |
|---|---|---|
| 旧版 Claude Code 会读取第三方 Base URL、特定中国时区和域名关键词，并把结果编码进 system prompt 的日期/撇号 | **历史机制有较强证据。** 官方仓库 issue 给出反编译逻辑；工程师承认这是反转售/反蒸馏实验，并表示会回滚 | 官方人员表态 + 官方仓库可复核材料 |
| 只要使用上海/乌鲁木齐时区，就会进入封号队列 | **未证实且表述过度。** 公开复现显示旧逻辑先对第一方端点短路；没有第三方 `ANTHROPIC_BASE_URL` 时不应触发该编码。也没有官方资料公开“封号队列”或阈值 | 社区推测 |
| 将时区改为台北能降低封号风险 | **不建议。** 这属于伪装环境，不是合规修复；官方只明确使用 IP 和“其他信号”做国家/地区级定位，没有公布时区匹配规则 | 规避性推测 |
| TUN 比系统代理安全，因为客户端看不见代理 | **不能作为防封结论。** TUN 可改善全流量覆盖，但 Claude Code 官方明确、正常支持代理环境变量；“隐藏代理”不是合规目标 | 技术事实与不受支持推断混合 |
| 美国 VPS、美国手机号、美区支付方式是账号稳定的必要条件 | **无官方依据。** 文章只有单用户幸存案例，无法排除使用模式、账号历史、支付真实性等变量 | 个人经验 |
| 国内大厂海外节点、机房 IP 必然比独立/住宅 IP 更危险 | **无公开阈值或必然关系。** Anthropic 的反蒸馏报告确实提到 IP 关联、请求元数据、基础设施指标和大规模账号网络，但没有公布面向正常用户的 ASN/住宅评分表 | 有背景依据，具体结论属推测 |

### 历史标记机制的准确边界

[issue #67120](https://github.com/anthropics/claude-code/issues/67120) 对 Claude Code 2.1.169 的静态检查显示：

- 仅当设置了非第一方 `ANTHROPIC_BASE_URL` 时才进入分类；未设置 Base URL 或端点为 `api.anthropic.com` 时短路。
- 分类信号包括 `Asia/Shanghai` / `Asia/Urumqi`、约 150 个域名以及若干实验室关键词。
- 结果通过日期分隔符和视觉相近的 Unicode 撇号进入发往端点的 system prompt。

[Claude Code 工程师 Thariq Shihipar](https://x.com/trq212/status/2072079729331777817) 将其描述为 3 月启动、用于防范未授权转售商和模型蒸馏的实验，并称更强的缓解措施已落地、回滚 PR 已合并。公开 changelog 的 2.1.197 条目没有明确写出这次回滚，因此严谨说法应是“工程师宣布并安排回滚”，而不是仅凭 changelog 声称所有后续版本都已独立验证无此逻辑。

## 2. Anthropic 官方明确了什么

### 2.1 地区资格与位置判断

- Consumer 和 Commercial 条款都要求只在 Anthropic 当前支持的国家/地区使用服务。中国大陆不在当前 Claude.ai/API 支持列表中；台湾、新加坡、美国等在列表中。来源：[Supported countries & regions](https://www.anthropic.com/supported-countries)、[Consumer Terms 3](https://www.anthropic.com/legal/consumer-terms)、[Commercial Terms D.2](https://www.anthropic.com/legal/commercial-terms)。
- Anthropic 明确说明，面向 Claude Free/Pro/Max 以及这些账号使用 Claude Code 时，会使用 **IP 地址和其他信号**推断国家/地区级位置，以执行条款、防滥用和展示区域功能；该安全用途不能关闭。官方没有在该文档中枚举“其他信号”的完整清单或权重。来源：[Does Claude use my location?](https://privacy.claude.com/en/articles/11186740-does-claude-use-my-location)。
- 官方申诉页列出的封禁原因包括反复违反 Usage Policy、从不支持地区创建账号、违反 Terms。来源：[Safeguards warnings and appeals](https://support.claude.com/en/articles/8241253-safeguards-warnings-and-appeals)。

### 2.2 代理、VPN 和企业网络

- Claude Code 尊重 `HTTPS_PROXY`、`HTTP_PROXY`、`NO_PROXY`，并有企业代理、自定义 CA、mTLS 的正式配置文档。来源：[Enterprise network configuration](https://code.claude.com/docs/en/corporate-proxy)、[Environment variables](https://code.claude.com/docs/en/env-vars)。
- 官方数据流文档称本地 Claude Code 与多数常见 VPN 和 LLM proxy 兼容。这个表述说明“用了代理/VPN”不能单独视为违规或封号原因。来源：[Data usage](https://code.claude.com/docs/en/data-usage)。
- `ANTHROPIC_BASE_URL` 也是官方支持的网关配置项，企业安全文档给出使用自有代理进行凭据注入、审计和域名 allowlist 的模式。它与灰色转售中转不是同一概念；应依据运营主体、授权和用途判断。来源：[Securely deploying AI agents](https://code.claude.com/docs/en/agent-sdk/secure-deployment)。
- 官方要求的网络目标至少包括 `api.anthropic.com`、`claude.ai`、`platform.claude.com`，更新/插件功能还可能需要 `downloads.claude.ai`、`storage.googleapis.com`、`raw.githubusercontent.com` 等。来源：[Network access requirements](https://code.claude.com/docs/en/corporate-proxy#network-access-requirements)。

### 2.3 账号、转售、自动化与执行措施

- Consumer 账号资料必须正确、当前、完整；不得共享登录信息、API key 或把账号提供给他人。来源：[Consumer Terms 2](https://www.anthropic.com/legal/consumer-terms)。
- 不得转售服务、训练竞争模型、抓取服务、帮助他人实施这些行为，或绕过系统/保护措施。Consumer 服务除 API key 或官方明确允许外，也不得通过自动化/非人方式访问。Claude Code 本身是官方允许的原生产品，不应把正常 Claude Code 使用误判为该禁止项。来源：[Consumer Terms 3](https://www.anthropic.com/legal/consumer-terms)。
- Anthropic 可就 Usage Policy、Consumer/Commercial Terms 或 Supported Region Policy 违规采取警告、暂停或终止措施。被封用户可提交申诉。来源：[Transparency Hub](https://www.anthropic.com/transparency/system-trust-reporting)、[Safeguards warnings and appeals](https://support.claude.com/en/articles/8241253-safeguards-warnings-and-appeals)。
- 在反蒸馏案例中，Anthropic 公布的归因依据包括 IP 地址关联、请求元数据、基础设施指标、跨账号同步流量、异常规模和合作方佐证；所描述的是约 24,000 个欺诈账号和数百万级交互的协同行为，不是普通个人的单一 IP 分。来源：[Detecting and preventing distillation attacks](https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks)。

## 3. 官方仓库中的账号案例能证明什么

这些 issue 在 Anthropic 官方仓库中，但内容由用户提交。它们能证明“存在报告”，不能证明 Anthropic 已确认根因。

- [#51583](https://github.com/anthropics/claude-code/issues/51583) 报告付费 Max 用户在企业 VPN 环境下账号被禁用；issue 被标为 `duplicate`，没有官方根因说明。
- [#5088](https://github.com/anthropics/claude-code/issues/5088) 聚集了大量 “organization disabled” 报告。有人怀疑 VPN、多设备或账号切换，也有人明确称从未使用 VPN、固定设备和 IP 仍被封。它反而说明不能从“封禁后曾用 VPN”推出 VPN 是原因。
- [#532](https://github.com/anthropics/claude-code/issues/532) 和 [#30318](https://github.com/anthropics/claude-code/issues/30318) 主要是 VPN/代理下连接失败或 403 的网络问题，不是账号封禁的已确认案例。

因此，下列说法均应保持为“未验证”：

- VPN、机房 IP、时区/IP 不一致、中文字体、简体中文语言分别有固定扣分；
- 住宅 IP 一定比企业或云网络安全；
- 固定 IP 是账号存活的必要条件；
- 某个 403 就等于账号已被风控或 IP 信誉差；
- 手机号国家、支付卡 BIN、设备指纹各自有公开权重。

## 4. 开源检查实现能证明什么

### `shellus/claude-cn-flag-check`

[README](https://github.com/shellus/claude-cn-flag-check) 声称默认通过本地捕获 Claude Code 请求，观察日期分隔符和撇号，而不是仅按输入猜测；其 [`src/detect.js`](https://github.com/shellus/claude-cn-flag-check/blob/main/src/detect.js) 复写了针对 2.1.170 的旧版逻辑，并明确在第一方端点时短路。

可采用的证据：

- 特定旧版本、第三方 Base URL 下，时区/域名分类和 prompt 编码可以被本地复现。
- 检查工具可以区分“实际捕获”和“计算预测”，这个证据表达方式值得 PureIP 借鉴。

不能采用为官方事实的部分：

- 该项目的 `40/35/25` 权重和 0–100 等级是作者自行定义，不是从 Anthropic 服务端获得的封号概率。
- README 中“会进入封号队列”等描述没有公开的服务端证据。
- README 提供的改时区、挑域名、强制假定第一方等规避建议不应进入 PureIP。
- 该项目验证的是历史版本；不能用它证明当前 Claude Code 或其他 AI 服务仍使用同一逻辑。

## 5. Clash + 二跳 + 分流的合规检查清单

下面只检查“请求是否按预期、完整、可审计地走既定链路”，不用于把不支持地区伪装成支持地区。

### 必须确认

1. **地区前提**：实际使用者及服务使用应符合 [Supported Regions Policy](https://www.anthropic.com/supported-countries)。如果实际位于不支持地区，换出口、改时区或伪造账号资料不是合规补救；应停止 Consumer 直连，向 Anthropic/组织法务确认可用的官方或合同路径。
2. **端点成组分流**：至少把 `api.anthropic.com`、`claude.ai`、`platform.claude.com` 作为同一服务组审计，确保认证和模型请求不会分别从不同出口或一条直连、一条代理。更新相关域名按实际安装方式补齐。
3. **失败关闭**：二跳失效时不要静默回落到直连。应明确报错，避免同一会话突然改变出口、泄漏真实路径或造成难以解释的认证失败。
4. **DNS、IPv4、IPv6 同策略**：确认域名解析和 A/AAAA 连接都受同一策略控制。只代理 IPv4 而让 IPv6 直连，是常见的链路完整性问题。
5. **客户端实际生效**：TUN、系统代理和 `HTTP_PROXY`/`HTTPS_PROXY` 都只是实现手段。应以 Claude Code 进程实际使用的出口和 `/status`/连接日志为准，而不是以 Clash 面板显示“已连接”为准。
6. **只使用可信端点**：优先 Anthropic 第一方端点；企业确需网关时使用组织批准、自控且有 TLS/日志/凭据边界的网关。不要使用来源不明的低价中转、共享账号或转售 token。
7. **保持资料真实**：系统时区应反映用户真实偏好/位置，账号、手机号和账单资料应正确，不为匹配出口而伪造。
8. **保持客户端更新**：升级到当前受支持版本；若审计历史标记机制，应记录 Claude Code 精确版本和是否设置第三方 `ANTHROPIC_BASE_URL`，不要用当前环境倒推过去是否命中。

### 可选但有价值

- 对二跳链路分别记录：入口代理、第二跳出口 ASN/国家、DNS 出口、IPv4 出口、IPv6 出口、失败回退策略、对应 Clash 规则名。
- 对认证、API、下载和可选遥测分别做连通性测试；“可访问首页”不等于 OAuth、API 和更新链路都正常。
- 企业 TLS 检查只在组织管理的 CA 和代理下使用；避免个人未知 MITM。官方 CA 配置见[企业网络配置](https://code.claude.com/docs/en/corporate-proxy#custom-ca-certificates)。
- 为诊断稳定性可固定一个受管理出口，但应标注这是减少会话漂移和方便排障的工程建议，**不是官方公布的防封规则**。

### 不建议

- 为“骗过检测”改系统时区、语言、字体或设备区域；
- 清除代理变量只为了让客户端看不见代理，导致实际请求失去可控路由；
- 把本地 TUN 等同于“官方看不见代理”或“账号绝对安全”；
- 使用虚假手机号、账单地址、支付身份、成品号或共享订阅；
- 根据单一 IP 查询站的“纯净分”决定账号是否安全。

## 6. PureIP 当前实现应如何调整

> 本轮实现状态（2026-09-04）：五个场景已统一使用同一评估入口，每个维度都声明证据来源、强度、是否计分
> 及是否可能触发硬门槛；页面仍保留一个便于同场景比较的总分。浏览器检查与 Claude Code 本机路径检查分开，
> 后者通过只读 PowerShell 脚本完成，不把网页能力冒充本机进程能力。

### 6.1 本轮已处理

1. **用途与资格分层。** 场景总分分别展示信誉、网络身份、地区资格、网络、服务实测、浏览器环境和证据缺失；
   中国大陆出口在 AI、跨境浏览和国际流媒体场景下仍有 45 分硬上限。账号/邮箱不再套用一个覆盖所有服务的
   中国大陆门槛；未指定并实测 Gmail、Outlook 或社媒时，地区与服务保持未测。
2. **移除无依据的环境扣分。** [`public/app.js`](../../public/app.js) 不再因时区/IP 不同、简中语言或中文字体
   扣分，也不再建议为追分去修改这些正常偏好。
3. **按用途统一分配证据。** [`public/scenarios.js`](../../public/scenarios.js) 是唯一场景评估入口。AI、账号、看剧、
   游戏会把机房、代理、VPN、共享出口和第三方通用风险分作为有上限的弱上下文；轻松上网只展示这些信息，
   不让它们降低浏览体验分。真实服务结果在 AI 与看剧中明显重于网络身份标签。
4. **网络类型不再冒充滥用，但也没有被抹掉。** 信誉维度只使用已确认滥用、Tor、DNS 黑名单、开放代理端口
   与漏洞；网络身份维度单独承接代理/VPN/机房/共享属性。页面会明确写“弱上下文”，不表述成平台封号公式。
5. **Claude 可达性测试更接近真实路径。** [`src/checks/unlock.js`](../../src/checks/unlock.js) 的完整通过现在要求
   Claude 网页与 `api.anthropic.com` 都可达；403 只表示当前出口请求被拒，不再武断归因为 IP 信誉。
6. **浏览器与 CLI 分层。** 页面已把“AI Agent”改为“浏览器环境”，明确 WebRTC/`navigator.webdriver` 不等于
   Claude Code 进程检查，也不预测官方封号。仓库新增 `scripts/audit-claude-route.ps1`，只读检查运行中的
   Claude Code 是否连接本机 Clash 端口；它不会输出远端 IP、进程命令行或凭据。

### 6.2 本机 Clash / Claude Code 只读审计

审计时间为 2026-09-04。读取了 Clash Verge Rev 的应用设置、当前生成配置、配置档索引与增强脚本，
并检查了 Claude Code 版本、用户级环境变量、npm/git 代理项和 Claude settings；订阅 URL、节点服务器、
代理凭据、账号信息与真实公网 IP 均未记录。

### 已确认

- Clash Verge 正在使用规则模式；系统代理已开启，TUN 未开启，LAN 访问关闭。
- 生成后的规则顶部已把 `anthropic.com`、`claude.ai`、`claudeusercontent.com` 指向 `AI住宅出口`。
  因为使用 `DOMAIN-SUFFIX,anthropic.com`，`api.anthropic.com`、`statsig.anthropic.com`、
  `downloads.claude.ai` 均在该组覆盖范围内。`platform.claude.com` **不是**这两个后缀的子域，
  当前是否同样走 AI 组尚未验证。
- 二跳结构确实存在：最终 SOCKS5 出口通过 `dialer-proxy: AI首跳` 建立连接；当前生成配置提供美国和澳洲
  两个最终出口，首跳组单独选择。选中的最终住宅出口失效时没有自动 `DIRECT` 回落；普通节点是人工可选兜底。
- 当前实际请求来自 Claude Desktop 内置的 Claude Code `2.1.247`；PATH 上另有一个 `2.1.132` 安装入口，
  两者不能混为同一运行版本。本机用户环境、npm/git 代理设置、Claude 用户 settings 与已保存的 shell
  snapshot 中均未发现 `ANTHROPIC_BASE_URL`；因此公开复现所述的“第三方 Base URL 隐写标记”触发前提未出现。
  本地二进制含 `Asia/Shanghai` / `Asia/Urumqi` 等字符串只能证明代码素材存在，不能单独证明当前请求被标记。

### 必须补充或确认

1. **Claude Code 进程实际走向已确认。** 当前是“系统代理开、TUN 关”，Claude Code `2.1.247` 进程已观察到
   连接本机 `7897`；同一时段的 `api.anthropic.com` 连接命中 `anthropic.com → AI住宅出口 → US-Los-SOCKS5`，
   该 SOCKS5 使用 `dialer-proxy: AI首跳`，首跳当时为美国中转节点。用户环境返回
   `/status isn't available in this environment.` 不影响这条证据；[官方命令文档](https://code.claude.com/docs/en/commands)
   也说明命令可用性会随平台、套餐和环境变化。官方建议的
   `curl.exe -I https://api.anthropic.com` 只能确认同一 shell 的基本可达性，不能证明 Claude Code 进程或最终出口。
   该 curl 方法来自[官方错误参考](https://code.claude.com/docs/en/errors#unable-to-connect-to-api)。
2. **Claude 域名交给 Clash 处理，但 DNS 上游没有与 AI 出口对齐。** 实际 `api.anthropic.com` 连接以 HTTPS
   代理入站进入 Clash，并按域名规则匹配；这排除了该次 Claude 请求自行直连目标的情况。Mihomo 核心启用了
   IPv6，DNS 模块关闭 AAAA 返回；上游是阿里/腾讯系 DNS，且未启用 `respect-rules`。Mihomo 官方文档说明
   `respect-rules` 用于让 DNS 连接遵循路由规则，因此当前不能声称 DNS 上游也从美国住宅出口发出。
   来源：[Mihomo DNS 配置](https://wiki.metacubex.one/en/config/dns/)。IPv6 对其他不遵循系统代理的程序是否旁路
   仍未验证，不能从 Claude 这一次 HTTPS 代理连接外推到整台机器。
3. **官方要求的辅助域名未全部固定到 AI 组。** `raw.githubusercontent.com` 不在当前 AI 置顶规则中，会落入
   订阅的普通规则；它用于 release notes 和插件市场计数，不等同于模型请求。官方当前文档将
   `storage.googleapis.com` 限为 2.1.116 之前的原生安装/更新需求，因此本机 2.1.132 不应仅为它扩大规则范围；
   `sentry.io` 属于可选运维流量。是否同出口应按实际连接日志精确到主机名后再加规则，避免把所有 Sentry 或
   Google Storage 流量笼统塞进住宅出口。
4. **本次配置重新生成后，增强规则仍然存在。** 全局增强脚本写入时间早于当前生成配置；当前生成配置仍包含
   8 条 AI 域名规则、`AI住宅出口`、`AI首跳` 和两个 `dialer-proxy: AI首跳`。这确认了本次生成没有冲掉规则。
   升级 Clash Verge、迁移机器或改用不加载全局增强的配置后，仍应重新检查生成结果。

### 当前结论

这套二跳的核心请求路径已闭环：Claude Code → 本机 Clash → AI 规则 → 美国住宅 SOCKS5，且该出口通过
Claude 自身的 Cloudflare trace 显示为美国、LAX、IPv4。剩余差异是 DNS 上游未跟随美国住宅规则，以及整机
其他程序的 IPv6 路径没有做全局审计。`/status` 不可用不会改变这个结论。

### 6.4 AI 场景专项复核（2026-09-04）

#### 已修正的 PureIP 判断缺口

此前“AI 工具”会平均 Claude、ChatGPT、Gemini 的探测结果，并在任一服务成功时解除整个 AI 场景的地区上限。
这会让“Gemini 可达”错误地为“Claude Code 可用”背书。现在页面可选 `Claude Code / Claude`、`ChatGPT`、
`Gemini` 或“任一已测 AI 服务”，默认是 Claude；地区门槛和服务路径实测只按所选服务判断。公开入口实测也改称
“入口可达 / 当前受限”，不再把未携带凭据的 HTTP 结果写成“账号可用”。

#### 对 Claude Code 应加强的检查

1. **进程路径已经实测。** Claude Code 正在生成回复时，`scripts/audit-claude-route.ps1` 观察到内置
   Claude Code `2.1.247` 连接 `7897`；Clash 连接数据把 `api.anthropic.com` 对应到预期住宅链路。旧脚本曾把
   `Get-CimInstance` 权限失败吞掉后误报“没有进程”，现已改用 `Get-Process` 并提供连接查询回退。
2. **将显式代理作为待验证的配置选项。** 官方明确支持在启动前设置 `HTTPS_PROXY` / `HTTP_PROXY`，也允许在
   Claude settings 的 `env` 块配置；这比仅依赖 Windows 系统代理更容易审计。若确认 `7897` 仍为 Clash mixed-port，
   可在一次可回退的测试会话中把两个变量指向 `http://127.0.0.1:7897`，并检查没有意外的 `NO_PROXY` 规则。
   这是“让路径可验证”的建议，不是伪装位置；本轮没有改写用户的 Claude 或 Clash 配置。来源：[企业代理配置](https://code.claude.com/docs/en/corporate-proxy)、[环境变量](https://code.claude.com/docs/en/env-vars)。
3. **把 DNS/IPv6 作为同一条链路检查。** 显式代理路径验证通过后，才可在独立测试中评估
   `CLAUDE_CODE_PROXY_RESOLVES_HOSTS=1` 是否让代理负责解析，从而减少本地 DNS 与最终出口不一致；它是官方提供的
   可选变量，不能代替实测，也不应和多项网络改动同时开启。来源：[环境变量](https://code.claude.com/docs/en/env-vars)。
4. **补齐精确域名，而不是扩大泛规则。** 模型/登录核心是 `api.anthropic.com` 与 `claude.ai`；若使用 Console
   登录，再验证 `platform.claude.com` 是否应进入同一 AI 组。`downloads.claude.ai` 已由现有 `claude.ai` 后缀覆盖；
   `bridge.claudeusercontent.com` 只在 Claude in Chrome 时需要。更新、遥测和插件域名与模型请求分开处理。来源：
   [官方网络访问要求](https://code.claude.com/docs/en/corporate-proxy#network-access-requirements)。
5. **更新后重新审计，不以版本号推断安全性。** 当前运行的是桌面内置 `2.1.247`，PATH 上的独立版本仍为
   `2.1.132`；版本差异说明审计必须记录实际进程路径。升级能带来已发布修复，但不能证明某个历史实验或服务端
   反滥用逻辑不存在；升级后应重新做“进程 → Clash → 规则链”的观察。来源：
   [Claude Code changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)。

#### 不应加入 PureIP 或本机“防封”清单的东西

- 根据时区、中文语言、中文字体、住宅标签给 Claude Code 下固定扣分；官方只确认“IP 与其他信号”用于国家/地区级
  合规与反滥用，没有公开这些信号的权重或因果关系。来源：[位置说明](https://privacy.claude.com/en/articles/11186740-does-claude-use-my-location)。
- 因为使用代理/VPN 就断言违规。Claude Code 有正式代理配置，真正需要检查的是地区资格、账户与实际用途是否合规、
  是否意外旁路，以及是否使用未经授权的网关或转售服务。
- 用 PureIP 的匿名入口探测替代已登录的 Claude Code 请求；前者只检查网络路径和公开入口，不能证明账户资格、
  订阅状态或平台最终风控判定。

### 6.3 后续可补齐

- 每条规则展示“来源、适用产品、适用版本、最后核对日期”；过期或仅社区来源的规则默认不计分。
- 服务地区列表应从官方页面定期更新或版本化缓存，不能把“所有 AI 工具”共用一个国家名单。
- 解锁测试展示“网页可达、登录可达、API 可达、地区资格”四种不同事实，不把匿名首页 200 当作账号可用。
- 把第三方 IP 情报冲突显示为证据冲突，不通过平均分制造虚假确定性。
- 对“指定 IP”继续坚持只做 IP 侧预评估，不声称已经验证浏览器、DNS、二跳或账号路径。

## 7. 建议的判定示例

| 场景 | 应显示 | 不应显示 |
|---|---|---|
| 中国大陆住宅 IP、无滥用记录 | IP 信誉良好；Claude 地区资格不支持；服务实测未验证/地区阻断 | Claude 90 分、账号安全 |
| 支持地区的企业 VPN | VPN/企业网络；地区支持；路由和服务分别实测 | 因 VPN 自动扣成高风险 |
| 支持地区的云主机，经官方 API key 调用 | 数据中心网络；地区支持；API 可达与滥用信誉另评 | 因 datacenter 自动判不可用 |
| 浏览器时区与出口国家不同 | 中性环境提示；说明旅行、远程办公和手动时区都可能造成差异 | “AI 服务一定怀疑”“轻松上网扣分” |
| Claude 首页返回 403 | 403，原因未确定；展示重定向/响应特征和测试时间 | “IP 信誉差”这一唯一结论 |
| 第三方 `ANTHROPIC_BASE_URL` | 标注第三方网关、运营方与信任风险；历史旧版标记机制仅作版本提示 | 当前必然封号、改时区即可安全 |

## 8. 仍然未知、不得假装知道的事项

- Anthropic 当前服务端完整反滥用特征、阈值和权重；
- 普通用户封禁中 IP、ASN、设备、时区、语言、手机号、支付方式分别占多大因果权重；
- 工程师所称“更强缓解措施”的具体技术实现；
- 历史标记机制是否直接参与账号封禁，还是仅用于识别转售/蒸馏网络；
- 当前每个 Claude Code 发布版本中是否完全不存在其他地区/端点检测，除非对该精确版本做独立二进制和网络审计。

## 来源索引

### Anthropic 官方

- [Supported countries & regions](https://www.anthropic.com/supported-countries)
- [Consumer Terms of Service](https://www.anthropic.com/legal/consumer-terms)
- [Commercial Terms of Service](https://www.anthropic.com/legal/commercial-terms)
- [Does Claude use my location?](https://privacy.claude.com/en/articles/11186740-does-claude-use-my-location)
- [Safeguards warnings and appeals](https://support.claude.com/en/articles/8241253-safeguards-warnings-and-appeals)
- [Enterprise network configuration](https://code.claude.com/docs/en/corporate-proxy)
- [Claude Code environment variables](https://code.claude.com/docs/en/env-vars)
- [Claude Code data usage](https://code.claude.com/docs/en/data-usage)
- [Claude Code commands](https://code.claude.com/docs/en/commands)
- [Claude Code error reference](https://code.claude.com/docs/en/errors)
- [Securely deploying AI agents](https://code.claude.com/docs/en/agent-sdk/secure-deployment)
- [Detecting and preventing distillation attacks](https://www.anthropic.com/news/detecting-and-preventing-distillation-attacks)
- [Transparency Hub: System Trust and Reporting](https://www.anthropic.com/transparency/system-trust-reporting)

### 官方人员与官方仓库

- [Thariq Shihipar 对历史实验及回滚的回应](https://x.com/trq212/status/2072079729331777817)
- [anthropics/claude-code issue #67120：端点/时区相关 prompt 变化](https://github.com/anthropics/claude-code/issues/67120)
- [anthropics/claude-code issue #51583：企业 VPN 后账号禁用报告](https://github.com/anthropics/claude-code/issues/51583)
- [anthropics/claude-code issue #5088：账号禁用聚合讨论](https://github.com/anthropics/claude-code/issues/5088)
- [anthropics/claude-code issue #532：VPN 连接冲突](https://github.com/anthropics/claude-code/issues/532)
- [anthropics/claude-code issue #30318：代理/地区 403 报告](https://github.com/anthropics/claude-code/issues/30318)
- [Claude Code changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)

### X 长文与开源复现

- [@app_sail 的原始 X 帖](https://x.com/app_sail/status/2072494971643715658)
- [X 长文转载，仅用于核对作者主张](https://cbshs.com/ChatGPT/claude-code-ban-prevention-guide/)
- [shellus/claude-cn-flag-check README](https://github.com/shellus/claude-cn-flag-check)
- [shellus/claude-cn-flag-check `src/detect.js`](https://github.com/shellus/claude-cn-flag-check/blob/main/src/detect.js)
