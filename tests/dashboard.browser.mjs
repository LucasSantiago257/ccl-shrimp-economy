import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const envText = await readFile(new URL('../.env', import.meta.url),'utf8');
const env = Object.fromEntries(envText.trim().split(/\r?\n/).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
const browser = await chromium.launch({channel:'msedge',headless:true});
const base = 'http://127.0.0.1:15173';
try {
  const page = await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const endpoint='/api/v1/reports/dashboard';
  assert.equal((await page.request.get(base+endpoint+'?from=2024-10-29&to=2024-11-01')).status(),401);
  await page.goto(base);
  await page.getByLabel('Usuário',{exact:true}).fill(env.APP_ADMIN_USERNAME);
  await page.getByLabel('Senha',{exact:true}).fill(env.APP_ADMIN_PASSWORD);
  await page.getByRole('button',{name:'Entrar no sistema'}).click();
  await page.getByRole('heading',{name:'Visão geral',exact:true}).waitFor();
  async function load(from,to,path=endpoint) {
    const r=await page.request.get(base+path+'?from='+from+'&to='+to);
    assert.equal(r.status(),200,await r.text());
    return r.json();
  }
  const a='2024-10-29', b='2024-10-30', c='2024-11-01', d='2024-11-02';
  const initial=await load(a,d);
  // Re-runs reuse the historical fixture only in the designated isolated project.
  if(Number(initial.composition.sales_total)===0) {
    const seed=await readFile(new URL('./dashboard-fixture.sql',import.meta.url),'utf8');
    execFileSync('docker',['compose','-p','camarao-dashboard-qa','-f','compose.yaml','-f','compose.test.yaml','exec','-T','mysql','sh','-c',
      'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql -u"$MYSQL_USER" camarao_test'],{input:seed,cwd:root});
  }
  for(const [end,paid] of [[b,0],[c,700],[d,1000]]) {
    const result=await load(a,end), report=await load(a,end,'/api/v1/reports/result');
    assert.deepEqual(result.metrics,report.metrics);
    assert.equal(Number(result.composition.sales_total),1000);
    assert.equal(Number(result.composition.sales_paid),paid);
    assert.equal(Number(result.composition.purchases_paid),500);
    assert.equal(Number(result.metrics.receivables),1000-paid);
    for(const key of ['revenue','operating_result','received','paid','purchased_kg','sold_kg','lost_kg']){
      const sum=result.series.reduce((n,p)=>n+Number(p[key]),0);
      assert.equal(sum,Number(report.metrics[key]),key);
    }
    assert.equal(Number(result.stock_kg),report.stock.reduce((n,p)=>n+Number(p.quantity),0));
    assert.equal(Number(result.series.find(p=>p.from===b).revenue),1000);
  }
  const nov=await load(c,c);
  assert.equal(Number(nov.composition.sales_total),0);
  assert.equal(Number(nov.metrics.receivables),300);
  assert.equal(Number(nov.metrics.operating_result),-50);
  const week=await load('2024-10-10','2024-11-12');
  assert.equal(week.grouping,'week');assert.equal(week.series[0].to,'2024-10-13');assert.equal(week.series.at(-1).to,'2024-11-12');
  const month=await load('2024-08-09','2024-11-12');
  assert.equal(month.grouping,'month');assert.equal(month.series[0].to,'2024-08-31');assert.equal(month.series.at(-1).to,'2024-11-12');
  assert.equal((await load('2024-01-01','2024-12-31')).series.length,12);
  assert.equal((await page.request.get(base+endpoint+'?from=2024-01-01&to=2025-01-01')).status(),422);
  await page.getByRole('navigation').getByRole('button',{name:'Dashboards',exact:true}).click();
  const preset=page.getByLabel('Período',{exact:true});
  for(const shortcut of ['Últimos 7 dias','Últimos 30 dias','Mês anterior','Mês atual']){
    const requested=page.waitForResponse(r=>r.url().includes(endpoint)&&r.ok());
    await preset.selectOption(shortcut); await requested;
  }
  await preset.selectOption('Personalizado');
  await page.getByLabel('Data inicial',{exact:true}).fill(a);
  await page.getByLabel('Data final',{exact:true}).fill(c);
  await page.getByRole('button',{name:'Aplicar',exact:true}).click();
  await page.locator('.dash-slice').filter({hasText:'70%'}).waitFor();
  await page.getByRole('button',{name:'Compras',exact:true}).last().click();
  await page.locator('.dash-slice').filter({hasText:'100%'}).waitFor();
  await page.setViewportSize({width:390,height:844});
  for(const table of await page.locator('.dash-table summary').all()) await table.click();
  assert.equal(await page.locator('.dash-table[open]').count(),4);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  console.log('OK: autenticação, composição histórica 0/70/100%, totais e séries, limites, atalhos, pizza, tabelas e layout de 390 px.');
} finally { await browser.close(); }

