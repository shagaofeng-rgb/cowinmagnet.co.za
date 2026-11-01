import { mkdir, writeFile } from 'node:fs/promises';
const origin = process.env.SITE_URL || 'https://cowinmagnet.co.za';
const output = process.argv[2] || 'reports/indexing-20261101';
const xml = async url => (await fetch(url, {signal:AbortSignal.timeout(30000)})).text();
const locs = text => [...text.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1].replaceAll('&amp;','&'));
const index = await xml(origin+'/sitemap.xml');
const urls = /<sitemapindex/.test(index) ? [...new Set((await Promise.all(locs(index).map(xml))).flatMap(locs))] : locs(index);
const results = [];
let cursor=0;
await Promise.all(Array.from({length:6},async()=>{while(cursor<urls.length){const url=urls[cursor++];try {
 const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(30000)});const html=await response.text();
 const canonical=html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1]||'';
 const alternates=[...html.matchAll(/<link[^>]*hreflang=["']([^"']+)["'][^>]*href=["']([^"']+)/gi)].map(m=>({language:m[1],url:m[2]}));
 const main=html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]||'';
 const text=main.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
 const links=[...html.matchAll(/href=["']([^"'#]+)["']/gi)].map(m=>{try{return new URL(m[1],url).href.split('#')[0]}catch{return ''}}).filter(h=>h.startsWith(origin+'/en-za/')&&!/\.(css|js|png|jpg|pdf|xml|webp)(\?|$)/.test(h));
 results.push({url,status:response.status,canonical,robots:response.headers.get('x-robots-tag')||html.match(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']+)/i)?.[1]||'',alternates,words:text.split(/\s+/).length,text,links:[...new Set(links)]});
 }catch(error){results.push({url,error:error.message})}}}));
await mkdir(output,{recursive:true});
await writeFile(output+'/public-pages.json',JSON.stringify(results,null,2));
const known=new Set(urls);const linked=[...new Set(results.flatMap(r=>r.links||[]))].filter(u=>!known.has(u));
const outside=[];for(const url of linked){try{const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(15000)});outside.push({url,status:r.status,location:r.headers.get('location')})}catch(error){outside.push({url,error:error.message})}}
await writeFile(output+'/links-outside-sitemap.json',JSON.stringify(outside,null,2));
console.log(JSON.stringify({total:results.length,bad:results.filter(r=>r.status!==200||r.canonical!==r.url||/noindex/.test(r.robots)).map(({text,links,...r})=>r),brokenLinks:outside.filter(r=>r.status===404),globalDefault:results.filter(r=>r.alternates?.some(a=>a.language==='x-default'&&new URL(a.url).hostname!=='cowinmagnet.co.za')).length},null,2));
