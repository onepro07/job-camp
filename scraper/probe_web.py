import concurrent.futures as cf, urllib.request, json
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36"
URLS=[
 ("国家电网","https://zhaopin.sgcc.com.cn/"),
 ("中国移动","https://job.10086.cn/"),
 ("中国联通","https://career.chinaunicom.cn/"),
 ("中国电信","https://hr.chinatelecom.com.cn/"),
 ("中石油","https://hr.cnpc.com.cn/"),
 ("中石化","https://job.sinopec.com/"),
 ("中建","https://job.cscec.com/"),
 ("中国中铁","https://www.crec.cn/rlzy/"),
 ("中广核","https://job.cgnpc.com.cn/"),
 ("永辉","https://job.yonghui.cn/"),
 ("苏宁","https://careers.suning.com/"),
 ("国聘","https://www.iguopin.com/"),
 ("华润","https://careers.crc.com.cn/"),
 ("南方电网","https://job.csg.cn/"),
 ("中粮","https://job.cofco.com/"),
 ("中国铁建","https://job.crcc.cn/"),
]
def chk(x):
    n,u=x
    try:
        req=urllib.request.Request(u,headers={"User-Agent":UA})
        with urllib.request.urlopen(req,timeout=12) as r:
            body=r.read(200000)
            return (n,u,r.status,r.geturl(),len(body))
    except Exception as e:
        return (n,u,0,type(e).__name__,0)
with cf.ThreadPoolExecutor(max_workers=8) as ex:
    for n,u,s,fin,ln in ex.map(chk,URLS):
        print(f"{s:>4} {n:<6} {ln:>7}B  {fin[:70]}")
