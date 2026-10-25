# DSH Codex Harness

面向 DeepSeek Harness（DSH）的独立插件，包名 `@royalliang/dsh-codex-harness`，版本 `0.3.0`。GitHub 仓库：`RoyalLiang/dsh-codex-harness`。

利用 DSH 原生执行、权限、后台任务和子代理生命周期，提供精简行为策略、安全的请求参数适配、基于真实 usage 的 token/cache 诊断，以及 `Codex 模式` 预设与输入栏的 Fast 开关。

## 能力与边界

- 行为策略覆盖证据与未知、结果验证、取消与权限、子代理任务边界和真实 ID、结果收集、稳定提示词前缀，以及压缩后保留未完成目标。`instructions` 可追加补充策略。
- 推理强度仅在 `ctx.llm.resolveModelInfo` 确认存在匹配的 `effort.id` 时覆写，否则继承并报告 `unsupported`。模型信息查询和取消错误向上传播。
- 通过 bundle patch 声明 `Codex 模式` 预设（身份 `royalliang-codex`），复用宿主 `standard` 工具组合，替换人格前缀并收紧工具输出与摘要预算。预设清单是完整组合，不继承其他预设。
- 客户端 bundle 在输入栏 `conversation.input.right` 提供 Fast 开关和独立的推理等级选择器。Fast 绑定本插件的实时 `fast` 配置，无需重载；推理等级通过宿主 `modelDirectories` 读写当前会话的受支持模型选择，缺少元数据时提供默认 High 的本地偏好列表。保存失败会显示提示。
- Fast 开启后，对 `gpt-*` 模型的 `POST .../responses`（含 `/responses/compact`）请求体附加 `service_tier: "priority"`；其他模型和非 Responses 请求不受影响，插件卸载时恢复。宿主公开接口没有 service tier 字段，这是受控的 fetch 兜底。
- 上下文窗口仍仅表达请求：公开 `GenerateOptions` 无对应接口，状态为 `unsupported-public-api`，不会扩大模型容量。

执行、文件访问、审批、后台任务、取消和子代理调度由 DSH 管理。策略不能授予权限、绕过沙箱或保证模型遵循；任务启动不等于完成，取消不代表回滚。本插件不重写宿主工具、压缩引擎或子代理调度器，不宣称通过自定义工具别名或手写 Responses 协议改写实现兼容，也不保证消除幻觉。

## 安装与启用

需要 Node.js `>=24`。在项目根目录生成本地包：

```sh
npm pack
```

产物为 `royalliang-dsh-codex-harness-0.3.0.tgz`。

**桌面应用：通过 Electron 插件管理器安装这个本地 tgz。** `desktop` profile 由 Electron 应用独占管理，CLI 安装会报错 `profile "desktop" is managed exclusively by the Electron application`。不要通过 CLI 或手写该 profile 的 `package.json` 安装插件。安装后重启宿主并创建新会话。

仅对于非受管理 profile，可使用 CLI，将下面的 profile 名及文件绝对路径替换为实际值：

```sh
dsh plugin --profile my-profile add file:/absolute/path/royalliang-dsh-codex-harness-0.3.0.tgz --ignore-scripts
```

该命令将安装操作转交给 pnpm。包内通过 `dsh.bundle.patch='./cordis.patch.yml'` 注册官方 bundle patch，插入插件行与 `Codex 模式` 预设行；注册方式和公开 patch 语法已验证。桌面安装结果以宿主插件管理器的兼容检查为准。

## 模式与输入栏控件

安装并重启后，新会话的 Agent 预设菜单会出现「Codex 模式」（身份 `royalliang-codex`）。输入栏保留宿主自带的模型席位，右侧新增开启时呈绿色的原生 Fast 滑动开关，以及使用 DSH 原生按钮和菜单的推理强度列表，不再显示「推理等级」标签。当前会话模型名称独立显示在输入框下方；模型选择在后续请求生效。

聊天记录使用宿主原生轮次刻度，显示在聊天区左侧，支持滚动、跳转及向右展开的悬停预览。输入框下方不再添加单独的「会话记录」。

列表插槽注册均提供唯一 ID，修复了宿主拒绝注册导致 Fast 和推理控件不显示的问题。

模型声明支持推理等级时，选择器列出其实际选项；未设置过的会话优先保存 High（若支持），已有选择保留。没有推理元数据时，提供 ◔ Low、◑ Medium、◕ High、● Extra high、✦ Max，默认 High，但仅按会话和模型保存到浏览器本地偏好，不向宿主提交参数；悬停提示说明此限制。当前 AGY 的 GPT-6.1 Sol 没有声明等级，其适配器也未转发 GPT 的推理参数，故该模型尚不能实际应用这些选择。加载或保存期间不可操作。高级配置 `reasoningEffort` 若不是 `inherit`，仍会按原有规则覆盖请求，因此使用选择器时应保留 `inherit`。Fast 为插件全局配置。

