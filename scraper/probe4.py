import json, urllib.request, concurrent.futures as cf
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36"
C=[("cscec1b","中建一局","建筑工程"),("cscec2b","中建二局","建筑工程"),("cscec3b","中建三局","建筑工程"),
   ("cscec8b","中建八局","建筑工程"),("cscec","中国建筑","建筑工程"),("scg","上海建工","建筑工程"),
   ("bucg","北京城建","建筑工程"),("ceec","中国能建","能源电力"),("cncec","中国化学","能源化工"),
   ("gzb","葛洲坝","建筑工程"),("crcc","中国铁建","建筑工程"),("crec","中国中铁","建筑工程"),
   ("ctg","三峡集团","能源电力"),("cnnc","中核集团","能源电力"),("cgnpc","中广核","能源电力"),
   ("cdt","大唐集团","能源电力"),("chd","华电集团","能源电力"),("chnenergy","国家能源","能源电力"),
   ("chinacoal","中煤集团","能源电力"),("sdicpower","国投电力","能源电力"),
   ("cntower","中国铁塔","通信运营"),("cmri","中国移动研究院","通信运营"),("chinatelecom","中国电信","通信运营"),
   ("rtmart","大润发","零售连锁"),("crv","华润万家","零售连锁"),("miniso","名创优品","零售连锁"),
   ("haiziwang","孩子王","零售连锁"),("watsons","屈臣氏","零售连锁"),("lawson","罗森","零售连锁"),
   ("familymart","全家","零售连锁"),("hema","盒马","零售连锁"),("wumart","物美","零售连锁"),
   ("yonghui","永辉超市","零售连锁"),("suning","苏宁易购","零售连锁"),("bbk","步步高","零售连锁"),
   ("jdsy","京东","互联网"),("sf-express","顺丰","物流运输"),("anneng","安能物流","物流运输"),
   ("tjbm","天津渤海","能源化工"),("sinomach","国机集团","工业制造"),("crrc","中国中车","工业制造"),
   ("csr","中车株机","工业制造"),("cmbchina","招商银行","银行金融"),("ccb","建设银行","银行金融")]
API="https://{t}.zhiye.com/api/Jobad/GetJobAdPageList"
def probe(x):
    t,n,i=x
    try:
        req=urllib.request.Request(API.format(t=t),data=json.dumps({"PageIndex":1,"PageSize":1}).encode(),
            headers={"Content-Type":"application/json","User-Agent":UA,"Referer":f"https://{t}.zhiye.com/social"},method="POST")
        d=json.loads(urllib.request.urlopen(req,timeout=9).read().decode('utf-8','ignore').lstrip('\ufeff'))
        if d.get("Code")==200 and int(d.get("Count") or 0)>0: return (t,n,i,int(d.get("Count")))
    except Exception: pass
    return None
with cf.ThreadPoolExecutor(max_workers=12) as ex:
    rs=[r for r in ex.map(probe,C) if r]
seen=set(); out=[]
for t,n,i,c in sorted(rs,key=lambda x:-x[3]):
    if n in seen: continue
    seen.add(n); out.append((t,n,i,c))
print(f"{len(out)} 个命中")
for t,n,i,c in out: print(f"OK  {n:<12}{i:<8}{c:>6}  {t}.zhiye.com")
json.dump(out, open('data/probe4.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)
