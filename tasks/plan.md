# 实施计划
1. 定义密文 API 契约和存储接口。2. 实现认证、会话、CSRF、限速。3. 实现 WebCrypto 与三类独立表单。4. 实现 Node/Worker 适配器。5. 测试、构建、文档。

风险：服务端误存明文——API 仅接收 envelope；XSS——不用 innerHTML；暴力破解——限速和 scrypt。