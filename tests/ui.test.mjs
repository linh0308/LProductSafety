import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const catalog=JSON.parse(execFileSync('python',['-c','import json; from backend.catalog import catalog; print(json.dumps(catalog()))'],{cwd:root,encoding:'utf8'}));
const actions=['View','Create','Edit','Delete','Upload','Approve','Close'];
catalog.permissions=Object.fromEntries(Object.keys(catalog.modules).map(m=>[m,Object.fromEntries(actions.map(a=>[a,true]))]));
catalog.roles=['Admin','Viewer'];
const summary={alerts:[],activity:[],conflicts:[],counts:{},materials:{},total_materials:0,compliance_rate:0,open_ncr:0,overdue_capa:0,training_rate:0,windows:{30:0,60:0,90:0},cts:['cts-1','cts-2','cts-3'].map(id=>({id,total:0,compliant:0,issues:0,updated:null}))};

async function boot(overrides={}){
  const dom=new JSDOM(fs.readFileSync(path.join(root,'backend/templates/index.html'),'utf8'),{url:'http://localhost/#/dashboard',runScripts:'outside-only'});
  const {window:w}=dom;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.fetch=async url=>{
    const u=new URL(url,'http://localhost');
    let data;
    if(overrides[u.pathname]) data=await overrides[u.pathname](u);
    else if(u.pathname==='/api/auth/me')data={user:{id:1,name:'QA Admin',email:'qa@example.test',role:'Admin'},csrf:'test'};
    else if(u.pathname==='/api/catalog')data=catalog;
    else if(u.pathname==='/api/overview')data=summary;
    else if(u.pathname.startsWith('/api/inspections/'))data={items:[],total:0,page:1,size:20};
    else if(u.pathname==='/api/records')data={items:[],total:0,page:1,size:20};
    else if(u.pathname==='/api/records/1')data={id:1,module:'materials',version:1,updated_at:'2026-09-15T09:00:00',display_status:'Pending',data:{material_code:'TEST-1',material_name:'Test material'},evidence:[],history:[],related:[],aliases:['TEST-1'],conflicts:[]};
    else if(u.pathname==='/api/imports')data={files:[],conflicts:[]};
    else if(u.pathname==='/api/xrf-trend')data={items:[],coverage:[],basis:'Source data'};
    else if(u.pathname==='/api/users')data=[];
    else if(u.pathname==='/api/settings/permissions')data={Viewer:catalog.permissions};
    else if(u.pathname.startsWith('/api/settings/'))data={};
    else throw Error('Unexpected test request: '+url);
    return {ok:true,status:200,json:async()=>structuredClone(data)};
  };
  const ui=fs.readFileSync(path.join(root,'static/ui.js'),'utf8').replaceAll('export function ','function ');
  const app=fs.readFileSync(path.join(root,'static/app.js'),'utf8').replace(/^import[^\n]*\n/,'').replace('(async function init()', 'await (async function init()');
  const code=`(async()=>{${ui}\n${app}\nglobalThis.testApp={render,rowTable,openModal,confirmAction,recordForm,refreshLivePage};})()`;
  await new vm.Script(code,{filename:'application-ui.js'}).runInContext(dom.getInternalVMContext());
  return {dom,w,async route(route){w.history.replaceState(null,'','/#/'+route);await w.testApp.render();return w.document.querySelector('#content');}};
}

