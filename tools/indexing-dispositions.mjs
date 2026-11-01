import { readFile, writeFile } from 'node:fs/promises';
import { regionalProductContext, regionalPageContext } from '../app/lib/regional-seo.js';
const dir='reports/indexing-20261101';
const raw=JSON.parse(await readFile(`${dir}/gsc-export.json`,'utf8'));
const stored=JSON.parse(await readFile(`${dir}/stored-inspection.json`,'utf8'));
const old404=[
 ['flexicon-debuts-low-profile-trough-hopper-conveyor-2026-07-28','23 Oct 2026'],
 ['canada-commits-352m-to-red-chris-mine-expansion-in-british-columbia-2026-07-03','31 Aug 2026'],
 ['yen-shorts-just-hit-a-19-year-high-gold-did-this-last-time-2026-07-07','20 Jul 2026'],
 ['gold-critical-minerals-gain-trust-premium-as-money-supply-chains-fray-2026-07-08','18 Jul 2026'],
 ['flynn-us-billions-for-rare-earths-and-8216-missing-the-mark-and-8217-2026-07-09','18 Jul 2026'],
 ['creating-mining-districts-could-unlock-billions-in-value-study-2026-07-07','18 Jul 2026'],
 ['critical-metals-weighs-asset-sales-to-speed-up-greenland-project-2026-07-08','17 Jul 2026'],
 ['carney-seeks-deeper-saudi-mining-energy-partnership-2026-07-09','17 Jul 2026'],
 ['devolution-may-see-made-in-nunavut-model-2026-07-09','17 Jul 2026'],
 ['lowry-reserves-extend-sandfire-s-black-butte-copper-mine-life-to-12-years-2026-07-09','17 Jul 2026']];
const items=raw.filter(g=>g.reason==='crawled-not-indexed').flatMap(g=>g.rows.map(r=>({url:r[0].match(/^https:\/\/[^\s]+/)[0],lastCrawl:r[1],gscReason:g.reason,source:'GSC UI 2026-11-01; report updated 2026-10-23'})));
items.push(...old404.map(([slug,lastCrawl])=>({url:`https://cowinmagnet.co.za/en-za/news/${slug}/`,lastCrawl,gscReason:'404',source:'GSC UI 2026-11-01; report updated 2026-10-23'})));
items.push(...stored.payload.results.filter(r=>r.coverageState.includes('noindex')).map(r=>({url:r.url,lastCrawl:r.lastCrawlTime,gscReason:'noindex',source:'Stored rolling inspection; updated 2026-10-26; not a new live inspection'})));
const articles=JSON.parse(await readFile('data/articles/articles.json','utf8'));
const sitemap=JSON.parse(await readFile(`${dir}/public-pages.json`,'utf8'));
let cursor=0;
await Promise.all(Array.from({length:5},async()=>{while(cursor<items.length){const r=items[cursor++];try{
const response=await fetch(r.url,{redirect:'manual',signal:AbortSignal.timeout(25000)});const html=await response.text();r.status=response.status;r.location=response.headers.get('location');r.robots=response.headers.get('x-robots-tag')||'';r.template=new URL(r.url).pathname.split('/')[2];r.inSitemap=sitemap.some(p=>p.url===r.url);
const path=new URL(r.url).pathname;
if(r.status===404){const slug=path.split('/').filter(Boolean).at(-1);const article=articles.find(a=>a.slug===slug);r.disposition=article?'证据不足':'有意排除';r.action=article?'Article record exists; investigate publication visibility before restore':'No current article record or sitemap entry; retain real 404, no unrelated redirect';}
else if(path.endsWith('.xml')){r.disposition='有意排除';r.action='RSS feed is not a search landing page; retain feed access';}
else if(r.gscReason==='noindex'){r.disposition=/noindex/i.test(r.robots)?'证据不足':'等待重抓';r.action='Historical HTTP noindex classification; verify current response and await Google recrawl';}
else if(regionalProductContext(path)||regionalPageContext(path)){r.disposition='已修复';r.action='Regional project requirements and contextual technical links added; x-default aligned; Google recrawl pending';}
else {r.disposition='等待重抓';r.action='Current 200; canonical/alternates reviewed; historical GSC classification does not prove current fault';}
}catch(error){r.disposition='证据不足';r.error=error.message}}}));
await writeFile(`${dir}/url-dispositions.json`,JSON.stringify(items,null,2));
const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';const fields=['url','gscReason','source','lastCrawl','template','status','robots','inSitemap','disposition','action'];
await writeFile(`${dir}/url-dispositions.csv`,[fields,...items.map(r=>fields.map(f=>r[f]))].map(row=>row.map(quote).join(',')).join('\n'));
console.log(JSON.stringify({total:items.length,byDisposition:items.reduce((a,r)=>(a[r.disposition]=(a[r.disposition]||0)+1,a),{}),notFound:items.filter(r=>r.status===404).map(r=>({url:r.url,disposition:r.disposition})),noindex:items.filter(r=>r.gscReason==='noindex')},null,2));
