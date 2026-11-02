"""从北森招聘门户抓取公开岗位（多企业、多行业）。

接口公开、无需登录：
    POST https://{tenant}.zhiye.com/api/Jobad/GetJobAdPageList
按企业配额抓取，输出 data/beisen.json（含 companies 与 jobs 两部分）。

只取标题、地点、职责、要求、更新日期等公开字段，不含任何个人信息；
请求间隔 0.6 秒，单站点上限 200 条，避免给对方造成压力。
"""
import json
import os
import re
import time
import urllib.request
from datetime import datetime

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")

API = "https://{t}.zhiye.com/api/Jobad/GetJobAdPageList"
OUT = os.path.join(os.path.dirname(__file__), "data")

# 每家企业抓多少条（合计 500），按行业分散，避免又是“一家公司霸榜”
SITES = [
    # tenant,      公司名,        行业,        配额
    ("boe", "京东方", "电子制造", 80),
    ("cttq", "正大天晴", "医药生物", 65),
    ("sinotrans", "中国外运", "物流运输", 80),
    ("hilton", "希尔顿", "酒店服务", 55),
    ("jmc", "江铃汽车", "汽车制造", 60),
    ("kanion", "康缘药业", "医药生物", 32),
    ("marriott", "万豪国际", "酒店服务", 35),
    ("dahua", "大华股份", "电子制造", 30),
    ("yiling", "以岭药业", "医药生物", 20),
    ("sunwoda", "欣旺达", "电子制造", 20),
    ("sph", "上海医药", "医药生物", 13),
    ("starbucks", "星巴克", "餐饮零售", 10),
]

# 职能归类：按标题关键词映射到固定词表，供筛选使用
FUNCS = [
    ("技术", ["工程师", "开发", "研发", "算法", "架构", "测试", "运维", "程序", "技术", "IT", "数据"]),
    ("设计", ["设计", "美术", "视觉", "UI", "UX", "原画"]),
    ("产品", ["产品经理", "产品", "策划"]),
    ("运营", ["运营", "内容", "社群", "直播", "电商", "店铺"]),
    ("销售", ["销售", "客户经理", "业务", "拓展", "招商", "BD", "渠道"]),
    ("市场", ["市场", "品牌", "营销", "公关", "推广", "媒介"]),
    ("生产制造", ["生产", "工艺", "设备", "车间", "质量", "质检", "QA", "QC", "装配", "维修", "操作"]),
    ("医疗专业", ["医师", "药师", "医学", "临床", "护士", "药代", "MSL", "注册"]),
    ("供应链", ["采购", "供应链", "物流", "仓储", "计划", "关务", "配送"]),
    ("门店服务", ["咖啡师", "服务员", "店员", "厨师", "前台", "值班", "吧台", "见习"]),
    ("职能管理", ["财务", "会计", "人力", "HR", "法务", "行政", "秘书", "助理", "审计", "培训"]),
]


CITY_NAMES = ("北京 上海 广州 深圳 杭州 南京 成都 武汉 西安 苏州 天津 重庆 长沙 郑州 青岛 宁波 "
              "东莞 佛山 合肥 福州 厦门 济南 沈阳 大连 昆明 无锡 常州 南昌 贵阳 太原 石家庄 哈尔滨 "
              "长春 温州 嘉兴 绍兴 金华 台州 徐州 南通 扬州 惠州 中山 珠海 江门 汕头 湛江 兰州 银川 "
              "西宁 乌鲁木齐 呼和浩特 南宁 海口 三亚 泉州 洛阳 芜湖 保定 唐山 烟台 潍坊 临沂 淄博 "
              "威海 泰安 济宁 昆山 常熟 张家港 义乌 慈溪 余姚 晋江 石狮").split()
CITY_PAT = re.compile("|".join(CITY_NAMES))


def city_from_title(title: str) -> str | None:
    m = CITY_PAT.search(title)
    return m.group(0) if m else None


def classify(title: str) -> str:
    for name, keys in FUNCS:
        for k in keys:
            if k.lower() in title.lower():
                return name
    return "其他"


def clean_city(names) -> str | None:
    if not names:
        return None
    c = str(names[0]).strip()
    for suf in ("特别行政区", "自治州", "地区", "市", "省"):
        if c.endswith(suf) and len(c) > len(suf):
            c = c[: -len(suf)]
    return c or None


def fetch(tenant: str, page: int, size: int = 50) -> dict:
    req = urllib.request.Request(
        API.format(t=tenant),
        data=json.dumps({"PageIndex": page, "PageSize": size}).encode(),
        headers={
            "Content-Type": "application/json",
            "User-Agent": UA,
            "Referer": f"https://{tenant}.zhiye.com/social",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        raw = r.read().decode("utf-8", "ignore")
    return json.loads(raw.lstrip("\ufeff"))


def main():
    companies, jobs = [], []
    title_count = {}
    for tenant, name, industry, quota in SITES:
        got, page = 0, 1
        while got < quota and page <= 8:
            try:
                d = fetch(tenant, page)
            except Exception as e:
                print(f"  {name} 第 {page} 页失败: {e}")
                break
            rows = d.get("Data") or []
            if not rows:
                break
            for it in rows:
                if got >= quota:
                    break
                title = (it.get("JobAdName") or "").strip()
                if not title:
                    continue
                # 同一企业同名岗位最多留 2 条（星巴克这类门店岗标题全一样）
                key = (name, title)
                if title_count.get(key, 0) >= (5 if tenant == "starbucks" else 2):
                    continue
                uid = it.get("Id") or it.get("JobAdId")
                title_count[key] = title_count.get(key, 0) + 1
                jobs.append({
                    "tenant": tenant,
                    "company": name,
                    "industry": industry,
                    "source_id": f"{tenant}-{uid}",
                    "title": title,
                    "city": clean_city(it.get("LocNames")) or city_from_title(title) or "全国/多地",
                    "func": classify(title),
                    "salary": it.get("Salary"),
                    "duty": (it.get("Duty") or "").strip(),
                    "require": (it.get("Require") or "").strip(),
                    "degree": it.get("Degree"),
                    "years": it.get("YearsOfWorking"),
                    "published_at": (it.get("ChangeDate") or "")[:10] or None,
                    "url": f"https://{tenant}.zhiye.com/social/detail/{uid}",
                })
                got += 1
            page += 1
            time.sleep(0.6)
        companies.append({"name": name, "industry": industry, "tenant": tenant, "count": got})
        print(f"  {name:<8}{industry:<8} {got:>4} 条")

    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "beisen.json"), "w", encoding="utf-8") as f:
        json.dump({"companies": companies, "jobs": jobs}, f, ensure_ascii=False, indent=1)
    # 总配额可能超出 500，按企业顺序裁到 500
    if len(jobs) > 500:
        jobs = jobs[:500]
    print(f"\n合计 {len(jobs)} 条 / {len(companies)} 家企业")
    print("行业:", {k: v for k, v in sorted(
        {i: sum(1 for x in jobs if x["industry"] == i) for i in {c["industry"] for c in companies}}.items(),
        key=lambda kv: -kv[1])})


if __name__ == "__main__":
    main()