test('Live refresh reads fresh records, preserves filters and retains data on failure',async()=>{
  let owner='Before',fail=false,calls=0;
  const app=await boot({'/api/records':async()=>{calls++;if(fail)throw Error('offline');return {items:[{id:72,module:'organization',data:{department_name:'QA',primary:owner}}],total:1};}});
  try{
    const page=await app.route('organization'),doc=app.w.document;
    assert.equal(doc.querySelector('#topbar-updated').hidden,false);
    assert.ok(doc.querySelector('#page-refresh-btn'));
    const before=calls;owner='After';
    Object.defineProperty(doc,'visibilityState',{configurable:true,value:'visible'});
    await app.w.testApp.refreshLivePage();
    assert.ok(calls>before);assert.match(page.textContent,/After/);assert.doesNotMatch(page.textContent,/Before/);
    const timestamp=doc.querySelector('#topbar-updated time').textContent;
    fail=true;await app.w.testApp.refreshLivePage(true);
    assert.match(page.textContent,/After/);
    assert.equal(doc.querySelector('#topbar-updated time').textContent,timestamp);
    assert.ok(doc.querySelector('.live-error'));
    fail=false;
    page.querySelector('[data-org-view="matrix"]').click();
    page.querySelector('input[name="q"]').value='After';
    page.querySelector('#org-search').dispatchEvent(new app.w.Event('submit',{bubbles:true,cancelable:true}));
    await app.w.testApp.refreshLivePage(true);
    assert.equal(page.querySelector('input[name="q"]').value,'After');
    assert.equal(page.querySelector('[data-org-view="matrix"]').getAttribute('aria-pressed'),'true');
    const search=page.querySelector('input[name="q"]');search.value='draft';search.dispatchEvent(new app.w.Event('input',{bubbles:true}));
    const blockedCalls=calls;await app.w.testApp.refreshLivePage(true);
    assert.equal(calls,blockedCalls);assert.equal(search.value,'draft');assert.ok(doc.querySelector('.live-paused'));
    await app.route('users');assert.equal(doc.querySelector('#topbar-updated').hidden,false);
    await app.route('system');assert.equal(doc.querySelector('#topbar-updated').hidden,false);
  }finally{app.dom.window.close();}
});

test('Live refresh does not overwrite edits started during a request',async()=>{
  let release,delay=false;
  const app=await boot({'/api/records':async()=>{if(delay)await new Promise(r=>release=r);return {items:[],total:0};}});
  try{
    const page=await app.route('organization');page.querySelector('[data-org-view="matrix"]').click();
    delay=true;const pending=app.w.testApp.refreshLivePage(true);
    const input=page.querySelector('input');input.value='unsaved';input.dispatchEvent(new app.w.Event('input',{bubbles:true}));
    release();await pending;
    assert.equal(page.querySelector('input'),input);assert.equal(input.value,'unsaved');
  }finally{app.dom.window.close();}
});

test('Organization chart derives coverage, filters matrix, and reuses detail and edit',async()=>{
  const rows=[
    {id:71,module:'organization',version:1,data:{department_name:'QA',role:'Leader',primary:'Leader',backup:''}},
    {id:72,module:'organization',version:1,data:{department_name:'System Control (QA)',primary:'Linh / Van',backup:'Leader',responsibility:'Compliance scope',email:'qa@example.test'}},
    {id:73,module:'organization',version:1,data:{department_name:'New department',primary:'',backup:'Van'}}
  ];
  const app=await boot({'/api/records':async()=>({items:rows,total:3}),'/api/records/72':async()=>({...rows[1],display_status:'Pending',related:[]})});
  try{
    const page=await app.route('organization'),doc=app.w.document;
    assert.equal(page.querySelector('[data-org-view="chart"]').getAttribute('aria-pressed'),'true');
    assert.deepEqual([...page.querySelectorAll('.org-stat strong')].map(e=>e.textContent),['3','3','2','2','2']);
    assert.equal(page.querySelectorAll('.org-branch').length,2);
    await page.querySelector('[data-org-open="72"]').onclick();
    await new Promise(r=>setTimeout(r,5));
    assert.match(doc.querySelector('.org-drawer').textContent,/Compliance scope/);
    doc.querySelector('#org-edit').click();
    assert.equal(doc.querySelector('#record-form [name="primary"]').value,'Linh / Van');
    doc.querySelector('#modal').close();
    page.querySelector('[data-org-view="matrix"]').click();
    assert.equal(page.querySelectorAll('tbody tr').length,3);
    page.querySelector('[name="status"]').value='Primary not assigned';
    page.querySelector('#org-search').dispatchEvent(new app.w.Event('submit',{cancelable:true}));
    assert.equal(page.querySelectorAll('tbody tr').length,1);
    assert.match(page.querySelector('tbody').textContent,/New department/);
    assert.ok(page.querySelector('#org-export'));
    assert.ok(page.querySelector('#org-excel'));
    page.querySelector('[data-org-view="chart"]').click();
    assert.equal(page.querySelectorAll('.org-branch').length,2);
  }finally{app.dom.window.close();}
});

test('Organization empty state does not fabricate leader or assignments',async()=>{
  const app=await boot();
  try{const page=await app.route('organization');assert.equal(page.querySelectorAll('.org-node').length,0);assert.deepEqual([...page.querySelectorAll('.org-stat strong')].map(e=>e.textContent),['0','0','0','0','0']);}finally{app.dom.window.close();}
});

