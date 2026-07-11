# 规格：双后端零知识密码库

## 目标
共享中文移动优先前端，同时运行于 Cloudflare Worker+D1 与 Linux Node+SQLite。数据不自动同步。服务端仅保存账户认证材料、被包装的库密钥和条目密文。

## 类型与验收
- account：平台、登录网址、账号、密码、备注、标签。
- website：名称、网址、说明、标签；界面与数据校验均拒绝账号/密码字段。
- note：标题、任意正文、标签。
- 类型创建后不可修改；当前分类内搜索。列表每条右侧提供独立“更多操作”按钮，轻量菜单含“编辑”“删除”，点击外部或 Escape 关闭且不得触发详情；详情标题栏也提供删除入口。删除前须二次确认并显示条目标题，执行中禁用且显示“删除中…”，失败给出中文提示；编辑页危险区删除保留为兜底。
- 桌面列表+详情，手机卡片+全屏详情；唯一“+ 新建”先选类型。
- 快速删除在桌面、手机与 320px 宽度可用，并具备键盘焦点、ARIA 菜单/确认对话框语义。
- 菜单：导入/导出、修改密码、退出。
- WebCrypto PBKDF2-SHA-256(310000)+AES-GCM；随机 vault key 被 KEK 包装；修改密码只重包密钥。
- 注册、登录/会话、改密与备份中的 `kdf` 为 `{salt,iterations:310000,hash?:'SHA-256'}`，`wrappedKey` 为 `{iv,ciphertext}`；数据库文本列只存 JSON 文本，API 始终输出对象。
- 会话 Cookie HttpOnly/Secure/SameSite=Strict、CSRF、限速、同源检查。
- 用户名存储和查询使用 `trim()` 后的原值，允许中文、空格、emoji 与常见符号；不得改变大小写或隐式 Unicode 规范化。trim 后须非空，按 JavaScript UTF-16 `String.length` 最多 80 个字符，拒绝控制/格式字符；精确匹配且唯一，违规返回 `invalid_username`。

## 命令
`npm test`、`npm run lint`、`npm run typecheck`、`npm run build`、`npm start`。

## 边界
始终校验输入与所有权；修改契约先更新文档。绝不记录密文正文、密码、密钥；绝不部署或修改旧系统。