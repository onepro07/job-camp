"""按日期分层抽样生成 INSERT，保证时间筛选有多天数据可测。

已入库前 10 条，这里从剩余条目里按 published_at 分组，每天最多取若干条。
"""
import json
import os
from collections import defaultdict

HERE = os.path.dirname(__file__)
SRC = os.path.join(HERE, "data", "tencent.json")
OUT = os.path.join(HERE, "data")
DESC_MAX = 70
PER_DAY = 8
TOTAL = 30
BATCH = 10


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
    items = data["items"][10:]          # 前 10 条已入库

    byday = defaultdict(list)
    for it in items:
        byday[it.get("published_at") or "unknown"].append(it)

    picked = []
    for day in sorted(byday, reverse=True):
        picked.extend(byday[day][:PER_DAY])
        if len(picked) >= TOTAL:
            break
    picked = picked[:TOTAL]

    rows = []
    for it in picked:
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

    cols = ("(company_id, title, city, experience, job_type, tags, description, "
            "source, source_id, source_url, published_at)")

    used = set()
    n = 0
    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i + BATCH]
        sql = f"INSERT INTO jobs {cols} VALUES\n" + ",\n".join(chunk)
        path = os.path.join(OUT, f"more_{i // BATCH + 1}.sql")
        open(path, "w", encoding="utf-8").write(sql)
        n += 1
        print(f"more_{i // BATCH + 1}.sql: {len(chunk)} 条, {len(sql)} 字节")

    days = sorted({it.get("published_at") for it in picked}, reverse=True)
    print(f"\n共 {len(rows)} 条，{n} 批；覆盖日期：{', '.join(d or '?' for d in days)}")


if __name__ == "__main__":
    main()
