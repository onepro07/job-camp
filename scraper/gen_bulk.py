"""批量补岗位：紧凑 SQL 生成器。

为降低单条 SQL 体积：
- url 不入库，前端用 source + source_id 拼出来
- job_type 走列默认值，INSERT 里省略
- description 裁到 80 字
"""
import json
import os

HERE = os.path.dirname(__file__)
SRC = os.path.join(HERE, "data", "tencent.json")
OUT = os.path.join(HERE, "data", "bulk")
os.makedirs(OUT, exist_ok=True)

PER_FILE = 25
DESC_MAX = 80
SKIP = 20          # 前 20 条已入库


def esc(s):
    if s is None:
        return "NULL"
    return "'" + str(s).replace("\\", "\\\\").replace("'", "''") + "'"


def arr(items):
    safe = [i.replace("'", "''") for i in items if i]
    inner = ",".join("'" + i + "'" for i in safe)
    return "ARRAY[" + inner + "]::text[]" if inner else "NULL"


def main():
    items = json.load(open(SRC, encoding="utf-8"))["items"][SKIP:]

    for f in os.listdir(OUT):
        if f.endswith(".sql"):
            os.remove(os.path.join(OUT, f))

    cols = "(company_id, title, city, experience, tags, description, source, source_id, published_at)"
    rows = []
    for it in items:
        desc = (it.get("responsibility") or "").strip().replace("\r", "").replace("\n", "")
        if len(desc) > DESC_MAX:
            desc = desc[:DESC_MAX] + "…"
        rows.append("(" + ", ".join([
            "1", esc(it["title"]), esc(it["city"]),
            esc(it.get("experience") or "不限"),
            arr([it.get("bg"), it.get("category")]),
            esc(desc), "'tencent'", esc(it["source_id"]),
            esc(it.get("published_at")) if it.get("published_at") else "NULL",
        ]) + ")")

    n = 0
    for i in range(0, len(rows), PER_FILE):
        chunk = rows[i:i + PER_FILE]
        sql = ("INSERT INTO jobs " + cols + " VALUES\n" + ",\n".join(chunk)
               + "\nON CONFLICT (source, source_id) DO NOTHING;")
        open(os.path.join(OUT, f"{i // PER_FILE + 1:02d}.sql"), "w", encoding="utf-8").write(sql)
        n += 1

    sizes = [os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT)]
    print(f"{n} 个文件，{len(rows)} 条，单文件平均 {sum(sizes)/len(sizes)/1024:.1f} KB，"
          f"总计 {sum(sizes)/1024:.0f} KB")


if __name__ == "__main__":
    main()
