"""北森招聘门户抓取 v3：42 家企业，目标 ~3000 条岗位。

与 v2 的差别：
1. 企业从 34 家扩到 42 家（按 scraper/data/counts.json 普查结果新增星巴克、长江存储、
   新华三、三一重工、国金证券、上海银行、德邦快递、中国船舶）
2. 分页深度 10 → 24 页（每家最多看 1200 条候选），库存大的企业能取到更多
3. 行业名统一到中信一级行业口径
4. 保留 v2 的「非专业岗过滤 + 同名去重 + 职级打分」

接口：POST https://{tenant}.zhiye.com/api/Jobad/GetJobAdPageList
列表项直接带 Duty / Require，不需要再请求详情页。

用法：python scraper/beisen_scrape3.py
输出：scraper/data/beisen3.json
"""
import json
import os
import re
import time
import urllib.request
from collections import Counter

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
API = "https://{t}.zhiye.com/api/Jobad/GetJobAdPageList"
OUT = "scraper/data"
MAX_PAGE = 24

# (tenant, 公司名, 中信一级行业, 目标条数)
SITES = [
    ("chery", "奇瑞汽车", "汽车", 200),
    ("cnnc", "中核集团", "公用事业", 190),
    ("chinalife", "中国人寿", "非银金融", 180),
    ("boe", "京东方", "电子", 150),
    ("picc", "中国人保", "非银金融", 150),
    ("xdf", "新东方", "社会服务", 110),
    ("leapmotor", "零跑汽车", "汽车", 110),
    ("gotion", "国轩高科", "电力设备", 90),
    ("cttq", "正大天晴", "医药生物", 90),
    ("united-imaging", "联影医疗", "医药生物", 90),
    ("ymtc", "长江存储", "电子", 90),
    ("wuxiapptec", "药明康德", "医药生物", 90),
    ("hilton", "希尔顿", "社会服务", 80),
    ("sinotrans", "中国外运", "交通运输", 80),
    ("h3c", "新华三", "计算机", 75),
    ("marriott", "万豪国际", "社会服务", 70),
    ("kanion", "康缘药业", "医药生物", 70),
    ("gjzq", "国金证券", "非银金融", 70),
    ("cicc", "中金公司", "非银金融", 65),
    ("changan", "长安汽车", "汽车", 65),
    ("dahua", "大华股份", "电子", 65),
    ("yiling", "以岭药业", "医药生物", 55),
    ("bosc", "上海银行", "银行", 55),
    ("xiangyu", "象屿集团", "交通运输", 55),
    ("mindray", "迈瑞医疗", "医药生物", 55),
    ("starbucks", "星巴克", "社会服务", 50),
    ("siat", "深圳先进技术研究院", "综合", 45),
    ("jmc", "江铃汽车", "汽车", 45),
    ("sph", "上海医药", "医药生物", 45),
    ("mengniu", "蒙牛", "食品饮料", 45),
    ("fosunpharma", "复星医药", "医药生物", 45),
    ("sany", "三一重工", "机械设备", 40),
    ("sunwoda", "欣旺达", "电子", 40),
    ("shuanghui", "双汇", "食品饮料", 35),
    ("ebscn", "光大证券", "非银金融", 35),
    ("kylinos", "麒麟软件", "计算机", 30),
    ("bankofbeijing", "北京银行", "银行", 30),
    ("miniso", "名创优品", "商贸零售", 25),
    ("tsingtao", "青岛啤酒", "食品饮料", 25),
    ("cmri", "中国移动研究院", "通信", 22),
    ("deppon", "德邦快递", "交通运输", 22),
]

# 非专业岗：门店/后勤/一线操作，不适合放进这个岗位库
DROP = re.compile(
    "兼职|实习|临时工|小时工|钟点|劳务|派遣|操作工|普工|技工|装配|焊工|电工|叉车|"
    "司机|保安|保洁|清洁|洗碗|传菜|服务员|店员|咖啡师|厨师|收银|导购|理货|分拣|"
    "装卸|快递员|骑手|配送员|营业员|促销|前台接待|客房|礼宾|门童|行李员|"
    "店长|店副理|值班经理|吧台|调酒|烘焙|面点|厨工|洗碗工|保洁员|绿化|门卫"
)

