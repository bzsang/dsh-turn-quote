# dsh-turn-quote（引用上文）

[![开放插件市场](https://img.shields.io/endpoint?url=https://dshopen.org/badge/dsh-turn-quote.json)](https://dshopen.org/zh/plugins/dsh-turn-quote/) [![awesome · DSH plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com/p/bzsang/dsh-turn-quote/) ![license](https://img.shields.io/badge/license-MIT-2563eb)

把**本次会话前文**引用到正在写的消息里。需求跑偏时，把当初那句需求（或当时的结论）@ 回来，让模型以原文为准继续。

- **单轮引用**：只引一条（我 / 助手）
- **整轮问答**：一轮的"提问 + 回答"一起引
- **最近多轮**：最近 2 / 3 / 5 轮一次性引完（多轮提问和回答）
- **按正文搜索**：`@` 后直接打字，按命中内容过滤，并显示命中处上下文

Quote earlier turns of the current conversation — one turn, a whole Q&A turn, or the last few
turns, with body search — **by turn, not by selected text**. The pick stays a compact chip in the
draft; the picked text is attached to the message you send, so the model can be re-anchored on
what was actually asked before.

## 安装

```sh
# 从 GitHub 安装（当前版本 0.2.0）
dsh plugin --profile <你的 profile> add https://github.com/bzsang/dsh-turn-quote
```

尚未发布 npm 包；从 GitHub 安装即可（纯 JS，无构建步骤，装完重启该 profile）。

要求：DeepSeek Harness `>=0.2.1-rc.5 <0.3.0`（0.2.2-rc.1 实测可用）。

## 用法

1. 输入框敲 `@`（或点输入框左侧的 `“` 按钮），菜单里会出现三个分组：
   - **对话上文**：单条消息，按时间倒序
       - `第N轮·我`：你在第 N 轮发送的消息
       - `第N轮·助手`：助手在第 N 轮的回答（同一轮多个步骤合并成一条）
   - **整轮问答**：`第N轮·问答` —— 该轮的提问与回答作为一条引用
   - **最近多轮**：`最近2轮` / `最近3轮` / `最近5轮` —— 连续多轮的问答一起引用
2. **搜索**：`@` 后继续输入内容即可过滤，命中数会显示在描述前（如 `命中 2 处 · …`），描述里给出命中位置前后的原文。
   - 也可以按轮次过滤：`@2`、`@第2轮`；按说话人过滤：`@我`、`@助手`、`@you`、`@assistant`
3. 选中后草稿里只留一个小标签（如 `@最近3轮`），光标停在标签后可以接着写新问题；连续 @ 多次可叠加多个引用。
4. 发送时标签展开成引用块：

```
【引用上文 · 最近3轮（第2–4轮）】
我：第二轮：再加批量操作，支持改状态和负责人
助手：第二轮回答：批量栏已加，执行后逐条写回，失败会带错误原因。
我：第三轮：白屏了，点项目看板没反应
助手：第三轮回答：是提前 return 导致的 hooks 顺序问题，已修复并补了冒烟测试。
我：第四轮：导出功能也加上吧
助手：第四轮回答：导出已加，支持 CSV 与 JSON。
【/引用上文】
```

整轮问答引用长这样：

```
【引用上文 · 第3轮 · 问答】
我：第三轮：白屏了，点项目看板没反应
助手：第三轮回答：是提前 return 导致的 hooks 顺序问题，已修复并补了冒烟测试。
【/引用上文】
```

### 行为细节

- `@"..."` 仍是 DSH 官方的路径引用语法，本插件不插手引号形式。
- 一条引用最多保留 4000 字，超出部分会注明省略多少字（多轮引用按顺序分配这个预算）。
- 只覆盖当前会话**已加载**的历史；尚未载入会话窗口的久远消息不会出现在列表里。
- 引用内容会成为你这条消息的一部分进入会话记录（对模型、回放、fork 都可见）——这正是"重新提交上下文"的语义。

## 与其他插件的区别 / How it differs

对着市场索引查过同类（2026-11 快照），三类近邻都不是同一件事：

| 同类 / Neighbour | 例子 / Examples | 与本插件的区别 / Difference |
| --- | --- | --- |
| 扩展 `@` 菜单的引用来源 | `dsh-reference-anything`、`dsh-expert` | 引用的是**别的会话、别的 AI 的历史**或专家名册；本插件引用的是**本次会话自己的前文** |
| 把**选中的文字/代码**变成引用 | `dsh-client-ui-quote`、`dsh-cherry-quote`、`dsh-quote-reply`、`@kialajin/dsh-quote-selection` | 要先手动选中一段；本插件按**轮次**（单轮 / 整轮问答 / 最近多轮）引用，不用选 |
| 会话回退 / 重发 | `dsh-session-rewind`、`@anionex/dsh-turn-rewind`、`@jochenyang/dsh-rewind-plugin` | 回退会把那一轮**从对话里撤回/删除**；本插件**不删任何东西**，只把原文附进当前这条消息 |

一句话：**按轮次引用，而不是按选中文字；是引用，不是回退。**

## 实现

纯浏览器端插件，Host 侧只有空 `apply`（无工具、无服务、不写会话事件）：

- 用 `ctx.inputTriggers.registerSource()` 注册一个 `@` 触发源，与官方 `@文件/@会话` 同菜单共存；
- 选中项走官方 chip 通道（`slash/input-insert-reference`），撤销栈、草稿持久化、复制形态都是原生行为；
- 发送时由 chip 的 `codec.serialize()` 展开成引用块；
- 候选数据来自 Session Controller 已加载的事件窗口（`sessions.binding(id).eventSource`），无新增 RPC。

## 安全

- 不含网络请求、不上传任何数据；读到的会话内容只写回你自己的输入框与消息。
- 插件以完整权限运行第三方代码。本包不调用系统命令、不读写工作区文件。

## 更新日志

- **0.2.0** — 新增「整轮问答」与「最近多轮」引用、按正文搜索（命中计数 + 命中处上下文）；修复客户端模块 id 与包名不一致导致升级后按钮/`@` 菜单不出现的问题。
- **0.1.0** — 首次发布：`@` 菜单按轮次引用前文、composer 引用按钮、发送时展开引用块。

## 许可

MIT © 2026 王国栋