## 配置

在实际 profile 的 `cordis.patch.yml` 顶层数组增加以下条目，可覆盖下表五项配置；配置通过插件 `Config` 校验：

```yaml
- id: royalliang-codex-harness
  config:
    reasoningEffort: inherit
    instructions: ''
```

| 字段 | 类型 | 默认值 | 含义 |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | 启用插件；`false` 时插件不执行操作。 |
| `fast` | boolean | `false` | 为 `gpt-*` 模型的 Responses 请求附加 `service_tier: "priority"`；其他请求不变。 |
| `reasoningEffort` | string | `'inherit'` | 默认继承；仅应用模型信息明确支持的 effort ID。 |
| `contextWindow` | number | `0` | `0` 表示继承，正数表达请求的 token 窗口；当前为 `unsupported-public-api`。 |
| `instructions` | string | `''` | 追加到内置策略，不替换内置策略。 |

同一 ID 下设置 `disabled: true` 可阻止宿主挂载插件；`config.enabled: false` 则让已挂载插件不执行操作。

## usage 与缓存诊断

唯一新增工具 `codex_harness_status` 为只读工具，报告当前 `agent.session.id` 的 controls、最近一次结算的调用 `usage`、累计 `totals` 和按用途累计的 `byPurpose`。原有 `usage` 字段保留；压缩或标题请求可能更新最近一次调用，但不会覆盖已有累计统计。工具仅在被调用时返回统计，不向每次模型请求追加统计消息。

- `TokenUsage.inputTokens` 表示未缓存输入，`cacheReadTokens` 和 `cacheWriteTokens` 分别表示缓存读取与写入；这是 DSH 适配后的独立计数，不能直接套用 OpenAI 原始 `input_tokens` 的包含关系。
- 总输入为未缓存输入、缓存读取和缓存写入之和；累计命中率为累计缓存读取除以累计总输入，不平均单次命中率。分母为零时为 `null`。
- 每个累计分组包含 `calls`、`unknownUsageCalls`、`incompleteCalls` 和 token 计数。失败或提前关闭的流也计为一次调用；无 usage 时增加 `unknownUsageCalls`，未收到完成原因时增加 `incompleteCalls`，不会伪造零用量。一次流有多份 usage 时只采用最后一份。
- `byPurpose` 区分 `conversation`、`compaction` 和 `session-title`；未识别用途统一归入 `other`，限制分组数量。某个用途缺少数据，不影响其他用途的独立累计。
- 某项计数在任意调用中缺失或无效，或累计超过安全整数范围时，该项累计保持 `null`，后续有效数据不会把不完整总数恢复成完整总数。总输入或命中率所需字段缺失时也为 `null`。
- `totalTokens` 仅在提供商给出时输出。`reasoningTokens` 单独报告，缺失为 `null`，不再次加到输出或总量上。不按响应速度或文本长度猜测缓存命中。

统计从插件挂载后观察到的调用开始，仅保存在进程内，最多保留最近活跃的 128 个会话；会话 dispose、插件卸载或进程重启会清除，淘汰后再次观察也从零开始。它不是完整会话账单，不汇总子代理会话，也不估算费用；切换模型后的 token 总数不能代表统一价格。

## 上下文与 token 优化

内置策略要求限定搜索路径和读取范围，返回精简结论及关键错误，将大型日志和数据保留为可继续读取的文件引用。检查点聚焦当前目标、约束、决策、修改路径、验证、未解决错误、后台任务 ID 和下一步，省略已消费日志和重复叙述，同时保留验证证据及工具调用与结果配对。这是行为指导，不是强制截断器；策略仅在挂载时注册，不根据累计统计重写稳定前缀。

Codex 预设在自身作用域挂载宿主 `dsh-spill-policy`，将单次工具结果的文本和图片共同预算设为 **4,096 个估算 token**，在结果进入历史前保留首尾预览及完整内容的读取路径。复用 base 已有的 spill 存储，不改写其他预设的预算。`read` 不受这条策略裁剪，便于分段找回原文；缺少存储、图片计价或可读图片路径时保留原内容，预算不是所有结果的硬上限。工具自身事先截断的内容无法恢复。

base 的全局策略可能先将超大结果缩到 12,500 个估算 token，再由 Codex 作用域缩到 4,096；此时会产生两级读取路径，沿路径可找回完整原文。后续宿主裁剪器仍按超过 8,192 个 Unicode 码点时保留前 4,096 和后 1,024 个码点的配置运行；场景测试检查了其保留 spill 路径及重复裁剪收敛的行为。

