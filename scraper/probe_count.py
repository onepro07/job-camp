"""普查北森门户（zhiye.com）各企业的在架岗位数。

只调列表接口读 Count，不抓正文，速度快。
用途：决定「加大配额」还是「扩展企业」能凑够目标岗位量。

用法：python scraper/probe_count.py [--out scraper/data/counts.json]
"""
import concurrent.futures as cf
import json
import sys
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
API = "https://{t}.zhiye.com/api/Jobad/GetJobAdPageList"

# 已在库的 34 家（复核库存）
CURRENT = [
    ("chinalife", "中国人寿", "非银金融"), ("picc", "中国人保", "非银金融"),
    ("cicc", "中金公司", "非银金融"), ("ebscn", "光大证券", "非银金融"),
    ("bankofbeijing", "北京银行", "银行"), ("chery", "奇瑞汽车", "汽车"),
    ("changan", "长安汽车", "汽车"), ("leapmotor", "零跑汽车", "汽车"),
    ("jmc", "江铃汽车", "汽车"), ("boe", "京东方", "电子"),
    ("dahua", "大华股份", "电子"), ("sunwoda", "欣旺达", "电子"),
    ("wuxiapptec", "药明康德", "医药生物"), ("cttq", "正大天晴", "医药生物"),
    ("kanion", "康缘药业", "医药生物"), ("yiling", "以岭药业", "医药生物"),
    ("sph", "上海医药", "医药生物"), ("fosunpharma", "复星医药", "医药生物"),
    ("united-imaging", "联影医疗", "医药生物"), ("mindray", "迈瑞医疗", "医药生物"),
    ("xdf", "新东方", "社会服务"), ("hilton", "希尔顿", "社会服务"),
    ("marriott", "万豪国际", "社会服务"), ("sinotrans", "中国外运", "交通运输"),
    ("xiangyu", "象屿集团", "交通运输"), ("siat", "深圳先进技术研究院", "综合"),
    ("gotion", "国轩高科", "电力设备"), ("mengniu", "蒙牛", "食品饮料"),
    ("shuanghui", "双汇", "食品饮料"), ("tsingtao", "青岛啤酒", "食品饮料"),
    ("kylinos", "麒麟软件", "计算机"), ("cnnc", "中核集团", "公用事业"),
    ("miniso", "名创优品", "商贸零售"), ("cmri", "中国移动研究院", "通信"),
]

