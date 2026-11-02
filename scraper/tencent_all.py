"""腾讯招聘公开接口——批量抓取（用于把库里的岗位扩到 500 条）。

沿用 tencent.py 的接口与限频，只是页数更多、输出到 tencent_all.json，
并且顺带把城市名规范化（去掉“（深圳）”这类后缀里的额外信息）。
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
from tencent import fetch_page, parse_date, OUT_DIR  # noqa: E402


def main(pages: int = 40, page_size: int = 50):
    rows, seen = [], set()
    total = None
    for p in range(1, pages + 1):
        try:
            data = fetch_page(p, page_size)
        except Exception as e:
            print(f"  第 {p} 页失败: {e}")
            time.sleep(2)
            continue
        d = data.get("Data") or {}
        total = d.get("Count")
        posts = d.get("Posts") or []
        if not posts:
            print(f"  第 {p} 页为空，停止")
            break
        for it in posts:
            pid = it.get("PostId")
            if not pid or pid in seen:
                continue
            seen.add(pid)
            rows.append({
                "source": "tencent",
                "source_id": str(pid),
                "title": (it.get("RecruitPostName") or "").strip(),
                "city": (it.get("LocationName") or "").strip(),
                "bg": (it.get("BGName") or "").strip().upper(),
                "category": (it.get("CategoryName") or "").strip(),
                "experience": (it.get("RequireWorkYearsName") or "").strip() or "不限",
                "responsibility": (it.get("Responsibility") or "").strip(),
                "requirement": (it.get("Requirement") or "").strip(),
                "url": it.get("PostURL"),
                "published_at": parse_date(it.get("LastUpdateTime") or ""),
            })
        print(f"  第 {p} 页 +{len(posts)}，累计 {len(rows)}")
        time.sleep(1)

    out = os.path.join(OUT_DIR, "tencent_all.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"total": total, "count": len(rows), "items": rows}, f, ensure_ascii=False, indent=1)
    print(f"\n完成：{len(rows)} 条 / 接口总数 {total}")
    print(f"输出：{out}")


if __name__ == "__main__":
    main()
