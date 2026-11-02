"""腾讯招聘公开接口抓取。

数据来源：careers.tencent.com 的公开查询接口，仅抓取岗位标题、城市、职责等
公开可见信息，不涉及任何个人信息。抓取频率控制在 1 秒/次。
"""
import json
import os
import time
import urllib.request
import urllib.parse
from datetime import datetime

API = "https://careers.tencent.com/tencentcareer/api/post/Query"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")

OUT_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(OUT_DIR, exist_ok=True)


def fetch_page(page_index: int, page_size: int = 30) -> dict:
    qs = urllib.parse.urlencode({
        "timestamp": int(time.time() * 1000),
        "countryId": "", "cityId": "", "bgIds": "", "productId": "",
        "categoryId": "", "parentCategoryId": "", "attrId": "",
        "keyword": "", "pageIndex": page_index, "pageSize": page_size,
        "language": "zh-cn", "area": "cn",
    })
    req = urllib.request.Request(f"{API}?{qs}", headers={
        "User-Agent": UA,
        "Referer": "https://careers.tencent.com/",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=25) as resp:
        return json.loads(resp.read().decode("utf-8"))


def parse_date(s: str) -> str | None:
    """'2026年11月02日' -> '2026-11-02'"""
    if not s:
        return None
    try:
        return datetime.strptime(s.replace("年", "-").replace("月", "-").replace("日", ""), "%Y-%m-%d").date().isoformat()
    except ValueError:
        return None


def main(pages: int = 10, page_size: int = 30):
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
                "bg": (it.get("BGName") or "").strip(),
                "category": (it.get("CategoryName") or "").strip(),
                "product": (it.get("ProductName") or "").strip(),
                "experience": (it.get("RequireWorkYearsName") or "").strip(),
                "responsibility": (it.get("Responsibility") or "").strip(),
                "url": it.get("PostURL"),
                "published_at": parse_date(it.get("LastUpdateTime") or ""),
            })
        print(f"  第 {p} 页 {len(posts)} 条，累计 {len(rows)}")
        time.sleep(1)

    out = os.path.join(OUT_DIR, "tencent.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"total": total, "count": len(rows), "items": rows}, f, ensure_ascii=False, indent=1)
    print(f"\n完成：{len(rows)} 条 / 接口报告总数 {total}")
    print(f"输出：{out}")


if __name__ == "__main__":
    main()