RANK = [
    (6, r"总监|负责人|首席|VP|副总裁|合伙人|院长|总经理"),
    (5, r"专家|资深|高级|主任|架构师"),
    (4, r"经理|主管|组长|leader|Leader"),
    (3, r"工程师|分析师|研究员|设计师|架构|算法|开发|科学家|顾问|律师|会计师|"
        r"产品经理|运营|战略|投资|风控|精算|注册|临床|医学|药研|QA|QC|研发"),
    (2, r"专员|助理|管培|培训生|储备"),
]

CITY_NAMES = ("北京 上海 广州 深圳 杭州 南京 成都 武汉 西安 苏州 天津 重庆 长沙 郑州 青岛 宁波 "
              "东莞 佛山 合肥 福州 厦门 济南 沈阳 大连 昆明 无锡 常州 南昌 贵阳 太原 石家庄 哈尔滨 "
              "长春 温州 嘉兴 绍兴 金华 台州 徐州 南通 扬州 惠州 中山 珠海 江门 汕头 湛江 兰州 银川 "
              "西宁 乌鲁木齐 呼和浩特 南宁 海口 三亚 泉州 洛阳 芜湖 保定 唐山 烟台 潍坊 临沂 淄博 "
              "威海 泰安 济宁 昆山 常熟 张家港 义乌 慈溪 余姚 晋江 石狮 廊坊 秦皇岛 鄂尔多斯 "
              "株洲 湘潭 襄阳 宜昌 九江 赣州 上饶 绵阳 德阳 宜宾 遵义 曲靖 包头 大庆 吉林 鞍山").split()
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
    ("职能管理", ["财务", "会计", "人力", "HR", "法务", "行政", "秘书", "培训", "战略"]),
]


def score(title):
    s = 0
    for w, pat in RANK:
        if re.search(pat, title, re.I):
            s = max(s, w)
    return s


def classify(title):
    for name, keys in FUNCS:
        for k in keys:
            if k.lower() in title.lower():
                return name
    return "其他"


def city_of(title, names):
    if names:
        c = str(names[0]).strip()
        for suf in ("特别行政区", "自治州", "地区", "市", "省"):
            if c.endswith(suf) and len(c) > len(suf):
                c = c[: -len(suf)]
        if c:
            return c
    m = CITY_PAT.search(title)
    return m.group(0) if m else "全国/多地"


def fetch(tenant, page, size=50):
    req = urllib.request.Request(
        API.format(t=tenant),
        data=json.dumps({"pageIndex": page, "pageSize": size}).encode(),
        headers={"Content-Type": "application/json", "User-Agent": UA,
                 "Referer": f"https://{tenant}.zhiye.com/social"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read().decode("utf-8", "ignore").lstrip("\ufeff"))


def main():
    companies, jobs = [], []
    for idx, (tenant, name, industry, quota) in enumerate(SITES, 1):
        pool, seen = [], set()
        page, total = 1, None
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
                if not title or DROP.search(title):
                    continue
                if title in seen:          # 同名岗位只留一条（多为多地同时招）
                    continue
                seen.add(title)
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
            time.sleep(0.35)

        # 专业度高的优先，同级按发布时间新的优先
        pool.sort(key=lambda x: (-x["rank"], x["published_at"] or ""), reverse=False)
        picked = [x for x in pool if x["rank"] >= 2][:quota]
        if len(picked) < quota:
            picked += [x for x in pool if x["rank"] < 2][: quota - len(picked)]
        jobs.extend(picked)
        companies.append({"name": name, "industry": industry, "tenant": tenant,
                          "count": len(picked), "stock": total})
        print(f"  [{idx:>2}/{len(SITES)}] {name:<14}{industry:<8} 库存 {str(total):>6} "
              f"候选 {len(pool):>4} → 入库 {len(picked):>3}")

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "beisen3.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"companies": companies, "jobs": jobs}, f, ensure_ascii=False, indent=1)

    print(f"\n合计 {len(jobs)} 条 / {len(companies)} 家企业 → {path}")
    print("行业：", dict(Counter(x["industry"] for x in jobs).most_common()))
    print("职能：", dict(Counter(x["func"] for x in jobs).most_common()))
    print("城市：", dict(Counter(x["city"] for x in jobs).most_common(12)))
    no_req = sum(1 for j in jobs if not j["require"])
    print(f"缺任职要求的：{no_req} 条（{no_req * 100 // max(1, len(jobs))}%）")


if __name__ == "__main__":
    main()
