"""把抓到的岗位数据生成分批 INSERT 语句。

腾讯岗位不公开薪资，salary 字段留空由前端显示"面议"。
职责描述截断到 200 字，避免单条 SQL 过长。
"""
import json
import os

HERE = os.path.dirname(__file__)
SRC = os.path.join(HERE, "data", "tencent.json")
OUT = os.path.join(HERE, "data")
BATCH = 10
LIMIT = 20          # 首轮入库条数
DESC_MAX = 70


def esc(s: str) -> str:
    if s is None:
        return "NULL"
    return "'" + str(s).replace("\\", "\\\\").replace("'", "''") + "'"


def arr(items):
    safe = [i.replace("'", "''") for i in items if i]
    inner = ",".join("'" + i + "'" for i in safe)
    return f"ARRAY[{inner}]::text[]" if inner else "NULL"


def main():
    data = json.load(open(SRC, encoding="utf-8"))
    items = data["items"][:LIMIT]

    rows = []
    for it in items:
        desc = (it.get("responsibility") or "").strip().replace("\r", "")
        if len(desc) > DESC_MAX:
            desc = desc[:DESC_MAX] + "…"
        tags = [it.get("bg"), it.get("category")]
        rows.append("(" + ", ".join([
            "1",
            esc(it["title"]),
            esc(it["city"]),
            esc(it.get("experience") or "不限"),
            "'社招'",
            arr(tags),
            esc(desc),
            "'tencent'",
            esc(it["source_id"]),
            esc(it.get("url")),
            esc(it.get("published_at")) if it.get("published_at") else "NULL",
        ]) + ")")

    cols = ("(company_id, title, city, experience, job_type, tags, description, "
            "source, source_id, source_url, published_at)")

    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i + BATCH]
        sql = f"INSERT INTO jobs {cols} VALUES\n" + ",\n".join(chunk)
        path = os.path.join(OUT, f"insert_{i // BATCH + 1}.sql")
        with open(path, "w", encoding="utf-8") as f:
            f.write(sql)
        print(f"{os.path.basename(path)}: {len(chunk)} 条, {len(sql)} 字节")

    print(f"\n共 {len(rows)} 条，分 {(len(rows) + BATCH - 1) // BATCH} 批")


if __name__ == "__main__":
    main()
