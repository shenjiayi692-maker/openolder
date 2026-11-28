# OpenOlder 待办清单

这是 openolder 唯一的待修、待办清单。任何会话开工前先读这里；做完一项，就把状态和日期写回来。
策略、扫词规则和候选词不放在这里，放在 Jiayi 的《新词工具站执行手册》（Claude 文档）里。

每条写清楚：问题、证据、状态、下一步、日期。完成的项移到“最近完成”，只保留最近一个月的。

## 待办

### 1. “不是工程文件”失败：看新的诊断记录
- 证据：D1 统计，analyze_fail（not_project）共 6 次：11-22 首页 4 次，11-23 /project-could-not-be-loaded-damaged/ 页 2 次。
- 状态：11-23 已加诊断（da7a28c），失败时会记扩展名、文件头和大小。
- 下一步：攒到 10 条左右的新记录后，看用户传的主要是什么文件，再决定是改提示、补页面，还是支持新格式。
- 推测（未证实）：手动改版本号的人常把 .prproj 解压成 XML、改完没压缩回去；工具目前会拒绝未压缩的 XML（11-23 本地测试确认会报 not_project）。如果新记录里多是 `not_project:prproj:xml:…`，就让工具直接接受未压缩的 XML（改动小）。
- 日期：2026-11-24 记录

### 2. “工程可能已损坏”页：4 周后看效果
- 状态：11-23 已在页面上加了从 Auto-Save 找回旧版本的步骤（da7a28c）。
- 下一步：12-21 前后看这一页的点击和分析失败有没有变化。
- 日期：2026-11-24 记录

### 3. Ableton 页面没在真软件里验证过（只能人做）
- 证据：/ableton-12-to-11/ 只用合成的工程测过。
- 下一步：用真实的 Live 12 工程转换，再在 Live 11 里打开验证（试用版、朋友，或在 r/ableton 找人帮忙）。验证通过前，页面上保留 beta 说明。
- 日期：2026-11-24 记录

### 4. Shorts 置顶评论
- 状态：横屏视频 11-27 已发布 https://youtu.be/QFufWWuYIzQ ；Shorts 11-27 已发布 https://youtube.com/shorts/pMvr-etf9OE 。
- 11-27 已用 @JiayiBuildsTools 在 Shorts 下发了带 openolder.com 链接和完整视频链接的评论。
- 11-28 决定（Jiayi）：暂不验证手机号，先不置顶，不影响发布。以后方便时去 youtube.com/verify 验证，再在评论 ⋮ → Pin；验证后也能传自定义缩略图。
- 日期：2026-11-27 记录

### 5. 目录站收录
- AlternativeTo：11-15 已提交，在审核队列（Gmail 有提醒），不要重复提交。
- VideoHelp：11-25 表单已填好，Jiayi 已提交，等审核（官方说可能要几周）。
- SaaSHub：要 Jiayi 自己注册、自己填（提交页要求 AI 代理让真人提交）。填法见 `docs/promotion/directories.md` 顶部状态说明；联系邮箱用 hello@openolder.com，竞品至少填一个。
- 下一步：12 月中查一次三家有没有通过；通过后把链接记到这里。
- 日期：2026-11-27 记录

### 6. 部署分支落后于 main（只差文档）
- 证据：11-25 把 TODO 推到了 main，推送到部署分支 demo-v0.1 时被拦下。
- 下一步：下次改网站代码、推 demo-v0.1 时顺带合并 main；只是文档，不影响网站。
- 日期：2026-11-27 记录

## 最近完成
- 2026-11-27 第一条 YouTube 视频发布：横屏 https://youtu.be/QFufWWuYIzQ ，Shorts https://youtube.com/shorts/pMvr-etf9OE （频道 Jiayi Builds Tools）。
- 2026-11-27 推广文档从 geounpack 仓库搬到本仓库 `docs/promotion/`（directories、forum-answers、premiere27-drafts、social-posts、youtube-scripts）。geounpack 那边已删掉旧副本。
- 2026-11-26 第一条 YouTube 视频（Premiere 27 → 2026，42 秒）做好横屏和竖屏两版，配音、字幕、背景音乐齐全。
- 2026-11-25 用 IndexNow 把站点地图里全部 20 个网址推送给 Bing（经浏览器 GET 推送，抽查 premiere-27-to-2026 返回 200）。
- 2026-11-25 推广：VideoHelp 提交表单已在 Chrome 填好，等 Jiayi 点 Submit；SaaSHub 要求真人提交，交给 Jiayi（文案见 docs/promotion/directories.md 顶部状态说明）。AlternativeTo 11-15 已提交，在审核队列。
- 2026-11-24 决定（Jiayi）：暂不加 Google Analytics / Clarity（会用 Cookie，要改隐私页并征得欧盟用户同意）。访问量继续看 Cloudflare Web Analytics，工具使用看 D1。以后要加，连同隐私页和同意提示一起改。
- 2026-11-24 工具下方新增“项目打不开或转换不了？告诉我们”，失败时也附“Email us the file”链接，主题带 `[OpenOlder feedback]`，4 种语言（2d80c4d）。
- 2026-11-23 分析失败时记录扩展名、文件头和大小；“工程可能已损坏”页加 Auto-Save 恢复步骤（da7a28c）。
