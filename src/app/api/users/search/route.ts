import { handler, json } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { HttpError, projectRole } from "@/lib/perms";

// User lookup for the "add member" picker: project admins only, at most 8 matches.
export const GET = handler(async (req) => {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "请先登录");
  const url = new URL(req.url);
  const projectId = Number(url.searchParams.get("project"));
  if ((await projectRole(user, projectId)) !== "admin") throw new HttpError(403, "权限不足");
  const q = (url.searchParams.get("q") ?? "").trim().replace(/^@/, "").slice(0, 40);
  const like = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
  const rows = await sql<{ id: number; username: string; display_name: string | null; avatar_url: string | null; role: string | null }[]>`
    SELECT u.id, u.username, u.display_name, u.avatar_url, m.role
    FROM users u LEFT JOIN project_members m ON m.user_id = u.id AND m.project_id = ${projectId}
    WHERE ${q} = '' OR u.username ILIKE ${like} OR u.display_name ILIKE ${like}
    ORDER BY (m.role IS NULL) DESC, (lower(u.username) = lower(${q})) DESC, u.username
    LIMIT 8`;
  return json(rows);
});