test('Dashboard renders with no alerts/activity; sidebar has all six groups',async()=>{
  const {dom,w}=await boot();
  try{
    assert.equal(w.document.querySelector('#content .alert.error'),null);
    assert.match(w.document.querySelector('#content').textContent,/Không có mục cần xử lý/);
    assert.equal(w.document.querySelectorAll('[data-group]').length,6);
    assert.equal(w.document.querySelector('#topbar-title').textContent,'Tổng quan Product Safety');
  }finally{dom.window.close();}
});

test('Dashboard separates IQC/OQC trends and opens expiry report lists',async()=>{
  const requests=[];
  const app=await boot({'/api/xrf-trend':async u=>{requests.push(u.searchParams);return {items:[{month:'2026-09',maximum:u.searchParams.get('stage')==='IQC'?10:90,average:5,count:2}],coverage:[]};}});
  try{
    const doc=app.w.document;
    assert.equal(doc.querySelectorAll('.report-metric').length,4);
    assert.equal(doc.querySelectorAll('.quality-trend').length,2);
    assert.match(doc.querySelectorAll('.quality-trend')[0].textContent,/IQC Trend/);
    assert.match(doc.querySelectorAll('.quality-trend')[1].textContent,/OQC Trend/);
    assert.equal(requests[0].get('stage'),'IQC');assert.equal(requests[1].get('stage'),'OQC');
    await doc.querySelector('[data-report-validity="Hết hạn"]').onclick();
    assert.equal(doc.querySelector('#modal').open,true);
    assert.match(doc.querySelector('#modal-title').textContent,/Hết hạn/);
    doc.querySelector('[data-close]').click();
    await doc.querySelector('#dashboard-element').onchange({target:{value:'cd'}});
    assert.equal(requests.at(-1).get('element'),'cd');
    await app.route('xrf-trend/IQC');
    assert.equal(doc.querySelector('#topbar-title').textContent,'IQC Trend');
  }finally{app.dom.window.close();}
});

test('Material list and form separate usage, dossier and optional owner',async()=>{
  const app=await boot();
  try{
    const page=await app.route('materials'),doc=app.w.document;
    assert.match(page.querySelector('thead').textContent,/Trạng thái sử dụng/);
    assert.match(page.querySelector('thead').textContent,/Tình trạng hồ sơ/);
    assert.doesNotMatch(page.querySelector('thead').textContent,/DRI|Nhà sản xuất/);
    assert.ok(page.querySelector('select[name="dossier"]'));
    assert.doesNotMatch(page.querySelector('select[name="status"]').textContent,/Pending|Completed/);
    app.w.testApp.recordForm('materials');
    assert.equal(doc.querySelector('#record-form [name="dri"]').value,'');
    assert.equal(doc.querySelector('#record-form [name="status"]'),null);
    assert.ok(doc.querySelector('#record-form [name="usage_status"]'));
    assert.ok(doc.querySelector('#record-form [name="dossier_status"]'));
  }finally{app.dom.window.close();}
});

test('Unified inspection screens filter, paginate and create original record types',async()=>{
  const requests=[];
  const app=await boot({'/api/inspections/inspection-results':async u=>{
    requests.push(u.searchParams);
    return {items:[],total:30,page:Number(u.searchParams.get('page')),size:Number(u.searchParams.get('size'))};
  }});
  try{
    const doc=app.w.document;
    await app.route('inspection-results');
    assert.equal(doc.querySelector('.alert.error'),null);
    assert.equal(doc.querySelectorAll('#submenu-materials .nav-link').length,6);
    const form=doc.querySelector('#inspection-filters');
    form.elements.stage.value='OQC';form.elements.method.value='XRF';
    await form.onsubmit({preventDefault(){},target:form});
    assert.equal(requests.at(-1).get('stage'),'OQC');
    assert.equal(requests.at(-1).get('method'),'XRF');
    await doc.querySelector('#inspection-next').onclick();
    assert.equal(requests.at(-1).get('page'),'2');
    assert.equal(requests.at(-1).get('method'),'XRF');
    doc.querySelector('#inspection-add').click();
    doc.querySelector('[data-inspection-create="oqc-reports"]').click();
    assert.equal(doc.querySelector('[name="inspection_stage"]').value,'OQC');
    doc.querySelector('[data-close]').click();
    await app.route('inspection-plans');
    assert.equal(doc.querySelector('.alert.error'),null);
    assert.ok(doc.querySelector('#inspection-filters'));
  }finally{app.dom.window.close();}
});

