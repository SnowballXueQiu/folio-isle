// AI-suggested aliases become auto-links across the project, so only name-like strings are kept:
// no pronoun/demonstrative phrases (这群人、该群体、本作主角) and no generic category nouns (部门、特务组织、美少女).
const LEADING = /^(这|那|该|此|本|其|某|我|你|他|她|它|一个|一名|一位|这个|那个)/;
const GENERIC_TAIL = /(部门|组织|机构|群体|团体|团队|人员|成员|主角|配角|角色|人物|少女|少年|男子|女子|男人|女人|孩子|们|一族|势力|国家|城市|地区|地方|东西|物品|武器|装置|系统|概念|事件)$/;
const GENERIC_WHOLE = new Set(["主角", "女主", "男主", "反派", "部门", "组织", "群体", "美少女", "少女", "少年", "大人", "老师", "队长", "首领", "领袖", "上司", "前辈", "后辈"]);

export function isNameLikeAlias(alias: string, title: string): boolean {
  const a = alias.trim();
  if ([...a].length < 2 || a === title) return false;
  if (GENERIC_WHOLE.has(a) || LEADING.test(a)) return false;
  // a tail like 组织/部门 is fine when the alias is clearly a variant of the title (e.g. 御空使组织 for 御空使)
  if (GENERIC_TAIL.test(a) && !a.includes(title.replace(/\s*[（(][^）)]*[）)]\s*$/, ""))) return false;
  return true;
}
