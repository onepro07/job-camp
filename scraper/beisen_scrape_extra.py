"""补充抓取：从招聘门户导航站挖到的新企业。

数据来源：resumemakeroffer.com 的企业页里带出的 *.zhiye.com 入口。
采样 420 页命中 6 个新门户，库存合计 1279 条。

输出 beisen_extra.json，之后与 beisen3.json 合并再导入。
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from beisen_scrape3 import (API, DROP, MAX_PAGE, UA, city_of, classify,  # noqa: E402
                            fetch, score)

OUT = "scraper/data"

# (tenant, 公司名, 中信一级行业, 目标条数)
EXTRA = [
    ("genertec", "通用技术集团", "综合", 160),
    ("hengdian2", "英洛华科技", "电子", 40),
    ("xingheng", "星恒电源", "电力设备", 40),
    ("szgas", "深圳燃气", "公用事业", 25),
    ("zhmag", "正海磁材", "电子", 14),
    ("xpgco", "厦门港务", "交通运输", 7),
]


def main():
    companies, jobs = [], []
    for idx, (tenant, name, industry, quota) in enumerate(EXTRA, 1):
        pool, seen, page, total = [], set(), 1, None
        while page <= MAX_PAGE and len(pool) < quota * 3:
            try:
                d = fetch(tenant, page)
            except Exception as e:
                print(f"  ! {name} 第 {page} 页失败: {type(e).__name__}")
                break
            rows = d.get("Data") or []
            if total is None:
                total = d.get("Count")
            if not rows:
                break
            for it in rows:
                title = (it.get("JobAdName") or "").strip()
                if not title or DROP.search(title) or title in seen:
                    continue
                seen.add(title)
                uid = it.get("Id") or it.get("JobAdId")
                pool.append({
                    "tenant": tenant, "company": name, "industry": industry,
                    "source_id": f"{tenant}-{uid}", "title": title,
                    "city": city_of(title, it.get("LocNames")),
                    "func": classify(title), "rank": score(title),
                    "duty": (it.get("Duty") or "").strip(),
                    "require": (it.get("Require") or "").strip(),
                    "years": it.get("YearsOfWorking"),
                    "published_at": (it.get("ChangeDate") or "")[:10] or None,
                    "url": f"https://{tenant}.zhiye.com/social/detail/{uid}",
                })
            page += 1
            time.sleep(0.35)

        pool.sort(key=lambda x: (-x["rank"], x["published_at"] or ""), reverse=False)
        picked = [x for x in pool if x["rank"] >= 2][:quota]
        if len(picked) < quota:
            picked += [x for x in pool if x["rank"] < 2][: quota - len(picked)]
        jobs.extend(picked)
        companies.append({"name": name, "industry": industry, "tenant": tenant,
                          "count": len(picked), "stock": total})
        print(f"  [{idx}/{len(EXTRA)}] {name:<12}{industry:<8} 库存 {str(total):>5} "
              f"候选 {len(pool):>4} → 入库 {len(picked):>3}")

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "beisen_extra.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"companies": companies, "jobs": jobs}, f, ensure_ascii=False, indent=1)
    print(f"\n合计 {len(jobs)} 条 / {len(companies)} 家 → {path}")


if __name__ == "__main__":
    main()
