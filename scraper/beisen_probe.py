"""探测北森（zhiye.com）招聘门户：哪些企业站点公开、岗位数量多少。

北森招聘门户的岗位接口是公开的：
    POST https://{tenant}.zhiye.com/api/Jobad/GetJobAdPageList
    {"PageIndex":1,"PageSize":50}
返回 {"Count": 岗位总数, "Data": [...]}，无需登录、无需鉴权头。

这里只做“哪些站点活着、各有多少岗位”的探测，不抓正文。
"""
import json
import concurrent.futures as cf
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")

CANDIDATES = [
    ("sinotrans", "中国外运", "物流运输"),
    ("cttq", "正大天晴", "医药生物"),
    ("jmc", "江铃汽车", "汽车制造"),
    ("fosun", "复星", "综合集团"),
    ("yiling", "以岭药业", "医药生物"),
    ("kanion", "康缘药业", "医药生物"),
    ("sunwoda", "欣旺达", "电子制造"),
    ("boe", "京东方", "电子制造"),
    ("midea", "美的集团", "家电制造"),
    ("haier", "海尔", "家电制造"),
    ("luxshare", "立讯精密", "电子制造"),
    ("catl", "宁德时代", "新能源"),
    ("byd", "比亚迪", "汽车制造"),
    ("geely", "吉利汽车", "汽车制造"),
    ("saic", "上汽集团", "汽车制造"),
    ("poly", "保利发展", "房地产"),
    ("crland", "华润置地", "房地产"),
    ("cmbchina", "招商银行", "银行金融"),
    ("pingan", "中国平安", "保险金融"),
    ("cscec", "中国建筑", "建筑工程"),
    ("crec", "中国中铁", "建筑工程"),
    ("cntower", "中国铁塔", "通信"),
    ("hikvision", "海康威视", "电子制造"),
    ("dahua", "大华股份", "电子制造"),
    ("medtronic", "美敦力", "医疗器械"),
    ("astrazeneca", "阿斯利康", "医药生物"),
    ("roche", "罗氏", "医药生物"),
    ("hilton", "希尔顿", "酒店服务"),
    ("marriott", "万豪国际", "酒店服务"),
    ("tobs", "滔搏", "零售连锁"),
    ("anta", "安踏", "零售连锁"),
    ("yum", "百胜中国", "餐饮连锁"),
    ("starbucks", "星巴克", "餐饮连锁"),
    ("sph", "上海医药", "医药生物"),
    ("sinopharm", "国药集团", "医药生物"),
    ("cosco", "中远海运", "物流运输"),
    ("sf", "顺丰", "物流运输"),
    ("jd", "京东", "电商零售"),
    ("xiaohongshu", "小红书", "互联网"),
    ("nio", "蔚来", "汽车制造"),
    ("xpeng", "小鹏汽车", "汽车制造"),
    ("lixiang", "理想汽车", "汽车制造"),
]

API = "https://{t}.zhiye.com/api/Jobad/GetJobAdPageList"


def probe(item):
    tenant, name, industry = item
    req = urllib.request.Request(
        API.format(t=tenant),
        data=json.dumps({"PageIndex": 1, "PageSize": 1}).encode(),
        headers={
            "Content-Type": "application/json",
            "User-Agent": UA,
            "Referer": f"https://{tenant}.zhiye.com/social",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            raw = r.read().decode("utf-8", "ignore")
        d = json.loads(raw.lstrip("\ufeff"))
        if d.get("Code") == 200:
            return (tenant, name, industry, int(d.get("Count") or 0), "ok")
        return (tenant, name, industry, 0, f"code={d.get('Code')}")
    except Exception as e:
        return (tenant, name, industry, 0, type(e).__name__)


def main():
    with cf.ThreadPoolExecutor(max_workers=10) as ex:
        rows = list(ex.map(probe, CANDIDATES))
    rows.sort(key=lambda x: -x[3])
    alive = [r for r in rows if r[4] == "ok" and r[3] > 0]
    print(f"{len(alive)}/{len(rows)} 个站点有公开岗位\n")
    for t, n, ind, c, _ in rows:
        mark = "OK " if c > 0 else "-- "
        print(f"{mark}{n:<10} {ind:<8} {c:>5}  {t}.zhiye.com")
    with open("data/beisen_sites.json", "w", encoding="utf-8") as f:
        json.dump([{"tenant": t, "name": n, "industry": i, "count": c}
                   for t, n, i, c, s in rows if c > 0], f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