test('Organization loads all pages and escapes imported names without fabricating a leader',async()=>{
  const requests=[];
  const app=await boot({'/api/records':async u=>{requests.push(u.searchParams.get('page'));return {items:[{id:Number(u.searchParams.get('page')),data:{department_name:'<img src=x onerror=alert(1)>',primary:'Owner'}}],total:2};}});
  try{const page=await app.route('organization');assert.deepEqual(requests,['1','2']);assert.equal(page.querySelectorAll('.org-branch').length,2);assert.equal(page.querySelector('.org-node img'),null);assert.ok(page.querySelector('.org-no-leader'));}finally{app.dom.window.close();}
});

test('Main menus only toggle submenus without navigation or requests',async()=>{
  const app=await boot();
  try{
    await app.route('cts-1');
    const doc=app.w.document, page=doc.querySelector('#content'), original=page.innerHTML, hash=app.w.location.hash;
    let requests=0;
    const fetch=app.w.fetch;
    app.w.fetch=(...args)=>{requests++;return fetch(...args);};
    for(const button of doc.querySelectorAll('[data-group]:not([data-group="dashboard"])')){
      const submenu=doc.querySelector('#submenu-'+button.dataset.group);
      const before=submenu.hidden;
      button.click();
      assert.equal(submenu.hidden,!before);
      assert.equal(button.getAttribute('aria-expanded'),String(before));
      button.click();
      assert.equal(submenu.hidden,before);
      assert.equal(app.w.location.hash,hash);
      assert.equal(page.innerHTML,original);
    }
    assert.equal(requests,0);
  }finally{app.dom.window.close();}
});

test('Every module renders and binds its empty table controls',async()=>{
  const app=await boot();
  try{for(const module of Object.keys(catalog.modules).filter(m=>m!=='organization')){
    const page=await app.route(module);
    assert.equal(page.querySelector('.alert.error'),null,module+': '+page.textContent);
    assert.ok(page.querySelector('#filters'),module);
    assert.equal(typeof page.querySelector('#export').onclick,'function',module);
    assert.equal(app.w.document.querySelector('.nav-link.active')?.getAttribute('href'),'#/'+(['reports','oqc-reports','xrf-iqc','xrf-oqc','change-control'].includes(module)?'inspection-results':['test-plan','xrf-plan'].includes(module)?'inspection-plans':module));
  }}finally{app.dom.window.close();}
});

test('Lists paginate records and move descriptions beneath the title',async()=>{
  const requests=[];
  const app=await boot({'/api/records':async u=>{
    const page=Number(u.searchParams.get('page')),size=Number(u.searchParams.get('size'));
    requests.push({page,size,q:u.searchParams.get('q')});
    return {page,size,total:53,items:Array.from({length:Math.max(0,Math.min(size,53-(page-1)*size))},(_,i)=>({id:(page-1)*size+i+1,module:'cts-1',data:{chemical_group:'Chemical '+((page-1)*size+i+1),cas_no:'123-45-6'},display_status:'Pending'}))};
  }});
  try{
    const doc=app.w.document;
    await app.route('cts-1');
    const size=requests.at(-1).size;
    assert.ok(size>0&&size<20);
    assert.match(doc.querySelector('#topbar-updated').textContent,/Danh mục tiêu chuẩn/);
    assert.equal(doc.querySelector('#topbar-updated').hidden,false);
    assert.equal(doc.querySelector('#content .page-head'),null);
    assert.equal(doc.querySelectorAll('tbody tr').length,size);
    assert.equal(doc.querySelector('#prev-page').disabled,true);
    await doc.querySelector('#next-page').onclick();
    assert.equal(requests.at(-1).page,2);
    assert.equal(doc.querySelector('tbody [data-open]').dataset.open,String(size+1));
    assert.equal(doc.querySelector('[aria-current="page"][data-page]').dataset.page,'2');
    await doc.querySelector('[data-page="1"]').onclick();
    assert.equal(requests.at(-1).page,1);
    const last=Math.ceil(53/size);
    await doc.querySelector(`[data-page="${last}"]`).onclick();
    assert.equal(doc.querySelector('#next-page').disabled,true);
    assert.equal(doc.querySelectorAll('tbody tr').length,53-(last-1)*size);
  }finally{app.dom.window.close();}
});

