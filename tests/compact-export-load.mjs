// Only after opening-export.browser.mjs, on its isolated MySQL. Never targets the operational database.
import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const env=Object.fromEntries((await readFile(new URL('../.env',import.meta.url),'utf8')).replace(/^\uFEFF/,'').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
const project=process.env.OPENING_TEST_PROJECT||'camarao-opening-v2-qa';
assert.ok(/^camarao-opening-[a-z0-9-]+$/.test(project));
function sql(query){return execFileSync('docker',['compose','-p',project,'-f','compose.yaml','-f','compose.test.yaml','-f','compose.profile-test.yaml','exec','-T','mysql','sh','-c','MYSQL_PWD="$MYSQL_PASSWORD" exec mysql -u"$MYSQL_USER" camarao_test --batch --skip-column-names'],{cwd:new URL('../',import.meta.url),stdio:['pipe','pipe','pipe'],input:query}).toString().trim();}
assert.equal(sql('SELECT DATABASE();'),'camarao_test');
function table(csv){return csv.replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(line=>line.split(';').map(s=>s.replace(/^"|"$/g,'')));}
const browser=await chromium.launch({channel:'msedge',headless:true});const c=await browser.newContext();const base='http://127.0.0.1:18080';
try{
 let csrf=await(await c.request.get(base+'/api/auth/csrf')).json();assert.equal((await c.request.post(base+'/api/login',{headers:{[csrf.header]:csrf.token},form:{username:env.APP_ADMIN_USERNAME,password:env.APP_ADMIN_PASSWORD}})).status(),204);
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bahia',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const before=await c.request.get(base+'/api/v1/reports/export?from='+day+'&to='+day+'&grouping=total');assert.equal(before.status(),200);const rows=table(await before.text());
 assert.equal(Number(rows[1][rows[0].indexOf('Saldo de caixa na data final (R$)')].replace(',','.')),510);
 assert.equal(Number(rows[1][rows[0].indexOf('Contas a receber na data final (R$)')].replace(',','.')),90);
 assert.equal(Number(rows[1][rows[0].indexOf('Total a pagar na data final (R$)')].replace(',','.')),100);
 sql(`SET SESSION cte_max_recursion_depth=11000;START TRANSACTION;
 INSERT INTO customers(name) VALUES('Cliente sintético do arquivo anual');SET @customer=LAST_INSERT_ID();
 INSERT INTO products(code,name,suggested_price,minimum_stock) VALUES('EXPORT-LOAD','Produto sintético do arquivo anual',20,0);SET @product=LAST_INSERT_ID();
 INSERT INTO stock_balances(product_id) VALUES(@product);
 INSERT INTO purchases(total,occurred_at,created_by) VALUES(100000,'2024-07-01 12:00:00','qa');SET @purchase=LAST_INSERT_ID();
 INSERT INTO purchase_items(purchase_id,product_id,quantity,unit_price,total) VALUES(@purchase,@product,10000,10,100000);SET @item=LAST_INSERT_ID();
 INSERT INTO stock_movements(product_id,type,quantity_delta,value_delta,purchase_item_id,occurred_at,created_by) VALUES(@product,'PURCHASE',10000,100000,@item,'2024-07-01 12:00:00','qa');
 CREATE TEMPORARY TABLE export_sequence AS WITH RECURSIVE seq AS (SELECT 1 AS n UNION ALL SELECT n+1 FROM seq WHERE n<10000) SELECT n FROM seq;
 SET @first=(SELECT COALESCE(MAX(id),0)+1 FROM sales);
 INSERT INTO sales(id,customer_id,total,cost_total,gross_total,discount_amount,occurred_at,created_by) SELECT @first+n-1,@customer,20,10,20,0,'2024-07-02 12:00:00','qa' FROM export_sequence;
 INSERT INTO sale_items(sale_id,product_id,quantity,unit_price,total,cost_unit,cost_total) SELECT @first+n-1,@product,1,20,20,10,10 FROM export_sequence;
 INSERT INTO stock_movements(product_id,type,quantity_delta,value_delta,sale_item_id,occurred_at,created_by) SELECT @product,'SALE',-1,-10,i.id,'2024-07-02 12:00:00','qa' FROM sale_items i WHERE i.sale_id>=@first;
 INSERT INTO financial_titles(nature,customer_id,sale_id,amount,issued_at,due_date) SELECT 'RECEIVABLE',@customer,@first+n-1,20,'2024-07-02 12:00:00','2024-07-31' FROM export_sequence;COMMIT;`);
 csrf=await(await c.request.get(base+'/api/auth/csrf')).json();
 const closed=await c.request.post(base+'/api/v1/closings',{headers:{[csrf.header]:csrf.token,'Idempotency-Key':randomUUID()},data:{from:'2024-01-01',to:'2024-12-31',note:'Arquivo sintético para comparação de tamanho'}});assert.equal(closed.status(),200,await closed.text());
 const id=(await closed.json()).id;
 const [snapshotBytes,titles]=sql('SELECT OCTET_LENGTH(snapshot_json),JSON_LENGTH(snapshot_json,\'$.records.titles\') FROM period_closures WHERE id='+id+';').split('\t').map(Number);
 const start=performance.now();const response=await c.request.get(base+'/api/v1/reports/export?from=2024-01-01&to=2024-12-31&grouping=month');assert.equal(response.status(),200);const bytes=await response.body();
 const data=table(bytes.toString('utf8'));assert.equal(data.length,13);assert.ok(bytes.length<16000);assert.ok(titles>=10000);assert.ok(snapshotBytes>1000000);
 const revenue=data[0].indexOf('Vendas líquidas (R$)'),result=data[0].indexOf('Resultado gerencial (R$)');
 assert.equal(data.slice(1).reduce((sum,row)=>sum+Number(row[revenue].replace(',','.')),0),200000);
 assert.equal(data.slice(1).reduce((sum,row)=>sum+Number(row[result].replace(',','.')),0),100000);
 console.log(JSON.stringify({status:'OK',documents:10000,monthlyRows:data.length-1,compactBytes:bytes.length,originalSnapshotBytes:snapshotBytes,exportMs:Math.round(performance.now()-start)}));
}catch(e){throw new Error(String(e.stack||e).replaceAll(env.APP_ADMIN_PASSWORD,'[senha omitida]'));}
finally{await browser.close();}