Codex 的 `compaction-basic.maxTokens` 设为 **16,384**，作为单次摘要请求输出上限，包含提供商计入的推理 tokens；它不是摘要目标长度。保持宿主压缩触发阈值、headroom 和近期保留预算，不添加压缩引擎。宿主拒绝以 `max-tokens` 结束的摘要；若真实模型经常达到上限，应提高该预设子插件的预算。这两项预算属于预设组合，不是上表的插件 Config 字段，`enabled: false` 不撤销预设组合。

比较同类长任务时，分别记录 `byPurpose.conversation` 与 `byPurpose.compaction` 的调用数、输入和输出，并结合宿主压缩事件、延迟和任务完成质量判断收益。压缩前后上下文大小、缓存失效原因及费用不在当前接口中；不能从最近一次 usage 推算压缩率。缺少计数时保持未知，不宣称节省比例。

## 兼容性与开发

实现为五个 ESM JavaScript 文件与一个手写客户端 bundle，插件名 `royalliang-codex-harness`。无普通运行时 npm 依赖；peer 为宿主提供的 `schemastery ^3.0.0` 和 `dsh-tools 0.2.1-rc.2 || 0.2.1-rc.3`。

| 层级 | 开发与验证记录 |
| --- | --- |
| 已验证 SDK | `0.2.1-rc.2`、`0.2.1-rc.3` |
| 本机 desktop NEXT 应用 | `2.0.19-next`，内置 SDK `0.2.1-rc.2` |
| desktop 内嵌运行时 | Node.js `24.21.0` / Electron `44.0.0` |
| 本插件 | `0.3.0` |

SDK、桌面应用、内嵌运行时与插件版本分别演进，不保证兼容旧宿主。此前 npm metadata 记录（2026-10-23 modified）为 `latest=0.2.1-rc.2`、`next=0.2.1-rc.3`，不是持续更新的查询或兼容承诺。

使用 Node.js 内建测试运行器：

```sh
npm test
npm run check
```

本轮在 Node.js `24.21.0` 上启用宿主场景测试后完成 **38 项通过、0 项失败、0 项跳过**。除累计 usage、控件、Fast 和 Cordis 生命周期回归外，新增 8 个场景覆盖短输出、分段读取、大日志原文恢复、后续裁剪路径保留、普通会话隔离、多次输出不改写历史、存储失败、工具失败、取消、无图片计价和摘要截断。`npm run check`、场景文件语法检查与 `git diff --check` 均通过。

`test/context-scenarios.test.js` 需要实际宿主包，不新增项目依赖。将 `DSH_CONTEXT_HOST_ROOT` 指向含 `node_modules` 的宿主包目录：需有 `dsh-spill-policy`、`dsh-spill-local`、`dsh-token-meter`、`dsh-compaction-basic`、`dsh-compaction-tool-result-pruner`、其依赖及 `yaml`。未设置变量时普通测试明确跳过宿主场景组；设置后缺包会失败。本机从已安装宿主提取所需包到忽略目录 `.audit/context-runtime`，复现命令如下（需 Node.js >=24）：

```powershell
$env:DSH_CONTEXT_HOST_ROOT = (Resolve-Path '.audit/context-runtime').Path
node --test --experimental-test-isolation=none
```

本轮场景复用了宿主 `0.2.1-rc.2` 的 spill、裁剪和摘要实现，以及工作区工具运行时。大日志夹具的文本估算从 **58,511 降至 4,084 tokens**，完整原文和中间错误可从真实临时文件找回。这里使用宿主文本估算，不是提供商 usage；摘要响应使用脚本流，验证请求前缀、预算传递和截断拒绝，不代表完整压缩事务或真实模型恢复任务的质量测试。测试临时结果在结束时清理。

未进行私有模型真实请求或费用基准测试，未安装新包到桌面应用。上述检查不代表当前桌面会话已热重载、模型端效果或性能节省结论。

## 独立实现与安全反馈

本项目为全新独立实现，以本项目需求、公开接口和验证结果为依据，不继承旧项目的实现、文档或 Git 历史。

普通问题可在 `RoyalLiang/dsh-codex-harness` 的 GitHub Issues 反馈。请勿公开凭据、私人对话或可利用漏洞细节；优先使用仓库实际提供的私密漏洞报告入口。若入口不可用，可先提交不含敏感内容的联系请求，协商披露渠道。目前未承诺专用安全邮箱或响应时限。

## 许可证

MIT，Copyright (c) 2026 RoyalLiang。完整条款见 [LICENSE](LICENSE)。
