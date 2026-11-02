import json, urllib.request, concurrent.futures as cf
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36"
C=[("chinamobile","中国移动","通信运营"),("cmcc","中国移动","通信运营"),("ctelecom","中国电信","通信运营"),
   ("cnmobile","中国移动","通信运营"),("sgcc","国家电网","能源电力"),("stategrid","国家电网","能源电力"),
   ("cscec8b","中建八局","建筑工程"),("cscec3b","中建三局","建筑工程"),("zhongjian","中国建筑","建筑工程"),
   ("sf-express","顺丰","物流运输"),("sfexpress","顺丰","物流运输"),("sfsy","顺丰","物流运输"),
   ("yili","伊利","食品饮料"),("ylgroup","伊利","食品饮料"),("nongfuspring","农夫山泉","食品饮料"),
   ("yonghui","永辉超市","零售连锁"),("suning","苏宁易购","零售连锁"),("masterkong","康师傅","食品饮料"),
   ("tingyi","康师傅","食品饮料"),("lenovo","联想","电子制造"),("haier","海尔","家电制造"),("midea","美的","家电制造"),
   ("gree","格力","家电制造"),("byd","比亚迪","汽车制造"),("vanke","万科","房地产"),("longfor","龙湖","房地产"),
   ("mindray","迈瑞医疗","医疗器械"),("united-imaging","联影医疗","医疗器械"),("smic","中芯国际","半导体"),
   ("ymtdzz","长江存储","半导体"),("longi","隆基绿能","新能源"),("sunrisepd","阳光电源","新能源"),
   ("trina","天合光能","新能源"),("tal","好未来","教育培训"),("ctrip","携程","互联网"),
   ("netease","网易","互联网"),("meituan","美团","互联网"),("cosco","中远海运","物流运输"),
   ("crc","华润","综合集团"),("chinaresources","华润","综合集团"),("sinopharm","国药","医药生物"),
   ("hengrui","恒瑞医药","医药生物"),("innovent","信达生物","医药生物"),("beigene","百济神州","医药生物"),
   ("crland","华润置地","房地产"),("poly","保利发展","房地产"),("sdic","国投","综合集团"),
   ("cgnpc","中广核","能源电力"),("chng","中国华能","能源电力"),("spic","国家电投","能源电力")]
API="https://{t}.zhiye.com/api/Jobad/GetJobAdPageList"
def probe(x):
    t,n,i=x
    try:
        req=urllib.request.Request(API.format(t=t),data=json.dumps({"PageIndex":1,"PageSize":1}).encode(),
            headers={"Content-Type":"application/json","User-Agent":UA,"Referer":f"https://{t}.zhiye.com/social"},method="POST")
        d=json.loads(urllib.request.urlopen(req,timeout=9).read().decode('utf-8','ignore').lstrip('\ufeff'))
        if d.get("Code")==200 and int(d.get("Count") or 0)>0:
            return (t,n,i,int(d.get("Count")))
    except Exception: pass
    return None
with cf.ThreadPoolExecutor(max_workers=12) as ex:
    rs=[r for r in ex.map(probe,C) if r]
seen=set(); out=[]
for t,n,i,c in sorted(rs,key=lambda x:-x[3]):
    if n in seen: continue
    seen.add(n); out.append((t,n,i,c))
print(f"{len(out)} 个新命中")
for t,n,i,c in out: print(f"OK  {n:<12}{i:<8}{c:>6}  {t}")
json.dump(out, open('data/probe3.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)
