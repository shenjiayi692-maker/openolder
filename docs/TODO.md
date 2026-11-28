# OpenOlder 待办清单

这是 openolder 唯一的待修、待办清单。任何会话开工前先读这里；做完一项，就把状态和日期写回来。
策略、扫词规则和候选词不放在这里，放在 Jiayi 的《新词工具站执行手册》（Claude 文档）里。

每条写清楚：问题、证据、状态、下一步、日期。完成的项移到“最近完成”，只保留最近一个月的。

## 待办

### 1. 读取失败：剩下 zip 类失败待查
- 证据（D1，11-24 至 11-27）：`analyze_fail` 里 `error:zip:zip` 5 次（首页 3、/pt/ 1、/premiere-2026-to-2025/ 1，其中 2 个大于 50 MB），说明用户传了 zip 但里面没找到 .prproj，或解压失败；另有 `error:mp4` 1 次、`error:prin` 1 次（传错文件）。`not_project:prproj:xml` 0 次，“用户传未压缩 XML”的推测目前没有证据。
- 下一步：攒到 10 条 zip 失败后，看是否值得改提示（例如“zip 里要包含 .prproj 或整个 Production 文件夹”），或支持更大的 zip。
- 日期：2026-11-28 更新

### 2. “工程可能已损坏”页：4 周后看效果
- 状态：11-23 已在页面上加了从 Auto-Save 找回旧版本的步骤（da7a28c）。
- 下一步：12-21 前后看这一页的点击和分析失败有没有变化。
- 日期：2026-11-24 记录

### 3. Ableton 页面没在真软件里验证过（只能人做）
- 11-28 用 [2Percent.als 原工程](https://github.com/djaboxx/iron-static/blob/946337f3317c8ad89c1b06b69c15465488f38431/ableton/sessions/Internal%20Project/2Percent.als)（Creator 为 Live 12.3.7）运行 downgradeTo11，解压两端 XML 比对。前后均有 6 个 MIDI 轨、4 个组轨、3 个返回轨、23 个 MIDI Clip、0 个音频 Clip。24 个 SampleRef 和 196 个 FileRef 数量一致；392 项相对及绝对路径按值和出现次数比对一致。
- 保留 beta。本机未找到 Live 11。待用 Live 11 打开转换件，记录实际版本、打开警告、轨道顺序和路由、采样缺失数、试听及另存重开结果。另用含音频轨和已收集 WAV 的工程核验音频 Clip 位置、长度、重定位及播放。


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

## 最近完成
- 2026-11-28 单项读取失败显示具体错误，D1 记录原因及输入特征。线上验收计划在 /premiere-27-to-2026/ 使用一个正常 Premiere 27 工程及一个损坏 gzip，小于 1 MB，各一次。
- 2026-11-28 大项目修复：11-25 至 11-27 /premiere-27-to-2026/ 上 5 次“不是工程文件”（gzip、10 MB 以上）和 3 次转换出错，原因是大项目解压后超过浏览器字符串上限（约 5.4 亿字符，项目压缩率约 14 倍）。现在识别版本只解压开头；只改版本号的转换（27→2026 等）边解压边压缩，6 亿字符的模拟项目 27 秒转完；转到 2025 及更早仍要整体处理，太大时给出说明而不是报错；转换引擎崩溃时页面不再卡住。统计里转换失败细分为 too_large / crash / damaged / error，新增 crash 事件。
- 2026-11-28 合并 main 到部署分支 demo-v0.1：推广文档和 11-25 至 11-28 的 TODO 记录进入部署分支，两边重新一致（原待办第 6 项）。
- 2026-11-27 About 页加了一行“Other tools by the same developer: Find Shutter Count …”，链接 https://findshuttercount.com/（正常 follow 链接，带 title）。只此一处，单向（findshuttercount 不回链），不是站群互链。测试：npm test 27/27，smoke-browser 与 smoke-ableton failures: 0；Ableton 页没动。
- 2026-11-27 第一条 YouTube 视频发布：横屏 https://youtu.be/QFufWWuYIzQ ，Shorts https://youtube.com/shorts/pMvr-etf9OE （频道 Jiayi Builds Tools）。
- 2026-11-27 推广文档从 geounpack 仓库搬到本仓库 `docs/promotion/`（directories、forum-answers、premiere27-drafts、social-posts、youtube-scripts）。geounpack 那边已删掉旧副本。
- 2026-11-26 第一条 YouTube 视频（Premiere 27 → 2026，42 秒）做好横屏和竖屏两版，配音、字幕、背景音乐齐全。
- 2026-11-25 用 IndexNow 把站点地图里全部 20 个网址推送给 Bing（经浏览器 GET 推送，抽查 premiere-27-to-2026 返回 200）。
- 2026-11-25 推广：VideoHelp 提交表单已在 Chrome 填好，等 Jiayi 点 Submit；SaaSHub 要求真人提交，交给 Jiayi（文案见 docs/promotion/directories.md 顶部状态说明）。AlternativeTo 11-15 已提交，在审核队列。
- 2026-11-24 决定（Jiayi）：暂不加 Google Analytics / Clarity（会用 Cookie，要改隐私页并征得欧盟用户同意）。访问量继续看 Cloudflare Web Analytics，工具使用看 D1。以后要加，连同隐私页和同意提示一起改。
- 2026-11-24 工具下方新增“项目打不开或转换不了？告诉我们”，失败时也附“Email us the file”链接，主题带 `[OpenOlder feedback]`，4 种语言（2d80c4d）。
- 2026-11-23 分析失败时记录扩展名、文件头和大小；“工程可能已损坏”页加 Auto-Save 恢复步骤（da7a28c）。
