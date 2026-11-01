import pg from 'pg';
import { mkdir, writeFile } from 'node:fs/promises';
const url=new URL(process.env.DATABASE_URL); url.searchParams.delete('ssl'); url.searchParams.delete('sslmode');
const db=new pg.Client({connectionString:url.href,ssl:{rejectUnauthorized:false}});
await db.connect();
try {
 const {rows}=await db.query('SELECT payload, updated_at FROM africa_json_documents WHERE path=$1',['data/seo/gsc-url-inspection.json']);
 await mkdir('reports/indexing-20261101',{recursive:true});
 await writeFile('reports/indexing-20261101/stored-inspection.json',JSON.stringify(rows[0],null,2));
 const results=rows[0]?.payload?.results||[];
 console.log(JSON.stringify({updatedAt:rows[0]?.updated_at,counts:rows[0]?.payload?.byCoverageState,affected:results.filter(r=>r.verdict!=='PASS').map(({referringUrls,sitemap,...r})=>r)},null,2));
} finally {await db.end()}
