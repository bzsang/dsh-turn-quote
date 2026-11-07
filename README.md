# dsh-turn-quote（引用上文）

把**本次会话前文**的某一轮问答引用到正在写的消息里。用于需求跑偏时"重新提交上下文"：
发现方向不对，把当初那句需求（或当时的方案结论）@ 回来，让模型以原文为准继续。

Quote an earlier turn of the current conversation into the composer with an `@` mention.
The pick stays a compact chip in the draft; the picked turn's text is attached to the
message you send, so the model can be re-anchored on what was actually asked before.

## 安装

```sh
dsh plugin --profile <你的 profile> add dsh-turn-quote
```

装好后重启该 profile（或重启 DSH 桌面端），输入框左侧会出现 `“` 按钮。

要求：DeepSeek Harness `>=0.2.1-rc.5 <0.3.0`。

## 用法

1. 输入框里敲 `@`，菜单顶部多出「对话上文 / Earlier turns」分组，按时间倒序列出本会话每一轮：
   - `第N轮·我`：你在第 N 轮发送的消息（只收真人输入，不含系统上下文、技能目录、注入的运行时信息）
   - `第N轮·助手`：助手在第 N 轮的回答（同一轮多个步骤合并成一条）
2. 也可以点输入框左侧的 `“` 按钮：在光标处插入 `@` 并打开菜单。
3. 选中后草稿里只留一个小标签，光标停在标签后，可以接着写新问题；支持连续 @ 多个。
4. 发送时标签展开成引用块：

```
【引用上文 · 第2轮 · 我】
<那一轮的原文>
【/引用上文】

（你的新问题）
```

- `@` 后继续输入会过滤：轮次（`2`、`第2轮`）、说话人（`我`/`助手`）、或原文关键字。
- `@"..."` 仍是 DSH 官方的路径引用语法，本插件不插手引号形式。
- 单条引用最多 4000 字，超出会注明省略多少字。
- 只覆盖当前会话**已加载**的历史；尚未载入会话窗口的久远消息不会出现在列表里。
- 引用内容会成为你这条消息的一部分进入会话记录（对模型、回放、fork 都可见）——这正是"重新提交上下文"的语义。

## 实现

纯浏览器端插件，Host 侧只有空 `apply`（无工具、无服务、不写会话事件）：

- 用 `ctx.inputTriggers.registerSource()` 注册一个 `@` 触发源，与官方 `@文件/@会话` 同菜单共存；
- 选中项走官方 chip 通道（`slash/input-insert-reference`），撤销栈、草稿持久化、复制形态都是原生行为；
- 发送时由 chip 的 `codec.serialize()` 展开成引用块；
- 候选数据来自 Session Controller 已加载的事件窗口（`sessions.binding(id).eventSource`），无新增 RPC。

## 安全

- 不含网络请求、不上传任何数据；读到的会话内容只写回你自己的输入框与消息。
- 插件以完整权限运行第三方代码。本包不调用系统命令、不读写工作区文件。

## 许可

MIT © 2026 王国栋