# 候选：各行业头部企业，tenant 为常见拼音/英文缩写
CANDIDATES = [
    # 银行
    ("cmbchina", "招商银行", "银行"), ("cib", "兴业银行", "银行"),
    ("spdb", "浦发银行", "银行"), ("citicbank", "中信银行", "银行"),
    ("cebbank", "光大银行", "银行"), ("hxb", "华夏银行", "银行"),
    ("njcb", "南京银行", "银行"), ("bosc", "上海银行", "银行"),
    ("cgbchina", "广发银行", "银行"), ("bankofningbo", "宁波银行", "银行"),
    ("psbc", "邮储银行", "银行"), ("cmbc", "民生银行", "银行"),
    # 保险
    ("pingan", "中国平安", "非银金融"), ("cpic", "中国太保", "非银金融"),
    ("newchinalife", "新华保险", "非银金融"), ("taikang", "泰康保险", "非银金融"),
    ("sinosafe", "阳光保险", "非银金融"),
    # 证券基金
    ("gtja", "国泰君安", "非银金融"), ("htsc", "华泰证券", "非银金融"),
    ("cmschina", "招商证券", "非银金融"), ("citics", "中信证券", "非银金融"),
    ("gjzq", "国金证券", "非银金融"), ("xyzq", "兴业证券", "非银金融"),
    # 地产建筑
    ("vanke", "万科", "房地产"), ("poly", "保利发展", "房地产"),
    ("crland", "华润置地", "房地产"), ("longfor", "龙湖集团", "房地产"),
    ("countrygarden", "碧桂园", "房地产"), ("greenland", "绿地集团", "房地产"),
    ("cscec", "中国建筑", "建筑装饰"), ("crec", "中国中铁", "建筑装饰"),
    ("crcc", "中国铁建", "建筑装饰"), ("cccc", "中国交建", "建筑装饰"),
    ("mcc", "中国中冶", "建筑装饰"), ("cscec3b", "中建三局", "建筑装饰"),
    ("cscec8b", "中建八局", "建筑装饰"),
    # 能源电力
    ("sgcc", "国家电网", "公用事业"), ("stategrid", "国家电网", "公用事业"),
    ("powerchina", "中国电建", "公用事业"), ("cgnpc", "中广核", "公用事业"),
    ("chng", "中国华能", "公用事业"), ("spic", "国家电投", "公用事业"),
    ("cec", "中国电子", "电子"), ("cnpc", "中国石油", "石油石化"),
    ("sinopec", "中国石化", "石油石化"), ("cnooc", "中国海油", "石油石化"),
    # 通信
    ("chinamobile", "中国移动", "通信"), ("ctelecom", "中国电信", "通信"),
    ("chinaunicom", "中国联通", "通信"), ("cmcc", "中国移动", "通信"),
    # 电子/半导体/家电
    ("lenovo", "联想", "电子"), ("haier", "海尔智家", "家用电器"),
    ("midea", "美的集团", "家用电器"), ("gree", "格力电器", "家用电器"),
    ("smic", "中芯国际", "电子"), ("ymtc", "长江存储", "电子"),
    ("huawei", "华为", "电子"), ("zte", "中兴通讯", "通信"),
    ("luxshare", "立讯精密", "电子"), ("goertek", "歌尔股份", "电子"),
    ("tcl", "TCL", "家用电器"), ("hisense", "海信", "家用电器"),
    # 汽车/新能源
    ("byd", "比亚迪", "汽车"), ("geely", "吉利汽车", "汽车"),
    ("gwm", "长城汽车", "汽车"), ("nio", "蔚来", "汽车"),
    ("xpeng", "小鹏汽车", "汽车"), ("saic", "上汽集团", "汽车"),
    ("faw", "中国一汽", "汽车"), ("dongfeng", "东风汽车", "汽车"),
    ("catl", "宁德时代", "电力设备"), ("longi", "隆基绿能", "电力设备"),
    ("sunrisepd", "阳光电源", "电力设备"), ("trina", "天合光能", "电力设备"),
    ("eve", "亿纬锂能", "电力设备"), ("sungrow", "阳光电源", "电力设备"),
    ("bydauto", "比亚迪", "汽车"),
    # 医药
    ("sinopharm", "国药集团", "医药生物"), ("hengrui", "恒瑞医药", "医药生物"),
    ("innovent", "信达生物", "医药生物"), ("beigene", "百济神州", "医药生物"),
    ("cspc", "石药集团", "医药生物"), ("hansoh", "翰森制药", "医药生物"),
    ("zhangzhou", "漳州片仔癀", "医药生物"), ("tasly", "天士力", "医药生物"),
    # 食品饮料/消费
    ("yili", "伊利集团", "食品饮料"), ("nongfuspring", "农夫山泉", "食品饮料"),
    ("masterkong", "康师傅", "食品饮料"), ("wanglaoji", "王老吉", "食品饮料"),
    ("wuliangye", "五粮液", "食品饮料"), ("moutai", "贵州茅台", "食品饮料"),
    ("haidilao", "海底捞", "社会服务"), ("starbucks", "星巴克", "社会服务"),
    ("yumchina", "百胜中国", "社会服务"),
    # 零售物流
    ("yonghui", "永辉超市", "商贸零售"), ("suning", "苏宁易购", "商贸零售"),
    ("jd", "京东", "商贸零售"), ("sf-express", "顺丰", "交通运输"),
    ("sfexpress", "顺丰", "交通运输"), ("cosco", "中远海运", "交通运输"),
    ("ems", "中国邮政", "交通运输"), ("deppon", "德邦快递", "交通运输"),
    # 互联网/软件
    ("netease", "网易", "计算机"), ("meituan", "美团", "计算机"),
    ("ctrip", "携程", "计算机"), ("tal", "好未来", "社会服务"),
    ("kingsoft", "金山软件", "计算机"), ("yonyou", "用友网络", "计算机"),
    ("h3c", "新华三", "计算机"), ("inspur", "浪潮信息", "计算机"),
    # 其他制造
    ("sany", "三一重工", "机械设备"), ("zoomlion", "中联重科", "机械设备"),
    ("crrc", "中国中车", "机械设备"), ("csic", "中国船舶", "国防军工"),
    ("avic", "中国航空工业", "国防军工"), ("comac", "中国商飞", "国防军工"),
]


def probe(item):
    tenant, name, industry = item
    body = json.dumps({"pageIndex": 1, "pageSize": 1}).encode()
    req = urllib.request.Request(
        API.format(t=tenant), data=body,
        headers={"Content-Type": "application/json", "User-Agent": UA,
                 "Referer": f"https://{tenant}.zhiye.com/social"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=12) as r:
            d = json.loads(r.read().decode("utf-8", "ignore").lstrip("\ufeff"))
            if d.get("Code") == 200:
                return {"tenant": tenant, "name": name, "industry": industry,
                        "count": int(d.get("Count") or 0), "ok": True}
    except Exception as e:
        return {"tenant": tenant, "name": name, "industry": industry,
                "count": 0, "ok": False, "err": type(e).__name__}
    return {"tenant": tenant, "name": name, "industry": industry, "count": 0, "ok": False}


def main():
    out = "scraper/data/counts.json"
    if "--out" in sys.argv:
        out = sys.argv[sys.argv.index("--out") + 1]

    seen, items = set(), []
    for it in CURRENT + CANDIDATES:
        if it[0] in seen:
            continue
        seen.add(it[0])
        items.append(it)
    print(f"探测 {len(items)} 个门户…\n")

    results = []
    with cf.ThreadPoolExecutor(max_workers=10) as ex:
        for i, r in enumerate(ex.map(probe, items), 1):
            flag = "✓" if r["ok"] and r["count"] > 0 else "×"
            print(f"  [{i:>3}/{len(items)}] {flag} {r['tenant']:<18} {r['name']:<12} {r['count']:>5}")
            if r["ok"] and r["count"] > 0:
                results.append(r)

    with open(out, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=1)

    total = sum(r["count"] for r in results)
    print(f"\n可用门户 {len(results)} 家，在架岗位合计 {total} 条 → {out}")
    top = sorted(results, key=lambda r: -r["count"])[:15]
    print("\n库存前 15：")
    for r in top:
        print(f"  {r['name']:<12} {r['count']:>5}  ({r['tenant']})")


if __name__ == "__main__":
    main()
