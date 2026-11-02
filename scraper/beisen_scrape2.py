"""从北森招聘门户抓取“优质岗位”（多企业、多行业）。

和上一版相比：
1. 企业从 12 家扩到 30 家，覆盖银行/保险/证券/汽车/新能源/医药/食品/教育/科研等
2. 加了岗位质量筛选：先剔除兼职、实习、门店服务、普工操作工一类，
   再按“职级词”打分排序，每家企业只取专业岗
"""
import json
import os
import re
import time
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
API = "https://{t}.zhiye.com/api/Jobad/GetJobAdPageList"
OUT = os.path.join(os.path.dirname(__file__), "data")

SITES = [
    # tenant,      公司名,        行业,        配额
    ("chinalife", "中国人寿", "保险金融", 40),
    ("picc", "中国人保", "保险金融", 40),
    ("chery", "奇瑞汽车", "汽车制造", 36),
    ("boe", "京东方", "电子制造", 36),
    ("cicc", "中金公司", "证券基金", 30),
    ("changan", "长安汽车", "汽车制造", 30),
    ("wuxiapptec", "药明康德", "医药生物", 30),
    ("leapmotor", "零跑汽车", "汽车制造", 30),
    ("cttq", "正大天晴", "医药生物", 28),
    ("xdf", "新东方", "教育培训", 28),
    ("united-imaging", "联影医疗", "医疗器械", 26),
    ("mindray", "迈瑞医疗", "医疗器械", 24),
    ("hilton", "希尔顿", "酒店服务", 24),
    ("sinotrans", "中国外运", "物流运输", 24),
    ("dahua", "大华股份", "电子制造", 22),
    ("xiangyu", "象屿集团", "物流供应链", 22),
    ("siat", "深圳先进技术研究院", "科研机构", 22),
    ("gotion", "国轩高科", "新能源", 22),
    ("mengniu", "蒙牛", "食品饮料", 22),
    ("kanion", "康缘药业", "医药生物", 22),
    ("yiling", "以岭药业", "医药生物", 18),
    ("jmc", "江铃汽车", "汽车制造", 18),
    ("sph", "上海医药", "医药生物", 18),
    ("ebscn", "光大证券", "证券基金", 18),
    ("bankofbeijing", "北京银行", "银行金融", 18),
    ("marriott", "万豪国际", "酒店服务", 16),
    ("fosunpharma", "复星医药", "医药生物", 16),
    ("kylinos", "麒麟软件", "软件", 14),
    ("sunwoda", "欣旺达", "电子制造", 12),
    ("shuanghui", "双汇", "食品饮料", 12),
    ("tsingtao", "青岛啤酒", "食品饮料", 6),
    ("cnnc", "中核集团", "能源电力", 64),
    ("miniso", "名创优品", "零售连锁", 22),
    ("cmri", "中国移动研究院", "通信运营", 18),
]

# 明确要剔除的“非专业岗”
DROP = re.compile(
    "兼职|实习|临时工|小时工|钟点|劳务|派遣|操作工|普工|技工|装配|焊工|电工|叉车|"
    "司机|保安|保洁|清洁|洗碗|传菜|服务员|店员|咖啡师|厨师|收银|导购|理货|分拣|"
    "装卸|快递员|骑手|配送员|营业员|促销|前台接待|客房|礼宾|门童|行李员"
)

# 职级/专业度打分：分数越高越“优质”
RANK = [
    (6, r"总监|负责人|首席|VP|副总裁|合伙人|院长|总经理"),
    (5, r"专家|资深|高级|主任|架构师|首席"),
    (4, r"经理|主管|组长|leader|Leader"),
    (3, r"工程师|分析师|研究员|设计师|架构|算法|开发|科学家|顾问|律师|会计师|"
        r"产品经理|运营|战略|投资|风控|精算|注册|临床|医学|药研|QA|QC|研发"),
    (2, r"专员|助理|管培|培训生|储备"),
]

CITY_NAMES = ("北京 上海 广州 深圳 杭州 南京 成都 武汉 西安 苏州 天津 重庆 长沙 郑州 青岛 宁波 "
              "东莞 佛山 合肥 福州 厦门 济南 沈阳 大连 昆明 无锡 常州 南昌 贵阳 太原 石家庄 哈尔滨 "
              "长春 温州 嘉兴 绍兴 金华 台州 徐州 南通 扬州 惠州 中山 珠海 江门 汕头 湛江 兰州 银川 "
              "西宁 乌鲁木齐 呼和浩特 南宁 海口 三亚 泉州 洛阳 芜湖 保定 唐山 烟台 潍坊 临沂 淄博 "
              "威海 泰安 济宁 昆山 常熟 张家港 义乌 慈溪 余姚 晋江 石狮 保定 廊坊 秦皇岛").split()
CITY_PAT = re.compile("|".join(CITY_NAMES))

