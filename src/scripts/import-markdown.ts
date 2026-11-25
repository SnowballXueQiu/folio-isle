// Import a folder of Markdown files (e.g. a Yuque/语雀 "lakebook" Markdown export) into a library.
//
//   node dist/scripts/import-markdown.js --library <id> --user <username> [--publish] [--dry-run] <dir>
//
// Folder layout → tree:
//   foo.md                 → doc "foo"
//   foo/  (no foo.md)      → group "foo"
//   foo.md + foo/          → doc "foo" with children (a doc can have both a body and children)
//   foo.md + foo.png       → when foo.md is a 语雀画板 (lakeboard JSON) the PNG is uploaded and embedded
// Everything runs in one transaction through the same functions the editor uses, so every doc
// gets a version ("import" source), tree events and audit rows.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { makeSql } from "../lib/db";
import { createNode, publish } from "../lib/docs";
import { sha256 } from "../lib/crypto";
import { audit } from "../lib/audit";

type Entry = { title: string; md?: string; dir?: string; png?: string };

// Code-point order keeps ASCII-prefixed names ("AAA…") first and 主线 before 支线; digit runs compare
// numerically; prologues (序章/序言/前言/楔子) always come first.
const PROLOGUE = /^(序|前言|楔子)/;
function compareNames(a: string, b: string) {
  const pa = PROLOGUE.test(a), pb = PROLOGUE.test(b);
  if (pa !== pb) return pa ? -1 : 1;
  const sa = a.split(/(\d+)/), sb = b.split(/(\d+)/);
  for (let i = 0; i < Math.min(sa.length, sb.length); i++) {
    if (sa[i] === sb[i]) continue;
    if (i % 2 === 1) return Number(sa[i]) - Number(sb[i]);
    return sa[i] < sb[i] ? -1 : 1;
  }
  return sa.length - sb.length;
}
const SKIP = (n: string) => n.startsWith(".") || n === "__MACOSX";

/** 语雀 export replaces spaces with "_" in file names; keep underscores between capitals (RPG_WEAPON). */
export const titleOf = (stem: string) => stem.replace(/(?<![A-Z])_|_(?![A-Z])/g, " ").replace(/\s+/g, " ").trim() || stem;

function entries(dir: string): Entry[] {
  const names = readdirSync(dir).filter((n) => !SKIP(n));
  const map = new Map<string, Entry>();
  const get = (stem: string) => map.get(stem) ?? map.set(stem, { title: titleOf(stem) }).get(stem)!;
  for (const n of names) {
    const full = path.join(dir, n);
    if (statSync(full).isDirectory()) get(n).dir = full;
    else if (n.toLowerCase().endsWith(".md")) get(n.slice(0, -3)).md = full;
  }
  for (const n of names) if (n.toLowerCase().endsWith(".png") && map.get(n.slice(0, -4))?.md) map.get(n.slice(0, -4))!.png = path.join(dir, n);
  return [...map.entries()].sort((a, b) => compareNames(a[0], b[0])).map(([, e]) => e);
}

const isBoard = (text: string) => /^\s*\{\s*"format"\s*:\s*"lakeboard"/.test(text);

async function main() {
  const args = process.argv.slice(2);
  const opt = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args.splice(i, 2)[1] : undefined;
  };
  const flag = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? (args.splice(i, 1), true) : false;
  };
  const libraryId = Number(opt("--library"));
  const username = opt("--user");
  const doPublish = flag("--publish");
  const dryRun = flag("--dry-run");
  const root = args[0];
  if (!libraryId || !username || !root || !existsSync(root)) {
    console.error("usage: import-markdown --library <id> --user <username> [--publish] [--dry-run] <dir>");
    process.exit(2);
  }

  const sql = makeSql(2);
  try {
    const [lib] = await sql<{ id: number; project_id: number; name: string }[]>`SELECT id, project_id, name FROM libraries WHERE id = ${libraryId} AND deleted_at IS NULL`;
    if (!lib) throw new Error(`library ${libraryId} not found`);
    const [user] = await sql<{ id: number }[]>`SELECT id FROM users WHERE username = ${username}`;
    if (!user) throw new Error(`user ${username} not found`);
    const ctx = { actorId: user.id, projectId: lib.project_id, ip: null };
    let docs = 0, groups = 0, images = 0;

    await sql.begin(async (t) => {
      async function walk(dir: string, parentId: number | null, depth: number) {
        for (const e of entries(dir)) {
          let content = e.md ? readFileSync(e.md, "utf8").replace(/^﻿/, "").replace(/\r\n?/g, "\n") : undefined;
          const board = content !== undefined && isBoard(content);
          if (board) content = e.png ? "" : "> 原文是语雀画板，无法转换为文字。";
          const kind = content !== undefined ? "doc" : "group";
          console.log(`${"  ".repeat(depth)}${kind === "doc" ? "📄" : "📁"} ${e.title}${board ? (e.png ? " (画板→图片)" : " (画板，未转换)") : ""}${content === "" && !board ? " (空)" : ""}`);
          if (dryRun) {
            if (e.dir) await walk(e.dir, null, depth + 1);
            continue;
          }
          const fid = board && e.png ? randomUUID() : null;
          if (fid) content = `![${e.title}](/api/files/${fid})\n\n> 由语雀画板转换的图片。`;
          const id = await createNode(t, ctx, { libraryId, parentId, kind, title: e.title, content: content || undefined });
          if (kind === "doc") {
            docs++;
            if (fid && e.png) {
              const data = readFileSync(e.png);
              await t`INSERT INTO attachments (id, project_id, node_id, uploaded_by, filename, mime, size, sha256, data)
                      VALUES (${fid}, ${lib.project_id}, ${id}, ${user.id}, ${path.basename(e.png)}, 'image/png', ${data.length}, ${sha256(data)}, ${data})`;
              await audit(t, { ...ctx, objectType: "attachment", objectId: fid, action: "attachment.upload", detail: { node_id: id, size: data.length, mime: "image/png" } });
              images++;
            }
            if (doPublish) await publish(t, ctx, id);
          } else groups++;
          if (e.dir) await walk(e.dir, id, depth + 1);
        }
      }
      await walk(root, null, 0);
      if (!dryRun) await audit(t, { ...ctx, objectType: "library", objectId: libraryId, action: "library.import", detail: { docs, groups, images, published: doPublish } });
    });
    console.log(dryRun ? "dry run, nothing written" : `imported into 「${lib.name}」: ${docs} docs, ${groups} groups, ${images} images${doPublish ? ", all published" : ""}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
