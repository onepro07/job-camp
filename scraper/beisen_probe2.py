"""批量探测北森招聘门户（zhiye.com）的企业子站。

接口公开：POST https://{tenant}.zhiye.com/api/Jobad/GetJobAdPageList
返回 Count 即该站公开岗位数。这里只探测，不抓正文。
"""
import json
import concurrent.futures as cf
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")

CANDIDATES = [
    # 已在库的企业（复核）
    ("boe", "京东方", "电子制造"), ("cttq", "正大天晴", "医药生物"),
    ("sinotrans", "中国外运", "物流运输"), ("hilton", "希尔顿", "酒店服务"),
    ("jmc", "江铃汽车", "汽车制造"), ("kanion", "康缘药业", "医药生物"),
    ("marriott", "万豪国际", "酒店服务"), ("dahua", "大华股份", "电子制造"),
    ("yiling", "以岭药业", "医药生物"), ("sunwoda", "欣旺达", "电子制造"),
    ("sph", "上海医药", "医药生物"), ("starbucks", "星巴克", "餐饮零售"),
    # 搜索里确认过的
    ("xiangyu", "象屿集团", "物流供应链"), ("kylinos", "麒麟软件", "软件"),
    ("siat", "深圳先进技术研究院", "科研机构"),
    # 金融
    ("cmbchina", "招商银行", "银行金融"), ("cib", "兴业银行", "银行金融"),
    ("spdb", "浦发银行", "银行金融"), ("citicbank", "中信银行", "银行金融"),
    ("cebbank", "光大银行", "银行金融"), ("hxb", "华夏银行", "银行金融"),
    ("bankofbeijing", "北京银行", "银行金融"), ("njcb", "南京银行", "银行金融"),
    ("pingan", "中国平安", "保险金融"), ("cpic", "中国太保", "保险金融"),
    ("chinalife", "中国人寿", "保险金融"), ("picc", "中国人保", "保险金融"),
    ("newchinalife", "新华保险", "保险金融"), ("cicc", "中金公司", "证券基金"),
    ("gtja", "国泰君安", "证券基金"), ("htsc", "华泰证券", "证券基金"),
    ("cmschina", "招商证券", "证券基金"), ("ebscn", "光大证券", "证券基金"),
    # 地产建筑
    ("vanke", "万科", "房地产"), ("poly", "保利发展", "房地产"),
    ("crland", "华润置地", "房地产"), ("longfor", "龙湖集团", "房地产"),
    ("countrygarden", "碧桂园", "房地产"), ("greenland", "绿地集团", "房地产"),
    ("cscec", "中国建筑", "建筑工程"), ("crec", "中国中铁", "建筑工程"),
    ("crcc", "中国铁建", "建筑工程"), ("cccc", "中国交建", "建筑工程"),
    ("mcc", "中国中冶", "建筑工程"), ("powerchina", "中国电建", "能源电力"),
    # 汽车
    ("faw", "中国一汽", "汽车制造"), ("saic", "上汽集团", "汽车制造"),
    ("dongfeng", "东风汽车", "汽车制造"), ("gac", "广汽集团", "汽车制造"),
    ("byd", "比亚迪", "汽车制造"), ("geely", "吉利汽车", "汽车制造"),
    ("changan", "长安汽车", "汽车制造"), ("gwm", "长城汽车", "汽车制造"),
    ("nio", "蔚来", "汽车制造"), ("xpeng", "小鹏汽车", "汽车制造"),
    ("lixiang", "理想汽车", "汽车制造"), ("leapmotor", "零跑汽车", "汽车制造"),
    ("chery", "奇瑞汽车", "汽车制造"),
    # 科技电子
    ("zte", "中兴通讯", "通信设备"), ("lenovo", "联想集团", "电子制造"),
    ("inspur", "浪潮集团", "云计算"), ("tcl", "TCL", "电子制造"),
    ("hisense", "海信", "家电制造"), ("skyworth", "创维", "家电制造"),
    ("gree", "格力电器", "家电制造"), ("changhong", "长虹", "家电制造"),
    ("smic", "中芯国际", "半导体"), ("gotion", "国轩高科", "新能源"),
    ("btr", "贝特瑞", "新材料"), ("luxshare", "立讯精密", "电子制造"),
    ("foxconn", "富士康", "电子制造"), ("catl", "宁德时代", "新能源"),
    ("sunrisepd", "阳光电源", "新能源"), ("longi", "隆基绿能", "新能源"),
    ("trina", "天合光能", "新能源"), ("ja", "晶澳科技", "新能源"),
    # 医药
    ("hengrui", "恒瑞医药", "医药生物"), ("beigene", "百济神州", "医药生物"),
    ("innovent", "信达生物", "医药生物"), ("wuxiapptec", "药明康德", "医药生物"),
    ("tasly", "天士力", "医药生物"), ("crsanjiu", "华润三九", "医药生物"),
    ("fosunpharma", "复星医药", "医药生物"), ("livzon", "丽珠医药", "医药生物"),
    ("simcere", "先声药业", "医药生物"), ("kelun", "科伦药业", "医药生物"),
    ("cspc", "石药集团", "医药生物"), ("sinopharm", "国药集团", "医药生物"),
    ("jumpcan", "济川药业", "医药生物"), ("hansoh", "翰森制药", "医药生物"),
    # 快消零售
    ("yili", "伊利集团", "食品饮料"), ("mengniu", "蒙牛", "食品饮料"),
    ("shuanghui", "双汇", "食品饮料"), ("nongfu", "农夫山泉", "食品饮料"),
    ("tsingtao", "青岛啤酒", "食品饮料"), ("masterkong", "康师傅", "食品饮料"),
    ("wahaha", "娃哈哈", "食品饮料"), ("unilever", "联合利华", "快消品"),
    ("pg", "宝洁", "快消品"), ("loreal", "欧莱雅", "快消品"),
    ("nestle", "雀巢", "食品饮料"), ("anta", "安踏", "零售连锁"),
    ("lining", "李宁", "零售连锁"), ("tobs", "滔搏", "零售连锁"),
    ("yonghui", "永辉超市", "零售连锁"), ("wumart", "物美", "零售连锁"),
    ("suning", "苏宁易购", "零售连锁"), ("haidilao", "海底捞", "餐饮零售"),
    ("luckin", "瑞幸咖啡", "餐饮零售"), ("yum", "百胜中国", "餐饮零售"),
    # 物流
    ("cosco", "中远海运", "物流运输"), ("sf", "顺丰", "物流运输"),
    ("yto", "圆通速递", "物流运输"), ("sto", "申通快递", "物流运输"),
    ("yunda", "韵达", "物流运输"), ("deppon", "德邦快递", "物流运输"),
    # 能源基建
    ("sinopec", "中国石化", "能源化工"), ("petrochina", "中国石油", "能源化工"),
    ("cnooc", "中国海油", "能源化工"), ("chnenergy", "国家能源集团", "能源电力"),
    ("spic", "国家电投", "能源电力"), ("huaneng", "华能集团", "能源电力"),
    ("sgcc", "国家电网", "能源电力"), ("csg", "南方电网", "能源电力"),
    ("chinaresources", "华润集团", "综合集团"), ("sinochem", "中化集团", "能源化工"),
    # 通信互联网
    ("cmcc", "中国移动", "通信运营"), ("chinaunicom", "中国联通", "通信运营"),
    ("chinatelecom", "中国电信", "通信运营"), ("netease", "网易", "互联网"),
    ("baidu", "百度", "互联网"), ("meituan", "美团", "互联网"),
    ("kuaishou", "快手", "互联网"), ("bilibili", "哔哩哔哩", "互联网"),
    ("ctrip", "携程", "互联网"), ("didi", "滴滴", "互联网"),
    # 其他
    ("xdf", "新东方", "教育培训"), ("offcn", "中公教育", "教育培训"),
    ("hyatt", "凯悦酒店", "酒店服务"), ("ihg", "洲际酒店", "酒店服务"),
    ("accor", "雅高集团", "酒店服务"), ("dhl", "DHL", "物流运输"),
    ("maersk", "马士基", "物流运输"), ("bosch", "博世", "汽车零部件"),
    ("siemens", "西门子", "工业制造"), ("schneider", "施耐德电气", "工业制造"),
    ("abb", "ABB", "工业制造"), ("emerson", "艾默生", "工业制造"),
]