test('Compact dashboard actions and XRF navigation work',async()=>{
  const app=await boot();
  const doc=app.w.document;
  try{
    assert.equal(doc.querySelectorAll('.overview-metric').length,4);
    assert.equal(doc.querySelectorAll('.compliance-row').length,3);
    assert.ok([...doc.querySelectorAll('.nav-children')].every(el=>el.hidden));
    assert.equal(doc.querySelectorAll('[data-group]')[2].dataset.group,'materials');
    doc.querySelector('#dashboard-search').click();
    assert.equal(doc.activeElement.id,'global-search');
    doc.querySelector('#dashboard-add').click();
    doc.querySelector('[data-create="materials"]').click();
    assert.ok(doc.querySelector('#record-form'));
    doc.querySelector('[data-close]').click();
    doc.querySelector('[data-alert-kind="reports"]').click();
    assert.ok(doc.querySelector('#modal').open);
    doc.querySelector('[data-close]').click();
    await app.route('xrf-iqc');
    const group=doc.querySelector('[data-group="materials"]');
    assert.equal(group.getAttribute('aria-expanded'),'true');
    assert.ok(doc.querySelector('#submenu-materials .nav-link.active'));
    group.click();
    assert.equal(doc.querySelector('#submenu-materials').hidden,true);
    for(const route of ['tasks','activity']){
      const page=await app.route(route);
      assert.equal(page.querySelector('.alert.error'),null);
      assert.doesNotMatch(page.textContent,/Không tìm thấy trang/);
    }
  }finally{app.dom.window.close();}
});

test('Group, record, imports, settings and unknown routes render without missing helpers',async()=>{
  const app=await boot();
  try{for(const route of [...catalog.groups.map(g=>'group/'+g.id),'record/1','imports','users','roles','notifications','retention','system','xrf-trend','unknown-route']){
    const page=await app.route(route);
    assert.equal(page.querySelector('.alert.error'),null,route+': '+page.textContent);
  }}finally{app.dom.window.close();}
});

test('Record form, close button and confirmation dialog work',async()=>{
  const {dom,w}=await boot();
  try{
    w.testApp.recordForm('materials');
    assert.equal(w.document.querySelector('#modal').open,true);
    assert.ok(w.document.querySelector('#record-form'));
    w.document.querySelector('[data-close]').click();
    assert.equal(w.document.querySelector('#modal').open,false);
    let called=false;
    w.testApp.confirmAction('Confirm',async()=>{called=true;});
    const button=w.document.querySelector('#accept-confirm');
    await button.onclick({target:button});
    assert.ok(called);
    assert.equal(w.document.querySelector('#modal').open,false);
  }finally{dom.window.close();}
});

test('Failure keeps navigation available and offers retry',async()=>{
  const app=await boot({'/api/overview':async()=>{throw Error('Test network error');}});
  try{
    assert.match(app.w.document.querySelector('#content').textContent,/Test network error/);
    assert.equal(typeof app.w.document.querySelector('#retry-page').onclick,'function');
    assert.equal(app.w.document.querySelectorAll('[data-group]').length,6);
    const page=await app.route('materials');
    assert.equal(page.querySelector('.alert.error'),null);
  }finally{app.dom.window.close();}
});

test('Slow old request cannot overwrite the current page',async()=>{
  const app=await boot();
  try{
    const originalFetch=app.w.fetch;
    let release;
    app.w.fetch=async url=>url.startsWith('/api/overview')?await new Promise(resolve=>{release=()=>resolve({ok:true,status:200,json:async()=>summary});}):originalFetch(url);
    const slow=app.route('dashboard');
    await app.route('materials');
    release();await slow;
    assert.ok(app.w.document.querySelector('#filters'));
    assert.equal(app.w.document.querySelector('#topbar-title').textContent,catalog.modules.materials.title);
  }finally{app.dom.window.close();}
});

test('Empty-state text is escaped',async()=>{
  const ui=fs.readFileSync(path.join(root,'static/ui.js'),'utf8');
  const {empty}=await import('data:text/javascript;base64,'+Buffer.from(ui).toString('base64'));
  assert.match(empty('<img src=x onerror=alert(1)>'),/&lt;img/);
  assert.ok(!empty('<script>x</script>').includes('<script>'));
});
