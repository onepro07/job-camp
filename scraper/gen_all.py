"""生成全量导入包。

每 30 条一个 .sql 文件，可直接粘贴到云数据库管理面板执行。
已入库的记录用 source_id 去重（脚本按 UNIQUE(source, source_id) 生成
ON CONFLICT DO NOTHING，重复执行不会报错也不会重复插入）。
"""
import json
import os

HERE = os.path.dirname(__file__)
SRC = os.path.join(HERE, "data", "tencent.json")
OUT = os.path.join(HERE, "data", "import_all")
os.makedirs(OUT, exist_ok=True)

PER_FILE = 30
DESC_MAX = 120


def esc(s):
    if s is None:
        return "NULL"
    return "'" + str(s).replace("\\", "\\\\").replace("'", "''") + "'"


def arr(items):
    safe = [i.replace("'", "''") for i in items if i]
    inner = ",".join("'" + i + "'" for i in safe)
    return f"ARRAY[{inner}]::text[]" if inner else "NULL"


def main():
    data = json.load(open(SRC, encoding="utf-8"))
    items = data["items"]

    # 清掉之前生成的旧文件
    for f in os.listdir(OUT):
        if f.endswith(".sql"):
            os.remove(os.path.join(OUT, f))

    cols = ("(company_id, title, city, experience, job_type, tags, description, "
            "source, source_id, source_url, published_at)")

    rows = []
    for it in items:
        desc = (it.get("responsibility") or "").strip().replace("\r", "")
        if len(desc) > DESC_MAX:
            desc = desc[:DESC_MAX] + "…"
        rows.append("(" + ", ".join([
            "1", esc(it["title"]), esc(it["city"]),
            esc(it.get("experience") or "不限"), "'社招'",
            arr([it.get("bg"), it.get("category")]),
            esc(desc), "'tencent'", esc(it["source_id"]),
            esc(it.get("url")),
            esc(it.get("published_at")) if it.get("published_at") else "NULL",
        ]) + ")")

    files = 0
    for i in range(0, len(rows), PER_FILE):
        chunk = rows[i:i + PER_FILE]
        sql = (f"INSERT INTO jobs {cols} VALUES\n" + ",\n".join(chunk)
               + "\nON CONFLICT (source, source_id) DO NOTHING;")
        path = os.path.join(OUT, f"{i // PER_FILE + 1:02d}.sql")
        open(path, "w", encoding="utf-8").write(sql)
        files += 1

    total_size = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f"生成 {files} 个文件，共 {len(rows)} 条，{total_size / 1024:.0f} KB")
    print(f"目录：{OUT}")


if __name__ == "__main__":
    main()
