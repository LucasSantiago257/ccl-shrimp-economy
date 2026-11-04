import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const env=Object.fromEntries((await readFile(new URL('../.env',import.meta.url),'utf8')).trim().split(/\r?\n/).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
const browser=await chromium.launch({channel:'msedge',headless:true});
const money=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value));
const kg=value=>new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:2}).format(Number(value))+' kg';
const base='http://127.0.0.1:15173';
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);
 await page.getByLabel('Usuário',{exact:true}).fill(env.APP_ADMIN_USERNAME);
 await page.getByLabel('Senha',{exact:true}).fill(env.APP_ADMIN_PASSWORD);
 await page.getByRole('button',{name:'Entrar no sistema',exact:true}).click();
 await page.getByRole('heading',{name:'Visão geral',exact:true}).waitFor();
 async function get(path) {
   const r=await page.request.get(base+'/api/v1'+path);
   assert.equal(r.status(),200,await r.text());return r.json();
 }
 const {date:day}=await get('/closings/status');
 const report=await get('/reports/result?from='+day+'&to='+day);
 async function navigate(name) {
   if(await page.getByRole('button',{name:'Abrir menu',exact:true}).isVisible()) await page.getByRole('button',{name:'Abrir menu',exact:true}).click();
   await page.getByRole('navigation').getByRole('button',{name,exact:true}).click();
 }
 for(const [path,label,value,weight] of [
   ['purchases','Compras','purchases','purchased_kg'],
   ['sales','Vendas','revenue','sold_kg']
 ]) {
   const url='/'+path+'?from='+day+'&to='+day+'&size=1';
   const first=await get(url);
   assert.ok(first.total>1,'Massa suficiente para verificar mais de uma página');
   assert.equal(Number(first.summary.total),Number(report.metrics[value]));
   assert.equal(Number(first.summary.quantity),Number(report.metrics[weight]));
   assert.deepEqual((await get(url+'&page=2')).summary,first.summary);
   const filtered=await get(url+'&q=NO-MATCH-PERIOD-UNIQUE');
   assert.equal(filtered.total,0);assert.equal(Number(filtered.summary.total),0);assert.equal(Number(filtered.summary.quantity),0);
   assert.equal((await page.request.get(base+'/api/v1/'+path+'?from='+day)).status(),422);
   assert.equal((await page.request.get(base+'/api/v1/'+path+'?from=2025-01-02&to=2025-01-01')).status(),422);
   await navigate(label);
   await page.getByLabel('Data inicial',{exact:true}).fill(day);
   await page.getByLabel('Data final',{exact:true}).fill(day);
   const ready=page.waitForResponse(r=>r.url().includes('/'+path+'?')&&r.url().includes('from='+day)&&r.ok());
   await page.getByRole('button',{name:'Aplicar período',exact:true}).click();await ready;
   const heading=path==='sales'?'Total vendido no período':'Total comprado no período';
   const card=page.locator('.kpi').filter({hasText:heading});
   await card.waitFor();
   assert.ok((await card.innerText()).includes(money(report.metrics[value])));
   const weightLabel=path==='sales'?'Quilos vendidos no período':'Quilos comprados no período';
   assert.ok((await page.locator('.kpi').filter({hasText:weightLabel}).innerText()).includes(kg(report.metrics[weight])));
   await page.setViewportSize({width:390,height:844});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }
 await navigate('Dashboards');
 const current=await get('/reports/result?from='+day.slice(0,7)+'-01&to='+day);
 const purchases=page.locator('.kpi').filter({hasText:'Compras no período'});
 await purchases.waitFor();
 assert.ok((await purchases.innerText()).includes(money(current.metrics.purchases)));
 assert.ok((await purchases.innerText()).includes(kg(current.metrics.purchased_kg)));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);
 console.log('OK: totais de compras/vendas por período, kg, paginação, busca, datas inválidas e Dashboard móvel.');
} finally { await browser.close(); }

