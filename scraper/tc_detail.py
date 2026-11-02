"""补齐腾讯岗位的完整职责与任职要求。

列表接口不返回 Requirement，详情接口才有：
    GET https://careers.tencent.com/tencentcareer/api/post/ByPostId?postId=xxx
只对库里已有的岗位逐个取一次，结果写 data/tc_detail.json。
"""
import json
import os
import concurrent.futures as cf
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
EP = "https://job-camp.app.workbuddy.host"
KEY = "wbpk_nwNlZ1h7pOQ3LHX58Ws34j_vFqMJilV8JocSACXhnlJ4wntdIAAZaN3"
OUT = os.path.join(os.path.dirname(__file__), "tmp")


def db_ids():
    ids = []
    for frm in range(0, 5000, 1000):
        req = urllib.request.Request(
            f"{EP}/.cloud/database/rest/v1/jobs?select=source_id&source=eq.tencent&limit=1000&offset={frm}",
            headers={"x-wb-webapp-access-key": KEY},
        )
        batch = json.loads(urllib.request.urlopen(req, timeout=20).read())
        ids += [r["source_id"] for r in batch]
        if len(batch) < 1000:
            break
    return ids


def fetch(pid):
    url = f"https://careers.tencent.com/tencentcareer/api/post/ByPostId?postId={pid}&language=zh-cn"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://careers.tencent.com/"})
        d = json.loads(urllib.request.urlopen(req, timeout=15).read().decode("utf-8"))
        data = d.get("Data") or {}
        return pid, (data.get("Responsibility") or "").strip(), (data.get("Requirement") or "").strip()
    except Exception:
        return pid, "", ""


def main():
    ids = db_ids()
    print("库内腾讯岗位", len(ids))
    out = {}
    with cf.ThreadPoolExecutor(max_workers=6) as ex:
        for i, (pid, resp, req) in enumerate(ex.map(fetch, ids), 1):
            if resp or req:
                out[pid] = {"resp": resp, "req": req}
            if i % 100 == 0:
                print(f"  {i}/{len(ids)}")
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "tc_detail.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    print(f"拿到详情 {len(out)} 条，其中有任职要求 {sum(1 for v in out.values() if v['req'])} 条")


if __name__ == "__main__":
    main()