API = "https://{t}.zhiye.com/api/Jobad/GetJobAdPageList"


def probe(item):
    tenant, name, industry = item
    req = urllib.request.Request(
        API.format(t=tenant),
        data=json.dumps({"PageIndex": 1, "PageSize": 1}).encode(),
        headers={"Content-Type": "application/json", "User-Agent": UA,
                 "Referer": f"https://{tenant}.zhiye.com/social"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            raw = r.read().decode("utf-8", "ignore")
        d = json.loads(raw.lstrip("\ufeff"))
        if d.get("Code") == 200:
            return (tenant, name, industry, int(d.get("Count") or 0))
    except Exception:
        pass
    return (tenant, name, industry, 0)


def main():
    with cf.ThreadPoolExecutor(max_workers=12) as ex:
        rows = list(ex.map(probe, CANDIDATES))
    alive = [r for r in rows if r[3] > 0]
    alive.sort(key=lambda x: -x[3])
    print(f"{len(alive)}/{len(rows)} 个站点有公开岗位\n")
    for t, n, ind, c in alive:
        print(f"OK  {n:<14}{ind:<10}{c:>6}  {t}.zhiye.com")
    with open("data/beisen_sites2.json", "w", encoding="utf-8") as f:
        json.dump([{"tenant": t, "name": n, "industry": i, "count": c}
                   for t, n, i, c in alive], f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