FUNCS = [
    ("技术", ["工程师", "开发", "研发", "算法", "架构", "测试", "运维", "程序", "技术", "IT", "数据", "科学"]),
    ("设计", ["设计", "美术", "视觉", "UI", "UX", "原画"]),
    ("产品", ["产品经理", "产品", "策划"]),
    ("运营", ["运营", "内容", "社群", "直播", "电商"]),
    ("销售", ["销售", "客户经理", "业务", "拓展", "招商", "BD", "渠道"]),
    ("市场", ["市场", "品牌", "营销", "公关", "推广", "媒介"]),
    ("生产制造", ["生产", "工艺", "设备", "车间", "质量", "质检", "制造"]),
    ("医疗专业", ["医师", "药师", "医学", "临床", "护士", "MSL", "注册", "药研"]),
    ("供应链", ["采购", "供应链", "物流", "仓储", "计划", "关务", "配送"]),
    ("金融专业", ["风控", "精算", "投资", "研究", "投行", "信贷", "理财", "合规", "审计"]),
    ("科研", ["研究员", "科学家", "博士后", "课题"]),
    ("职能管理", ["财务", "会计", "人力", "HR", "法务", "行政", "秘书", "审计", "培训", "战略"]),
]


def score(title: str) -> int:
    s = 0
    for w, pat in RANK:
        if re.search(pat, title, re.I):
            s = max(s, w)
    return s


def classify(title: str) -> str:
    for name, keys in FUNCS:
        for k in keys:
            if k.lower() in title.lower():
                return name
    return "其他"


def city_of(title: str, names) -> str:
    if names:
        c = str(names[0]).strip()
        for suf in ("特别行政区", "自治州", "地区", "市", "省"):
            if c.endswith(suf) and len(c) > len(suf):
                c = c[: -len(suf)]
        if c:
            return c
    m = CITY_PAT.search(title)
    return m.group(0) if m else "全国/多地"


def fetch(tenant: str, page: int, size: int = 50) -> dict:
    req = urllib.request.Request(
        API.format(t=tenant),
        data=json.dumps({"PageIndex": page, "PageSize": size}).encode(),
        headers={"Content-Type": "application/json", "User-Agent": UA,
                 "Referer": f"https://{tenant}.zhiye.com/social"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8", "ignore").lstrip("\ufeff"))


def main():
    companies, jobs = [], []
    for tenant, name, industry, quota in SITES:
        pool, seen_titles = [], {}
        page = 1
        while page <= 10 and len(pool) < quota * 3:
            try:
                d = fetch(tenant, page)
            except Exception as e:
                print(f"  {name} 第 {page} 页失败: {e}")
                break
            rows = d.get("Data") or []
            if not rows:
                break
            for it in rows:
                title = (it.get("JobAdName") or "").strip()
                if not title or DROP.search(title):
                    continue
                key = title
                if seen_titles.get(key, 0) >= 1:      # 同名岗位只留一条（多为多地招聘）
                    continue
                seen_titles[key] = 1
                uid = it.get("Id") or it.get("JobAdId")
                pool.append({
                    "tenant": tenant,
                    "company": name,
                    "industry": industry,
                    "source_id": f"{tenant}-{uid}",
                    "title": title,
                    "city": city_of(title, it.get("LocNames")),
                    "func": classify(title),
                    "rank": score(title),
                    "duty": (it.get("Duty") or "").strip(),
                    "require": (it.get("Require") or "").strip(),
                    "years": it.get("YearsOfWorking"),
                    "published_at": (it.get("ChangeDate") or "")[:10] or None,
                    "url": f"https://{tenant}.zhiye.com/social/detail/{uid}",
                })
            page += 1
            time.sleep(0.5)

        # 按“专业度 + 更新时间”排序，取前 quota 条
        pool.sort(key=lambda x: (-x["rank"], x["published_at"] or ""), reverse=False)
        picked = [x for x in pool if x["rank"] >= 2][:quota]
        if len(picked) < quota:
            picked += [x for x in pool if x["rank"] < 2][: quota - len(picked)]
        jobs.extend(picked)
        companies.append({"name": name, "industry": industry, "tenant": tenant, "count": len(picked)})
        print(f"  {name:<14}{industry:<10}候选 {len(pool):>4} → 入库 {len(picked):>3}")

    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "beisen2.json"), "w", encoding="utf-8") as f:
        json.dump({"companies": companies, "jobs": jobs}, f, ensure_ascii=False, indent=1)

    from collections import Counter
    print(f"\n合计 {len(jobs)} 条 / {len(companies)} 家企业")
    print("行业：", dict(Counter(x["industry"] for x in jobs).most_common()))
    print("职能：", dict(Counter(x["func"] for x in jobs).most_common()))
    print("城市：", dict(Counter(x["city"] for x in jobs).most_common(10)))


if __name__ == "__main__":
    main()
