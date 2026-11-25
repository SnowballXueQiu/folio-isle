# 言屿 Folio Isle

Inf Network 的项目式知识库。每个项目包含 **知识库、待办、随笔、AI 分析** 四个模块。

- 知识库：多库、分组与文档树（文档可同时有正文和子节点）、拖拽排序、稳定链接 `/d/<id>`、目录与标题大纲；默认私有、可逐库公开；点赞与评论。
- 写作：Tiptap 可视化编辑器，正文存为 Markdown 超集（`:text[文字]{fg=red bg=yellow}`、`:::callout`、`:::details`、表格、图片、代码块）。停止输入 3 秒自动保存、持续输入每 20 秒保存；断网暂存、版本冲突保留本地修改。
- 版本与恢复：每个有变化的版本长期保留；管理员可回滚正文、撤销目录移动/排序/重命名、从回收站恢复文档与知识库；历史正文、目录事件、审计、附件在数据库层只允许追加。
- 审计：按操作者、对象、动作、时间查询，与业务变更同一事务提交。
- AI 分析：单篇摘要（带原文引用）→ 全量文档对逐一分析 → 单库总结与项目总览；星图（Cytoscape）与文字版；按「两篇正文版本 + 模型 + 规则版本」去重，重新发布只重算涉及的文档对；引用在服务端校验，下架/删除后立即停止展示。
- 登录：唯一入口为第三方 OAuth2 SSO（授权码 + PKCE S256 + 一次性 state），按「提供方标识 + UID」识别用户。

## 部署

```bash
cp .env.example .env        # 填写 POSTGRES_PASSWORD、APP_SECRET、APP_URL、SSO_*、AI_*
docker compose up -d --build            # 或：podman-compose up -d --build
# 可选：ClickHouse 运行日志（默认保留 30 天）
docker compose -f compose.yaml -f compose.clickhouse.yaml up -d
```

服务：`web`（Next.js，容器内 3000，默认绑定 127.0.0.1:3100）、`worker`（AI 任务，PostgreSQL 队列）、`db`（PostgreSQL 16）。数据库迁移在启动时自动执行。健康检查：`GET /api/health`。

第一个登录的用户成为站点管理员；SSO 与 AI 提供方也可以在「站点设置」里修改（密钥加密保存）。

### 备份与恢复

```bash
scripts/backup.sh                        # backups/folio-<UTC>.dump + sha256；BACKUP_REMOTE=user@host:/dir 时同时 scp 到异机
scripts/restore.sh backups/folio-XXXX.dump   # 也支持 user@host:/path/file.dump；可在全新主机上执行
```

正文、全部历史版本、附件、审计、待办、随笔和 AI 结果都在 PostgreSQL 中，一份 dump 即完整备份。`COMPOSE` 可强制指定 compose 命令，`WITH_CLICKHOUSE=1` 带上叠加文件。

## 开发

```bash
npm install
cp .env.example .env.local   # DATABASE_URL=postgres://...，DEV_LOGIN=1 可用 /api/auth/dev?u=name 本地免 SSO 登录
npm run migrate && npm run dev        # http://localhost:3100
npm run worker                        # AI worker
npm test                              # Markdown 往返测试
```
