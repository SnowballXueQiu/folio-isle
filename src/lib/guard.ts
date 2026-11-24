import "server-only";
import { currentUser, clientIp, type User } from "./auth";
import { nodeAccess, libraryAccess, HttpError, atLeast, type Role } from "./perms";

export async function needUser(): Promise<User> {
  const u = await currentUser();
  if (!u) throw new HttpError(401, "请先登录");
  return u;
}

export async function nodeCtx(nodeId: number, need: Role = "editor") {
  const user = await needUser();
  const acc = await nodeAccess(user, nodeId);
  if (!acc || !acc.canReadPublished) throw new HttpError(404, "不存在");
  if (!atLeast(acc.role, need)) throw new HttpError(403, "权限不足");
  return { user, acc, ctx: { actorId: user.id, projectId: acc.project.id, ip: await clientIp() } };
}

export async function libraryCtx(libraryId: number, need: Role = "editor") {
  const user = await needUser();
  const acc = await libraryAccess(user, libraryId);
  if (!acc || !acc.canRead) throw new HttpError(404, "不存在");
  if (!atLeast(acc.role, need)) throw new HttpError(403, "权限不足");
  return { user, acc, ctx: { actorId: user.id, projectId: acc.project.id, ip: await clientIp() } };
}

export const idParam = async (p: Promise<{ id: string }>) => {
  const n = Number((await p).id);
  if (!Number.isSafeInteger(n) || n <= 0) throw new HttpError(404, "不存在");
  return n;
};
