# DSH Codex Harness

面向 DeepSeek Harness（DSH）的独立插件，包名 `@royalliang/dsh-codex-harness`，版本 `0.1.3`。GitHub 仓库：`RoyalLiang/dsh-codex-harness`。

利用 DSH 原生执行、权限、后台任务和子代理生命周期，提供精简行为策略、安全的请求参数适配、基于真实 usage 的 token/cache 诊断，以及 `Codex 模式` 预设与输入栏的模型/推理等级/Fast 控件。

## 能力与边界

- 行为策略覆盖证据与未知、结果验证、取消与权限、子代理任务边界和真实 ID、结果收集、稳定提示词前缀，以及压缩后保留未完成目标。`instructions` 可追加补充策略。
- 推理强度仅在 `ctx.llm.resolveModelInfo` 确认存在匹配的 `effort.id` 时覆写，否则继承并报告 `unsupported`。模型信息查询和取消错误向上传播。
- 通过 bundle patch 声明 `Codex 模式` 预设（身份 `codex-collaboration`），组合复用宿主 `standard` 预设的插件清单，仅替换人格前缀。预设清单是完整组合，不继承其他预设。
- 客户端 bundle 在输入栏 `conversation.input.right` 显示当前会话模型与生效推理等级，并提供 Fast 开关，写入本插件的 `fast` 配置。
- Fast 开启后，对 `gpt-*` 模型的 `POST .../responses`（含 `/responses/compact`）请求体附加 `service_tier: "priority"`；其他模型和非 Responses 请求不受影响，插件卸载时恢复。宿主公开接口没有 service tier 字段，这是受控的 fetch 兜底。
- 上下文窗口仍仅表达请求：公开 `GenerateOptions` 无对应接口，状态为 `unsupported-public-api`，不会扩大模型容量。

执行、文件访问、审批、后台任务、取消和子代理调度由 DSH 管理。策略不能授予权限、绕过沙箱或保证模型遵循；任务启动不等于完成，取消不代表回滚。本插件不重写宿主工具、压缩引擎或子代理调度器，不宣称通过自定义工具别名或手写 Responses 协议改写实现兼容，也不保证消除幻觉。

## 安装与启用

需要 Node.js `>=24`。在项目根目录生成本地包：

```sh
npm pack
```

产物为 `royalliang-dsh-codex-harness-0.1.3.tgz`。

**桌面应用：通过 Electron 插件管理器安装这个本地 tgz。** `desktop` profile 由 Electron 应用独占管理，CLI 安装会报错 `profile "desktop" is managed exclusively by the Electron application`。不要通过 CLI 或手写该 profile 的 `package.json` 安装插件。安装后重启宿主并创建新会话。

仅对于非受管理 profile，可使用 CLI，将下面的 profile 名及文件绝对路径替换为实际值：

```sh
dsh plugin --profile my-profile add file:/absolute/path/royalliang-dsh-codex-harness-0.1.3.tgz --ignore-scripts
```

该命令将安装操作转交给 pnpm。包内通过 `dsh.bundle.patch='./cordis.patch.yml'` 注册官方 bundle patch，插入插件行与 `Codex 模式` 预设行；注册方式和公开 patch 语法已验证。桌面安装结果以宿主插件管理器的兼容检查为准。

## 模式与输入栏控件

安装并重启后，新会话的 Agent 预设菜单会出现「Codex 模式」（身份 `codex-collaboration`，沿用旧插件会话记录）。输入栏右侧显示当前会话模型、生效推理等级，以及绑定本插件 `fast` 配置的 Fast 开关。

推理等级由模型目录决定：若提供商的模型没有声明 `reasoningEfforts`，宿主不会给出等级选项。此时可在 profile 的 `llm-pi-ai` 配置里为该模型补充 `reasoningEfforts`；插件不会篡改其他插件的配置。

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

唯一新增工具 `codex_harness_status` 为只读工具，报告当前 `agent.session.id` 最近一次完成的 LLM 调用，包括 usage、purpose、完成状态和 controls。最近一次调用可能是压缩或会话标题等辅助调用，应结合 purpose 解读；它不是用户任务的累计用量。

- `TokenUsage.inputTokens` 表示未缓存输入，`cacheReadTokens` 和 `cacheWriteTokens` 分别表示缓存读取与写入。
- 仅当两项缓存计数均为非负安全整数且其余必要输入数据有效时，才计算总输入和缓存读取命中率。总输入为未缓存输入、缓存读取和缓存写入之和，命中率为缓存读取除以总输入；分母为零时为 `null`。
- 缺失数据为 `null` 或 unknown，不视为零。`totalTokens` 仅在提供商给出时输出；不按响应速度或文本长度猜测缓存命中。

状态仅保存在进程内，最多保留 128 个会话，每会话仅保留最后完成的一次调用，会话 dispose 时清除。它不持久化，不是账单或跨调用汇总。不同提供商的字段口径可能不同，不应直接混算。

## 兼容性与开发

实现为五个 ESM JavaScript 文件与一个手写客户端 bundle，插件名 `royalliang-codex-harness`。无普通运行时 npm 依赖；peer 为宿主提供的 `schemastery ^3.0.0` 和 `dsh-tools 0.2.1-rc.2 || 0.2.1-rc.3`。

| 层级 | 开发与验证记录 |
| --- | --- |
| 已验证 SDK | `0.2.1-rc.2`、`0.2.1-rc.3` |
| 本机 desktop NEXT 应用 | `2.0.19-next`，内置 SDK `0.2.1-rc.2` |
| desktop 内嵌运行时 | Node.js `24.21.0` / Electron `44.0.0` |
| 本插件 | `0.1.3` |

SDK、桌面应用、内嵌运行时与插件版本分别演进，不保证兼容旧宿主。此前 npm metadata 记录（2026-10-23 modified）为 `latest=0.2.1-rc.2`、`next=0.2.1-rc.3`，不是持续更新的查询或兼容承诺。

使用 Node.js 内建测试运行器：

```sh
npm test
npm run check
```

源包在 Node.js `24.21.0` 环境已完成：

- 全新 `npm install`，安装 23 个包；`npm run check` 通过。
- SDK `0.2.1-rc.2` 与 `0.2.1-rc.3` 分别运行同一套 `node --test`：各 17 项通过、0 项失败，包括 7 项行为测试、3 项 Fast 兜底测试、3 项打包与 patch 结构测试、2 项客户端 bundle 装载与注册测试、1 项 SDK 断言集，以及 1 项真实 Cordis 运行时装载、工具注册、注销、重载和禁用测试。
- `npm pack` 通过，包含 11 个发布文件；bundle 注册、`Codex 模式` 预设行及公开 patch 语法已验证。

未进行私有模型真实请求或 token/cache 节省基准测试。上述检查不代表当前桌面会话已热重载、模型端效果或性能节省结论。

## 独立实现与安全反馈

本项目为全新独立实现，以本项目需求、公开接口和验证结果为依据，不继承旧项目的实现、文档或 Git 历史。

普通问题可在 `RoyalLiang/dsh-codex-harness` 的 GitHub Issues 反馈。请勿公开凭据、私人对话或可利用漏洞细节；优先使用仓库实际提供的私密漏洞报告入口。若入口不可用，可先提交不含敏感内容的联系请求，协商披露渠道。目前未承诺专用安全邮箱或响应时限。

## 许可证

MIT，Copyright (c) 2026 RoyalLiang。完整条款见 [LICENSE](LICENSE)。
