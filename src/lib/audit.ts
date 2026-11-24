import type { Db } from "./db";

export type AuditInput = {
  projectId?: number | null;
  actorId?: number | null;
  objectType: string;
  objectId?: string | number | null;
  action: string;
  detail?: Record<string, unknown>;
  ip?: string | null;
};

/** Must be called inside the same transaction as the business change. */
export async function audit(db: Db, a: AuditInput) {
  await db`INSERT INTO audit_events (project_id, actor_id, object_type, object_id, action, detail, ip)
           VALUES (${a.projectId ?? null}, ${a.actorId ?? null}, ${a.objectType}, ${a.objectId == null ? null : String(a.objectId)},
                   ${a.action}, ${db.json((a.detail ?? {}) as never)}, ${a.ip ?? null})`;
}

export const ACTION_LABELS: Record<string, string> = {
  "doc.create": "新建文档",
  "group.create": "新建分组",
  "doc.save": "保存草稿",
  "doc.publish": "发布",
  "doc.unpublish": "下架",
  "doc.rollback": "回滚正文",
  "node.rename": "重命名",
  "node.move": "移动",
  "node.reorder": "排序",
  "node.delete": "删除",
  "node.restore": "恢复",
  "tree.revert": "撤销目录变更",
  "library.create": "新建知识库",
  "library.update": "修改知识库",
  "library.visibility": "调整可见性",
  "library.delete": "删除知识库",
  "library.restore": "恢复知识库",
  "member.add": "添加成员",
  "member.role": "调整角色",
  "member.remove": "移除成员",
  "project.create": "创建项目",
  "project.update": "修改项目",
  "comment.create": "评论",
  "comment.hide": "隐藏评论",
  "comment.unhide": "恢复评论",
  "like.add": "点赞",
  "like.remove": "取消点赞",
  "todo.create": "新建待办",
  "todo.update": "修改待办",
  "todo.status": "更新待办状态",
  "todo.archive": "归档待办",
  "todo.unarchive": "取消归档待办",
  "note.create": "发布随笔",
  "note.update": "编辑随笔",
  "note.archive": "归档随笔",
  "note.unarchive": "取消归档随笔",
  "attachment.upload": "上传附件",
  "ai.enable": "启用 AI 分析",
  "ai.disable": "停用 AI 分析",
  "ai.pause": "暂停 AI 任务",
  "ai.resume": "继续 AI 任务",
  "ai.retry": "重试失败任务",
  "ai.rebuild": "重新规划任务",
  "settings.sso": "修改 SSO 配置",
  "settings.ai": "修改 AI 提供方",
  "user.admin": "调整站点管理员",
  "user.login": "登录",
};
