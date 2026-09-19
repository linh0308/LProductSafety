import {esc,label,badge,dateText,timeText,sourceText,percent,empty} from './ui.js?v=7';
const $=s=>document.querySelector(s);
const content=$('#content'),modal=$('#modal');
function getOptimalPageSize(){
  const vh = window.innerHeight || 900;
  const count = Math.floor((vh - 250) / 31.5);
  if(count <= 16) return 15;
  if(count <= 22) return 20;
  return 25;
}
let loginAt,user,csrf,catalog,overview,requestId=0,currentModule='',listState={page:1,q:'',status:'',start:'',end:'',sort:'updated_at',direction:'desc',size:getOptimalPageSize()},toastTimer;
window.listState = listState;
let pendingMaterialSupplierFilter = '';
let currentDetail=null;
const icons={dashboard:'◫',compliance:'◇',xrf:'◉',materials:'▣',management:'♙',documents:'▤',settings:'⚙'};
const names={'inspection-plans':'Kế hoạch kiểm nghiệm',imports:'Nguồn Excel & đối chiếu','xrf-trend':'Xu hướng XRF & thực hiện kế hoạch',users:'Quản lý người dùng',roles:'Vai trò & Phân quyền',notifications:'Cài đặt thông báo',retention:'Quy định lưu trữ',system:'Cấu hình hệ thống'};

function loginTimeText(value){
  if(!value)return '—';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '—';
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}
const apiCache = new Map();
const API_CACHE_TTL = 30000;
let apiCacheGeneration=0;

function invalidateApiCache() {
  apiCacheGeneration++;
  apiCache.clear();
  window.xrfPlanCache = null;
}
window.invalidateApiCache = invalidateApiCache;

async function api(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const isGet = method === 'GET';

  if (!isGet) {
    invalidateApiCache();
  } else if (!options.noCache) {
    const cached = apiCache.get(path);
    if (cached && (Date.now() - cached.time < API_CACHE_TTL)) {
      return JSON.parse(JSON.stringify(cached.data));
    }
  }

  const cacheGeneration=apiCacheGeneration;
  const headers = {
    ...(options.body instanceof FormData ? {} : {'Content-Type': 'application/json'}),
    'X-CSRF-Token': csrf || '',
    ...(options.headers || {})
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || 12000);

  let response;
  try {
    response = await fetch('/api' + path, { ...options, cache:'no-store', headers, signal: controller.signal });
  } catch(err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw Error('Kết nối tới máy chủ quá thời gian. Vui lòng kiểm tra lại mạng hoặc tải lại.');
    }
    throw err;
  }
  clearTimeout(timeoutId);

  if (response.status === 401) {
    location.replace('/login');
    throw Error('Phiên đã hết hạn.');
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw Error('Phản hồi máy chủ không hợp lệ.');
  }
  if (!response.ok) {
    let msg = 'Dữ liệu không hợp lệ. Kiểm tra các trường bắt buộc.';
    if (typeof data?.detail === 'string') {
      msg = data.detail;
    } else if (Array.isArray(data?.detail) && data.detail.length > 0) {
      msg = data.detail.map(e => e.msg ? `${e.loc?.slice(-1)[0] || 'Trường'}: ${e.msg}` : JSON.stringify(e)).join('; ');
    }
    throw Error(msg);
  }

  if (isGet && cacheGeneration===apiCacheGeneration) {
    apiCache.set(path, { time: Date.now(), data: data });
  }

  return data;
}
function notify(text){clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,5500);}
function goto(route){if(location.hash==='#/'+route)render();else location.hash='#/'+route;}
function title(id){return catalog.modules[id]?.title||names[id]||'Product Safety';}
function can(module,action){return !!catalog.permissions[module]?.[action];}
function openModal(name,body,footer=''){
  modal.style.maxWidth = '';
  modal.style.width = '';
  modal.innerHTML=`<div class="dialog-head"><h2 id="modal-title">${esc(name)}</h2><button data-close aria-label="Đóng">×</button></div><div class="dialog-body">${body}</div>${footer?`<div class="dialog-footer">${footer}</div>`:''}`;
  if(!modal.open)modal.showModal();
  modal.querySelector('[data-close]').onclick=()=>{ modal.close(); modal.style.maxWidth=''; modal.style.width=''; };
}
function confirmAction(text,action){
  openModal('Xác nhận',`<p>${esc(text)}</p>`,`<button id="cancel-confirm">Hủy</button><button id="accept-confirm" class="danger">Đồng ý</button>`);
  $('#cancel-confirm').onclick=()=>modal.close();
  $('#accept-confirm').onclick=async e=>{
    e.target.disabled=true;
    try{await action();modal.close();}catch(error){notify(error.message);}finally{if($('#accept-confirm'))$('#accept-confirm').disabled=false;}
  };
}
function nav(active){
  $('#navigation').innerHTML=catalog.groups.map(group=>{
    const items=group.items.filter(item=>!catalog.modules[item.id]||can(item.id,'View'));
    const expanded=items.some(item=>item.id===active)||active==='group/'+group.id||(group.id==='settings'&&(active==='bom'||active==='product-bom'));
    return `<section class="nav-section"><button class="nav-group" data-group="${esc(group.id)}" aria-expanded="${expanded}" aria-controls="submenu-${esc(group.id)}"><span class="nav-icon">${icons[group.id]||'◇'}</span><span class="nav-label">${esc(group.name)}</span>${group.id!=='dashboard'?'<span class="nav-arrow">⌄</span>':''}</button><div class="nav-children" id="submenu-${esc(group.id)}" ${!expanded||group.id==='dashboard'?'hidden':''}>${items.map(item=>`<a class="nav-link ${item.id===active?'active':''}" href="#/${esc(item.id)}" ${item.id===active?'aria-current="page"':''}>${esc(item.name)}</a>`).join('')}</div></section>`;
  }).join('');
  $('#navigation').querySelectorAll('[data-group]').forEach(button=>button.onclick=()=>{
    const id=button.dataset.group;
    if(id==='dashboard'){goto('dashboard');return;}
    if($('#sidebar').classList.contains('collapsed'))toggleSidebar(false);
    const open=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(open));$('#submenu-'+id).hidden=!open;
  });
}
function head(name,description='',actions=''){const desc=description?`<p style="margin:0;color:var(--muted)">${esc(description)}</p>`:'';if(!desc&&!actions)return '';return `<div class="page-head" style="padding-bottom:10px; display:flex; justify-content:space-between; align-items:center;">${desc}` + (actions ? `<div class="head-actions" style="display:flex;gap:10px;">${actions}</div>` : '') + `</div>`;}
function paginationHtml(currentPage, totalItems, pageSize, attrName='data-page', prevId='prev-page', nextId='next-page') {
  currentPage = Number(currentPage) || 1;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalPages < 1) {
    return `<div class="pagination"><span>Tổng số: <b>${totalItems}</b> mục</span></div>`;
  }
  const startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, startPage + 4);
  const adjustedStart = Math.max(1, endPage - 4);
  let pageButtons = '';
  for (let p = adjustedStart; p <= endPage; p++) {
    pageButtons += `<button type="button" class="${p === currentPage ? 'primary' : ''}" ${attrName}="${p}" ${p === currentPage ? 'aria-current="page"' : ''}>${p}</button>`;
  }
  return `<div class="pagination"><span><b>${totalItems}</b> mục · Trang <b>${currentPage}</b> / ${totalPages}</span><nav style="display:flex;align-items:center;gap:4px"><button type="button" id="${prevId}" ${currentPage <= 1 ? 'disabled' : ''}>← Trước</button>${pageButtons}<button type="button" id="${nextId}" ${currentPage >= totalPages ? 'disabled' : ''}>Sau →</button></nav></div>`;
}
const columnPreferences = {
  materials: ['material_code', 'material_name', 'category', 'supplier', 'project'],
  bom: ['project', 'parent_code', 'material_code', 'material_name', 'supplier'],
  suppliers: ['supplier', 'evaluation_status', 'audit_grade', 'last_audit_date', 'next_audit_date', 'contact'],
  'test-types': ['name', 'standard', 'description', 'default_selected'],
  'test-plan': ['project', 'material_code', 'material_name', 'test_type', 'test'],
  'xrf-plan': ['project', 'material_code', 'material_name', 'supplier', 'test'],
  'xrf-iqc': ['material_code', 'material_name', 'lot', 'test_date', 'material_type', 'pb'],
  'xrf-oqc': ['material_code', 'material_name', 'lot', 'test_date', 'material_type', 'pb'],
  'change-control': ['material_code', 'notes', 'test_date', 'material_type', 'pb'],
  'xrf-standard': ['element', 'material_type', 'control_limit', 'spec_limit', 'rule'],
  'cts-1': ['chemical_group', 'cas_no'],
  'cts-2': ['requirement_id', 'requirement', 'category', 'frequency', 'last_review'],
  'cts-3': ['requirement_id', 'requirement', 'category', 'frequency', 'last_review'],
  declarations: ['declaration_no', 'material_code', 'supplier', 'issue_date', 'expiry_date'],
  'material-declarations': ['declaration_no', 'material_code', 'supplier', 'issue_date', 'expiry_date'],
  reports: ['report_id', 'material_code', 'test_type', 'lab', 'expiry_date'],
  'oqc-reports': ['report_id', 'project', 'test_type', 'expiry_date'],
  fmd: ['material_code', 'substance', 'cas', 'composition', 'flag'],
  organization: ['department_name', 'role', 'primary', 'backup', 'email'],
  training: ['course', 'employee', 'training_date', 'expiry_date', 'trainer'],
  risk: ['process', 'risk_category', 'concern', 'substance', 'frequency'],
  ncr: ['ncr_no', 'issue_date', 'material_code', 'issue', 'severity'],
  capa: ['capa_no', 'ncr_no', 'material_code', 'issue', 'root_cause'],
  procedures: ['document_no', 'document_name', 'category', 'revision', 'owner'],
  documents: ['document_no', 'document_name', 'category', 'revision', 'owner'],
  'retention-records': ['document_no', 'document_name', 'category', 'revision', 'owner'],
  appendices: ['document_no', 'document_name', 'category', 'revision', 'owner'],
  'master-data': ['category', 'value']
};
function rowTable(rows, columns=['name','module','status']) {
  if (!rows || !rows.length) {
    return empty('Không có mục dữ liệu', 'Chưa có hồ sơ đáp ứng điều kiện.');
  }
  const colLabels = {
    name: 'Hồ sơ',
    module: 'Module',
    status: 'Trạng thái',
    dri: 'DRI',
    expiry: 'Ngày hết hạn',
    project: 'Dự án',
    supplier: 'Nhà cung cấp'
  };
  return `<div class="table-scroll"><table><thead><tr>${columns.map(c => `<th>${colLabels[c] || c}</th>`).join('')}<th></th></tr></thead><tbody>${rows.map(r => `<tr>${columns.map(c => `<td>${c === 'name' ? `<button class="link-button" data-open="${r.id}">${esc(label(r))}</button>` : c === 'module' ? esc(title(r.module)) : c === 'status' ? badge(r.display_status) : c === 'dri' ? esc(r.data?.dri || 'Chưa phân công') : c === 'expiry' ? dateText(r.data?.expiry_date || r.data?.due_date) : esc(r.data?.[c] ?? '—')}</td>`).join('')}<td><button class="link-button" data-open="${r.id}">👁️ Chi tiết</button></td></tr>`).join('')}</tbody></table></div>`;
}
let dashboardElement='pb',dashboardMaterialType='Polymers';
  async function dashboard(){
    const [d,iqc,oqc]=await Promise.all([api('/overview'),api('/xrf-trend?stage=IQC&element='+dashboardElement+'&material_type='+encodeURIComponent(dashboardMaterialType)),api('/xrf-trend?stage=OQC&element='+dashboardElement+'&material_type='+encodeURIComponent(dashboardMaterialType))]);
    overview=d;$('#notification-count').textContent=d.open_actions??0;
    const coverage = d.coverage || {};
    
    // Tầng 1: Management KPI (5 cards across full width - synchronized dimensions & pastel palette)
    const tier1 = `<div class="dashboard-tier tier-1" style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:12px;width:100%;flex-shrink:0">
      <div class="kpi-card" style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;box-shadow:0 1px 2px rgba(0,0,0,0.02);cursor:pointer;transition:all .15s ease" onclick="location.hash='#/materials'">
        <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase">TỔNG SỐ VẬT LIỆU</div>
        <div style="font-size:22px;font-weight:700;color:#0f172a;margin-top:2px;line-height:1.1">${d.active_materials}</div>
        <small style="color:#64748b;font-size:10.5px">Đang quản lý trong hệ thống</small>
      </div>
      <div class="kpi-card" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;box-shadow:0 1px 2px rgba(0,0,0,0.02);cursor:pointer;transition:all .15s ease" onclick="location.hash='#/materials'">
        <div style="font-size:11px;font-weight:600;color:#15803d;text-transform:uppercase">TUÂN THỦ HSF</div>
        <div style="font-size:22px;font-weight:700;color:#16a34a;margin-top:2px;line-height:1.1">${d.hsf_compliance}%</div>
        <small style="color:#15803d;font-size:10.5px">${d.compliant_materials} / ${d.active_materials} Đạt chuẩn RoHS</small>
      </div>
      <div class="kpi-card" style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;box-shadow:0 1px 2px rgba(0,0,0,0.02);cursor:pointer;transition:all .15s ease" onclick="location.hash='#/xrf-iqc'">
        <div style="font-size:11px;font-weight:600;color:#b45309;text-transform:uppercase">SÀNG LỌC XRF</div>
        <div style="font-size:22px;font-weight:700;color:#d97706;margin-top:2px;line-height:1.1">${coverage.xrf} / ${coverage.total_materials}</div>
        <small style="color:#b45309;font-size:10.5px">NVL đã kiểm tra quang phổ</small>
      </div>
      <div class="kpi-card" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;box-shadow:0 1px 2px rgba(0,0,0,0.02);cursor:pointer;transition:all .15s ease" onclick="location.hash='#/reports'">
        <div style="font-size:11px;font-weight:600;color:#1e40af;text-transform:uppercase">BÁO CÁO KIỂM NGHIỆM</div>
        <div style="font-size:22px;font-weight:700;color:#2563eb;margin-top:2px;line-height:1.1">${d.valid_reports} / ${d.required_reports}</div>
        <small style="color:#1e40af;font-size:10.5px">Báo cáo kiểm nghiệm hợp lệ</small>
      </div>
      <div class="kpi-card" style="background:${d.open_actions>0?'#fef2f2':'#f8fafc'};border:1px solid ${d.open_actions>0?'#fecaca':'#e2e8f0'};border-radius:8px;padding:10px 14px;box-shadow:0 1px 2px rgba(0,0,0,0.02);cursor:pointer;transition:all .15s ease" onclick="document.getElementById('dashboard-alerts')?.click()">
        <div style="font-size:11px;font-weight:600;color:${d.open_actions>0?'#b91c1c':'#64748b'};text-transform:uppercase">HÀNH ĐỘNG CẦN XỬ LÝ</div>
        <div style="font-size:22px;font-weight:700;color:${d.open_actions>0?'#dc2626':'#0f172a'};margin-top:2px;line-height:1.1">${d.open_actions}</div>
        <small style="color:${d.open_actions>0?'#b91c1c':'#64748b'};font-size:10.5px">${d.open_actions>0?'CAPA, NCR hoặc sự cố phát sinh':'Không có tồn đọng'}</small>
      </div>
    </div>`;

    // Tầng 2: Technical Monitoring (IQC & OQC side-by-side with full responsive chart height)
    const tier2 = `<div class="dashboard-tier tier-2" style="width:100%"><section class="card xrf-monitoring-card"><div class="xrf-monitoring-toolbar"><h3><span class="xrf-heading-mark" aria-hidden="true">⌁</span>XRF Monitoring</h3><div class="xrf-monitoring-filters"><label class="xrf-filter"><span>Chất phân tích</span><select id="dashboard-element">${['pb','cd','hg','cr','br','cl'].map(e=>`<option value="${e}" ${e===dashboardElement?'selected':''}>${e.toUpperCase()}</option>`).join('')}</select></label><label class="xrf-filter xrf-filter-material"><span>Nhóm vật liệu</span><select id="dashboard-material-type">${['Polymers','Metals/Ceramic/Glass','Composite','Packaging'].map(t=>`<option ${t===dashboardMaterialType?'selected':''}>${t}</option>`).join('')}</select></label><span class="xrf-period" aria-label="Thời gian hiển thị: 6 tháng gần nhất"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18"/></svg>6 tháng gần nhất</span></div></div><div class="quality-trends" style="display:flex;gap:12px;padding:10px 14px;flex:1;min-height:0">${dashboardTrend('IQC XRF Trend',iqc,'IQC',iqc.control_limit)}${dashboardTrend('OQC XRF Trend',oqc,'OQC',oqc.control_limit)}</div></section></div>`;
    
    // Tầng 3: Risk & Action
    const fmdPct = coverage.total_materials ? Math.round(100 * coverage.fmd / coverage.total_materials) : 0;
    const declPct = coverage.total_materials ? Math.round(100 * coverage.declaration / coverage.total_materials) : 0;
    const testPct = d.required_reports ? Math.round(100 * d.valid_reports / d.required_reports) : 100;
    const xrfPct = coverage.total_materials ? Math.round(100 * coverage.xrf / coverage.total_materials) : 0;

    const actionListHtml = d.alerts && d.alerts.length ? `<div class="quality-tasks-grid" style="flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;padding:10px 14px;align-content:start;overflow-y:auto">${d.alerts.slice(0,6).map(a=>{
      const icon = a.type==='expired'?'🔴':a.type==='expiring'||a.type==='missing'?'🟠':'🔵';
      return `<button data-open="${a.id}" title="${esc(a.title)}" style="text-align:left;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 12px;font-size:11px;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer">${icon} ${esc(a.title)}</button>`;
    }).join('')}</div>` : `<div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:space-between;padding:10px 14px">
      <div style="display:flex;align-items:center;gap:10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:6px 12px">
        <div style="width:26px;height:26px;border-radius:50%;background:#10b981;color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold;flex-shrink:0">✓</div>
        <div>
          <b style="font-size:12px;color:#065f46;display:block">Hệ thống tuân thủ tốt · Hiện không có tồn đọng</b>
          <span style="font-size:10.5px;color:#047857">Không có báo cáo quá hạn, thiếu hồ sơ bắt buộc hoặc CAPA tồn đọng.</span>
        </div>
      </div>
      
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:6px 0">
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 10px;display:flex;flex-direction:column;gap:2px">
          <span style="font-size:9.5px;font-weight:600;color:#64748b;text-transform:uppercase">Kiểm soát rủi ro RoHS</span>
          <b style="font-size:14px;color:#059669">100% Đạt chuẩn</b>
          <small style="font-size:9.5px;color:#94a3b8">Không phát hiện mẫu quá ngưỡng</small>
        </div>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 10px;display:flex;flex-direction:column;gap:2px">
          <span style="font-size:9.5px;font-weight:600;color:#64748b;text-transform:uppercase">Đo lường XRF chu kỳ</span>
          <b style="font-size:14px;color:#0284c7">${coverage.xrf} / ${coverage.total_materials} NVL</b>
          <small style="font-size:9.5px;color:#94a3b8">Đã hoàn thành phân tích quang phổ</small>
        </div>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 10px;display:flex;flex-direction:column;gap:2px">
          <span style="font-size:9.5px;font-weight:600;color:#64748b;text-transform:uppercase">Cấu hình Required Tests</span>
          <b style="font-size:14px;color:#f59e0b">Chờ thiết lập</b>
          <small style="font-size:9.5px;color:#94a3b8">Chọn NVL trong BOM để chỉ định</small>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;font-size:11px">
        <span style="color:#64748b">Thao tác nhanh:</span>
        <div style="display:flex;gap:6px">
          <button data-route="bom" style="padding:3px 8px;font-size:10.5px;background:#fff;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer">BOM / NVL →</button>
          <button data-route="xrf" style="padding:3px 8px;font-size:10.5px;background:#fff;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer">Dữ liệu XRF →</button>
          <button data-route="inspection-plans" style="padding:3px 8px;font-size:10.5px;background:#fff;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer">Kế hoạch kiểm nghiệm →</button>
        </div>
      </div>
    </div>`;

    const tier3 = `<div class="dashboard-tier tier-3" style="display:flex;gap:12px;width:100%">
      <section class="card" style="flex:1.25;margin:0;display:flex;flex-direction:column;min-height:0;height:100%"><div class="card-header" style="display:flex;justify-content:space-between;align-items:center;padding:8px 16px;border-bottom:1px solid #f1f5f9"><h3 style="margin:0;font-size:12.5px;font-weight:700;color:#1e293b">VIỆC CẦN XỬ LÝ</h3><button id="dashboard-alerts" style="padding:2px 8px;font-size:10.5px;border-radius:4px;border:1px solid #cbd5e1;background:#fff;cursor:pointer">Xem tất cả (${d.alerts ? d.alerts.length : 0})</button></div>${actionListHtml}</section>
      
      <section class="card" style="flex:1;margin:0;display:flex;flex-direction:column;min-height:0;height:100%"><div class="card-header" style="padding:8px 16px;border-bottom:1px solid #f1f5f9"><h3 style="margin:0;font-size:12.5px;font-weight:700;color:#1e293b">ĐỘ PHỦ HỒ SƠ TUÂN THỦ</h3></div><div style="flex:1;min-height:0;padding:10px 14px;display:flex;flex-direction:column;justify-content:space-between">
        <div style="display:flex;flex-direction:column;gap:6px">
          <div><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px"><span style="color:#475569;font-weight:500">FMD (Full Material Disclosure)</span><b style="color:#0f172a">${coverage.fmd} / ${coverage.total_materials} (${fmdPct}%) <span style="font-size:9.5px;padding:1px 5px;border-radius:4px;background:#eff6ff;color:#2563eb">${fmdPct>0?`Đã có ${coverage.fmd}`:'Chưa có'}</span></b></div><div style="width:100%;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden"><div style="width:${fmdPct}%;height:100%;background:#3b82f6;border-radius:3px"></div></div></div>
          <div><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px"><span style="color:#475569;font-weight:500">Declaration (Cam kết NCC)</span><b style="color:#0f172a">${coverage.declaration} / ${coverage.total_materials} (${declPct}%) <span style="font-size:9.5px;padding:1px 5px;border-radius:4px;background:#eef2ff;color:#4f46e5">${declPct>0?`Đã có ${coverage.declaration}`:'Chưa có'}</span></b></div><div style="width:100%;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden"><div style="width:${declPct}%;height:100%;background:#6366f1;border-radius:3px"></div></div></div>
          <div><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px"><span style="color:#475569;font-weight:500">Test Report (Báo cáo Lab)</span><b style="color:#0f172a">${d.valid_reports} / ${d.required_reports} (${testPct}%) <span style="font-size:9.5px;padding:1px 5px;border-radius:4px;background:#ecfdf5;color:#059669">${testPct>=100?'Đầy đủ':'Thiếu báo cáo'}</span></b></div><div style="width:100%;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden"><div style="width:${testPct}%;height:100%;background:#10b981;border-radius:3px"></div></div></div>
          <div><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px"><span style="color:#475569;font-weight:500">XRF Screening (Quang phổ)</span><b style="color:#0f172a">${coverage.xrf} / ${coverage.total_materials} (${xrfPct}%) <span style="font-size:9.5px;padding:1px 5px;border-radius:4px;background:#f0f9ff;color:#0284c7">${coverage.xrf} đã đo</span></b></div><div style="width:100%;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden"><div style="width:${xrfPct}%;height:100%;background:#0ea5e9;border-radius:3px"></div></div></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding-top:6px;border-top:1px solid #f1f5f9">
          <div style="background:#ecfdf5;border:1px solid #d1fae5;border-radius:5px;padding:5px 8px;text-align:center"><div style="font-size:9.5px;font-weight:600;color:#065f46">ĐẠT CHUẨN</div><b style="font-size:13px;color:#059669">${d.compliant_materials} NVL</b></div>
          <div style="background:#fffbeb;border:1px solid #fef3c7;border-radius:5px;padding:5px 8px;text-align:center"><div style="font-size:9.5px;font-weight:600;color:#92400e">CẦN BỔ SUNG</div><b style="font-size:13px;color:#d97706">${d.pending_materials ?? (coverage.total_materials - d.compliant_materials)} NVL</b></div>
          <div style="background:#fef2f2;border:1px solid #fee2e2;border-radius:5px;padding:5px 8px;text-align:center"><div style="font-size:9.5px;font-weight:600;color:#991b1b">RỦI RO / NG</div><b style="font-size:13px;color:#dc2626">${d.ng_materials ?? 0} NVL</b></div>
        </div>
        <div style="font-size:9.5px;color:#94a3b8;display:flex;justify-content:space-between;align-items:center;padding-top:2px"><span>Đồng bộ tự động theo ${coverage.total_materials} NVL trong BOM</span><span style="color:#059669;font-weight:600">Audit Ready ✓</span></div>
      </div></section>
    </div>`;

    return `<div class="quality-dashboard">${tier1}${tier2}${tier3}</div>`;
  }
  
function dashboardTrend(title,data,stage='IQC',controlLimit=null){
  const months={},now=new Date();
  for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);months[`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`]={maximum:0,total:0,count:0};}
  for(const r of data.items){const m=months[r.month];if(m){m.maximum=Math.max(m.maximum,r.maximum);m.total+=r.average*r.count;m.count+=r.count;}}
  const hasLimit=controlLimit!==null&&Number.isFinite(Number(controlLimit)),limit=Number(controlLimit);
  const peak=Math.max(0,...Object.values(months).map(m=>m.maximum));
  const raw=Math.max(1,peak,hasLimit?limit:0)*1.18/4,power=10**Math.floor(Math.log10(raw)),step=([1,2,2.5,5,10].find(n=>n*power>=raw)||10)*power,scale=step*4;
  const y=v=>145-120*(v/scale);
  const entries=Object.entries(months);
  const count=entries.reduce((n,[,m])=>n+m.count,0),average=count?entries.reduce((n,[,m])=>n+m.total,0)/count:0;
  const primaryColor=stage==='IQC'?'#2563eb':'#059669';
  const gradStart=stage==='IQC'?'#3b82f6':'#10b981';
  const gradEnd=stage==='IQC'?'#1d4ed8':'#047857';
  const bgTrack=stage==='IQC'?'#eff6ff':'#ecfdf5';
  const fmt=v=>Number(v.toFixed(2));
  const over=hasLimit&&peak>limit;
  const barW=36;
  const limitY=hasLimit?y(limit):null;
  const gradientId='xrf-bar-grad-'+stage;

  return `<div class="xrf-control-chart xrf-polished" style="--chart-color:${primaryColor}">
    <div class="xrf-chart-title">
      <b><span class="xrf-series-dot"></span>${esc(title)}</b>
      <small>${dashboardElement.toUpperCase()} · ppm</small>
    </div>
    <div class="xrf-chart-summary">
      <div>
        <strong>${count?fmt(peak):'—'}</strong>
        <span>ppm <small>Đỉnh 6 tháng</small></span>
      </div>
      <span class="xrf-sample-pill">${count} mẫu</span>
    </div>
    <svg viewBox="0 0 600 182" role="img" aria-label="${esc(title)}: ${esc(dashboardMaterialType)}" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${gradStart}"/>
          <stop offset="100%" stop-color="${gradEnd}"/>
        </linearGradient>
        <linearGradient id="${gradientId}-danger" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#f87171"/>
          <stop offset="100%" stop-color="#dc2626"/>
        </linearGradient>
      </defs>

      ${[0,1,2,3,4].map(i=>`<line x1="42" x2="580" y1="${y(step*i)}" y2="${y(step*i)}" stroke="#eef2f7" ${i?'stroke-dasharray="3 5"':''}/><text x="32" y="${y(step*i)+3}" text-anchor="end" font-size="10" fill="#9aa9bb">${fmt(step*i)}</text>`).join('')}

      ${entries.map(([month,m],i)=>{
        const cx=55+i*101;
        const bx=cx-barW/2;
        const val=m.maximum;
        const barH=m.count && val>0 ? Math.max(6, 145 - y(val)) : 0;
        const barY=145-barH;
        const isOver=hasLimit && val>limit;
        const barFill=isOver ? `url(#${gradientId}-danger)` : `url(#${gradientId})`;
        const tx=Math.max(43,Math.min(410,cx-85));
        const ty=barY>80?barY-72:barY+14;

        return `
        <!-- Background Track -->
        <rect x="${bx}" y="25" width="${barW}" height="120" rx="6" fill="${bgTrack}" opacity="0.45"/>

        <!-- Active Data Bar -->
        ${m.count && barH>0 ? `<rect class="xrf-bar-rect" x="${bx}" y="${barY}" width="${barW}" height="${barH}" rx="5" fill="${barFill}"/>` : ''}

        <!-- Top Value Label -->
        <text x="${cx}" y="${m.count && barH>0 ? Math.max(20, barY-5) : 138}" text-anchor="middle" font-size="${m.count?'10.5':'9.5'}" font-weight="${m.count?'600':'400'}" fill="${m.count?(isOver?'#dc2626':'#1e293b'):'#cbd5e1'}">${m.count?fmt(val):'—'}</text>

        <!-- X Axis Label -->
        <text x="${cx}" y="168" text-anchor="middle" font-size="10.5" font-weight="500" fill="#64748b">${Number(month.slice(5))}/${month.slice(2,4)}</text>

        <!-- Tooltip on Hover -->
        ${m.count ? `<g class="xrf-interactive-point" tabindex="0">
          <rect x="${bx-4}" y="20" width="${barW+8}" height="130" fill="transparent" style="cursor:pointer"/>
          <g class="xrf-point-tooltip" transform="translate(${tx},${ty})" pointer-events="none">
            <rect width="170" height="62" rx="8" fill="#1e293b" opacity="0.96" filter="drop-shadow(0 4px 6px rgba(0,0,0,0.15))"/>
            <text x="12" y="18" fill="#94a3b8" font-size="10.5">${month} · ${m.count} mẫu</text>
            <text x="12" y="36" fill="#ffffff" font-size="12" font-weight="700">Max: ${fmt(val)} ppm</text>
            <text x="12" y="52" fill="#cbd5e1" font-size="10.5">Trung bình: ${fmt(m.total/m.count)} ppm</text>
          </g>
        </g>` : ''}
        `;
      }).join('')}

      <!-- Control Limit Red Dashed Line -->
      ${hasLimit ? `
        <line class="xrf-control-line" x1="42" x2="580" y1="${limitY}" y2="${limitY}" stroke="#dc2626" stroke-width="1.8" stroke-dasharray="6 4"/>
        <rect x="428" y="${limitY-20}" width="152" height="18" rx="4" fill="#fee2e2" stroke="#fca5a5" stroke-width="0.8"/>
        <text x="504" y="${limitY-7}" text-anchor="middle" fill="#b91c1c" font-size="10" font-weight="700">Control Limit · ${fmt(limit)} ppm</text>
      ` : ''}

      ${!count?'<text x="310" y="85" text-anchor="middle" font-size="12" font-weight="500" fill="#94a3b8">Chưa có số đo trong giai đoạn này</text>':''}
    </svg>
    <div class="xrf-chart-footer">
      <span>Trung bình <b>${count?fmt(average):'—'} ppm</b></span>
      <span class="${over?'xrf-over-limit':''}">${!hasLimit?'Chưa có giới hạn kiểm soát':over?'⚠️ Có giá trị vượt giới hạn':'✓ Nằm trong kiểm soát'}</span>
    </div>
  </div>`;
}
async function dashboardReportList(validity='',days=null,page=1){
  const query=new URLSearchParams({validity,method:'Lab / Bên thứ ba',page,size:15});
  if(days!==null)query.set('expiry_days',days);
  const data=await api('/inspections/inspection-results?'+query),pages=Math.max(1,Math.ceil(data.total/15));
  openModal(days!==null?'Báo cáo hết hạn trong '+days+' ngày':'Báo cáo · '+validity,rowTable(data.items,['name','module','expiry','status'])+`<div class="pagination"><span>${data.total} hồ sơ · Trang ${data.page}/${pages}</span><div><button id="report-prev" ${data.page<=1?'disabled':''}>← Trước</button><button id="report-next" ${data.page>=pages?'disabled':''}>Sau →</button></div></div>`);
  modal.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{modal.close();goto('record/'+b.dataset.open);});
  $('#report-prev').onclick=()=>dashboardReportList(validity,days,data.page-1).catch(e=>notify(e.message));
  $('#report-next').onclick=()=>dashboardReportList(validity,days,data.page+1).catch(e=>notify(e.message));
}

async function openSupplierEvaluationModal(row = null) {
  const isEdit = !!row;
  const d = row?.data || {};
  const currentStatus = d.evaluation_status || 'Approved';
  const currentGrade = d.audit_grade || 'Hạng B (Đạt)';
  const lastAudit = d.last_audit_date || new Date().toISOString().slice(0, 10);

  let nextAudit = d.next_audit_date;
  if (!nextAudit && lastAudit) {
    const nextDateObj = new Date(lastAudit);
    nextDateObj.setFullYear(nextDateObj.getFullYear() + 1);
    nextAudit = nextDateObj.toISOString().slice(0, 10);
  }

  const modalHtml = `
    <form id="supplier-eval-form" style="display:flex;flex-direction:column;gap:12px">
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px">
        <div style="font-size:12.5px;font-weight:700;color:#0f172a;margin-bottom:10px;display:flex;align-items:center;gap:6px">
          <span>🏢 Thông tin Nhà cung cấp</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">
          <label style="margin:0;font-size:11px;color:#475569">
            Tên Nhà cung cấp *
            <input type="text" name="supplier" id="eval-supplier-name" value="${esc(d.supplier || '')}" required style="margin-top:4px;font-weight:650">
          </label>
          <label style="margin:0;font-size:11px;color:#475569">
            Người liên hệ
            <input type="text" name="contact" value="${esc(d.contact || '')}" style="margin-top:4px">
          </label>
          <label style="margin:0;font-size:11px;color:#475569">
            Email liên hệ
            <input type="email" name="email" value="${esc(d.email || '')}" style="margin-top:4px">
          </label>
          <label style="margin:0;font-size:11px;color:#475569">
            Điện thoại
            <input type="text" name="phone" value="${esc(d.phone || '')}" style="margin-top:4px">
          </label>
          <label style="margin:0;grid-column:span 2;font-size:11px;color:#475569">
            Địa chỉ
            <input type="text" name="address" value="${esc(d.address || '')}" style="margin-top:4px">
          </label>
        </div>
      </div>

      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 16px">
        <div style="font-size:12.5px;font-weight:700;color:#1e40af;margin-bottom:10px;display:flex;align-items:center;gap:6px">
          <span>📋 Đánh giá định kỳ & Lịch Audit (Audit Schedule)</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">
          <label style="margin:0;font-size:11px;color:#1e40af;font-weight:600">
            Tình trạng đánh giá định kỳ *
            <select name="evaluation_status" id="eval-status-select" style="margin-top:4px;font-weight:650">
              <option value="Approved" ${currentStatus==='Approved'?'selected':''}>✓ Approved (Đạt chuẩn - Ưu tiên sử dụng)</option>
              <option value="Qualified" ${currentStatus==='Qualified'?'selected':''}>ℹ️ Qualified (Đủ điều kiện)</option>
              <option value="Conditional" ${currentStatus==='Conditional'?'selected':''}>⚠️ Conditional (Có điều kiện - Cần cải tiến)</option>
              <option value="Pending" ${currentStatus==='Pending'?'selected':''}>⏳ Pending (Chờ đánh giá)</option>
              <option value="Blacklist" ${currentStatus==='Blacklist'?'selected':''}>🚫 Blacklist (Đình chỉ cung ứng)</option>
            </select>
          </label>
          <label style="margin:0;font-size:11px;color:#1e40af;font-weight:600">
            Xếp loại / Grade
            <select name="audit_grade" id="eval-grade-select" style="margin-top:4px;font-weight:650">
              <option value="Hạng A (Xuất sắc)" ${currentGrade==='Hạng A (Xuất sắc)'?'selected':''}>Hạng A (Xuất sắc · ≥90 điểm)</option>
              <option value="Hạng B (Đạt)" ${currentGrade==='Hạng B (Đạt)'?'selected':''}>Hạng B (Đạt · 75 - 89 điểm)</option>
              <option value="Hạng C (Cần cải tiến)" ${currentGrade==='Hạng C (Cần cải tiến)'?'selected':''}>Hạng C (Cần cải tiến · 60 - 74 điểm)</option>
              <option value="Hạng D (Không đạt)" ${currentGrade==='Hạng D (Không đạt)'?'selected':''}>Hạng D (Không đạt · &lt;60 điểm)</option>
            </select>
          </label>
          <label style="margin:0;font-size:11px;color:#475569">
            Ngày đánh giá gần nhất
            <input type="date" name="last_audit_date" id="eval-last-date" value="${esc(lastAudit || '')}" style="margin-top:4px">
          </label>
          <div>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <label style="margin:0;font-size:11px;color:#475569">Hạn đánh giá tiếp theo *</label>
              <div style="display:flex;gap:4px">
                <button type="button" class="quick-audit-calc" data-months="6" style="padding:1px 5px;font-size:10px;background:#fff;border:1px solid #cbd5e1;border-radius:3px;cursor:pointer">+6 tháng</button>
                <button type="button" class="quick-audit-calc" data-months="12" style="padding:1px 5px;font-size:10px;background:#fff;border:1px solid #cbd5e1;border-radius:3px;cursor:pointer">+1 năm</button>
                <button type="button" class="quick-audit-calc" data-months="24" style="padding:1px 5px;font-size:10px;background:#fff;border:1px solid #cbd5e1;border-radius:3px;cursor:pointer">+2 năm</button>
              </div>
            </div>
            <input type="date" name="next_audit_date" id="eval-next-date" value="${esc(nextAudit || '')}" required style="margin-top:4px;width:100%">
          </div>
          <label style="margin:0;grid-column:span 2;font-size:11px;color:#475569">
            Ghi chú / Nhận xét đánh giá định kỳ
            <textarea name="evaluation_notes" rows="3" style="margin-top:4px" placeholder="Nhận xét chất lượng, điểm mạnh, rủi ro HSF, hành động cải tiến cần theo dõi...">${esc(d.evaluation_notes || '')}</textarea>
          </label>
        </div>
      </div>

      <div style="background:#f8fafc;border:1px dashed #cbd5e1;border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;gap:12px">
        <div>
          <span style="font-weight:650;color:#0f172a;font-size:12px;display:flex;align-items:center;gap:5px">
            📎 Tải lên Biên bản đánh giá / Audit Report / Chứng nhận ISO (PDF)
          </span>
          <div id="supplier-evidence-label" style="font-size:11px;color:#64748b;margin-top:2px">
            Chưa chọn tệp đính kèm mới (tùy chọn)
          </div>
        </div>
        <div>
          <label style="cursor:pointer;display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:4px;border:1px solid #3b82f6;background:#eff6ff;color:#1d4ed8;font-size:11px;font-weight:600;margin:0">
            <input type="file" id="supplier-evidence-file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx" style="display:none">
            <span>📎 Chọn file đính kèm</span>
          </label>
        </div>
      </div>

      <div id="eval-modal-error" style="color:#ef4444;font-size:11.5px;font-weight:600"></div>
    </form>
  `;

  openModal(
    isEdit ? `Đánh giá định kỳ: ${d.supplier || 'Nhà cung cấp'}` : 'Thêm Nhà cung cấp mới',
    modalHtml,
    `
      <button data-close>Hủy</button>
      <button type="button" class="primary" id="save-supplier-eval-btn">💾 Lưu kết quả đánh giá</button>
    `
  );

  modal.querySelectorAll('.quick-audit-calc').forEach(btn => {
    btn.onclick = () => {
      const months = Number(btn.dataset.months);
      const lastInput = modal.querySelector('#eval-last-date').value;
      const baseDate = lastInput ? new Date(lastInput) : new Date();
      baseDate.setMonth(baseDate.getMonth() + months);
      modal.querySelector('#eval-next-date').value = baseDate.toISOString().slice(0, 10);
    };
  });

  const fileInput = modal.querySelector('#supplier-evidence-file');
  const fileLbl = modal.querySelector('#supplier-evidence-label');
  if (fileInput) {
    fileInput.onchange = () => {
      if (fileInput.files[0]) {
        const f = fileInput.files[0];
        fileLbl.innerHTML = `<span style="color:#16a34a;font-weight:600">✓ Đã chọn: ${esc(f.name)} (${(f.size/1024).toFixed(1)} KB)</span>`;
      }
    };
  }

  const saveBtn = modal.querySelector('#save-supplier-eval-btn');
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const form = modal.querySelector('#supplier-eval-form');
      const supName = form.supplier.value.trim();
      const errBox = modal.querySelector('#eval-modal-error');
      if (!supName) {
        errBox.textContent = 'Vui lòng nhập tên Nhà cung cấp.';
        return;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = 'Đang lưu...';

      try {
        const formData = new FormData(form);
        const dataObj = Object.fromEntries(formData.entries());
        dataObj.status = 'Pending';

        let targetId = row?.id;
        if (isEdit) {
          const updated = { ...row.data, ...dataObj };
          await api('/records/' + row.id, {
            method: 'PUT',
            body: JSON.stringify({ module: 'suppliers', data: updated, version: row.version })
          });
        } else {
          const created = await api('/records', {
            method: 'POST',
            body: JSON.stringify({ module: 'suppliers', data: dataObj })
          });
          targetId = created.id;
        }

        if (fileInput && fileInput.files && fileInput.files[0] && targetId) {
          const body = new FormData();
          body.append('file', fileInput.files[0]);
          await api('/records/' + targetId + '/evidence', { method: 'POST', body });
        }

        modal.close();
        notify(`Đã lưu hồ sơ đánh giá nhà cung cấp "${supName}" thành công!`);
        render();
      } catch (err) {
        errBox.textContent = err.message;
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = '💾 Lưu kết quả đánh giá';
        }
      }
    };
  }
}

async function suppliersListPage() {
  const [suppliersRes, materialsRes, declRes, matDeclRes, bomRes] = await Promise.all([
    api('/records?module=suppliers&size=2000'),
    api('/records?module=materials&size=2000'),
    api('/records?module=declarations&size=2000'),
    api('/records?module=material-declarations&size=2000'),
    api('/records?module=bom&size=2000')
  ]);

  const allSuppliers = suppliersRes.items || [];
  const allMaterials = materialsRes.items || [];
  const allDeclarations = [...(declRes.items || []), ...(matDeclRes.items || [])];
  const allBom = bomRes.items || [];

  const bomProjects = [...new Set(allBom.map(b => b.data?.project).filter(Boolean))].sort();

  // Mapping project -> materials and project -> suppliers
  const bomProjMats = {};
  const bomProjSups = {};
  allBom.forEach(b => {
    const p = b.data?.project;
    const mc = b.data?.material_code;
    const s = (b.data?.supplier || '').trim().toUpperCase();
    if (p) {
      if (!bomProjMats[p]) bomProjMats[p] = new Set();
      if (!bomProjSups[p]) bomProjSups[p] = new Set();
      if (mc) bomProjMats[p].add(mc);
      if (s) bomProjSups[p].add(s);
    }
  });

  window.psSuppliersMap = Object.fromEntries(allSuppliers.map(s => [s.id, s]));

  // Map supplier -> materials
  const supMatMap = {};
  allMaterials.forEach(m => {
    const s = (m.data?.supplier || '').trim();
    if (s) {
      if (!supMatMap[s]) supMatMap[s] = [];
      supMatMap[s].push(m);
    }
  });

  // Map supplier -> declarations
  const supDeclMap = {};
  allDeclarations.forEach(d => {
    const s = (d.data?.supplier || '').trim();
    if (s) {
      if (!supDeclMap[s]) supDeclMap[s] = [];
      supDeclMap[s].push(d);
    }
  });

  // Project filtering
  const projFilter = listState.project || '';
  let projectScopedSuppliers = allSuppliers;
  if (projFilter) {
    projectScopedSuppliers = allSuppliers.filter(s => {
      const d = s.data || {};
      const supName = (d.supplier || '').trim().toUpperCase();
      if (bomProjSups[projFilter] && bomProjSups[projFilter].has(supName)) return true;
      const mats = supMatMap[d.supplier] || [];
      return mats.some(m => {
        const mc = m.data?.material_code;
        const mp = m.data?.project;
        return mp === projFilter || (bomProjMats[projFilter] && bomProjMats[projFilter].has(mc));
      });
    });
  }

  const now = new Date();
  let approvedCount = 0, qualifiedCount = 0, conditionalCount = 0, blacklistCount = 0, pendingCount = 0, auditDueCount = 0;

  projectScopedSuppliers.forEach(s => {
    const st = s.data?.evaluation_status || 'Pending';
    if (st === 'Approved') approvedCount++;
    else if (st === 'Qualified') qualifiedCount++;
    else if (st === 'Conditional') conditionalCount++;
    else if (st === 'Blacklist') blacklistCount++;
    else pendingCount++;

    const nextDate = s.data?.next_audit_date;
    if (nextDate) {
      const days = Math.ceil((new Date(nextDate) - now) / (1000 * 60 * 60 * 24));
      if (days <= 60) auditDueCount++;
    } else {
      auditDueCount++;
    }
  });

  // Filtering
  let filtered = projectScopedSuppliers;
  const q = (listState.q || '').trim().toLowerCase();
  const stFilter = listState.status || '';

  if (q) {
    filtered = filtered.filter(s => {
      const d = s.data || {};
      const supName = (d.supplier || '').toLowerCase();
      const contact = (d.contact || '').toLowerCase();
      const email = (d.email || '').toLowerCase();
      const phone = (d.phone || '').toLowerCase();
      const mats = (supMatMap[d.supplier] || []).map(m => (m.data?.material_code || '') + ' ' + (m.data?.material_name || '')).join(' ').toLowerCase();
      return supName.includes(q) || contact.includes(q) || email.includes(q) || phone.includes(q) || mats.includes(q);
    });
  }

  if (stFilter) {
    if (stFilter === 'audit_due') {
      filtered = filtered.filter(s => {
        const nextDate = s.data?.next_audit_date;
        if (!nextDate) return true;
        const days = Math.ceil((new Date(nextDate) - now) / (1000 * 60 * 60 * 24));
        return days <= 60;
      });
    } else {
      filtered = filtered.filter(s => (s.data?.evaluation_status || 'Pending') === stFilter);
    }
  }

  // Sorting
  const sortKey = listState.sort || 'updated_at';
  const sortDir = listState.direction || 'desc';
  filtered.sort((a, b) => {
    let valA, valB;
    if (sortKey === 'supplier') {
      valA = a.data?.supplier || '';
      valB = b.data?.supplier || '';
    } else if (sortKey === 'evaluation_status') {
      valA = a.data?.evaluation_status || '';
      valB = b.data?.evaluation_status || '';
    } else if (sortKey === 'audit_grade') {
      valA = a.data?.audit_grade || '';
      valB = b.data?.audit_grade || '';
    } else if (sortKey === 'last_audit_date') {
      valA = a.data?.last_audit_date || '';
      valB = b.data?.last_audit_date || '';
    } else if (sortKey === 'next_audit_date') {
      valA = a.data?.next_audit_date || '';
      valB = b.data?.next_audit_date || '';
    } else {
      valA = a[sortKey] || a.data?.[sortKey] || '';
      valB = b[sortKey] || b.data?.[sortKey] || '';
    }
    return sortDir === 'asc' ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
  });

  const supplierOptimal = (function() {
    const vh = window.innerHeight || 900;
    const count = Math.floor((vh - 365) / 47);
    return Math.max(6, Math.min(22, count)) || 8;
  })();
  const pageSize = Number(listState.supplierSize) || supplierOptimal;
  listState.supplierSize = pageSize;
  listState.size = pageSize;
  const page = listState.page || 1;
  const total = filtered.length;
  const pagedItems = filtered.slice((page - 1) * pageSize, page * pageSize);
  const pagination = paginationHtml(page, total, pageSize);

  const defaultSizes = [...new Set([pageSize, 10, 12, 13, 14, 16, 17, 20, 25, 2000])].sort((a, b) => a - b);
  const sizeOptHtml = defaultSizes.map(v => `<option value="${v}" ${pageSize===v?'selected':''}>${v===2000?`Tất cả (${total} NCC)`:`${v} / trang`}</option>`).join('');

  const kpiCardsHtml = `
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:12px;flex-shrink:0">
      <div style="background:#fff;border:${!stFilter?'2px solid #2563eb':'1px solid #e2e8f0'};border-radius:8px;padding:10px 14px;box-shadow:${!stFilter?'0 0 0 2px rgba(37,99,235,0.15), 0 2px 4px rgba(0,0,0,0.05)':'0 1px 2px rgba(0,0,0,0.02)'};cursor:pointer;transition:all .15s ease" data-status-filter="">
        <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase">Tổng số NCC</div>
        <div style="font-size:22px;font-weight:700;color:#0f172a;margin-top:2px;line-height:1.1">${projectScopedSuppliers.length}</div>
        <small style="color:#64748b;font-size:10.5px">${projFilter ? `Dự án: <b>${esc(projFilter)}</b>` : 'Đang quản lý trong hệ thống'}</small>
      </div>
      <div style="background:#f0fdf4;border:${stFilter==='Approved'?'2px solid #16a34a':'1px solid #bbf7d0'};border-radius:8px;padding:10px 14px;box-shadow:${stFilter==='Approved'?'0 0 0 2px rgba(22,163,74,0.15), 0 2px 4px rgba(0,0,0,0.05)':'0 1px 2px rgba(0,0,0,0.02)'};cursor:pointer;transition:all .15s ease" data-status-filter="Approved">
        <div style="font-size:11px;font-weight:600;color:#15803d;text-transform:uppercase">Đạt chuẩn (Approved)</div>
        <div style="font-size:22px;font-weight:700;color:#16a34a;margin-top:2px;line-height:1.1">${approvedCount}</div>
        <small style="color:#15803d;font-size:10.5px">Ưu tiên sử dụng sản xuất</small>
      </div>
      <div style="background:#fffbeb;border:${stFilter==='audit_due'?'2px solid #d97706':'1px solid #fde68a'};border-radius:8px;padding:10px 14px;box-shadow:${stFilter==='audit_due'?'0 0 0 2px rgba(217,119,6,0.15), 0 2px 4px rgba(0,0,0,0.05)':'0 1px 2px rgba(0,0,0,0.02)'};cursor:pointer;transition:all .15s ease" data-status-filter="audit_due">
        <div style="font-size:11px;font-weight:600;color:#b45309;text-transform:uppercase">Cần đánh giá (≤ 60 ngày)</div>
        <div style="font-size:22px;font-weight:700;color:#d97706;margin-top:2px;line-height:1.1">${auditDueCount}</div>
        <small style="color:#b45309;font-size:10.5px">Đến hạn audit định kỳ</small>
      </div>
      <div style="background:#eff6ff;border:${stFilter==='Qualified'?'2px solid #2563eb':'1px solid #bfdbfe'};border-radius:8px;padding:10px 14px;box-shadow:${stFilter==='Qualified'?'0 0 0 2px rgba(37,99,235,0.15), 0 2px 4px rgba(0,0,0,0.05)':'0 1px 2px rgba(0,0,0,0.02)'};cursor:pointer;transition:all .15s ease" data-status-filter="Qualified">
        <div style="font-size:11px;font-weight:600;color:#1e40af;text-transform:uppercase">Đủ điều kiện (Qualified)</div>
        <div style="font-size:22px;font-weight:700;color:#2563eb;margin-top:2px;line-height:1.1">${qualifiedCount}</div>
        <small style="color:#1e40af;font-size:10.5px">Đạt yêu cầu kỹ thuật & QA</small>
      </div>
      <div style="background:#fef2f2;border:${stFilter==='Blacklist'?'2px solid #dc2626':'1px solid #fecaca'};border-radius:8px;padding:10px 14px;box-shadow:${stFilter==='Blacklist'?'0 0 0 2px rgba(220,38,38,0.15), 0 2px 4px rgba(0,0,0,0.05)':'0 1px 2px rgba(0,0,0,0.02)'};cursor:pointer;transition:all .15s ease" data-status-filter="Blacklist">
        <div style="font-size:11px;font-weight:600;color:#b91c1c;text-transform:uppercase">Đình chỉ (Blacklist)</div>
        <div style="font-size:22px;font-weight:700;color:#dc2626;margin-top:2px;line-height:1.1">${blacklistCount}</div>
        <small style="color:#b91c1c;font-size:10.5px">Chặn mua hàng & cấp NVL</small>
      </div>
    </div>
  `;

  const rowsHtml = pagedItems.map(r => {
    const d = r.data || {};
    const supName = d.supplier || label(r);
    const allSupMats = supMatMap[supName] || [];
    const mats = projFilter
      ? allSupMats.filter(m => m.data?.project === projFilter || (bomProjMats[projFilter] && bomProjMats[projFilter].has(m.data?.material_code)))
      : allSupMats;
    const decls = supDeclMap[supName] || [];
    const status = d.evaluation_status || 'Pending';
    const grade = d.audit_grade || '—';
    const lastDate = d.last_audit_date;
    const nextDate = d.next_audit_date;

    let scheduleBadge = '<span style="color:#94a3b8;font-size:11px">—</span>';
    if (nextDate) {
      const days = Math.ceil((new Date(nextDate) - now) / (1000 * 60 * 60 * 24));
      if (days < 0) {
        scheduleBadge = `<span class="badge" style="background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;font-size:10.5px">✕ Quá hạn ${Math.abs(days)} ngày</span>`;
      } else if (days <= 60) {
        scheduleBadge = `<span class="badge" style="background:#fef3c7;color:#b45309;border:1px solid #fde68a;font-size:10.5px">⚠️ Sắp đến hạn (${days} ngày)</span>`;
      } else {
        scheduleBadge = `<span class="badge" style="background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;font-size:10.5px">✓ Còn ${days} ngày</span>`;
      }
    }

    let matTagsHtml = '';
    if (mats.length === 0) {
      matTagsHtml = `<span style="color:#94a3b8;font-size:11px">Chưa có NVL${projFilter ? ` (${esc(projFilter)})` : ''}</span>`;
    } else {
      const matTitle = mats.map(m => `${m.data?.material_code || ''} ${m.data?.material_name || ''}`.trim()).join('\n');
      matTagsHtml = `<button type="button" class="supplier-material-count" data-supplier-filter="${esc(supName)}" title="${esc(matTitle)}"><b>${mats.length}</b><span>NVL đang cấp</span></button>`;
    }

    const declWithFile = decls.find(dc => dc.files && dc.files.length > 0);
    const declFile = declWithFile?.files?.[0];
    let declLinkHtml = '';
    if (declFile) {
      declLinkHtml = `<a href="/api/evidence/${declFile.id}" target="_blank" style="color:#2563eb;font-size:11px;font-weight:600;text-decoration:none;display:inline-flex;align-items:center;gap:3px;background:#eff6ff;padding:1px 6px;border-radius:4px;border:1px solid #bfdbfe">📄 ${esc(declWithFile.data?.declaration_no || 'Declaration')} 📥</a>`;
    } else if (decls.length > 0) {
      declLinkHtml = `<span style="color:#059669;font-size:11px;font-weight:600">✓ Đã nộp (${decls.length})</span>`;
    } else {
      declLinkHtml = `<span style="color:#94a3b8;font-size:11px">Chưa nộp</span>`;
    }

    return `
      <tr>
        <td class="supplier-material-count-cell">
          <div>
            <button class="link-button" data-open="${r.id}" style="font-weight:700;font-size:12.5px;color:#0f172a">${esc(supName)}</button>
            <div style="font-size:11px;color:#64748b;margin-top:1px">${esc(d.contact || '')} ${d.phone ? `· ${esc(d.phone)}` : ''}</div>
          </div>
        </td>
        <td class="supplier-material-count-cell">${matTagsHtml}</td>
        <td class="supplier-status-cell">${badge(status)}</td>
        <td class="supplier-grade-cell"><span style="font-size:11.5px;font-weight:600;color:#334155">${esc(grade)}</span></td>
        <td style="font-size:11.5px">${dateText(lastDate)}</td>
        <td>
          <div style="display:flex;flex-direction:column;gap:2px">
            <span style="font-size:11.5px;font-weight:500">${dateText(nextDate)}</span>
            ${scheduleBadge}
          </div>
        </td>
        <td class="supplier-decl-cell">${declLinkHtml}</td>
        <td class="supplier-action-cell">
          <div style="display:flex;align-items:center;gap:6px">
            <button class="link-button" data-open="${r.id}" style="font-size:11.5px">👁️ Chi tiết</button>
            <button type="button" class="link-button evaluate-supplier-btn" data-supplier-id="${r.id}" style="font-size:11.5px;color:#2563eb;font-weight:600">✏️ Đánh giá</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  return head('Quản lý Nhà cung cấp & Đánh giá định kỳ', '') + kpiCardsHtml + `
    <section class="card fill-card">
      <form class="toolbar" id="filters" data-module="suppliers">
        <input type="search" name="q" placeholder="Tìm tên NCC, NVL cung cấp, liên hệ, email…" value="${esc(listState.q)}" aria-label="Tìm trong bảng">
        <select name="project" id="project-filter" title="Lọc theo Dự án" aria-label="Dự án">
          <option value="">Tất cả dự án (${bomProjects.length})</option>
          ${bomProjects.map(p => `<option value="${esc(p)}" ${projFilter===p?'selected':''}>Dự án: ${esc(p)}</option>`).join('')}
        </select>
        <select name="status" title="Lọc theo Trạng thái đánh giá" aria-label="Trạng thái">
          <option value="">Tất cả trạng thái</option>
          <option value="Approved" ${stFilter==='Approved'?'selected':''}>Approved (Đạt chuẩn)</option>
          <option value="Qualified" ${stFilter==='Qualified'?'selected':''}>Qualified (Đủ điều kiện)</option>
          <option value="Conditional" ${stFilter==='Conditional'?'selected':''}>Conditional (Có điều kiện)</option>
          <option value="Pending" ${stFilter==='Pending'?'selected':''}>Pending (Chờ đánh giá)</option>
          <option value="Blacklist" ${stFilter==='Blacklist'?'selected':''}>Blacklist (Đình chỉ)</option>
          <option value="audit_due" ${stFilter==='audit_due'?'selected':''}>⏰ Đến hạn đánh giá (≤ 60 ngày)</option>
        </select>
        <select name="size" id="page-size-select" title="Số lượng dòng mỗi trang" aria-label="Số dòng mỗi trang">${sizeOptHtml}</select>
        <div class="toolbar-actions-group">
          <button type="submit" class="toolbar-btn" title="Áp dụng tìm kiếm & bộ lọc" aria-label="Áp dụng bộ lọc"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg></button>
          <button type="button" id="reset-filter" class="toolbar-btn" title="Xóa toàn bộ bộ lọc & làm mới" aria-label="Xóa bộ lọc"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg></button>
        </div>
        <div class="toolbar-actions-right">
          <button type="button" id="export" class="toolbar-btn" title="Xuất danh sách ra file Excel" aria-label="Xuất file Excel"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
          ${can('suppliers','Create')?`<button type="button" class="primary toolbar-btn" id="add-supplier-eval-btn" title="Thêm Nhà cung cấp mới" aria-label="Thêm Nhà cung cấp mới"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>`:''}
        </div>
      </form>
      <div class="table-scroll suppliers-table-scroll">
        <table class="suppliers-table">
          <thead>
            <tr>
              <th><button class="link-button" data-sort="supplier">Nhà cung cấp ${listState.sort==='supplier'?(listState.direction==='asc'?'↑':'↓'):'↕'}</button></th>
              <th>Số lượng NVL đang cấp</th>
              <th><button class="link-button" data-sort="evaluation_status">Tình trạng đánh giá ${listState.sort==='evaluation_status'?(listState.direction==='asc'?'↑':'↓'):'↕'}</button></th>
              <th><button class="link-button" data-sort="audit_grade">Xếp loại / Grade ${listState.sort==='audit_grade'?(listState.direction==='asc'?'↑':'↓'):'↕'}</button></th>
              <th><button class="link-button" data-sort="last_audit_date">Ngày đánh giá ${listState.sort==='last_audit_date'?(listState.direction==='asc'?'↑':'↓'):'↕'}</button></th>
              <th><button class="link-button" data-sort="next_audit_date">Hạn đánh giá tiếp theo ${listState.sort==='next_audit_date'?(listState.direction==='asc'?'↑':'↓'):'↕'}</button></th>
              <th>Cam kết Declaration</th>
              <th>Hành động</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="8" class="muted" style="text-align:center;padding:24px">Không tìm thấy nhà cung cấp nào phù hợp.</td></tr>'}
          </tbody>
        </table>
      </div>
      ${pagination}
    </section>
  `;
}

async function materialsListPage() {
  const [materialsRes, reportsRes, declRes, matDeclRes, suppliersRes, bomRes] = await Promise.all([
    api('/records?module=materials&size=2000'),
    api('/records?module=reports&size=2000'),
    api('/records?module=declarations&size=2000'),
    api('/records?module=material-declarations&size=2000'),
    api('/records?module=suppliers&size=2000'),
    api('/records?module=bom&size=2000')
  ]);

  const allMaterials = materialsRes.items || [];
  const allReports = reportsRes.items || [];
  const allDeclarations = [...(declRes.items || []), ...(matDeclRes.items || [])];
  const allSuppliers = suppliersRes.items || [];
  const allBom = bomRes.items || [];

  const bomProjects = [...new Set(allBom.map(b => b.data?.project).filter(Boolean))].sort();
  const bomProjMats = {};
  allBom.forEach(b => {
    const p = b.data?.project;
    const mc = b.data?.material_code;
    if (p && mc) {
      if (!bomProjMats[p]) bomProjMats[p] = new Set();
      bomProjMats[p].add(mc);
    }
  });

  window.psMaterialsMap = Object.fromEntries(allMaterials.map(m => [m.id, m]));

  // Map material_code -> list of reports
  const matReportsMap = {};
  allReports.forEach(r => {
    const code = (r.data?.material_code || '').trim();
    if (code) {
      if (!matReportsMap[code]) matReportsMap[code] = [];
      matReportsMap[code].push(r);
    }
  });

  // Map material_code -> declarations, and supplier -> declarations
  const matDeclMap = {};
  const supDeclMap = {};
  allDeclarations.forEach(d => {
    const code = (d.data?.material_code || '').trim();
    const sup = (d.data?.supplier || '').trim();
    if (code) {
      if (!matDeclMap[code]) matDeclMap[code] = [];
      matDeclMap[code].push(d);
    }
    if (sup) {
      if (!supDeclMap[sup]) supDeclMap[sup] = [];
      supDeclMap[sup].push(d);
    }
  });

  const projFilter = listState.project || '';
  let projectScopedMaterials = allMaterials;
  if (projFilter) {
    projectScopedMaterials = allMaterials.filter(m => {
      const d = m.data || {};
      return d.project === projFilter || (bomProjMats[projFilter] && bomProjMats[projFilter].has(d.material_code));
    });
  }

  const now = new Date();

  // Process compliance status for each material
  allMaterials.forEach(m => {
    const d = m.data || {};
    const code = (d.material_code || '').trim();
    const sup = (d.supplier || '').trim();

    let reqTests = String(d.required_tests || '').split(',').map(s => s.trim()).filter(Boolean);
    m._reqTests = reqTests;

    const matReps = matReportsMap[code] || [];
    const testStatusList = [];

    reqTests.forEach(t => {
      const matching = matReps.filter(r => (r.data?.test_type || '').toLowerCase() === t.toLowerCase());
      if (matching.length === 0) {
        testStatusList.push({ test: t, status: 'Missing', report: null, days: null });
      } else {
        const latest = [...matching].sort((a, b) => String(b.data?.expiry_date || '9999').localeCompare(String(a.data?.expiry_date || '9999')))[0];
        const res = (latest.data?.result || 'PASS').toUpperCase();
        let st = 'Valid';
        let remainingDays = null;
        if (res === 'FAIL' || res === 'NG') {
          st = 'NG';
        } else if (latest.data?.expiry_date) {
          const exp = new Date(latest.data.expiry_date);
          remainingDays = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
          if (remainingDays < 0) st = 'Expired';
          else if (remainingDays <= 90) st = 'ExpiringSoon';
          else st = 'Valid';
        }
        testStatusList.push({ test: t, status: st, report: latest, days: remainingDays });
      }
    });

    m._testStatusList = testStatusList;

    // Overall compliance
    if (testStatusList.some(x => x.status === 'NG' || x.status === 'Expired')) {
      m._complianceStatus = 'ExpiredNG';
    } else if (testStatusList.some(x => x.status === 'Missing')) {
      m._complianceStatus = 'Missing';
    } else if (testStatusList.some(x => x.status === 'ExpiringSoon')) {
      m._complianceStatus = 'ExpiringSoon';
    } else {
      m._complianceStatus = 'Compliant';
    }

    m._declarations = matDeclMap[code] || supDeclMap[sup] || [];
  });

  // Calculate scoped KPI counts
  let compliantCount = 0;
  let missingCount = 0;
  let expiringSoonCount = 0;
  let expiredNgCount = 0;
  let activeCount = 0;

  projectScopedMaterials.forEach(m => {
    const d = m.data || {};
    const usage = d.usage_status || 'Đang sử dụng';
    if (usage === 'Đang sử dụng') activeCount++;
    if (m._complianceStatus === 'Compliant') compliantCount++;
    else if (m._complianceStatus === 'Missing') missingCount++;
    else if (m._complianceStatus === 'ExpiringSoon') expiringSoonCount++;
    else if (m._complianceStatus === 'ExpiredNG') expiredNgCount++;
  });

  // Filtering
  let filtered = projectScopedMaterials;
  const q = (listState.q || '').trim().toLowerCase();
  const stFilter = listState.status || '';

  if (q) {
    filtered = filtered.filter(m => {
      const d = m.data || {};
      const code = (d.material_code || '').toLowerCase();
      const name = (d.material_name || '').toLowerCase();
      const sup = (d.supplier || '').toLowerCase();
      const proj = (d.project || '').toLowerCase();
      const cat = (d.category || '').toLowerCase();
      const tests = (d.required_tests || '').toLowerCase();
      return code.includes(q) || name.includes(q) || sup.includes(q) || proj.includes(q) || cat.includes(q) || tests.includes(q);
    });
  }

  if (stFilter) {
    if (stFilter === 'Compliant') {
      filtered = filtered.filter(m => m._complianceStatus === 'Compliant');
    } else if (stFilter === 'Missing') {
      filtered = filtered.filter(m => m._complianceStatus === 'Missing');
    } else if (stFilter === 'ExpiringSoon') {
      filtered = filtered.filter(m => m._complianceStatus === 'ExpiringSoon');
    } else if (stFilter === 'ExpiredNG') {
      filtered = filtered.filter(m => m._complianceStatus === 'ExpiredNG');
    } else if (stFilter === 'Active') {
      filtered = filtered.filter(m => (m.data?.usage_status || 'Đang sử dụng') === 'Đang sử dụng');
    } else if (stFilter === 'Inactive') {
      filtered = filtered.filter(m => (m.data?.usage_status || '') !== 'Đang sử dụng');
    } else {
      filtered = filtered.filter(m => (m.data?.usage_status === stFilter) || (m.data?.status === stFilter));
    }
  }

  // Sorting
  const sortKey = listState.sort || 'material_code';
  const sortDir = listState.direction || 'asc';
  filtered.sort((a, b) => {
    let valA, valB;
    if (sortKey === 'material_code') {
      valA = a.data?.material_code || '';
      valB = b.data?.material_code || '';
    } else if (sortKey === 'material_name') {
      valA = a.data?.material_name || '';
      valB = b.data?.material_name || '';
    } else if (sortKey === 'supplier') {
      valA = a.data?.supplier || '';
      valB = b.data?.supplier || '';
    } else if (sortKey === 'category') {
      valA = a.data?.category || '';
      valB = b.data?.category || '';
    } else if (sortKey === 'project') {
      valA = a.data?.project || '';
      valB = b.data?.project || '';
    } else if (sortKey === 'compliance') {
      valA = a._complianceStatus || '';
      valB = b._complianceStatus || '';
    } else if (sortKey === 'usage_status') {
      valA = a.data?.usage_status || '';
      valB = b.data?.usage_status || '';
    } else {
      valA = a[sortKey] || a.data?.[sortKey] || '';
      valB = b[sortKey] || b.data?.[sortKey] || '';
    }
    return sortDir === 'asc' ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
  });

  const matOptimal = (function() {
    const vh = window.innerHeight || 900;
    const count = Math.floor((vh - 315) / 45);
    return Math.max(8, Math.min(30, count)) || 10;
  })();
  const pageSize = Number(listState.materialSize) || matOptimal;
  listState.materialSize = pageSize;
  listState.size = pageSize;
  const page = listState.page || 1;
  const total = filtered.length;
  const pagedItems = filtered.slice((page - 1) * pageSize, page * pageSize);
  const pagination = paginationHtml(page, total, pageSize);

  const defaultSizes = [...new Set([pageSize, 10, 12, 13, 14, 16, 17, 20, 25, 2000])].sort((a, b) => a - b);
  const sizeOptHtml = defaultSizes.map(v => `<option value="${v}" ${pageSize===v?'selected':''}>${v===2000?`Tất cả (${total} NVL)`:`${v} / trang`}</option>`).join('');

  const kpiCardsHtml = `
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:12px;flex-shrink:0">
      <div style="background:#fff;border:${!stFilter?'2px solid #2563eb':'1px solid #e2e8f0'};border-radius:8px;padding:10px 14px;box-shadow:${!stFilter?'0 0 0 2px rgba(37,99,235,0.15), 0 2px 4px rgba(0,0,0,0.05)':'0 1px 2px rgba(0,0,0,0.02)'};cursor:pointer;transition:all .15s ease" data-status-filter="">
        <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase">Tổng số NVL</div>
        <div style="font-size:22px;font-weight:700;color:#0f172a;margin-top:2px;line-height:1.1">${projectScopedMaterials.length}</div>
        <small style="color:#64748b;font-size:10.5px">${projFilter ? `Dự án: <b>${esc(projFilter)}</b>` : 'Đang quản lý trong hệ thống'}</small>
      </div>
      <div style="background:#f0fdf4;border:${stFilter==='Compliant'?'2px solid #16a34a':'1px solid #bbf7d0'};border-radius:8px;padding:10px 14px;box-shadow:${stFilter==='Compliant'?'0 0 0 2px rgba(22,163,74,0.15), 0 2px 4px rgba(0,0,0,0.05)':'0 1px 2px rgba(0,0,0,0.02)'};cursor:pointer;transition:all .15s ease" data-status-filter="Compliant">
        <div style="font-size:11px;font-weight:600;color:#15803d;text-transform:uppercase">Đạt chuẩn (Compliant)</div>
        <div style="font-size:22px;font-weight:700;color:#16a34a;margin-top:2px;line-height:1.1">${compliantCount}</div>
        <small style="color:#15803d;font-size:10.5px">100% báo cáo kiểm nghiệm hợp lệ</small>
      </div>
      <div style="background:#fffbeb;border:${stFilter==='Missing'?'2px solid #d97706':'1px solid #fde68a'};border-radius:8px;padding:10px 14px;box-shadow:${stFilter==='Missing'?'0 0 0 2px rgba(217,119,6,0.15), 0 2px 4px rgba(0,0,0,0.05)':'0 1px 2px rgba(0,0,0,0.02)'};cursor:pointer;transition:all .15s ease" data-status-filter="Missing">
        <div style="font-size:11px;font-weight:600;color:#b45309;text-transform:uppercase">Cần nộp / Thiếu báo cáo</div>
        <div style="font-size:22px;font-weight:700;color:#d97706;margin-top:2px;line-height:1.1">${missingCount}</div>
        <small style="color:#b45309;font-size:10.5px">Thiếu 1 hoặc nhiều test bắt buộc</small>
      </div>
      <div style="background:#eff6ff;border:${stFilter==='ExpiringSoon'?'2px solid #2563eb':'1px solid #bfdbfe'};border-radius:8px;padding:10px 14px;box-shadow:${stFilter==='ExpiringSoon'?'0 0 0 2px rgba(37,99,235,0.15), 0 2px 4px rgba(0,0,0,0.05)':'0 1px 2px rgba(0,0,0,0.02)'};cursor:pointer;transition:all .15s ease" data-status-filter="ExpiringSoon">
        <div style="font-size:11px;font-weight:600;color:#1e40af;text-transform:uppercase">Sắp hết hạn (≤ 90 ngày)</div>
        <div style="font-size:22px;font-weight:700;color:#2563eb;margin-top:2px;line-height:1.1">${expiringSoonCount}</div>
        <small style="color:#1e40af;font-size:10.5px">Cần yêu cầu NCC gia hạn</small>
      </div>
      <div style="background:#fef2f2;border:${stFilter==='ExpiredNG'?'2px solid #dc2626':'1px solid #fecaca'};border-radius:8px;padding:10px 14px;box-shadow:${stFilter==='ExpiredNG'?'0 0 0 2px rgba(220,38,38,0.15), 0 2px 4px rgba(0,0,0,0.05)':'0 1px 2px rgba(0,0,0,0.02)'};cursor:pointer;transition:all .15s ease" data-status-filter="ExpiredNG">
        <div style="font-size:11px;font-weight:600;color:#b91c1c;text-transform:uppercase">Quá hạn / Không đạt (NG)</div>
        <div style="font-size:22px;font-weight:700;color:#dc2626;margin-top:2px;line-height:1.1">${expiredNgCount}</div>
        <small style="color:#b91c1c;font-size:10.5px">Báo cáo quá hạn hoặc kết quả NG</small>
      </div>
    </div>
  `;

  const rowsHtml = pagedItems.map(m => {
    const d = m.data || {};
    const code = d.material_code || '—';
    const name = d.material_name || '—';
    const cat = d.category || 'Raw material';
    const sup = d.supplier || '—';
    const usage = d.usage_status || 'Đang sử dụng';
    const decls = m._declarations || [];

    const declWithFile = decls.find(dc => dc.files && dc.files.length > 0);
    const declFile = declWithFile?.files?.[0];
    let declLinkHtml = '';
    if (declFile) {
      declLinkHtml = `<a href="/api/evidence/${declFile.id}" target="_blank" style="color:#2563eb;font-size:10.5px;font-weight:600;text-decoration:none;display:inline-flex;align-items:center;gap:3px;background:#eff6ff;padding:1px 5px;border-radius:4px;border:1px solid #bfdbfe" title="${esc(declWithFile.data?.declaration_no || 'Declaration')}">📄 Cam kết 📥</a>`;
    } else if (decls.length > 0) {
      declLinkHtml = `<span style="color:#059669;font-size:10.5px;font-weight:600">✓ Đã nộp</span>`;
    } else {
      declLinkHtml = `<span style="color:#94a3b8;font-size:10.5px">Chưa nộp</span>`;
    }

    const testBadges = m._testStatusList.map(item => {
      const t = item.test;
      const rep = item.report;
      if (item.status === 'Valid') {
        const title = rep ? `${esc(t)}: ${esc(rep.data?.report_id || '')} (Hạn: ${dateText(rep.data?.expiry_date)})` : t;
        return `<span class="badge" style="background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;font-size:10.5px;padding:1px 6px;white-space:nowrap" title="${title}">✓ ${esc(t)}</span>`;
      } else if (item.status === 'ExpiringSoon') {
        const title = rep ? `${esc(t)}: ${esc(rep.data?.report_id || '')} (Còn ${item.days} ngày - Hạn: ${dateText(rep.data?.expiry_date)})` : t;
        return `<span class="badge" style="background:#fef3c7;color:#b45309;border:1px solid #fde68a;font-size:10.5px;padding:1px 6px;white-space:nowrap" title="${title}">⚠️ ${esc(t)} (${item.days}d)</span>`;
      } else if (item.status === 'Expired') {
        const title = rep ? `${esc(t)}: ${esc(rep.data?.report_id || '')} (Quá hạn ${Math.abs(item.days)} ngày)` : t;
        return `<span class="badge" style="background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;font-size:10.5px;padding:1px 6px;white-space:nowrap" title="${title}">✕ ${esc(t)} (Hết hạn)</span>`;
      } else if (item.status === 'NG') {
        return `<span class="badge" style="background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;font-size:10.5px;padding:1px 6px;white-space:nowrap" title="${esc(t)}: Kết quả Không đạt (FAIL/NG)">✕ ${esc(t)} (NG)</span>`;
      } else {
        return `<span class="badge" style="background:#f8fafc;color:#64748b;border:1px dashed #cbd5e1;font-size:10.5px;padding:1px 6px;white-space:nowrap" title="${esc(t)}: Chưa có báo cáo kiểm nghiệm">⏳ ${esc(t)}</span>`;
      }
    }).join(' ');

    let compBadge = '';
    if (m._complianceStatus === 'Compliant' && (m._reqTests || []).length === 0) {
      compBadge = `<span class="badge" style="background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;font-size:11px;font-weight:600;white-space:nowrap">Không yêu cầu kiểm nghiệm</span>`;
    } else if (m._complianceStatus === 'Compliant') {
      compBadge = `<span class="badge" style="background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;font-size:11px;font-weight:600;white-space:nowrap">✓ Đạt chuẩn</span>`;
    } else if (m._complianceStatus === 'ExpiringSoon') {
      compBadge = `<span class="badge" style="background:#fef3c7;color:#b45309;border:1px solid #fde68a;font-size:11px;font-weight:600;white-space:nowrap">⚠️ Sắp hết hạn</span>`;
    } else if (m._complianceStatus === 'ExpiredNG') {
      compBadge = `<span class="badge" style="background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;font-size:11px;font-weight:600;white-space:nowrap">✕ Quá hạn / NG</span>`;
    } else {
      compBadge = `<span class="badge" style="background:#fffbeb;color:#b45309;border:1px solid #fde68a;font-size:11px;font-weight:600;white-space:nowrap">⏳ Thiếu báo cáo</span>`;
    }

    let usageBadge = '';
    if (usage === 'Đang sử dụng') {
      usageBadge = `<span class="badge" style="background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;font-size:10.5px;white-space:nowrap">🟢 Đang sử dụng</span>`;
    } else if (usage === 'Tạm ngưng') {
      usageBadge = `<span class="badge" style="background:#fef3c7;color:#b45309;border:1px solid #fde68a;font-size:10.5px;white-space:nowrap">🟡 Tạm ngưng</span>`;
    } else {
      usageBadge = `<span class="badge" style="background:#f1f5f9;color:#64748b;border:1px solid #cbd5e1;font-size:10.5px;white-space:nowrap">⚪ Ngừng dùng</span>`;
    }

    return `
      <tr>
        <td style="padding:6px 10px"><button class="link-button" data-open="${m.id}" style="font-weight:700;font-size:12.5px;color:#0f172a;font-family:monospace">${esc(code)}</button></td><td style="padding:6px 10px"><div style="font-size:11px;color:#64748b;white-space:normal" title="${esc(name)}">${esc(name)}</div></td>
        <td style="padding:6px 10px">
          <span class="badge" style="background:#f1f5f9;color:#334155;border:1px solid #e2e8f0;font-size:10.5px">${esc(cat)}</span>
        </td>
        <td style="padding:6px 10px">
          <div>
            <div style="font-size:12px;font-weight:600;color:#1e293b">${esc(sup)}</div>
            <div style="margin-top:2px">${declLinkHtml}</div>
          </div>
        </td>
        <td style="padding:6px 10px">
          <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
            ${testBadges || '<span class="badge" style="background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;font-size:10.5px;padding:1px 6px;white-space:nowrap">Không yêu cầu</span>'}
          </div>
        </td>
        <td style="padding:6px 10px">${compBadge}</td>
        <td style="padding:6px 10px">${usageBadge}</td>
        <td style="padding:4px 6px;text-align:center;white-space:nowrap;width:75px">
          <div style="display:inline-flex;align-items:center;gap:6px">
            <button class="link-button" data-open="${m.id}" style="font-size:13px;padding:2px 4px;line-height:1;cursor:pointer" title="Xem chi tiết">👁️</button>
            <button type="button" class="link-button edit-material-btn" data-material-id="${m.id}" style="font-size:13px;color:#2563eb;padding:2px 4px;line-height:1;cursor:pointer" title="Chỉnh sửa">✏️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  return head('Danh mục Nguyên vật liệu & Hồ sơ Tuân thủ', '') + kpiCardsHtml + `
    <section class="card fill-card">
      <form class="toolbar" id="filters" data-module="materials">
        <input type="search" name="q" placeholder="Tìm mã NVL, tên NVL, nhà cung cấp, dự án…" value="${esc(listState.q)}" aria-label="Tìm trong bảng">
        <select name="project" id="project-filter" title="Lọc theo Dự án" aria-label="Dự án">
          <option value="">Tất cả dự án (${bomProjects.length})</option>
          ${bomProjects.map(p => `<option value="${esc(p)}" ${projFilter===p?'selected':''}>Dự án: ${esc(p)}</option>`).join('')}
        </select>
        <select name="status" title="Lọc theo Trạng thái tuân thủ & sử dụng" aria-label="Trạng thái">
          <option value="">Tất cả trạng thái</option>
          <option value="Compliant" ${stFilter==='Compliant'?'selected':''}>✓ Đạt chuẩn (Compliant)</option>
          <option value="Missing" ${stFilter==='Missing'?'selected':''}>⏳ Cần nộp / Thiếu báo cáo</option>
          <option value="ExpiringSoon" ${stFilter==='ExpiringSoon'?'selected':''}>⚠️ Sắp hết hạn (≤ 90 ngày)</option>
          <option value="ExpiredNG" ${stFilter==='ExpiredNG'?'selected':''}>🚫 Quá hạn / Không đạt (NG)</option>
          <option value="Active" ${stFilter==='Active'?'selected':''}>🟢 Đang sử dụng</option>
          <option value="Inactive" ${stFilter==='Inactive'?'selected':''}>⚪ Tạm ngưng / Ngừng dùng</option>
        </select>
        <select name="size" id="page-size-select" title="Số lượng dòng mỗi trang" aria-label="Số dòng mỗi trang">${sizeOptHtml}</select>
        <div class="toolbar-actions-group">
          <button type="submit" class="toolbar-btn" title="Áp dụng tìm kiếm & bộ lọc" aria-label="Áp dụng bộ lọc"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg></button>
          <button type="button" id="reset-filter" class="toolbar-btn" title="Xóa toàn bộ bộ lọc & làm mới" aria-label="Xóa bộ lọc"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg></button>
        </div>
        <div class="toolbar-actions-right">
          <button type="button" id="export" class="toolbar-btn" title="Xuất danh sách ra file Excel" aria-label="Xuất file Excel"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
          ${can('materials','Create')?`<button type="button" class="primary toolbar-btn" id="add-material-btn" title="Thêm Nguyên vật liệu mới" aria-label="Thêm NVL mới"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>`:''}
        </div>
      </form>
      <div class="table-scroll">
        <table style="width:100%">
          <thead>
            <tr>
              <th style="padding:8px 10px"><button class="link-button" data-sort="material_code">Part Code ${listState.sort==='material_code'?(listState.direction==='asc'?'↑':'↓'):'↕'}</button></th><th style="padding:8px 10px"><button class="link-button" data-sort="material_name">Part Name ${listState.sort==='material_name'?(listState.direction==='asc'?'↑':'↓'):'↕'}</button></th>
              <th style="padding:8px 10px"><button class="link-button" data-sort="category">Phân loại ${listState.sort==='category'?(listState.direction==='asc'?'↑':'↓'):'↕'}</button></th>
              <th style="padding:8px 10px"><button class="link-button" data-sort="supplier">Nhà cung cấp & Cam kết ${listState.sort==='supplier'?(listState.direction==='asc'?'↑':'↓'):'↕'}</button></th>
              <th style="padding:8px 10px;min-width:180px">Hồ sơ Báo cáo kiểm nghiệm</th>
              <th style="padding:8px 10px"><button class="link-button" data-sort="compliance">Trạng thái tuân thủ ${listState.sort==='compliance'?(listState.direction==='asc'?'↑':'↓'):'↕'}</button></th>
              <th style="padding:8px 10px"><button class="link-button" data-sort="usage_status">Tình trạng sử dụng ${listState.sort==='usage_status'?(listState.direction==='asc'?'↑':'↓'):'↕'}</button></th>
              <th style="padding:6px 4px;width:55px;text-align:center" title="Thao tác / Chỉnh sửa">⚙️</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="7" class="muted" style="text-align:center;padding:24px">Không tìm thấy vật liệu nào phù hợp.</td></tr>'}
          </tbody>
        </table>
      </div>
      ${pagination}
    </section>
  `;
}


async function xrfDataListPage(module) {
  const [dataRes, materialsRes, limitsRes, bomRes] = await Promise.all([
    api(`/records?module=${module}&size=2000`),
    api('/records?module=materials&size=2000'),
    api('/xrf-limits'),
    api('/records?module=bom&size=2000')
  ]);

  const items = dataRes.items || [];
  const allMaterials = materialsRes.items || [];
  const limits = limitsRes || [];
  const allBom = bomRes?.items || [];

  // Extract unique projects strictly from the "Project" column of BOM module (Quản lý & Cập nhật BOM)
  const bomProjects = [...new Set(allBom.map(b => (b.data?.project || '').trim()).filter(Boolean))].sort();
  const bomProjMats = {};
  allBom.forEach(b => {
    const p = (b.data?.project || '').trim();
    const mc = (b.data?.material_code || '').trim();
    if (p && mc) {
      if (!bomProjMats[p]) bomProjMats[p] = new Set();
      bomProjMats[p].add(mc);
    }
  });

  // Map limits
  const limitMap = {};
  limits.forEach(l => {
    const d = l.data || {};
    const mt = (d.material_type || 'Polymers').trim().toLowerCase();
    const el = (d.element || '').trim();
    if (!limitMap[mt]) limitMap[mt] = {};
    limitMap[mt][el] = {
      control: Number(d.control_limit) || null,
      spec: Number(d.spec_limit) || null,
      rule: d.rule || ''
    };
  });

  // Map materials by material_code and supplier for cross-reference
  const matMap = {};
  allMaterials.forEach(m => {
    const code = (m.data?.material_code || '').trim();
    const sup = (m.data?.supplier || '').trim();
    if (code) {
      if (!matMap[code]) matMap[code] = [];
      matMap[code].push(m);
    }
  });

  // Collect unique phases and categories
  const phases = [...new Set(items.map(r => r.data?.phase || r.data?.build).filter(Boolean))].sort();
  const matTypes = [...new Set(items.map(r => r.data?.material_type).filter(Boolean))].sort();

  // Evaluate compliance for each record
  items.forEach(r => {
    const d = r.data || {};
    const code = (d.material_code || '').trim();
    const sup = (d.supplier || '').trim();
    const mt = (d.material_type || 'Polymers').trim().toLowerCase();

    // Check material catalog match
    const matchingMats = matMap[code] || [];
    const matMatch = matchingMats.find(m => !sup || (m.data?.supplier || '').trim().toLowerCase() === sup.toLowerCase()) || matchingMats[0];
    r._matMatch = matMatch;
    r._hasXrfReq = matMatch ? String(matMatch.data?.required_tests || '').toLowerCase().includes('xrf') : false;

    // Concentrations
    const pb = Number(d.pb) || 0;
    const cd = Number(d.cd) || 0;
    const hg = Number(d.hg) || 0;
    const cr = Number(d.cr) || 0;
    const br = Number(d.br) || 0;
    const cl = Number(d.cl) || 0;

    const explicitRes = String(d.result || r.display_status || '').trim().toUpperCase();
    
    let isFail = false;
    let isWarn = false;
    const hasData = d.test_date || pb > 0 || cd > 0 || hg > 0 || cr > 0 || br > 0 || cl > 0 || explicitRes;

    if (explicitRes === 'FAIL' || explicitRes === 'NG') {
      isFail = true;
    }

    const pbSpec = 1000, pbCtrl = 700;
    const cdSpec = 100, cdCtrl = 50;
    const hgSpec = 1000, hgCtrl = 700;
    const crSpec = 1000, crCtrl = 700;
    const brSpec = 900, brCtrl = 630;
    const clSpec = 900, clCtrl = 630;

    if (pb > pbSpec || cd > cdSpec || hg > hgSpec || cr > crSpec || br > brSpec || cl > clSpec) isFail = true;
    else if (pb > pbCtrl || cd > cdCtrl || hg > hgCtrl || cr > crCtrl || br > brCtrl || cl > clCtrl) isWarn = true;

    if (isFail) {
      r._status = 'NG';
    } else if (isWarn) {
      r._status = 'Warning';
    } else if (hasData) {
      r._status = 'Pass';
    } else {
      r._status = 'Pending';
    }
  });

  const projFilter = listState.project || '';
  let projectScopedItems = items;
  if (projFilter) {
    projectScopedItems = items.filter(r => {
      const d = r.data || {};
      const code = (d.material_code || '').trim();
      const proj = (d.project || '').trim();
      if (bomProjMats[projFilter] && bomProjMats[projFilter].has(code)) return true;
      if (proj === projFilter || proj.includes(projFilter)) return true;
      return false;
    });
  }

  // Calculate KPI summary numbers
  const totalCount = projectScopedItems.length;
  let passCount = 0;
  let warningCount = 0;
  let ngCount = 0;
  let pendingCount = 0;

  projectScopedItems.forEach(r => {
    if (r._status === 'Pass') passCount++;
    else if (r._status === 'Warning') warningCount++;
    else if (r._status === 'NG') ngCount++;
    else pendingCount++;
  });

  // Filtering
  let filtered = projectScopedItems;
  const q = (listState.q || '').trim().toLowerCase();
  const stFilter = listState.status || '';
  const phaseFilter = listState.phase || '';
  const catFilter = listState.category || '';
  const startFilter = listState.start || '';
  const endFilter = listState.end || '';

  if (q) {
    filtered = filtered.filter(r => {
      const d = r.data || {};
      const code = (d.material_code || '').toLowerCase();
      const name = (d.material_name || '').toLowerCase();
      const sup = (d.supplier || '').toLowerCase();
      const lot = (d.lot || '').toLowerCase();
      const proj = (d.project || '').toLowerCase();
      const ph = (d.phase || d.build || '').toLowerCase();
      const cat = (d.category || d.material_type || '').toLowerCase();
      return code.includes(q) || name.includes(q) || sup.includes(q) || lot.includes(q) || proj.includes(q) || ph.includes(q) || cat.includes(q);
    });
  }

  if (stFilter) {
    filtered = filtered.filter(r => r._status === stFilter);
  }

  if (phaseFilter) {
    filtered = filtered.filter(r => (r.data?.phase === phaseFilter || r.data?.build === phaseFilter));
  }

  if (catFilter) {
    filtered = filtered.filter(r => (r.data?.material_type === catFilter || r.data?.category === catFilter));
  }

  if (startFilter) {
    filtered = filtered.filter(r => r.data?.test_date && r.data.test_date >= startFilter);
  }
  if (endFilter) {
    filtered = filtered.filter(r => r.data?.test_date && r.data.test_date <= endFilter);
  }

  // Sorting
  const sortKey = listState.sort || 'test_date';
  const sortDir = listState.direction || 'desc';
  filtered.sort((a, b) => {
    let valA = a.data?.[sortKey] ?? '';
    let valB = b.data?.[sortKey] ?? '';
    if (sortKey === 'status' || sortKey === 'result') {
      valA = a._status;
      valB = b._status;
    }
    return sortDir === 'asc' ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
  });

  // DYNAMIC VIEWPORT HEIGHT FIT - No vertical scroll, fits exactly 1 screen
  const optimalSize = (function() {
    const vh = window.innerHeight || 800;
    // Overhead: topbar(~48) + page padding(~20) + unified KPIs(~74) + margin(~12) + toolbar(~34) + th(~30) + pagination(~38) + buffer = ~315px
    const count = Math.floor((vh - 315) / 37);
    return Math.max(6, Math.min(25, count)) || 12;
  })();
  const pageSize = optimalSize;
  listState.xrfSize = pageSize;
  listState.size = pageSize;
  const page = listState.page || 1;
  const total = filtered.length;
  const pagedItems = filtered.slice((page - 1) * pageSize, page * pageSize);
  const pagination = paginationHtml(page, total, pageSize);

  // 2. Unified KPI cards - Synchronized 5-card layout with subtitles
  const kpiCardsHtml = `
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:12px;flex-shrink:0">
      <div style="background:#fff;border:${!stFilter?'2px solid #2563eb':'1px solid #e2e8f0'};border-radius:8px;padding:10px 14px;box-shadow:${!stFilter?'0 0 0 2px rgba(37,99,235,0.15), 0 2px 4px rgba(0,0,0,0.05)':'0 1px 2px rgba(0,0,0,0.02)'};cursor:pointer;transition:all .15s ease" data-status-filter="">
        <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase">Tổng số mẫu</div>
        <div style="font-size:22px;font-weight:700;color:#0f172a;margin-top:2px;line-height:1.1">${totalCount}</div>
        <small style="color:#64748b;font-size:10.5px">${projFilter ? `Dự án: <b>${esc(projFilter)}</b>` : 'Dữ liệu đo phổ quang học'}</small>
      </div>
      <div style="background:#f0fdf4;border:${stFilter==='Pass'?'2px solid #16a34a':'1px solid #bbf7d0'};border-radius:8px;padding:10px 14px;box-shadow:${stFilter==='Pass'?'0 0 0 2px rgba(22,163,74,0.15), 0 2px 4px rgba(0,0,0,0.05)':'0 1px 2px rgba(0,0,0,0.02)'};cursor:pointer;transition:all .15s ease" data-status-filter="Pass">
        <div style="font-size:11px;font-weight:600;color:#15803d;text-transform:uppercase">Đạt chuẩn (Pass)</div>
        <div style="font-size:22px;font-weight:700;color:#16a34a;margin-top:2px;line-height:1.1">${passCount}</div>
        <small style="color:#15803d;font-size:10.5px">100% nguyên tố dưới ngưỡng RoHS</small>
      </div>
      <div style="background:#fffbeb;border:${stFilter==='Pending'?'2px solid #d97706':'1px solid #fde68a'};border-radius:8px;padding:10px 14px;box-shadow:${stFilter==='Pending'?'0 0 0 2px rgba(217,119,6,0.15), 0 2px 4px rgba(0,0,0,0.05)':'0 1px 2px rgba(0,0,0,0.02)'};cursor:pointer;transition:all .15s ease" data-status-filter="Pending">
        <div style="font-size:11px;font-weight:600;color:#b45309;text-transform:uppercase">Chờ đo / Xử lý</div>
        <div style="font-size:22px;font-weight:700;color:#d97706;margin-top:2px;line-height:1.1">${pendingCount}</div>
        <small style="color:#b45309;font-size:10.5px">Mẫu mới chờ thực hiện XRF</small>
      </div>
      <div style="background:#eff6ff;border:${stFilter==='Warning'?'2px solid #2563eb':'1px solid #bfdbfe'};border-radius:8px;padding:10px 14px;box-shadow:${stFilter==='Warning'?'0 0 0 2px rgba(37,99,235,0.15), 0 2px 4px rgba(0,0,0,0.05)':'0 1px 2px rgba(0,0,0,0.02)'};cursor:pointer;transition:all .15s ease" data-status-filter="Warning">
        <div style="font-size:11px;font-weight:600;color:#1e40af;text-transform:uppercase">Cảnh báo ngưỡng</div>
        <div style="font-size:22px;font-weight:700;color:#2563eb;margin-top:2px;line-height:1.1">${warningCount}</div>
        <small style="color:#1e40af;font-size:10.5px">Nồng độ tiếp cận ngưỡng kiểm soát</small>
      </div>
      <div style="background:#fef2f2;border:${stFilter==='NG'?'2px solid #dc2626':'1px solid #fecaca'};border-radius:8px;padding:10px 14px;box-shadow:${stFilter==='NG'?'0 0 0 2px rgba(220,38,38,0.15), 0 2px 4px rgba(0,0,0,0.05)':'0 1px 2px rgba(0,0,0,0.02)'};cursor:pointer;transition:all .15s ease" data-status-filter="NG">
        <div style="font-size:11px;font-weight:600;color:#b91c1c;text-transform:uppercase">Vượt ngưỡng (NG)</div>
        <div style="font-size:22px;font-weight:700;color:#dc2626;margin-top:2px;line-height:1.1">${ngCount}</div>
        <small style="color:#b91c1c;font-size:10.5px">Hàm lượng vượt giới hạn cho phép</small>
      </div>
    </div>
  `;

  // Helper for concentration badge - compact, clean, no wrapping
  const renderElem = (el, val, ctrl, spec) => {
    const num = Number(val) || 0;
    let color = '#334155';
    let bg = '#f8fafc';
    let border = '#e2e8f0';
    let weight = '500';
    if (spec && num > spec) {
      color = '#dc2626'; bg = '#fef2f2'; border = '#fecaca'; weight = '700';
    } else if (ctrl && num > ctrl) {
      color = '#d97706'; bg = '#fffbeb'; border = '#fde68a'; weight = '600';
    }
    return `<span style="background:${bg};border:1px solid ${border};color:${color};font-weight:${weight};border-radius:2px;padding:0 1.5px;font-size:9px;line-height:1.15;white-space:nowrap">${el}:<b>${esc(val)}</b></span>`;
  };

  // 4. Build Compact Table Rows - perfectly proportional column widths, 0 scrollbars
  const rowsHtml = pagedItems.map(r => {
    const d = r.data || {};
    const code = d.material_code || '—';
    const name = d.material_name || '—';
    const phase = d.phase || d.build || '—';
    const sup = d.supplier || '—';
    const lot = d.lot || '—';
    const matType = d.material_type || 'Polymers';
    const testDate = d.test_date;

    const pb = d.pb !== undefined && d.pb !== null && d.pb !== '' ? d.pb : '0';
    const cd = d.cd !== undefined && d.cd !== null && d.cd !== '' ? d.cd : '0';
    const hg = d.hg !== undefined && d.hg !== null && d.hg !== '' ? d.hg : '0';
    const cr = d.cr !== undefined && d.cr !== null && d.cr !== '' ? d.cr : '0';
    const br = d.br !== undefined && d.br !== null && d.br !== '' ? d.br : '0';
    const cl = d.cl !== undefined && d.cl !== null && d.cl !== '' ? d.cl : '0';

    // Status pill without pseudo-element bullet
    let statusBadge = '';
    if (r._status === 'Pass') {
      statusBadge = `<span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:10.5px;font-weight:600;background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;white-space:nowrap">✓ Pass</span>`;
    } else if (r._status === 'Warning') {
      statusBadge = `<span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:10.5px;font-weight:600;background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;white-space:nowrap">⚠️ Cảnh báo</span>`;
    } else if (r._status === 'NG') {
      statusBadge = `<span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:10.5px;font-weight:600;background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;white-space:nowrap">✕ NG</span>`;
    } else {
      statusBadge = `<span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:10.5px;font-weight:600;background:#fffbeb;color:#b45309;border:1px solid #fde68a;white-space:nowrap">⏳ Chờ đo</span>`;
    }

    // Material catalog indicator: IQC ONLY, completely hidden for OQC
    let matLinkHtml = '';
    if (module === 'xrf-iqc') {
      if (r._matMatch) {
        if (r._hasXrfReq) {
          matLinkHtml = `<span style="color:#15803d;font-weight:600" title="Khớp Danh mục NVL & có y/c test XRF">✓ Khớp NVL</span>`;
        } else {
          matLinkHtml = `<span style="color:#b45309" title="Khớp mã trong Danh mục NVL nhưng không có y/c XRF">⚠️ Khớp NVL</span>`;
        }
      } else {
        matLinkHtml = `<span style="color:#94a3b8" title="Chưa tìm thấy trong Danh mục NVL">Chưa liên kết</span>`;
      }
    }

    return `
      <tr style="height:35px">
        <td style="padding:3px 6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(code)}">
          <div style="display:flex;flex-direction:column;justify-content:center;line-height:1.2;overflow:hidden">
            <button class="link-button" data-open="${r.id}" style="font-weight:700;font-size:12px;color:#0f172a;font-family:monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left">${esc(code)}</button>
            ${module==='xrf-iqc'&&matLinkHtml?`<div style="font-size:9.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px">${matLinkHtml}</div>`:''}
          </div>
        </td>
        <td style="padding:3px 6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(name)}">
          <span style="font-size:12px;font-weight:600;color:#0f172a">${esc(name)}</span>
        </td>
        <td style="padding:3px 4px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          <span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:10.5px;font-weight:700;background:#f1f5f9;color:#0f172a;border:1px solid #cbd5e1;white-space:nowrap">${esc(phase)}</span>
        </td>
        <td style="padding:3px 6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(module==='xrf-iqc'?sup:(d.category||'Finish Good'))}">
          <span style="font-size:11.5px;font-weight:600;color:#1e293b">${esc(module==='xrf-iqc'?sup:(d.category||'Finish Good'))}</span>
        </td>
        <td style="padding:3px 4px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(lot)}">
          <span style="font-family:monospace;font-size:11px;background:#f8fafc;padding:1px 4px;border-radius:3px;border:1px solid #e2e8f0;color:#334155;white-space:nowrap">${esc(lot)}</span>
        </td>
        <td style="padding:3px 2px;text-align:center;white-space:nowrap" title="${testDate?new Date(testDate).toLocaleDateString('vi-VN'):''}">
          <span style="font-size:11px;color:#0f172a">${testDate?new Date(testDate).toLocaleDateString('vi-VN'):'—'}</span>
        </td>
        <td style="padding:3px 2px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(matType)}">
          <span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;white-space:nowrap">${esc(matType)}</span>
        </td>
        <td style="padding:3px 4px;overflow:hidden;white-space:nowrap">
          <div style="display:flex;gap:2px;align-items:center;font-size:10px;line-height:1.15;overflow:hidden" title="Pb:${pb}, Cd:${cd}, Hg:${hg}, Cr:${cr}, Br:${br}, Cl:${cl} (ppm)">
            ${renderElem('Pb', pb, 700, 1000)}
            ${renderElem('Cd', cd, 50, 100)}
            ${renderElem('Hg', hg, 700, 1000)}
            ${renderElem('Cr', cr, 700, 1000)}
            ${renderElem('Br', br, 630, 900)}
            ${renderElem('Cl', cl, 630, 900)}
          </div>
        </td>
        <td style="padding:3px 2px;text-align:center;white-space:nowrap">
          ${statusBadge}
        </td>
        <td style="padding:3px 4px;text-align:center;white-space:nowrap">
          <div style="display:inline-flex;align-items:center;justify-content:center;gap:6px">
            <button class="link-button" data-open="${r.id}" style="font-size:13px;padding:2px 4px;line-height:1;cursor:pointer" title="Xem chi tiết">👁️</button>
            <button type="button" class="link-button edit-xrf-btn" data-record-id="${r.id}" data-record-module="${module}" style="font-size:13px;color:#2563eb;padding:2px 4px;line-height:1;cursor:pointer" title="Chỉnh sửa">✏️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div style="display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden">
      ${kpiCardsHtml}
      <section class="card fill-card" style="display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;margin-bottom:0">
        <form class="toolbar" id="filters" data-module="${module}" style="padding:4px 8px;gap:5px;flex-shrink:0;margin-bottom:0;flex-wrap:nowrap;overflow:hidden">
          <input type="search" name="q" placeholder="Tìm kiếm..." value="${esc(listState.q)}" aria-label="Tìm trong bảng" style="min-width:85px;max-width:125px;padding:3px 6px;font-size:11.5px">
          <select name="phase" id="phase-filter" title="Giai đoạn" aria-label="Giai đoạn" style="max-width:115px;padding:3px 5px;font-size:11.5px">
            <option value="">Tất cả giai đoạn (${phases.length})</option>
            ${phases.map(p => `<option value="${esc(p)}" ${phaseFilter===p?'selected':''}>${esc(p)}</option>`).join('')}
          </select>
          <select name="project" id="project-filter" title="Lọc theo Dự án" aria-label="Dự án" style="max-width:125px;padding:3px 5px;font-size:11.5px">
            <option value="">Tất cả dự án (${bomProjects.length})</option>
            ${bomProjects.map(p => `<option value="${esc(p)}" ${projFilter===p?'selected':''}>Dự án: ${esc(p)}</option>`).join('')}
          </select>
          <select name="category" id="category-filter" title="Nhóm vật liệu" aria-label="Nhóm vật liệu" style="max-width:105px;padding:3px 5px;font-size:11.5px">
            <option value="">Tất cả nhóm</option>
            <option value="Polymers" ${catFilter==='Polymers'?'selected':''}>Polymers</option>
            <option value="Metals/Ceramic/Glass" ${catFilter==='Metals/Ceramic/Glass'?'selected':''}>Metals/Ceramic</option>
            <option value="Composite" ${catFilter==='Composite'?'selected':''}>Composite</option>
            <option value="Packaging" ${catFilter==='Packaging'?'selected':''}>Packaging</option>
          </select>
          <select name="status" id="status-filter" title="Trạng thái" aria-label="Trạng thái" style="max-width:105px;padding:3px 5px;font-size:11.5px">
            <option value="">Tất cả trạng thái</option>
            <option value="Pass" ${stFilter==='Pass'?'selected':''}>✓ Pass</option>
            <option value="Warning" ${stFilter==='Warning'?'selected':''}>⚠️ Cảnh báo</option>
            <option value="NG" ${stFilter==='NG'?'selected':''}>✕ NG</option>
            <option value="Pending" ${stFilter==='Pending'?'selected':''}>⏳ Chờ đo</option>
          </select>
          <label style="margin:0;display:flex;align-items:center;gap:2px;font-size:10.5px;color:var(--muted)">Từ<input type="date" name="start" value="${esc(listState.start)}" style="width:96px;padding:2px 3px;font-size:10.5px"></label>
          <label style="margin:0;display:flex;align-items:center;gap:2px;font-size:10.5px;color:var(--muted)">Đến<input type="date" name="end" value="${esc(listState.end)}" style="width:96px;padding:2px 3px;font-size:10.5px"></label>
          <div class="toolbar-actions-group">
            <button type="submit" class="toolbar-btn" style="padding:2px 6px" title="Tìm"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg></button>
            <button type="button" id="reset-filter" class="toolbar-btn" style="padding:2px 6px" title="Làm mới"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg></button>
          </div>
          <div class="toolbar-actions-right">
            <button type="button" id="export" class="toolbar-btn" data-module="${module}" style="padding:2px 6px" title="Xuất Excel"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
            ${can(module,'Create')?`<button type="button" class="primary toolbar-btn" id="add-record" data-module="${module}" style="padding:2px 7px" title="Thêm mới"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>`:''}
          </div>
        </form>
        <div class="table-scroll" style="flex:1;min-height:0;overflow-y:hidden!important;overflow-x:hidden!important">
          <table style="width:100%;table-layout:fixed;border-collapse:collapse">
            <thead style="background:#f8fafc">
              <tr>
                <th style="padding:5px 6px;width:11.5%;text-align:left"><button class="link-button" data-sort="material_code">Part Code ${listState.sort==='material_code'?(listState.direction==='asc'?'↑':'↓'):'↕'}</button></th>
                <th style="padding:5px 6px;width:14.5%;text-align:left"><button class="link-button" data-sort="material_name">Part Name ${listState.sort==='material_name'?(listState.direction==='asc'?'↑':'↓'):'↕'}</button></th>
                <th style="padding:5px 4px;width:6%;text-align:center"><button class="link-button" data-sort="phase">Giai đoạn ${listState.sort==='phase'?(listState.direction==='asc'?'↑':'↓'):'↕'}</button></th>
                <th style="padding:5px 6px;width:9.5%;text-align:left"><button class="link-button" data-sort="supplier">${module==='xrf-iqc'?'Nhà cung cấp':'Phân loại'} ${listState.sort==='supplier'?(listState.direction==='asc'?'↑':'↓'):'↕'}</button></th>
                <th style="padding:5px 4px;width:8.5%;text-align:center"><button class="link-button" data-sort="lot">Lot No. ${listState.sort==='lot'?(listState.direction==='asc'?'↑':'↓'):'↕'}</button></th>
                <th style="padding:5px 2px;width:8.5%;text-align:center"><button class="link-button" data-sort="test_date">Ngày test ${listState.sort==='test_date'?(listState.direction==='asc'?'↑':'↓'):'↕'}</button></th>
                <th style="padding:5px 2px;width:8%;text-align:center"><button class="link-button" data-sort="material_type">Nhóm VL ${listState.sort==='material_type'?(listState.direction==='asc'?'↑':'↓'):'↕'}</button></th>
                <th style="padding:5px 4px;width:17.5%;text-align:left">Chỉ số XRF đo (ppm)</th>
                <th style="padding:5px 2px;width:7%;text-align:center"><button class="link-button" data-sort="result">Đánh giá ${listState.sort==='result'?(listState.direction==='asc'?'↑':'↓'):'↕'}</button></th>
                <th style="padding:5px 4px;width:9%;text-align:center" title="Thao tác / Chỉnh sửa">⚙️</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="10" class="muted" style="text-align:center;padding:20px">Không tìm thấy kết quả kiểm nghiệm nào phù hợp.</td></tr>'}
            </tbody>
          </table>
        </div>
        <div style="flex-shrink:0">
          ${pagination}
        </div>
      </section>
    </div>
  `;
}

// Organization presentation uses the existing record API and editing workflow.
let orgView='chart', orgRows=[], orgQuery='', orgStatus='';
const orgAssigned=value=>!!String(value??'').trim()&&!/^(?:-|—|n\/a|tbd|chưa phân công)$/i.test(String(value).trim());
const orgAssignment=d=>!orgAssigned(d.primary)?'Primary not assigned':!orgAssigned(d.backup)?'Backup not assigned':'Fully assigned';
const orgLeader=r=>!r.data.reports_to&&/leader|team lead|overall coordinator/i.test(`${r.data.role||''} ${r.data.org_unit||''}`);
const orgTone=r=>{const name=r.data.department_name||'';return /system|^qa$/i.test(name)?0:/iqc|oqc/i.test(name)?1:/production|ops/i.test(name)?2:/supply|purchase|pmc/i.test(name)?3:/red|npi/i.test(name)?4:[...name].reduce((a,c)=>a+c.charCodeAt(0),0)%6;};
const orgPill=d=>`<span class="org-pill ${orgAssignment(d)==='Fully assigned'?'complete':'pending'}">${esc(orgAssignment(d))}</span>`;
function orgMetrics(rows){
  const members=new Set(rows.flatMap(r=>[r.data.primary,r.data.backup].filter(orgAssigned).flatMap(v=>String(v).split(/[/;,\n]+/)).map(v=>v.trim().toLocaleLowerCase()).filter(Boolean)));
  return [new Set(rows.map(r=>String(r.data.department_name||'').trim().toLocaleLowerCase()).filter(Boolean)).size,members.size,rows.filter(r=>orgAssigned(r.data.primary)).length,rows.filter(r=>orgAssigned(r.data.backup)).length,rows.filter(r=>orgAssignment(r.data)!=='Fully assigned').length];
}
async function organizationPage(){
  const rows=[];
  for(let page=1;;page++){
    const result=await api(`/records?module=organization&size=2000&page=${page}&sort=department_name&direction=asc`);
    rows.push(...result.items);
    if(rows.length>=result.total||!result.items.length)break;
  }
  orgRows=rows;
  return organizationHTML();
}
function orgCard(r,leader=false){const d=r.data;return `<button type="button" class="org-node org-tone-${orgTone(r)} ${leader?'org-leader':''}" data-org-open="${r.id}" aria-label="Xem chi tiết ${esc(d.department_name)}">
  <div class="org-node-head"><h3>${esc(leader?'QA / HSF Leader':d.department_name||'Chưa đặt tên')}</h3><span class="org-arrow" aria-hidden="true">↗</span></div>
  <div class="org-node-body"><strong class="org-primary">${esc(orgAssigned(d.primary)?d.primary:'Chưa có Primary DRI')}</strong>${leader?`<small class="org-coordinator">${esc(d.role||'Leader')} · Overall Coordinator</small>`:''}<div class="org-backup ${orgAssigned(d.backup)?'assigned':'missing'}"><span>Backup</span><span>${esc(orgAssigned(d.backup)?d.backup:'Chưa phân công')}</span></div></div></button>`;}
function orgFiltered(){return orgRows.filter(r=>(!orgQuery||Object.values(r.data).some(v=>String(v??'').toLocaleLowerCase().includes(orgQuery.toLocaleLowerCase())))&&(!orgStatus||orgAssignment(r.data)===orgStatus));}
function organizationHTML(){
  const metrics=orgMetrics(orgRows), rows=orgFiltered(), leaders=orgRows.filter(orgLeader), departments=rows.filter(r=>!orgLeader(r));
  return `<div class="org-dashboard"><div class="org-summary" aria-label="Tổng quan phân công">${['Departments','Members','Primary DRI','Backup','Pending'].map((title,i)=>`<div class="org-stat org-tone-${i}" title="${['Số đơn vị, gồm Leader','Số người phụ trách và backup','Hồ sơ có Primary DRI','Hồ sơ có backup','Hồ sơ thiếu Primary hoặc Backup'][i]}"><strong>${metrics[i]}</strong><span>${title}</span></div>`).join('')}</div>
  <section class="org-surface"><div class="org-controls"><div class="org-tabs" role="group" aria-label="Chế độ xem"><button data-org-view="chart" aria-pressed="${orgView==='chart'}">Organization Chart</button><button data-org-view="matrix" aria-pressed="${orgView==='matrix'}">Responsibility Matrix</button></div><div class="org-actions">${orgView==='matrix'?'<button id="org-export">Export CSV (filtered)</button><button id="org-excel">Excel · all records</button>':''}${can('organization','Create')?'<button class="primary" id="org-add">+ Add new</button>':''}</div></div>
  ${orgView==='matrix'?`<form class="org-search" id="org-search"><input name="q" type="search" aria-label="Tìm bộ phận hoặc người phụ trách" placeholder="Tìm bộ phận, người phụ trách, trách nhiệm…" value="${esc(orgQuery)}">${orgView==='matrix'?`<select name="status" aria-label="Trạng thái phân công"><option value="">Tất cả trạng thái phân công</option>${['Fully assigned','Primary not assigned','Backup not assigned'].map(s=>`<option ${s===orgStatus?'selected':''}>${s}</option>`).join('')}</select>`:''}<button>Tìm kiếm</button>${orgQuery||orgStatus?'<button type="button" id="org-reset">Xóa lọc</button>':''}<span>${rows.length} / ${orgRows.length} hồ sơ</span></form>`:''}
  ${!orgRows.length?empty('Chưa có cơ cấu trách nhiệm','Thêm hồ sơ để phân công Primary DRI và Backup cho từng bộ phận.'):orgView==='chart'?`<div class="org-chart"><div class="org-leaders">${leaders.length?leaders.map(r=>orgCard(r,true)).join(''):'<div class="org-no-leader">QA / HSF Leader<br><small>Chưa có hồ sơ điều phối tổng thể</small></div>'}</div><div class="org-chart-label" aria-hidden="true"></div><div class="org-branches">${departments.map(r=>`<div class="org-branch">${orgCard(r)}</div>`).join('')}</div>${!departments.length?empty('Không có bộ phận phù hợp','Thay đổi tìm kiếm hoặc thêm bộ phận mới.'):''}</div>`:`<div class="table-scroll org-matrix"><table><thead><tr>${['Department','Scope / Responsibility','Primary DRI','Backup DRI','Status','Action'].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr><td><button class="link-button" data-org-open="${r.id}">${esc(r.data.department_name)}</button><small>${esc(r.data.role||'—')}</small></td><td><div class="org-matrix-scope">${esc(r.data.responsibility||'Chưa cập nhật')}</div></td><td><b>${esc(r.data.primary||'Chưa phân công')}</b><small>${esc(r.data.email||'')}</small></td><td>${esc(r.data.backup||'Chưa phân công')}</td><td>${orgPill(r.data)}<small>Hồ sơ: ${esc(r.display_status||r.data.status||'—')}</small></td><td><button class="link-button" data-org-open="${r.id}">Chi tiết →</button></td></tr>`).join('')}</tbody></table>${!rows.length?empty('Không có kết quả','Thử thay đổi bộ lọc.'):''}</div>`}</section></div>`;
}
function bindOrganization(){
  const repaint=()=>{content.innerHTML=organizationHTML();bindOrganization();};
  content.querySelectorAll('[data-org-view]').forEach(b=>b.onclick=()=>{orgView=b.dataset.orgView;orgStatus='';if(orgView==='chart')orgQuery='';repaint();});
  content.querySelectorAll('[data-org-open]').forEach(b=>b.onclick=()=>openOrganizationDetail(b.dataset.orgOpen));
  if($('#org-search')) $('#org-search').onsubmit=e=>{e.preventDefault();const form=new FormData(e.target);orgQuery=String(form.get('q')||'').trim();orgStatus=String(form.get('status')||'');repaint();};
  $('#org-reset')?.addEventListener('click',()=>{orgQuery='';orgStatus='';repaint();});
  $('#org-add')?.addEventListener('click',()=>recordForm('organization'));
  $('#org-excel')?.addEventListener('click',()=>{location.href='/api/export/organization';});
  $('#org-export')?.addEventListener('click',()=>{
    const cell=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
    const rows=[['Department','Scope / Responsibility','Primary DRI','Backup DRI','Email','Role','Assignment Status','Record Status'],...orgFiltered().map(r=>[r.data.department_name,r.data.responsibility,r.data.primary,r.data.backup,r.data.email,r.data.role,orgAssignment(r.data),r.display_status])];
    const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='responsibility-matrix.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
}
async function openOrganizationDetail(id){
  const trigger=document.activeElement;
  const drawer=document.createElement('dialog');drawer.className='org-drawer';drawer.setAttribute('aria-label','Responsibility details');
  drawer.innerHTML='<button class="org-close" aria-label="Đóng chi tiết">×</button><p role="status">Đang tải trách nhiệm…</p>';document.body.append(drawer);
  drawer.querySelector('.org-close').onclick=()=>drawer.close();
  drawer.addEventListener('close',()=>{drawer.remove();if(trigger?.isConnected)trigger.focus();});
  drawer.addEventListener('click',e=>{if(e.target===drawer){const r=drawer.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right)drawer.close();}});
  drawer.showModal();
  try{
    const row=await api('/records/'+encodeURIComponent(id));if(!drawer.open)return;const d=row.data;
    const fields=[['Primary DRI',d.primary],['Backup DRI',d.backup],['Role',d.role],['Email / Contact',d.email||d.contact],['Responsibility scope',d.responsibility],['Related compliance responsibilities',d.related_responsibilities||d.compliance_responsibilities||d.authority],['Reports to',d.reports_to],['Nguồn trách nhiệm',d.source_reference],['Trạng thái hồ sơ',row.display_status]];
    drawer.innerHTML=`<header><span class="org-eyebrow">RESPONSIBILITY DETAILS</span><button class="org-close" aria-label="Đóng chi tiết">×</button><h2>${esc(d.department_name||'Department')}</h2>${orgPill(d)}</header><dl>${fields.map(([k,v])=>`<div><dt>${k}</dt><dd>${esc(v||'Chưa cập nhật')}</dd></div>`).join('')}</dl><footer>${can('organization','Edit')?'<button class="primary" id="org-edit">Edit responsibility</button>':''}<button id="org-full-detail">Hồ sơ & audit history →</button></footer>`;
    drawer.querySelector('.org-close').onclick=()=>drawer.close();
    drawer.querySelector('#org-edit')?.addEventListener('click',()=>{drawer.close();recordForm('organization',row);});
    drawer.querySelector('#org-full-detail').onclick=()=>{drawer.close();goto('record/'+row.id);};
    drawer.querySelector('.org-close').focus();
  }catch(error){drawer.querySelector('[role="status"]').textContent=error.message;}
}

async function listPage(module){
  if(module==='organization') return organizationPage();
  if(module==='materials') {
    return await materialsListPage();
  }
  if(module==='suppliers') {
    return await suppliersListPage();
  }
  if(module==='xrf-iqc' || module==='xrf-oqc') {
    return await xrfDataListPage(module);
  }
  if(module==='test-plan') {
    return await finishedGoodsTestPlanPage();
  }
  if(module==='bom') {
    const params = {module: 'bom', size: 1000};
    if(listState.q) params.q = listState.q;
    const query = new URLSearchParams(params);
    const result=await api('/records?'+query);
    const materials=await api('/records?module=materials&size=1000');
    const matMap = {};
    materials.items.forEach(m => matMap[m.data.material_code] = m);
    
    const projects = {};
    result.items.forEach(r => {
      const p = r.data.project || 'No Project';
      const prod = r.data.parent_code || 'Unknown Product';
      const key = p + '::' + prod;
      if(!projects[key]) projects[key] = {project: p, product: prod, items: []};
      
      const mat = matMap[r.data.material_code];
      projects[key].items.push({bom: r, mat: mat});
    });
    
    window.psBomProjects = projects;
    const projectKeys = Object.keys(projects);
    const bomPage = listState.page || 1;
    const bomPageSize = Number(listState.size) || getOptimalPageSize();
    const pageKeys = projectKeys.slice((bomPage - 1) * bomPageSize, bomPage * bomPageSize);
    const pagination = paginationHtml(bomPage, projectKeys.length, bomPageSize);
    const bomOptHtml = [15,20,25,50,2000].map(v=>`<option value="${v}" ${bomPageSize===v?'selected':''}>${v===2000?`Tất cả (${projectKeys.length} dự án)`:`${v} / trang`}</option>`).join('');
    
    return head('Quản lý & Cập nhật BOM','')+`<section class="card fill-card"><div class="toolbar"><select id="page-size-select" title="Số lượng dòng mỗi trang" aria-label="Số dòng mỗi trang">${bomOptHtml}</select><div class="toolbar-actions-right"><button type="button" class="toolbar-btn primary" id="import-bom-btn" title="Cập nhật BOM từ Excel" aria-label="Cập nhật BOM từ Excel"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></button><button type="button" class="toolbar-btn" id="save-bom-btn" title="Lưu dữ liệu / Xuất file BOM ra Excel" aria-label="Lưu dữ liệu BOM"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></button><button type="button" class="toolbar-btn danger" id="delete-bom-btn" title="Xóa toàn bộ dữ liệu BOM" aria-label="Xóa toàn bộ dữ liệu BOM"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button></div></div><div class="table-scroll"><table><thead><tr><th>Project</th><th>Product (Mã thành phẩm)</th><th>Số NVL</th><th>Hành động</th></tr></thead><tbody>${pageKeys.map(k=>{
      const p = projects[k];
      return `<tr><td>${esc(p.project)}</td><td>${esc(p.product)}</td><td>${p.items.length}</td><td><div style="display:flex;align-items:center;gap:12px"><button class="link-button" data-route="product-bom/${encodeURIComponent(k)}">Xem danh sách NVL</button><button type="button" class="link-button delete-project-btn" data-project="${esc(p.project)}" title="Xóa BOM dự án ${esc(p.project)}" style="color:#ef4444;font-size:12px;background:none;border:none;cursor:pointer;padding:0">🗑️ Xóa</button></div></td></tr>`;
    }).join('')}</tbody></table></div>${pagination}</section>`;
  }
  const config=catalog.modules[module];
  const pageSize=Number(listState.size)||getOptimalPageSize();
  const query=new URLSearchParams({module,...listState,size:pageSize});
  const result=await api('/records?'+query);
  const keys=columnPreferences[module]||config.fields.slice(0,5).map(f=>f.key);
  const columns=keys.map(key=>config.fields.find(f=>f.key===key)).filter(Boolean);
  const pagination=paginationHtml(result.page,result.total,pageSize);
  const hasDri = config.fields.some(f=>f.key==='dri');
  const hasStatus = config.fields.some(f=>f.key==='status') || result.items.some(r=>r.display_status);
  const hasProject = module === 'materials';
  const hasDate = module !== 'materials' && config.fields.some(f=>f.type==='date');
  const sizeOptHtml = [15,20,25,50,2000].map(v=>`<option value="${v}" ${pageSize===v?'selected':''}>${v===2000?`Tất cả (${result.total} mục)`:`${v} / trang`}</option>`).join('');
  const reportsQuickFilter = module === 'reports' ? `
    <div style="display:flex;gap:6px;margin-bottom:8px;padding:0 2px">
      <button type="button" class="tab-pill ${!listState.status?'active':''}" data-status-filter="" style="border:none;background:${!listState.status?'#2563eb':'#e2e8f0'};color:${!listState.status?'#fff':'#475569'};padding:4px 12px;border-radius:6px;font-size:11.5px;font-weight:${!listState.status?'600':'500'};cursor:pointer">Tất cả báo cáo</button>
      <button type="button" class="tab-pill ${listState.status==='Valid'?'active':''}" data-status-filter="Valid" style="border:none;background:${listState.status==='Valid'?'#16a34a':'#e2e8f0'};color:${listState.status==='Valid'?'#fff':'#475569'};padding:4px 12px;border-radius:6px;font-size:11.5px;font-weight:${listState.status==='Valid'?'600':'500'};cursor:pointer">✓ Đang còn hạn (Valid)</button>
      <button type="button" class="tab-pill ${listState.status==='Expiring Soon'?'active':''}" data-status-filter="Expiring Soon" style="border:none;background:${listState.status==='Expiring Soon'?'#d97706':'#e2e8f0'};color:${listState.status==='Expiring Soon'?'#fff':'#475569'};padding:4px 12px;border-radius:6px;font-size:11.5px;font-weight:${listState.status==='Expiring Soon'?'600':'500'};cursor:pointer">⚠️ Sắp hết hạn (≤ 90 ngày)</button>
      <button type="button" class="tab-pill ${listState.status==='Expired'?'active':''}" data-status-filter="Expired" style="border:none;background:${listState.status==='Expired'?'#dc2626':'#e2e8f0'};color:${listState.status==='Expired'?'#fff':'#475569'};padding:4px 12px;border-radius:6px;font-size:11.5px;font-weight:${listState.status==='Expired'?'600':'500'};cursor:pointer">🗄️ Kho lưu trữ hết hạn (Expired)</button>
    </div>
  ` : '';
  return head(config.title,'')+reportsQuickFilter+`<section class="card fill-card"><form class="toolbar" id="filters"><input type="search" name="q" placeholder="Tìm mã, tên, NCC, CAS…" value="${esc(listState.q)}" aria-label="Tìm trong bảng">${hasProject ? `<select name="project" id="project-filter" title="Lọc theo Dự án" aria-label="Dự án"><option value="">Tất cả dự án</option><option value="Co-mold" ${listState.project==='Co-mold'?'selected':''}>Co-molded / Co-mold</option><option value="SE Jump" ${listState.project==='SE Jump'?'selected':''}>SE Jump</option><option value="CALDERA" ${listState.project==='CALDERA'?'selected':''}>CALDERA, SIERRA 8</option></select><select name="category" id="category-filter" title="Lọc theo Category" aria-label="Category"><option value="">Tất cả Category</option><option value="Raw material" ${listState.category==='Raw material'?'selected':''}>Raw material</option><option value="Packing material" ${listState.category==='Packing material'?'selected':''}>Packing material</option></select>` : ''}${hasStatus ? `<select name="status" title="Lọc theo Trạng thái" aria-label="Trạng thái"><option value="">Tất cả trạng thái</option>${['Pending','Compliant','NG','Pass','Valid','Expiring Soon','Expired','Overdue','Open','Closed','Completed','Due Soon','Not Applicable'].map(s=>`<option ${listState.status===s?'selected':''}>${s}</option>`).join('')}</select>` : ''}${hasDate ? `<label style="margin:0;display:flex;align-items:center;gap:3px;font-size:11px;color:var(--muted)">Từ<input type="date" name="start" value="${esc(listState.start)}" style="width:120px"></label><label style="margin:0;display:flex;align-items:center;gap:3px;font-size:11px;color:var(--muted)">Đến<input type="date" name="end" value="${esc(listState.end)}" style="width:120px"></label>` : ''}<select name="size" id="page-size-select" title="Số lượng dòng mỗi trang" aria-label="Số dòng mỗi trang">${sizeOptHtml}</select><div class="toolbar-actions-group"><button type="submit" class="toolbar-btn" title="Áp dụng tìm kiếm & bộ lọc" aria-label="Áp dụng bộ lọc"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg></button><button type="button" id="reset-filter" class="toolbar-btn" title="Xóa toàn bộ bộ lọc & làm mới" aria-label="Xóa bộ lọc"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg></button></div><div class="toolbar-actions-right"><button type="button" id="export" class="toolbar-btn" title="Xuất danh sách ra file Excel" aria-label="Xuất file Excel"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>${can(module,'Create')?`<button type="button" class="primary toolbar-btn" id="add-record" title="Thêm hồ sơ mới" aria-label="Thêm hồ sơ mới"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>`:''}</div></form><div class="table-scroll"><table><thead><tr>${columns.map(f=>`<th><button class="link-button" data-sort="${f.key}">${esc(f.label)} ${listState.sort===f.key?(listState.direction==='asc'?'↑':'↓'):'↕'}</button></th>`).join('')}${hasDri ? '<th>DRI</th>' : ''}${hasStatus ? '<th>Trạng thái</th>' : ''}<th></th></tr></thead><tbody>${result.items.map(r=>`<tr>${columns.map((f,i)=>`<td title="${esc(r.data[f.key])}">${i===0?`<button class="link-button" data-open="${r.id}">${esc(r.data[f.key]||label(r))}</button>`:esc(r.data[f.key]??'—')}</td>`).join('')}${hasDri ? `<td>${esc(r.data.dri||'Chưa phân công')}</td>` : ''}${hasStatus ? `<td>${badge(r.display_status)}</td>` : ''}<td><button class="link-button" data-open="${r.id}">👁️ Xem chi tiết</button></td></tr>`).join('')}</tbody></table></div>${result.items.length?'':empty(result.total?'Không có kết quả trên trang này':'Chưa có hồ sơ phù hợp','Thêm hồ sơ hoặc thay đổi bộ lọc để tiếp tục.')}${pagination}</section>`;
}

async function finishedGoodsTestPlanPage() {
  const result = await api('/records?module=test-plan&size=2000');
  const items = result.items || [];
  
  const now = new Date();
  
  let passCount = 0;
  let pendingCount = 0;
  let dueSoonCount = 0;
  let ngCount = 0;
  
  items.forEach(m => {
    const d = m.data || {};
    const res = (d.report_result || 'Pending').toLowerCase();
    
    if (res === 'pass') passCount++;
    else if (res === 'fail' || res === 'ng') ngCount++;
    else {
      pendingCount++;
      if (d.report_deadline) {
        const exp = new Date(d.report_deadline);
        const remainingDays = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
        if (remainingDays >= 0 && remainingDays <= 14) dueSoonCount++;
        if (remainingDays < 0) {
            ngCount++;
            pendingCount--;
        }
      }
    }
  });

  let filtered = items;
  const q = (listState.q || '').trim().toLowerCase();
  const stFilter = listState.status || '';

  if (q) {
    filtered = filtered.filter(m => {
      const d = m.data || {};
      const name = (d.material_name || '').toLowerCase();
      const code = (d.material_code || '').toLowerCase();
      const type = (d.test_type || '').toLowerCase();
      return name.includes(q) || code.includes(q) || type.includes(q);
    });
  }

  if (stFilter) {
    if (stFilter === 'Pass') {
      filtered = filtered.filter(m => (m.data?.report_result || '').toLowerCase() === 'pass');
    } else if (stFilter === 'Pending') {
      filtered = filtered.filter(m => {
          const res = (m.data?.report_result || 'Pending').toLowerCase();
          if(res !== 'pass' && res !== 'fail' && res !== 'ng') {
              if (m.data?.report_deadline) {
                  const exp = new Date(m.data.report_deadline);
                  const rem = Math.ceil((exp - now) / 86400000);
                  if (rem < 0) return false;
              }
              return true;
          }
          return false;
      });
    } else if (stFilter === 'DueSoon') {
      filtered = filtered.filter(m => {
          const res = (m.data?.report_result || 'Pending').toLowerCase();
          if(res !== 'pass' && res !== 'fail' && res !== 'ng' && m.data?.report_deadline) {
              const exp = new Date(m.data.report_deadline);
              const rem = Math.ceil((exp - now) / 86400000);
              return rem >= 0 && rem <= 14;
          }
          return false;
      });
    } else if (stFilter === 'NG') {
      filtered = filtered.filter(m => {
          const res = (m.data?.report_result || '').toLowerCase();
          if(res === 'fail' || res === 'ng') return true;
          if(res !== 'pass' && m.data?.report_deadline) {
              const exp = new Date(m.data.report_deadline);
              const rem = Math.ceil((exp - now) / 86400000);
              return rem < 0;
          }
          return false;
      });
    }
  }

  const matOptimal = (function() {
    const vh = window.innerHeight || 900;
    const count = Math.floor((vh - 250) / 42.5);
    return Math.max(8, Math.min(30, count)) || 13;
  })();
  const pageSize = Number(listState.size) || matOptimal;
  
  listState.size = pageSize;
  const page = listState.page || 1;
  const total = filtered.length;
  const pagedItems = filtered.slice((page - 1) * pageSize, page * pageSize);
  const pagination = paginationHtml(page, total, pageSize);

  const kpiCardsHtml = `
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:12px;flex-shrink:0">
      <div style="background:#fff;border:${!stFilter?'2px solid #2563eb':'1px solid #e2e8f0'};border-radius:8px;padding:10px 14px;box-shadow:${!stFilter?'0 0 0 2px rgba(37,99,235,0.15), 0 2px 4px rgba(0,0,0,0.05)':'0 1px 2px rgba(0,0,0,0.02)'};cursor:pointer;transition:all .15s ease" data-status-filter="">
        <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase">Tổng số báo cáo</div>
        <div style="font-size:22px;font-weight:700;color:#0f172a;margin-top:2px;line-height:1.1">${items.length}</div>
        <small style="color:#64748b;font-size:10.5px">Kế hoạch test thành phẩm</small>
      </div>
      <div style="background:#f0fdf4;border:${stFilter==='Pass'?'2px solid #16a34a':'1px solid #bbf7d0'};border-radius:8px;padding:10px 14px;box-shadow:${stFilter==='Pass'?'0 0 0 2px rgba(22,163,74,0.15), 0 2px 4px rgba(0,0,0,0.05)':'0 1px 2px rgba(0,0,0,0.02)'};cursor:pointer;transition:all .15s ease" data-status-filter="Pass">
        <div style="font-size:11px;font-weight:600;color:#15803d;text-transform:uppercase">Đạt / Pass</div>
        <div style="font-size:22px;font-weight:700;color:#16a34a;margin-top:2px;line-height:1.1">${passCount}</div>
        <small style="color:#15803d;font-size:10.5px">Hoàn thành & kết quả Pass</small>
      </div>
      <div style="background:#fffbeb;border:${stFilter==='Pending'?'2px solid #d97706':'1px solid #fde68a'};border-radius:8px;padding:10px 14px;box-shadow:${stFilter==='Pending'?'0 0 0 2px rgba(217,119,6,0.15), 0 2px 4px rgba(0,0,0,0.05)':'0 1px 2px rgba(0,0,0,0.02)'};cursor:pointer;transition:all .15s ease" data-status-filter="Pending">
        <div style="font-size:11px;font-weight:600;color:#b45309;text-transform:uppercase">Đang xử lý / Pending</div>
        <div style="font-size:22px;font-weight:700;color:#d97706;margin-top:2px;line-height:1.1">${pendingCount}</div>
        <small style="color:#b45309;font-size:10.5px">Chưa có kết quả báo cáo</small>
      </div>
      <div style="background:#eff6ff;border:${stFilter==='DueSoon'?'2px solid #2563eb':'1px solid #bfdbfe'};border-radius:8px;padding:10px 14px;box-shadow:${stFilter==='DueSoon'?'0 0 0 2px rgba(37,99,235,0.15), 0 2px 4px rgba(0,0,0,0.05)':'0 1px 2px rgba(0,0,0,0.02)'};cursor:pointer;transition:all .15s ease" data-status-filter="DueSoon">
        <div style="font-size:11px;font-weight:600;color:#1e40af;text-transform:uppercase">Gần đến hạn (≤ 14 ngày)</div>
        <div style="font-size:22px;font-weight:700;color:#2563eb;margin-top:2px;line-height:1.1">${dueSoonCount}</div>
        <small style="color:#1e40af;font-size:10.5px">Cần đôn đốc kết quả</small>
      </div>
      <div style="background:#fef2f2;border:${stFilter==='NG'?'2px solid #dc2626':'1px solid #fecaca'};border-radius:8px;padding:10px 14px;box-shadow:${stFilter==='NG'?'0 0 0 2px rgba(220,38,38,0.15), 0 2px 4px rgba(0,0,0,0.05)':'0 1px 2px rgba(0,0,0,0.02)'};cursor:pointer;transition:all .15s ease" data-status-filter="NG">
        <div style="font-size:11px;font-weight:600;color:#b91c1c;text-transform:uppercase">Quá hạn / NG / Fail</div>
        <div style="font-size:22px;font-weight:700;color:#dc2626;margin-top:2px;line-height:1.1">${ngCount}</div>
        <small style="color:#b91c1c;font-size:10.5px">Không đạt hoặc trễ hạn</small>
      </div>
    </div>
  `;

  const rowsHtml = pagedItems.map(m => {
    const d = m.data || {};
    const name = d.material_name || '—';
    const code = d.material_code || '—';
    const type = d.test_type || '—';
    const test = d.test || '—';
    const cat = d.category || '—';
    const deadline = d.report_deadline ? new Date(d.report_deadline).toLocaleDateString('vi-VN') : '—';
    const res = d.report_result || 'Pending';
    
    let resBadge = '';
    if (res.toLowerCase() === 'pass') resBadge = '<span style="color:#15803d;background:#dcfce7;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600">PASS</span>';
    else if (res.toLowerCase() === 'fail' || res.toLowerCase() === 'ng') resBadge = '<span style="color:#b91c1c;background:#fee2e2;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600">' + esc(res) + '</span>';
    else resBadge = '<span style="color:#b45309;background:#fef3c7;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600">' + esc(res) + '</span>';

    return `<tr>
      <td><button class="link-button" data-open="${m.id}" style="font-weight:700;color:#0f172a">${esc(code)}</button></td><td>${esc(name)}</td>
      <td>
        <div style="font-size:12px;color:#1e293b">${esc(type)}</div>
        <div style="font-size:10px;color:#64748b;margin-top:2px">${esc(test)}</div>
      </td>
      <td>${esc(cat)}</td>
      <td><span style="color:#475569;font-size:12px">${deadline}</span></td>
      <td>${resBadge}</td>
      <td>
        <button type="button" class="link-button edit-material-btn" data-open="${m.id}" style="font-size:11.5px;color:#2563eb;font-weight:600" title="Chỉnh sửa chi tiết báo cáo">👁️ Chi tiết</button>
      </td>
    </tr>`;
  }).join('');

  return `<section class="card fill-card">
    ${kpiCardsHtml}
    <form class="toolbar" id="filters" data-module="test-plan" style="margin-bottom:0">
      <input type="search" name="q" placeholder="Tìm tên thành phẩm, mã, loại test..." value="${esc(listState.q)}" aria-label="Tìm trong bảng" style="width:250px">
      <select name="size" id="page-size-select" title="Số lượng dòng mỗi trang" aria-label="Số dòng mỗi trang">
        ${[...new Set([matOptimal, 10, 15, 20, 25, 50, 2000])].sort((a,b)=>a-b).map(v => `<option value="${v}" ${pageSize===v?'selected':''}>${v===2000? `Tất cả (${total})` : `${v} / trang`}</option>`).join('')}
      </select>
      <div class="toolbar-actions-group">
        <button type="submit" class="toolbar-btn" title="Áp dụng tìm kiếm"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg></button>
        <button type="button" id="reset-filter" class="toolbar-btn" title="Xóa bộ lọc"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg></button>
      </div>
      <div class="toolbar-actions-right">
        ${can('test-plan','Create')? `<button type="button" class="primary toolbar-btn" id="add-record" data-module="test-plan" title="Thêm kế hoạch mới"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>` : ''}
      </div>
    </form>
    <div class="table-scroll" style="margin-top:-1px">
      <table>
        <thead>
          <tr>
            <th>Tên Thành phẩm / Mã TP</th>
            <th>Loại test</th>
            <th>Category</th>
            <th>Thời hạn báo cáo</th>
            <th>Kết quả</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="6" class="empty-state">${empty('Chưa có kế hoạch nào','').replace('<div class="empty-state">','').replace('</div>','')}</td></tr>`}
        </tbody>
      </table>
    </div>
    ${pagination}
  </section>`;
}



window.xrfPlanState = window.xrfPlanState || {
  year: 2026,
  tab: 'matrix',
  project: '',
  category: '',
  status: '',
  q: '',
  page: 1,
  size: 15
};
window.xrfCellDetailStore = {};
window.xrfPlanCurrentItems = [];
window.xrfPlanCache = null;

function renderXrfFrequencyRulesTable() {
  return `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:12px 0">
      <div style="margin-bottom:14px">
        <h3 style="margin:0 0 4px 0;color:#0f172a;font-size:15px;display:flex;align-items:center;gap:8px">
          <span>⚙️ Quy chuẩn Tần suất Kiểm tra XRF (Test Frequency Standards)</span>
        </h3>
        <p style="margin:0;color:#64748b;font-size:12px">Bảng quy định tần suất kiểm tra áp dụng cho toàn bộ chu trình NPI và Sản xuất hàng loạt (MP) theo tiêu chuẩn Product Safety.</p>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="background:#f8fafc;border-bottom:2px solid #cbd5e1">
            <th style="padding:10px;text-align:center;width:45px">No</th>
            <th style="padding:10px;text-align:left;width:130px">Test</th>
            <th style="padding:10px;text-align:left;width:180px">Category</th>
            <th style="padding:10px;text-align:left;width:160px">NPI Phase</th>
            <th style="padding:10px;text-align:left;width:150px">MP phase</th>
            <th style="padding:10px;text-align:left">Hướng dẫn & Tiêu chí kiểm soát</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom:1px solid #e2e8f0">
            <td style="padding:12px 10px;text-align:center;font-weight:700">1</td>
            <td style="padding:12px 10px;font-weight:600;color:#1e40af">XRF Test-IQC</td>
            <td style="padding:12px 10px">
              <span class="badge info" style="background:#eff6ff;color:#1d4ed8;font-size:11px;font-weight:650">Direct Material</span>
              <div style="color:#64748b;font-size:11px;margin-top:2px">(Raw material)</div>
            </td>
            <td style="padding:12px 10px;font-weight:600;color:#334155">Once per NPI stage</td>
            <td style="padding:12px 10px;font-weight:700;color:#15803d">Monthly (Hàng tháng)</td>
            <td style="padding:12px 10px;color:#475569;font-size:12px;line-height:1.5">
              Kiểm soát toàn bộ vật liệu trực tiếp cấu thành linh kiện/sản phẩm (kim loại, nhựa, bo mạch, ốc vít...). Hàng tháng IQC bắt buộc lấy mẫu đo quang phổ huỳnh quang tia X (XRF) để sàng lọc Pb, Cd, Hg, Cr, Br, Cl.
            </td>
          </tr>
          <tr style="border-bottom:1px solid #e2e8f0">
            <td style="padding:12px 10px;text-align:center;font-weight:700">2</td>
            <td style="padding:12px 10px;font-weight:600;color:#1e40af">XRF Test-IQC</td>
            <td style="padding:12px 10px">
              <span class="badge" style="background:#f1f5f9;color:#475569;font-size:11px;font-weight:650">Indirect Material</span>
              <div style="color:#64748b;font-size:11px;margin-top:2px">(Packing material)</div>
            </td>
            <td style="padding:12px 10px;font-weight:600;color:#334155">1st lot only (Chỉ lô đầu)</td>
            <td style="padding:12px 10px;font-weight:600;color:#94a3b8">N/A (Không định kỳ)</td>
            <td style="padding:12px 10px;color:#475569;font-size:12px;line-height:1.5">
              Vật liệu đóng gói bao bì, túi PE, thùng carton, khay tray, băng keo. Chỉ kiểm tra kiểm định XRF cho lô hàng đầu tiên (1st lot) khi duyệt NCC hoặc thay đổi quy cách sản phẩm; các tháng sản xuất MP không bắt buộc đo lại trừ khi có cảnh báo chất lượng.
            </td>
          </tr>
          <tr>
            <td style="padding:12px 10px;text-align:center;font-weight:700">3</td>
            <td style="padding:12px 10px;font-weight:600;color:#7c3aed">XRF Test-OQC</td>
            <td style="padding:12px 10px">
              <span class="badge good" style="background:#dcfce7;color:#15803d;font-size:11px;font-weight:650">Finish Good</span>
              <div style="color:#64748b;font-size:11px;margin-top:2px">(Thành phẩm xuất xưởng)</div>
            </td>
            <td style="padding:12px 10px;font-weight:600;color:#334155">Twice per NPI stage</td>
            <td style="padding:12px 10px;font-weight:700;color:#0284c7">Quarterly (Mỗi quý: T3, T6, T9, T12)</td>
            <td style="padding:12px 10px;color:#475569;font-size:12px;line-height:1.5">
              Kiểm tra thành phẩm hoàn chỉnh tại công đoạn xuất xưởng (OQC) định kỳ 3 tháng 1 lần vào các tháng cuối quý để xác nhận 100% sản phẩm đóng gói xuất xưởng an toàn tuyệt đối, tuân thủ nghiêm ngặt chỉ thị RoHS và Halogen-Free.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

async function saveCarryOverDeclaration(item, ym, planType, inheritedLot, inheritedTestDate, notes) {
  try {
    const data = {
      material_code: item.code,
      material_name: item.name,
      year_month: ym,
      plan_type: planType,
      inherited_lot: inheritedLot || '',
      inherited_test_date: inheritedTestDate || '',
      declared_by: (window.currentUser && window.currentUser.email) || 'IQC / QA',
      category: item.rawCategory || '',
      notes: notes || (planType === 'carry_over' ? 'Không phát sinh lô mới. Đang dùng tiếp lô cũ đã test Đạt.' : 'Tháng không phát sinh nhập lô mới.')
    };
    await api('/records', {
      method: 'POST',
      body: JSON.stringify({ module: 'xrf-plan', data: data })
    });
    window.xrfPlanCache = null;
    modal.close();
    notify(`Đã lưu khai báo ${planType === 'carry_over' ? 'dùng tiếp lô cũ' : 'miễn test'} cho tháng ${ym}!`);
    render();
  } catch (err) {
    alert('Lỗi lưu khai báo: ' + err.message);
  }
}

async function deleteCarryOverDeclaration(declId, ym, declVersion = 1) {
  if (!confirm(`Bạn có chắc muốn hủy khai báo tháng ${ym} này không?`)) return;
  try {
    await api('/records/' + declId + '?version=' + (declVersion || 1), { method: 'DELETE' });
    window.xrfPlanCache = null;
    modal.close();
    notify(`Đã hủy khai báo tháng ${ym}.`);
    render();
  } catch (err) {
    alert('Lỗi hủy khai báo: ' + err.message);
  }
}

function openXrfCellDetailModal(cellInfo) {
  const { item, ym, month, status, tests, decl, latestPassLot } = cellInfo;

  if (status === 'TESTED') {
    const rows = tests.map(t => {
      const d = t.data || {};
      const res = d.result || 'Pass';
      const isPass = res.toLowerCase() === 'pass';
      return `
        <tr style="border-bottom:1px solid #e2e8f0">
          <td style="padding:7px 8px;font-weight:600;color:#0f172a">${esc(d.test_date || ym)}</td>
          <td style="padding:7px 8px;font-weight:600">${esc(d.lot || '—')}</td>
          <td style="padding:7px 8px;text-align:right">${d.pb !== undefined && d.pb !== '' ? d.pb : '—'}</td>
          <td style="padding:7px 8px;text-align:right">${d.cd !== undefined && d.cd !== '' ? d.cd : '—'}</td>
          <td style="padding:7px 8px;text-align:right">${d.hg !== undefined && d.hg !== '' ? d.hg : '—'}</td>
          <td style="padding:7px 8px;text-align:right">${d.cr !== undefined && d.cr !== '' ? d.cr : '—'}</td>
          <td style="padding:7px 8px;text-align:right">${d.br !== undefined && d.br !== '' ? d.br : '—'}</td>
          <td style="padding:7px 8px;text-align:right">${d.cl !== undefined && d.cl !== '' ? d.cl : '—'}</td>
          <td style="padding:7px 8px;text-align:center"><span class="badge ${isPass?'good':'bad'}" style="font-size:10px">${esc(res)}</span></td>
          <td style="padding:7px 8px;text-align:center">
            <button type="button" class="link-button" data-open="${t.id}" style="color:#2563eb;font-weight:600;font-size:11px">Xem chi tiết →</button>
          </td>
        </tr>
      `;
    }).join('');

    const modalBody = `
      <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;background:#f8fafc;padding:10px 14px;border-radius:6px;border:1px solid #e2e8f0">
        <div style="font-size:12px;color:#334155;line-height:1.5">
          <b>Mã Part:</b> <span style="font-weight:700;color:#0f172a">${esc(item.code)}</span> &nbsp;|&nbsp;
          <b>Tên:</b> ${esc(item.name)}<br>
          <b>Công đoạn:</b> ${esc(item.testStage)} &nbsp;|&nbsp;
          <b>Phân loại:</b> ${esc(item.normalizedCategory)} &nbsp;|&nbsp;
          <b>Nhà cung cấp:</b> ${esc(item.supplier)}
        </div>
        <span class="badge good" style="font-size:11px;padding:4px 8px">✓ ${tests.length} bản ghi đo</span>
      </div>
      <div class="table-scroll" style="max-height:55vh">
        <table style="width:100%;font-size:11.5px;border-collapse:collapse">
          <thead>
            <tr style="background:#f1f5f9;border-bottom:2px solid #cbd5e1">
              <th style="padding:7px 8px;text-align:left">Ngày test</th>
              <th style="padding:7px 8px;text-align:left">Lot No</th>
              <th style="padding:7px 8px;text-align:right">Pb (ppm)</th>
              <th style="padding:7px 8px;text-align:right">Cd (ppm)</th>
              <th style="padding:7px 8px;text-align:right">Hg (ppm)</th>
              <th style="padding:7px 8px;text-align:right">Cr (ppm)</th>
              <th style="padding:7px 8px;text-align:right">Br (ppm)</th>
              <th style="padding:7px 8px;text-align:right">Cl (ppm)</th>
              <th style="padding:7px 8px;text-align:center">Kết quả</th>
              <th style="padding:7px 8px;text-align:center">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
      <div style="margin-top:14px;display:flex;justify-content:flex-end;gap:8px">
        <button type="button" class="toolbar-btn" onclick="document.getElementById('modal').close()">Đóng</button>
      </div>
    `;
    openModal(`Kết quả đo XRF: ${item.code} (${ym})`, modalBody);
    modal.querySelectorAll('[data-open]').forEach(b => {
      b.onclick = () => {
        modal.close();
        goto('record/' + b.dataset.open);
      };
    });
  } else if (status === 'CARRYOVER') {
    const d = decl?.data || {};
    const lot = d.inherited_lot || '—';
    const testDate = d.inherited_test_date || '—';
    const notes = d.notes || 'Không phát sinh lô mới trong tháng. Đang sử dụng tiếp lô cũ đã kiểm tra Đạt.';
    const declaredBy = d.declared_by || '—';

    const modalBody = `
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 16px;margin-bottom:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <div style="font-weight:700;color:#1e40af;font-size:13.5px;display:flex;align-items:center;gap:6px">
            <span>🔵 Tháng không phát sinh lô mới — Sử dụng tiếp lô cũ</span>
          </div>
          <span class="badge good" style="background:#dcfce7;color:#15803d;font-size:11px;padding:3px 8px">✓ Tuân thủ đạt chuẩn</span>
        </div>
        <div style="font-size:12px;color:#334155;line-height:1.6">
          Mã vật liệu: <b>${esc(item.code)}</b> (${esc(item.name)})<br>
          Kỳ kế hoạch: <b>Tháng ${month} / Năm ${ym.slice(0, 4)}</b> (${ym})<br>
          Nhà cung cấp: <b>${esc(item.supplier)}</b> &nbsp;|&nbsp; Phân loại: <b>${esc(item.normalizedCategory)}</b>
        </div>
      </div>

      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin-bottom:14px">
        <h4 style="margin:0 0 10px;font-size:12px;color:#0f172a;text-transform:uppercase;letter-spacing:0.3px">Chi tiết lô hàng kế thừa</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;font-size:12px;color:#334155">
          <div>Mã Lot đang dùng: <b style="color:#0f172a">${esc(lot)}</b></div>
          <div>Ngày kiểm tra gốc: <b style="color:#0f172a">${esc(testDate)}</b></div>
          <div>Kết quả đo XRF gốc: <span style="color:#16a34a;font-weight:700">PASS (Đạt)</span></div>
          <div>Người khai báo: <b>${esc(declaredBy)}</b></div>
        </div>
        <div style="margin-top:10px;padding-top:8px;border-top:1px dashed #e2e8f0;font-size:11.5px;color:#64748b">
          <b>Ghi chú:</b> ${esc(notes)}
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px">
        ${decl?.id ? `<button type="button" id="modal-delete-decl-btn" style="height:32px;padding:0 12px;font-size:12px;color:#dc2626;background:#fff;border:1px solid #fca5a5;border-radius:6px;cursor:pointer;white-space:nowrap;font-weight:600">🗑️ Hủy khai báo này</button>` : '<div></div>'}
        <button type="button" style="height:32px;padding:0 14px;font-size:12px;color:#334155;background:#fff;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer" onclick="document.getElementById('modal').close()">Đóng</button>
      </div>
    `;

    modal.style.maxWidth = '640px';
    modal.style.width = '640px';
    openModal(`Khai báo kế thừa: ${item.code} (${ym})`, modalBody);
    $('#modal-delete-decl-btn')?.addEventListener('click', () => {
      deleteCarryOverDeclaration(decl.id, ym, decl.version);
    });
  } else if (status === 'EXEMPT') {
    const d = decl?.data || {};
    const notes = d.notes || 'Không phát sinh lô mới nhập kho hoặc tạm ngưng mã này.';
    const declaredBy = d.declared_by || '—';

    const modalBody = `
      <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:12px 16px;margin-bottom:14px">
        <div style="font-weight:700;color:#475569;font-size:13px;margin-bottom:4px">
          ⚪ Tháng không nhập hàng / Miễn kiểm tra XRF
        </div>
        <p style="margin:0;font-size:12px;color:#334155;line-height:1.5">
          Mã vật liệu <b>${esc(item.code)}</b> (${esc(item.name)}) được miễn kiểm tra trong <b>Tháng ${month}/${ym.slice(0, 4)}</b> do không phát sinh sản xuất hoặc nhập kho.<br>
          Tháng này được loại khỏi mẫu số tính tỷ lệ tuân thủ (% Compliance).
        </p>
        <div style="margin-top:8px;font-size:11.5px;color:#64748b">
          <b>Ghi chú:</b> ${esc(notes)}<br>
          <b>Người khai báo:</b> ${esc(declaredBy)}
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px">
        ${decl?.id ? `<button type="button" id="modal-delete-decl-btn" style="height:32px;padding:0 12px;font-size:12px;color:#dc2626;background:#fff;border:1px solid #fca5a5;border-radius:6px;cursor:pointer;white-space:nowrap;font-weight:600">🗑️ Hủy khai báo này</button>` : '<div></div>'}
        <button type="button" style="height:32px;padding:0 14px;font-size:12px;color:#334155;background:#fff;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer" onclick="document.getElementById('modal').close()">Đóng</button>
      </div>
    `;

    modal.style.maxWidth = '640px';
    modal.style.width = '640px';
    openModal(`Miễn kiểm tra: ${item.code} (${ym})`, modalBody);
    $('#modal-delete-decl-btn')?.addEventListener('click', () => {
      deleteCarryOverDeclaration(decl.id, ym, decl.version);
    });
  } else {
    // DUE, OVERDUE, SCHEDULED, NA
    const isOverdue = status === 'OVERDUE';
    const isDue = status === 'DUE';
    const alertTitle = isOverdue ? 'Cảnh báo quá hạn kiểm tra XRF' : (isDue ? 'Nhắc nhở kiểm tra XRF đến hạn' : 'Kế hoạch kiểm tra XRF');
    const alertColor = isOverdue ? '#b91c1c' : (isDue ? '#b45309' : '#1e40af');
    const alertBg = isOverdue ? '#fee2e2' : (isDue ? '#fffbeb' : '#eff6ff');
    const alertBorder = isOverdue ? '#fca5a5' : (isDue ? '#fde68a' : '#bfdbfe');

    const modalBody = `
      <div style="background:${alertBg};border:1px solid ${alertBorder};border-radius:8px;padding:12px 16px;margin-bottom:12px">
        <div style="font-weight:700;color:${alertColor};font-size:13px;margin-bottom:4px">
          ${isOverdue ? '⚠️ Chưa có kết quả đo XRF trong tháng quy định!' : (isDue ? '🟡 Tháng hiện tại đến hạn kiểm tra XRF định kỳ' : 'Kế hoạch kiểm tra XRF')}
        </div>
        <p style="margin:0;font-size:12px;color:#334155;line-height:1.5">
          Mã vật liệu: <b>${esc(item.code)}</b> (${esc(item.name)}) &nbsp;|&nbsp; NCC: <b>${esc(item.supplier)}</b><br>
          Kỳ kiểm tra: <b>Tháng ${month} / Năm ${ym.slice(0, 4)}</b> (${ym}) &nbsp;|&nbsp; Tần suất: <b>${esc(item.frequency)}</b>
        </p>
      </div>

      <!-- Khung khai báo nghiệp vụ thông minh -->
      <div style="background:#f8fafc;border:1px solid #dce3ec;border-radius:8px;padding:12px 14px;margin-bottom:14px">
        <div style="font-weight:700;color:#1e293b;font-size:12.5px;margin-bottom:8px">
          📋 Khai báo tình trạng nguyên vật liệu tháng ${month}/${ym.slice(0, 4)}:
        </div>

        <!-- Tùy chọn 1: Dùng tiếp lô cũ đã test Đạt -->
        <div style="background:#fff;border:1.5px solid ${latestPassLot ? '#3b82f6' : '#cbd5e1'};border-radius:6px;padding:10px 12px;margin-bottom:10px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
            <span style="font-weight:700;color:#1e40af;font-size:12px">💡 Phương án 1: Dùng tiếp lô trước đã kiểm tra Đạt (Lot Carry-over)</span>
            ${latestPassLot ? '<span class="badge good" style="font-size:10px;padding:2px 6px">Đã tìm thấy Lot Đạt</span>' : ''}
          </div>
          <p style="font-size:11.5px;color:#475569;margin:0 0 8px;line-height:1.4">
            ${latestPassLot
              ? `Tìm thấy kết quả đo Pass gần nhất: <b>Lot ${esc(latestPassLot.lot)}</b> (Đo ngày: <b>${esc(latestPassLot.test_date)}</b>). Nếu tháng này không nhập lô mới, bạn có thể xác nhận tiếp tục sử dụng lô này.`
              : `Nhập mã Lot cũ đang sử dụng trên chuyền để ghi nhận tính tuân thủ kế thừa.`}
          </p>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <input type="text" id="carryover-lot-input" placeholder="Mã Lot sử dụng" value="${esc(latestPassLot ? latestPassLot.lot : '')}" style="height:32px;padding:4px 8px;font-size:12px;width:150px;border:1px solid #cbd5e1;border-radius:6px">
            <input type="date" id="carryover-date-input" title="Ngày đo gốc của Lot" value="${esc(latestPassLot ? latestPassLot.test_date : '')}" style="height:32px;padding:4px 8px;font-size:12px;width:140px;border:1px solid #cbd5e1;border-radius:6px">
            <button type="button" class="primary" id="confirm-carryover-btn" style="height:32px;padding:0 14px;font-size:12px;font-weight:600;background:#2563eb;color:#fff;border-radius:6px;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center">
              ✓ Xác nhận dùng Lot này (Pass)
            </button>
          </div>
        </div>

        <!-- Tùy chọn 2 & 3: Báo không nhập hàng hoặc Nhập số đo mới -->
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding-top:4px">
          <button type="button" id="confirm-exempt-btn" style="height:32px;padding:0 12px;font-size:12px;color:#475569;background:#fff;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer;white-space:nowrap" title="Khai báo không phát sinh nhập lô mới hoặc tạm ngưng mã này">
            ⚪ Không nhập hàng trong tháng (Miễn test)
          </button>
          <button type="button" class="primary" id="modal-enter-xrf-btn" style="height:32px;padding:0 14px;font-size:12px;font-weight:600;border-radius:6px;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center">
            ➕ Nhập số đo XRF mới (${item.testStage === 'XRF Test-OQC' ? 'OQC' : 'IQC'})
          </button>
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end">
        <button type="button" style="height:32px;padding:0 14px;font-size:12px;color:#334155;background:#fff;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer" onclick="document.getElementById('modal').close()">Đóng</button>
      </div>
    `;

    modal.style.maxWidth = '640px';
    modal.style.width = '640px';
    openModal(alertTitle, modalBody);

    $('#confirm-carryover-btn')?.addEventListener('click', () => {
      const lotVal = ($('#carryover-lot-input')?.value || '').trim();
      const dateVal = ($('#carryover-date-input')?.value || '').trim();
      saveCarryOverDeclaration(item, ym, 'carry_over', lotVal, dateVal);
    });

    $('#confirm-exempt-btn')?.addEventListener('click', () => {
      saveCarryOverDeclaration(item, ym, 'exemption', '', '');
    });

    $('#modal-enter-xrf-btn')?.addEventListener('click', () => {
      modal.close();
      const mod = item.testStage === 'XRF Test-OQC' ? 'xrf-oqc' : 'xrf-iqc';
      recordForm(mod, null, {
        material_code: item.code,
        material_name: item.name,
        category: item.rawCategory,
        supplier: item.supplier,
        project: item.project,
        phase: item.phase,
        test_date: `${ym}-01`
      });
    });
  }
}

function exportXrfPlanExcel() {
  const state = window.xrfPlanState;
  const selYear = state.year || new Date().getFullYear();
  const headers = ['STT', 'Part Code', 'Part Name', 'Nhà cung cấp', 'Dự án', 'Phân loại', 'Giai đoạn', 'Tần suất'];
  for (let m = 1; m <= 12; m++) headers.push(`Tháng ${m}`);
  headers.push('Tổng quan (Đã test / Yêu cầu)');
  headers.push('Tỷ lệ tuân thủ (%)');

  const rows = [headers];
  const items = window.xrfPlanCurrentItems || [];
  items.forEach((item, idx) => {
    const row = [
      idx + 1,
      item.code,
      item.name,
      item.supplier,
      item.project,
      item.normalizedCategory,
      item.phase,
      item.frequency
    ];
    for (let m = 1; m <= 12; m++) {
      const cell = item.months?.[m];
      if (!cell) row.push('—');
      else if (cell.status === 'TESTED') row.push(`Đã test (${cell.badgeLabel})`);
      else if (cell.status === 'CARRYOVER') row.push(`Dùng lô cũ (${cell.decl?.data?.inherited_lot || 'Pass'})`);
      else if (cell.status === 'EXEMPT') row.push('Miễn test');
      else if (cell.status === 'DUE') row.push('Đến hạn');
      else if (cell.status === 'OVERDUE') row.push('Quá hạn');
      else if (cell.status === 'SCHEDULED') row.push('Kế hoạch');
      else row.push('—');
    }
    const ov = item.overall || { compCount: 0, reqCount: 0, pct: 100 };
    row.push(ov.reqCount === 0 && ov.compCount === 0 ? 'Miễn định kỳ' : `${ov.compCount}/${ov.reqCount}`);
    row.push(`${ov.pct}%`);
    rows.push(row);
  });

  const csvContent = '\uFEFF' + rows.map(r => r.map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Ke_hoach_XRF_Nam_${selYear}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  notify(`Đã xuất file Kế hoạch XRF Năm ${selYear} thành công!`);
}

async function xrfPlanPage() {
  const state = window.xrfPlanState;
  
  // Load data or use cached
  if (!window.xrfPlanCache) {
    const [matRes, iqcRes, oqcRes, planRes, bomRes] = await Promise.all([
      api('/records?module=materials&size=2000'),
      api('/records?module=xrf-iqc&size=2000'),
      api('/records?module=xrf-oqc&size=2000'),
      api('/records?module=xrf-plan&size=2000'),
      api('/records?module=bom&size=2000')
    ]);
    window.xrfPlanCache = { matRes, iqcRes, oqcRes, planRes, bomRes };
  }

  const { matRes, iqcRes, oqcRes, planRes, bomRes } = window.xrfPlanCache;
  const matItems = matRes?.items || [];
  const iqcItems = iqcRes?.items || [];
  const oqcItems = oqcRes?.items || [];
  const planItems = planRes?.items || [];
  const allBom = bomRes?.items || [];

  // Index declarations from xrf-plan
  const planDeclMap = {};
  planItems.forEach(r => {
    const d = r.data || {};
    const code = (d.material_code || '').trim();
    const ym = (d.year_month || '').trim();
    if (code && ym) {
      planDeclMap[`${code}_${ym}`] = r;
    }
  });

  // Extract unique projects strictly from the "Project" column of BOM module (Quản lý & Cập nhật BOM)
  const bomProjects = [...new Set(allBom.map(b => (b.data?.project || '').trim()).filter(Boolean))].sort();
  const bomProjMats = {};
  const matBomProjs = {};
  allBom.forEach(b => {
    const p = (b.data?.project || '').trim();
    const mc = (b.data?.material_code || '').trim();
    if (p && mc) {
      if (!bomProjMats[p]) bomProjMats[p] = new Set();
      bomProjMats[p].add(mc);
      if (!matBomProjs[mc]) matBomProjs[mc] = new Set();
      matBomProjs[mc].add(p);
    }
  });

  const normalizeProject = (p) => {
    if (!p) return '—';
    const s = String(p).trim();
    const clean = s.toLowerCase().replace(/[-_\s]+/g, '');
    if (clean === 'comold' || clean === 'comolded') return 'Co-molded';
    if (clean === 'sejump') return 'SE Jump';
    for (const bp of bomProjects) {
      if (bp.toLowerCase().replace(/[-_\s]+/g, '') === clean) return bp;
    }
    return s;
  };

  // Build indexed test maps
  const iqcTestMap = {};
  iqcItems.forEach(r => {
    const d = r.data || {};
    const code = (d.material_code || '').trim();
    const date = (d.test_date || '').trim();
    if (code && date.length >= 7) {
      const key = `${code}_${date.slice(0, 7)}`;
      if (!iqcTestMap[key]) iqcTestMap[key] = [];
      iqcTestMap[key].push(r);
    }
  });

  const oqcTestMap = {};
  oqcItems.forEach(r => {
    const d = r.data || {};
    const code = (d.material_code || '').trim();
    const date = (d.test_date || '').trim();
    if (code && date.length >= 7) {
      const key = `${code}_${date.slice(0, 7)}`;
      if (!oqcTestMap[key]) oqcTestMap[key] = [];
      oqcTestMap[key].push(r);
    }
  });

  // Build index of valid Pass test records per material
  const passTestsMap = {};
  [...iqcItems, ...oqcItems].forEach(t => {
    const d = t.data || {};
    const code = (d.material_code || '').trim();
    const res = String(d.result || '').toUpperCase();
    if (code && res === 'PASS') {
      if (!passTestsMap[code]) passTestsMap[code] = [];
      passTestsMap[code].push({
        id: t.id,
        lot: d.lot || '—',
        test_date: d.test_date || '',
        result: d.result || 'Pass',
        module: t.module
      });
    }
  });
  Object.values(passTestsMap).forEach(arr => {
    arr.sort((a, b) => String(a.test_date).localeCompare(String(b.test_date)));
  });

  const getLatestPassLot = (code, ym) => {
    const list = passTestsMap[code] || [];
    if (!list.length) return null;
    if (ym) {
      const prior = list.filter(t => t.test_date && t.test_date.slice(0, 7) <= ym);
      if (prior.length) return prior[prior.length - 1];
    }
    return list[list.length - 1];
  };

  // Build unified item list
  const itemsMap = new Map();
  matItems.forEach(m => {
    const d = m.data || {};
    const code = (d.material_code || '').trim();
    if (!code) return;
    const cat = (d.category || 'Direct Material').trim();
    const catLower = cat.toLowerCase();
    let normCat = 'Direct Material';
    if (catLower.includes('indirect') || catLower.includes('pack')) normCat = 'Indirect Material';
    else if (catLower.includes('finish') || catLower.includes('fg')) normCat = 'Finish Good';

    const phase = (d.phase || 'MP').trim().toUpperCase();
    const isNPI = phase.includes('NPI') || ['P1', 'P2', 'EVT', 'DVT', 'PVT'].some(p => phase.includes(p));

    // Determine BOM project for this material from BOM module
    const bProjs = matBomProjs[code] ? Array.from(matBomProjs[code]).sort() : [];
    const projDisplay = bProjs.length > 0 ? bProjs.join(', ') : normalizeProject(d.project);

    itemsMap.set(code, {
      id: m.id,
      code: code,
      name: d.material_name || code,
      supplier: d.supplier || '—',
      project: projDisplay,
      bomProjects: bProjs,
      rawCategory: cat,
      normalizedCategory: normCat,
      phase: phase || 'MP',
      isNPI: isNPI,
      testStage: normCat === 'Finish Good' ? 'XRF Test-OQC' : 'XRF Test-IQC',
      frequency: normCat === 'Direct Material'
        ? (isNPI ? 'Once / stage' : 'Monthly')
        : (normCat === 'Indirect Material'
          ? (isNPI ? '1st lot only' : 'N/A')
          : (isNPI ? 'Twice / stage' : 'Quarterly'))
    });
  });

  oqcItems.forEach(r => {
    const d = r.data || {};
    const code = (d.material_code || '').trim();
    if (code && !itemsMap.has(code)) {
      const normProj = normalizeProject(d.project);
      itemsMap.set(code, {
        id: r.id,
        code: code,
        name: d.material_name || code,
        supplier: d.supplier || 'In-house',
        project: normProj,
        bomProjects: [normProj],
        rawCategory: 'Finish Good',
        normalizedCategory: 'Finish Good',
        phase: (d.phase || 'MP').trim().toUpperCase(),
        isNPI: (d.phase || '').toUpperCase().includes('NPI'),
        testStage: 'XRF Test-OQC',
        frequency: 'Quarterly'
      });
    }
  });

  const allItems = Array.from(itemsMap.values());
  // Strictly take project list from BOM module; fallback to allItems only if BOM is empty
  const allProjects = bomProjects.length > 0
    ? bomProjects
    : [...new Set(allItems.map(i => i.project).filter(p => p && p !== '—'))].sort();

  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;
  const curYM = `${curYear}-${String(curMonth).padStart(2, '0')}`;
  const selYear = Number(state.year) || curYear;

  window.xrfCellDetailStore = {};

  let globalTestedCount = 0;
  let globalDueCount = 0;
  let globalOverdueCount = 0;
  let globalRequiredToDateCount = 0;
  let globalTestedToDateCount = 0;

  allItems.forEach(item => {
    item.months = {};
    item.hasTestedInYear = false;
    item.hasCarryOverInYear = false;
    item.hasOverdueInYear = false;
    item.hasDueThisMonth = false;

    for (let m = 1; m <= 12; m++) {
      const ym = `${selYear}-${String(m).padStart(2, '0')}`;
      const isPast = ym < curYM;
      const isCurrent = ym === curYM;
      const isFuture = ym > curYM;

      const testKey = `${item.code}_${ym}`;
      const matchingTests = (item.normalizedCategory === 'Finish Good' ? oqcTestMap[testKey] : iqcTestMap[testKey]) || [];
      const decl = planDeclMap[testKey];
      const latestPassLot = getLatestPassLot(item.code, ym);

      let status = 'NA';
      let badgeLabel = '—';

      if (matchingTests.length > 0) {
        status = 'TESTED';
        item.hasTestedInYear = true;
        globalTestedCount++;
        if (isPast || isCurrent) {
          globalTestedToDateCount++;
          globalRequiredToDateCount++;
        }
        const hasNG = matchingTests.some(t => {
          const r = String(t.data?.result || '').toUpperCase();
          return r === 'FAIL' || r === 'NG';
        });
        badgeLabel = hasNG ? 'NG' : (matchingTests.length > 1 ? `Pass (${matchingTests.length})` : 'Pass');
      } else if (decl && decl.data?.plan_type === 'carry_over') {
        status = 'CARRYOVER';
        item.hasTestedInYear = true;
        item.hasCarryOverInYear = true;
        globalTestedCount++;
        if (isPast || isCurrent) {
          globalTestedToDateCount++;
          globalRequiredToDateCount++;
        }
        badgeLabel = 'Dùng lô cũ';
      } else if (decl && decl.data?.plan_type === 'exemption') {
        status = 'EXEMPT';
        badgeLabel = 'Miễn test';
      } else {
        let isRequired = false;
        if (item.normalizedCategory === 'Direct Material') {
          isRequired = !item.isNPI || m === 1;
        } else if (item.normalizedCategory === 'Finish Good') {
          isRequired = [3, 6, 9, 12].includes(m);
        } else if (item.normalizedCategory === 'Indirect Material') {
          isRequired = false;
        }

        if (isRequired) {
          if (isPast) {
            status = 'OVERDUE';
            badgeLabel = 'Trễ hạn';
            item.hasOverdueInYear = true;
            globalOverdueCount++;
            globalRequiredToDateCount++;
          } else if (isCurrent) {
            status = 'DUE';
            badgeLabel = 'Đến hạn';
            item.hasDueThisMonth = true;
            globalDueCount++;
            globalRequiredToDateCount++;
          } else {
            status = 'SCHEDULED';
            badgeLabel = 'Kế hoạch';
          }
        }
      }

      const cellKey = `c_${item.code}_${ym}`.replace(/[^a-zA-Z0-9_]/g, '_');
      window.xrfCellDetailStore[cellKey] = {
        item: item,
        ym: ym,
        month: m,
        status: status,
        tests: matchingTests,
        decl: decl,
        latestPassLot: latestPassLot
      };

      item.months[m] = {
        cellKey: cellKey,
        ym: ym,
        status: status,
        badgeLabel: badgeLabel,
        tests: matchingTests,
        decl: decl,
        latestPassLot: latestPassLot
      };
    }

    // Calculate Overall full-year compliance for this item
    let reqCount = 0;
    let compCount = 0;

    if (item.normalizedCategory === 'Direct Material') {
      if (item.isNPI) {
        reqCount = 1;
        compCount = (item.months[1]?.status === 'TESTED' || item.months[1]?.status === 'CARRYOVER' || item.hasTestedInYear) ? 1 : 0;
      } else {
        reqCount = 12;
        compCount = 0;
        for (let m = 1; m <= 12; m++) {
          const st = item.months[m]?.status;
          if (st === 'TESTED' || st === 'CARRYOVER') {
            compCount++;
          } else if (st === 'EXEMPT') {
            reqCount--;
          }
        }
        reqCount = Math.max(0, reqCount);
      }
    } else if (item.normalizedCategory === 'Finish Good') {
      if (item.isNPI) {
        reqCount = 2;
        let cnt = 0;
        for (let m = 1; m <= 12; m++) {
          const st = item.months[m]?.status;
          if (st === 'TESTED' || st === 'CARRYOVER') cnt++;
          else if (st === 'EXEMPT' && [3, 6, 9, 12].includes(m)) reqCount--;
        }
        compCount = Math.min(cnt, Math.max(1, reqCount));
      } else {
        reqCount = 4;
        compCount = 0;
        [3, 6, 9, 12].forEach(m => {
          const st = item.months[m]?.status;
          if (st === 'TESTED' || st === 'CARRYOVER') compCount++;
          else if (st === 'EXEMPT') reqCount--;
        });
        reqCount = Math.max(0, reqCount);
      }
    } else if (item.normalizedCategory === 'Indirect Material') {
      if (item.isNPI) {
        reqCount = 1;
        compCount = (item.hasTestedInYear || Object.values(item.months).some(x => x.status === 'CARRYOVER')) ? 1 : 0;
      } else {
        reqCount = item.hasTestedInYear ? 1 : 0;
        compCount = item.hasTestedInYear ? 1 : 0;
      }
    }

    const pct = reqCount > 0 ? Math.min(100, Math.round((compCount / reqCount) * 100)) : 100;
    item.overall = {
      reqCount,
      compCount,
      pct,
      isOverdue: item.hasOverdueInYear
    };
  });

  const complianceRate = globalRequiredToDateCount > 0
    ? Math.min(100, Math.round((globalTestedToDateCount / globalRequiredToDateCount) * 100))
    : 100;

  // Filter items
  let filtered = allItems;
  const q = (state.q || '').trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(i =>
      i.code.toLowerCase().includes(q) ||
      i.name.toLowerCase().includes(q) ||
      i.supplier.toLowerCase().includes(q) ||
      i.project.toLowerCase().includes(q)
    );
  }

  if (state.project) {
    filtered = filtered.filter(i => {
      if (bomProjMats[state.project] && bomProjMats[state.project].has(i.code)) return true;
      if (i.bomProjects && i.bomProjects.includes(state.project)) return true;
      if (i.project === state.project || normalizeProject(i.project) === state.project) return true;
      return false;
    });
  }

  if (state.category) {
    if (state.category === 'direct') {
      filtered = filtered.filter(i => i.normalizedCategory === 'Direct Material');
    } else if (state.category === 'indirect') {
      filtered = filtered.filter(i => i.normalizedCategory === 'Indirect Material');
    } else if (state.category === 'fg') {
      filtered = filtered.filter(i => i.normalizedCategory === 'Finish Good');
    }
  }

  if (state.status) {
    if (state.status === 'tested') {
      filtered = filtered.filter(i => i.hasTestedInYear);
    } else if (state.status === 'carryover') {
      filtered = filtered.filter(i => i.hasCarryOverInYear);
    } else if (state.status === 'due') {
      filtered = filtered.filter(i => i.hasDueThisMonth);
    } else if (state.status === 'overdue') {
      filtered = filtered.filter(i => i.hasOverdueInYear);
    }
  }

  window.xrfPlanCurrentItems = filtered;

  const matOptimal = (function() {
    const vh = window.innerHeight || 800;
    const count = Math.floor((vh - 295) / 30);
    return Math.max(8, Math.min(30, count)) || 13;
  })();

  const pageSize = Number(state.size) || matOptimal;
  const page = Number(state.page) || 1;
  const total = filtered.length;
  const pagedItems = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(total / pageSize) || 1;

  const paginationHtml = `
    <div class="pagination" style="display:flex;justify-content:space-between;align-items:center;padding:7px 14px;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;background:#fff;flex-shrink:0">
      <div>Hiển thị <b>${total ? (page - 1) * pageSize + 1 : 0}</b>–<b>${Math.min(page * pageSize, total)}</b> trong <b>${total}</b> mã hàng</div>
      
      <!-- Chú giải trạng thái (Status Legend) đặt gọn gàng, tinh tế tại Footer -->
      <div style="display:flex;align-items:center;gap:12px;font-size:10.5px;color:#475569;user-select:none">
        <span style="display:inline-flex;align-items:center;gap:4px" title="Đã có kết quả đo quang phổ XRF đạt chuẩn"><span style="width:14px;height:14px;border-radius:50%;background:#16a34a;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:8.5px;font-weight:700">✓</span> Đạt chuẩn (Pass)</span>
        <span style="display:inline-flex;align-items:center;gap:4px" title="Kế thừa kết quả đo của lô trước còn hạn tuân thủ"><span style="width:14px;height:14px;border-radius:50%;background:#2563eb;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:9.5px;font-weight:700">⟳</span> Dùng lô cũ (Carry-over)</span>
        <span style="display:inline-flex;align-items:center;gap:4px" title="Đã qua tháng quy định nhưng chưa có số đo"><span style="width:14px;height:14px;border-radius:50%;background:#ef4444;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:800">!</span> Quá hạn (Overdue)</span>
        <span style="display:inline-flex;align-items:center;gap:4px" title="Đến kỳ lấy mẫu đo XRF trong tháng này"><span style="width:14px;height:14px;border-radius:50%;background:#f59e0b;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:8px">●</span> Đến hạn (Due)</span>
        <span style="display:inline-flex;align-items:center;gap:4px" title="Kế hoạch định kỳ trong các tháng tới"><span style="width:12px;height:12px;border-radius:50%;border:1.5px dashed #93c5fd;background:#eff6ff;display:inline-block"></span> Kế hoạch</span>
        <span style="display:inline-flex;align-items:center;gap:4px;color:#64748b" title="Tháng không nhập hàng hoặc không áp dụng kiểm tra"><span style="color:#94a3b8;font-weight:700;margin-right:2px">—</span> Miễn test (N/A)</span>
      </div>

      <div style="display:flex;align-items:center;gap:6px">
        <button type="button" class="toolbar-btn" id="xrf-plan-prev" ${page <= 1 ? 'disabled' : ''} style="padding:2px 8px;font-size:11px;height:26px">Trước</button>
        <span>Trang <b>${page}</b> / <b>${totalPages}</b></span>
        <button type="button" class="toolbar-btn" id="xrf-plan-next" ${page >= totalPages ? 'disabled' : ''} style="padding:2px 8px;font-size:11px;height:26px">Sau</button>
      </div>
    </div>
  `;

  // Unified KPI cards - Synchronized 5-card layout with other menus
  const testedMaterialsCount = allItems.filter(i => i.hasTestedInYear).length;
  const kpiCardsHtml = `
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:12px;flex-shrink:0">
      <div class="xrf-kpi-card" data-status-filter="" style="background:#fff;border:${!state.status?'2px solid #2563eb':'1px solid #e2e8f0'};border-radius:8px;padding:10px 14px;box-shadow:${!state.status?'0 0 0 2px rgba(37,99,235,0.15), 0 2px 4px rgba(0,0,0,0.05)':'0 1px 2px rgba(0,0,0,0.02)'};cursor:pointer;transition:all .15s ease">
        <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase">Tổng số mã theo dõi</div>
        <div style="font-size:22px;font-weight:700;color:#0f172a;margin-top:2px;line-height:1.1">${allItems.length}</div>
        <small style="color:#64748b;font-size:10.5px">Direct, Indirect &amp; Finish Good</small>
      </div>
      <div class="xrf-kpi-card" data-status-filter="tested" style="background:#f0fdf4;border:${state.status==='tested'?'2px solid #16a34a':'1px solid #bbf7d0'};border-radius:8px;padding:10px 14px;box-shadow:${state.status==='tested'?'0 0 0 2px rgba(22,163,74,0.15), 0 2px 4px rgba(0,0,0,0.05)':'0 1px 2px rgba(0,0,0,0.02)'};cursor:pointer;transition:all .15s ease">
        <div style="font-size:11px;font-weight:600;color:#15803d;text-transform:uppercase">Đã đo XRF (${selYear})</div>
        <div style="font-size:22px;font-weight:700;color:#16a34a;margin-top:2px;line-height:1.1">${testedMaterialsCount}</div>
        <small style="color:#15803d;font-size:10.5px">${globalTestedCount} lượt kiểm tra đạt chuẩn</small>
      </div>
      <div class="xrf-kpi-card" data-status-filter="due" style="background:#fffbeb;border:${state.status==='due'?'2px solid #d97706':'1px solid #fde68a'};border-radius:8px;padding:10px 14px;box-shadow:${state.status==='due'?'0 0 0 2px rgba(217,119,6,0.15), 0 2px 4px rgba(0,0,0,0.05)':'0 1px 2px rgba(0,0,0,0.02)'};cursor:pointer;transition:all .15s ease">
        <div style="font-size:11px;font-weight:600;color:#b45309;text-transform:uppercase">Đến hạn tháng ${curMonth}</div>
        <div style="font-size:22px;font-weight:700;color:#d97706;margin-top:2px;line-height:1.1">${globalDueCount}</div>
        <small style="color:#b45309;font-size:10.5px">Kỳ hạn kiểm tra tháng ${curMonth}/${selYear}</small>
      </div>
      <div class="xrf-kpi-card" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;box-shadow:0 1px 2px rgba(0,0,0,0.02);cursor:default">
        <div style="font-size:11px;font-weight:600;color:#1e40af;text-transform:uppercase">Tỷ lệ tuân thủ (${selYear})</div>
        <div style="font-size:22px;font-weight:700;color:#2563eb;margin-top:2px;line-height:1.1">${complianceRate}%</div>
        <small style="color:#1e40af;font-size:10.5px">So với kế hoạch định kỳ cả năm</small>
      </div>
      <div class="xrf-kpi-card" data-status-filter="overdue" style="background:#fef2f2;border:${state.status==='overdue'?'2px solid #dc2626':'1px solid #fecaca'};border-radius:8px;padding:10px 14px;box-shadow:${state.status==='overdue'?'0 0 0 2px rgba(220,38,38,0.15), 0 2px 4px rgba(0,0,0,0.05)':'0 1px 2px rgba(0,0,0,0.02)'};cursor:pointer;transition:all .15s ease">
        <div style="font-size:11px;font-weight:600;color:#b91c1c;text-transform:uppercase">Quá hạn chưa test</div>
        <div style="font-size:22px;font-weight:700;color:#dc2626;margin-top:2px;line-height:1.1">${globalOverdueCount}</div>
        <small style="color:#b91c1c;font-size:10.5px">Cần nhắc nhở IQC/OQC đo bổ sung</small>
      </div>
    </div>
  `;

  // Professional Standard Toolbar matching Danh mục NVL
  const toolbarHtml = `
    <form class="toolbar" id="xrf-plan-toolbar" onsubmit="return false;" style="padding:8px 12px;gap:8px;align-items:center;flex-wrap:nowrap;margin:0;border-bottom:1px solid #e2e8f0;background:#fff;flex-shrink:0">
      <input type="search" id="xrf-plan-search" placeholder="Tìm kiếm mã Part, tên NVL, nhà cung cấp, dự án…" value="${esc(state.q)}" aria-label="Tìm kiếm trong bảng" style="flex:1;min-width:140px;max-width:280px;height:32px;padding:5px 9px;font-size:11.5px">

      <select id="xrf-plan-year" title="Chọn năm kế hoạch" style="height:32px;padding:4px 8px;font-size:11.5px;font-weight:600;color:#1e40af;max-width:105px">
        <option value="2025" ${selYear===2025?'selected':''}>Năm 2025</option>
        <option value="2026" ${selYear===2026?'selected':''}>Năm 2026</option>
        <option value="2027" ${selYear===2027?'selected':''}>Năm 2027</option>
      </select>

      <select id="xrf-plan-project" title="Lọc theo dự án" style="height:32px;padding:4px 8px;font-size:11.5px;max-width:115px">
        <option value="">Tất cả dự án (${allProjects.length})</option>
        ${allProjects.map(p => `<option value="${esc(p)}" ${state.project===p?'selected':''}>Dự án: ${esc(p)}</option>`).join('')}
      </select>

      <select id="xrf-plan-category" title="Lọc theo phân loại vật liệu" style="height:32px;padding:4px 8px;font-size:11.5px;max-width:125px">
        <option value="">Tất cả phân loại</option>
        <option value="direct" ${state.category==='direct'?'selected':''}>Direct Material</option>
        <option value="indirect" ${state.category==='indirect'?'selected':''}>Indirect Material</option>
        <option value="fg" ${state.category==='fg'?'selected':''}>Finish Good</option>
      </select>

      <select id="xrf-plan-status" title="Lọc theo trạng thái kiểm tra" style="height:32px;padding:4px 8px;font-size:11.5px;max-width:130px">
        <option value="">Tất cả trạng thái</option>
        <option value="tested" ${state.status==='tested'?'selected':''}>✓ Đã đo XRF</option>
        <option value="carryover" ${state.status==='carryover'?'selected':''}>⟳ Dùng lô cũ (Carry-over)</option>
        <option value="due" ${state.status==='due'?'selected':''}>⏰ Đến hạn kiểm tra</option>
        <option value="overdue" ${state.status==='overdue'?'selected':''}>⚠️ Quá hạn chưa test</option>
      </select>

      <div class="toolbar-actions-group">
        <button type="button" id="xrf-plan-reset" class="toolbar-btn" title="Xóa toàn bộ bộ lọc & làm mới" aria-label="Xóa bộ lọc" style="height:32px;width:32px;padding:0;display:flex;align-items:center;justify-content:center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
        </button>
      </div>

      <div class="toolbar-actions-right" style="margin-left:auto;display:flex;align-items:center;gap:6px;flex-shrink:0">
        <div style="display:inline-flex;background:#f1f5f9;border:1px solid #e2e8f0;padding:2px;border-radius:6px;gap:2px">
          <button type="button" id="tab-xrf-matrix-btn" style="padding:3px 10px;height:26px;font-size:11px;border:none;border-radius:4px;cursor:pointer;background:${state.tab==='matrix'?'#fff':'transparent'};color:${state.tab==='matrix'?'#0f172a':'#64748b'};font-weight:${state.tab==='matrix'?'700':'500'};box-shadow:${state.tab==='matrix'?'0 1px 2px rgba(0,0,0,0.08)':'none'}">📊 Ma trận</button>
          <button type="button" id="tab-xrf-rules-btn" style="padding:3px 10px;height:26px;font-size:11px;border:none;border-radius:4px;cursor:pointer;background:${state.tab==='rules'?'#fff':'transparent'};color:${state.tab==='rules'?'#0f172a':'#64748b'};font-weight:${state.tab==='rules'?'700':'500'};box-shadow:${state.tab==='rules'?'0 1px 2px rgba(0,0,0,0.08)':'none'}">⚙️ Tiêu chuẩn</button>
        </div>

        <button type="button" id="xrf-plan-export-btn" class="toolbar-btn" title="Xuất danh sách ra file Excel" aria-label="Xuất file Excel" style="height:32px;width:32px;padding:0;display:flex;align-items:center;justify-content:center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>

        ${can('xrf-plan','Create') ? `
          <button type="button" id="xrf-plan-add-btn" class="primary toolbar-btn" title="Thêm kế hoạch kiểm tra đột xuất" aria-label="Thêm kế hoạch" style="height:32px;width:32px;padding:0;display:flex;align-items:center;justify-content:center">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        ` : ''}
      </div>
    </form>
  `;

  // Render Table Rows with Status Indicator Dots & Overall Column
  const rowsHtml = pagedItems.length ? pagedItems.map((item, idx) => {
    const stt = (page - 1) * pageSize + idx + 1;
    let catBadge = '';
    if (item.normalizedCategory === 'Direct Material') {
      catBadge = '<span class="badge info" style="background:#eff6ff;color:#1d4ed8;font-size:9.5px;padding:1px 4px;font-weight:600">Direct</span>';
    } else if (item.normalizedCategory === 'Indirect Material') {
      catBadge = '<span class="badge" style="background:#f1f5f9;color:#475569;font-size:9.5px;padding:1px 4px;font-weight:600">Indirect</span>';
    } else {
      catBadge = '<span class="badge good" style="background:#dcfce7;color:#15803d;font-size:9.5px;padding:1px 4px;font-weight:600">Finish Good</span>';
    }

    const monthCells = Array.from({length: 12}, (_, i) => i + 1).map(m => {
      const cell = item.months[m];
      const isCur = selYear === curYear && m === curMonth;
      const cellBg = isCur ? 'background:rgba(254,243,199,0.3);' : '';

      if (cell.status === 'TESTED') {
        const isNG = cell.badgeLabel === 'NG';
        const testCount = cell.tests.length;
        const testDates = cell.tests.map(t => t.data?.test_date || '').filter(Boolean).join(', ');
        const testLots = cell.tests.map(t => t.data?.lot || '').filter(Boolean).join(', ');
        const tooltip = `ĐÃ ĐO ĐẠT CHUẨN (${cell.badgeLabel})\n• Tháng: T${m}/${selYear}\n• Lượt test: ${testCount}\n• Ngày test: ${testDates || '—'}\n• Lot: ${testLots || '—'}\n👉 Bấm để xem chi tiết phổ đo XRF`;
        return `<td class="xrf-month-td" style="text-align:center;padding:0;vertical-align:middle;text-overflow:clip;overflow:visible;${cellBg}"><button type="button" class="xrf-matrix-cell xrf-dot-btn ${isNG ? 'dot-ng' : 'dot-pass'}" data-cell-key="${cell.cellKey}" title="${esc(tooltip)}">${isNG ? '✕' : (testCount > 1 ? testCount : '✓')}</button></td>`;
      } else if (cell.status === 'CARRYOVER') {
        const decl = cell.decl?.data || {};
        const tooltip = `KẾ THỪA LÔ CŨ (CARRY-OVER - PASS)\n• Tháng: T${m}/${selYear}\n• Dùng tiếp Lot: ${decl.inherited_lot || '—'}\n• Ngày test gốc: ${decl.inherited_test_date || '—'}\n• Người khai báo: ${decl.declared_by || '—'}\n• Ghi chú: ${decl.notes || '—'}\n👉 Bấm để xem hoặc hủy khai báo`;
        return `<td class="xrf-month-td" style="text-align:center;padding:0;vertical-align:middle;text-overflow:clip;overflow:visible;${cellBg}"><button type="button" class="xrf-matrix-cell xrf-dot-btn dot-carryover" data-cell-key="${cell.cellKey}" title="${esc(tooltip)}">⟳</button></td>`;
      } else if (cell.status === 'EXEMPT') {
        const decl = cell.decl?.data || {};
        const tooltip = `MIỄN TEST THÁNG T${m}/${selYear}\n• Lý do: Không có lô hàng mới về trong tháng\n• Người khai báo: ${decl.declared_by || '—'}\n• Ghi chú: ${decl.notes || '—'}\n👉 Bấm để xem hoặc hủy khai báo`;
        return `<td class="xrf-month-td" style="text-align:center;padding:0;vertical-align:middle;text-overflow:clip;overflow:visible;${cellBg}"><button type="button" class="xrf-matrix-cell xrf-dot-btn dot-exempt" data-cell-key="${cell.cellKey}" title="${esc(tooltip)}">—</button></td>`;
      } else if (cell.status === 'DUE') {
        const tooltip = `ĐẾN HẠN THÁNG NÀY!\n• Kỳ kiểm tra: T${m}/${selYear}\n• Tần suất: ${item.frequency}\n• Công đoạn: ${item.testStage}\n👉 Bấm để khai báo dùng lô cũ hoặc nhập số đo XRF`;
        return `<td class="xrf-month-td" style="text-align:center;padding:0;vertical-align:middle;text-overflow:clip;overflow:visible;${cellBg}"><button type="button" class="xrf-matrix-cell xrf-dot-btn dot-due" data-cell-key="${cell.cellKey}" title="${esc(tooltip)}">●</button></td>`;
      } else if (cell.status === 'OVERDUE') {
        const tooltip = `QUÁ HẠN KIỂM TRA!\n• Kỳ quy định: T${m}/${selYear}\n• Tần suất: ${item.frequency}\n• Công đoạn: ${item.testStage}\n👉 Bấm để khai báo dùng lô cũ hoặc nhập số đo XRF`;
        return `<td class="xrf-month-td" style="text-align:center;padding:0;vertical-align:middle;text-overflow:clip;overflow:visible;${cellBg}"><button type="button" class="xrf-matrix-cell xrf-dot-btn dot-overdue" data-cell-key="${cell.cellKey}" title="${esc(tooltip)}">!</button></td>`;
      } else if (cell.status === 'SCHEDULED') {
        const tooltip = `Kế hoạch định kỳ: Tháng ${m}/${selYear}\n• Tần suất: ${item.frequency}\n• Trạng thái: Chưa đến kỳ lấy mẫu\n👉 Bấm để khai báo trước hoặc nhập số đo sớm`;
        return `<td class="xrf-month-td" style="text-align:center;padding:0;vertical-align:middle;text-overflow:clip;overflow:visible;${cellBg}"><button type="button" class="xrf-matrix-cell xrf-dot-btn dot-plan" data-cell-key="${cell.cellKey}" title="${esc(tooltip)}"></button></td>`;
      } else {
        const tooltip = `Không yêu cầu kiểm tra trong tháng ${m}`;
        return `<td class="xrf-month-td" style="text-align:center;padding:0;color:#cbd5e1;font-size:11px;vertical-align:middle;text-overflow:clip;overflow:visible;${cellBg}"><span title="${esc(tooltip)}" style="cursor:default">·</span></td>`;
      }
    }).join('');

    // Overall Column Calculation
    const ov = item.overall || { compCount: 0, reqCount: 0, pct: 100, isOverdue: false };
    let ovColor = '#16a34a';
    let ovBarBg = '#16a34a';
    let ovStatusText = 'Tuân thủ đạt chuẩn';

    if (ov.isOverdue) {
      ovColor = '#dc2626';
      ovBarBg = '#dc2626';
      ovStatusText = 'Có tháng quá hạn chưa kiểm tra!';
    } else if (ov.reqCount === 0) {
      ovColor = '#64748b';
      ovBarBg = '#cbd5e1';
      ovStatusText = 'Miễn kiểm tra định kỳ (MP Indirect)';
    } else if (ov.compCount >= ov.reqCount) {
      ovColor = '#16a34a';
      ovBarBg = '#16a34a';
      ovStatusText = 'Đã hoàn thành 100% kế hoạch năm';
    } else {
      ovColor = '#2563eb';
      ovBarBg = '#2563eb';
      ovStatusText = 'Đang thực hiện theo tiến độ kế hoạch';
    }

    const overallTooltip = `TỔNG QUAN NĂM ${selYear}:\n• Đã kiểm tra: ${ov.compCount} / ${ov.reqCount} kỳ yêu cầu\n• Tỷ lệ hoàn thành: ${ov.pct}%\n• Đánh giá: ${ovStatusText}`;

    return `<tr style="border-bottom:1px solid #f1f5f9;height:29px">
      <td style="text-align:center;color:#64748b;font-weight:500;position:sticky;left:0;background:#fff;z-index:2;padding:2px 0;width:36px;overflow:visible">${stt}</td>
      <td style="position:sticky;left:36px;background:#fff;z-index:2;padding:2px 4px"><button type="button" class="link-button" data-open="${item.id}" style="font-weight:700;color:#0f172a;font-size:11px;max-width:96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(item.code)}</button></td>
      <td title="${esc(item.name)}" style="max-width:135px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;position:sticky;left:141px;background:#fff;z-index:2;box-shadow:2px 0 4px -2px rgba(0,0,0,0.12);padding:2px 6px;font-size:11px;color:#334155">${esc(item.name)}</td>
      <td title="${esc(item.supplier)}" style="max-width:95px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#64748b;padding:2px 6px;font-size:10.5px">${esc(item.supplier)}</td>
      <td style="text-align:center;padding:2px 2px">${catBadge}</td>
      <td style="text-align:center;padding:2px 0;overflow:visible"><span style="font-size:9.5px;font-weight:600;color:#334155;background:#f1f5f9;padding:1px 4px;border-radius:3px">${esc(item.phase)}</span></td>
      <td style="text-align:center;font-size:10px;color:#64748b;padding:2px 2px">${esc(item.frequency)}</td>
      ${monthCells}
      <td style="padding:2px 6px;vertical-align:middle;text-align:center" title="${esc(overallTooltip)}">
        <div style="display:flex;flex-direction:column;gap:2px;min-width:72px;max-width:88px;margin:0 auto">
          <div style="display:flex;align-items:center;justify-content:space-between;font-size:10px;font-weight:750;line-height:1">
            <span style="color:${ovColor}">${ov.reqCount === 0 && ov.compCount === 0 ? 'N/A' : `${ov.compCount}/${ov.reqCount}`}</span>
            <span style="color:${ovColor};font-size:9.5px">${ov.pct}%</span>
          </div>
          <div style="width:100%;height:4px;background:#e2e8f0;border-radius:2px;overflow:hidden">
            <div style="width:${ov.pct}%;height:100%;background:${ovBarBg};border-radius:2px"></div>
          </div>
        </div>
      </td>
    </tr>`;
  }).join('') : `<tr><td colspan="20" class="empty-state" style="text-align:center;padding:30px;color:#64748b">Không tìm thấy mã vật liệu phù hợp với bộ lọc.</td></tr>`;

  // Matrix Table with Colgroup and Sticky Headers
  const matrixTableHtml = `
    <div class="table-scroll" style="flex:1 1 0;min-height:0;overflow:auto">
      <table class="xrf-matrix-table" style="width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed">
        <colgroup>
          <col style="width:36px">
          <col style="width:105px">
          <col style="width:135px">
          <col style="width:95px">
          <col style="width:75px">
          <col style="width:48px">
          <col style="width:65px">
          ${Array.from({length: 12}, () => '<col style="width:28px">').join('')}
          <col style="width:95px">
        </colgroup>
        <thead>
          <tr style="background:#f8fafc;border-bottom:2px solid #cbd5e1">
            <th style="text-align:center;padding:6px 0;position:sticky;left:0;top:0;background:#f8fafc;z-index:4;width:36px">STT</th>
            <th style="text-align:left;padding:6px 4px;position:sticky;left:36px;top:0;background:#f8fafc;z-index:4;width:105px">Mã Part</th>
            <th style="text-align:left;padding:6px 6px;position:sticky;left:141px;top:0;background:#f8fafc;z-index:4;box-shadow:2px 0 4px -2px rgba(0,0,0,0.12);width:135px">Tên NVL / TP</th>
            <th style="text-align:left;padding:6px 6px;position:sticky;top:0;background:#f8fafc;z-index:3">Nhà cung cấp</th>
            <th style="text-align:center;padding:6px 2px;position:sticky;top:0;background:#f8fafc;z-index:3">Phân loại</th>
            <th style="text-align:center;padding:6px 2px;position:sticky;top:0;background:#f8fafc;z-index:3">Phase</th>
            <th style="text-align:center;padding:6px 2px;position:sticky;top:0;background:#f8fafc;z-index:3">Tần suất</th>
            ${Array.from({length: 12}, (_, i) => i + 1).map(m => {
              const isCur = selYear === curYear && m === curMonth;
              return `<th style="text-align:center;padding:6px 1px;position:sticky;top:0;background:${isCur?'#eff6ff':'#f8fafc'};color:${isCur?'#1d4ed8':'#475569'};font-weight:750;z-index:3" title="${isCur ? `Tháng hiện tại (T${m}/${selYear})` : `Tháng ${m}`}">T${m}</th>`;
            }).join('')}
            <th style="text-align:center;padding:6px 4px;position:sticky;top:0;background:#f8fafc;z-index:3;color:#1e293b;font-weight:750" title="Tình trạng tuân thủ toàn năm ${selYear}">Tổng quan</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;

  return `
    <div style="display:flex;flex-direction:column;flex:1 1 0;min-height:0;height:100%;overflow:hidden">
      ${kpiCardsHtml}
      <section class="card fill-card" style="display:flex;flex-direction:column;flex:1 1 0;min-height:0;overflow:hidden;margin-bottom:0">
        ${toolbarHtml}
        <div id="xrf-matrix-wrapper" style="display:${state.tab==='rules'?'none':'flex'};flex-direction:column;flex:1 1 0;min-height:0;overflow:hidden">
          ${matrixTableHtml}
          ${paginationHtml}
        </div>
        <div id="xrf-rules-wrapper" style="display:${state.tab==='rules'?'flex':'none'};flex-direction:column;flex:1 1 0;min-height:0;overflow-y:auto;padding:10px 14px">
          ${renderXrfFrequencyRulesTable()}
        </div>
      </section>
    </div>
  `;
}

function bindXrfPlanPage() {
  content.querySelectorAll('.xrf-kpi-card[data-status-filter]').forEach(card => {
    card.onclick = () => {
      const st = card.dataset.statusFilter;
      window.xrfPlanState.status = (window.xrfPlanState.status === st && st !== '') ? '' : st;
      window.xrfPlanState.page = 1;
      render();
    };
  });

  $('#xrf-plan-year')?.addEventListener('change', e => {
    window.xrfPlanState.year = Number(e.target.value);
    window.xrfPlanState.page = 1;
    render();
  });

  $('#xrf-plan-project')?.addEventListener('change', e => {
    window.xrfPlanState.project = e.target.value;
    window.xrfPlanState.page = 1;
    render();
  });

  $('#xrf-plan-category')?.addEventListener('change', e => {
    window.xrfPlanState.category = e.target.value;
    window.xrfPlanState.page = 1;
    render();
  });

  $('#xrf-plan-status')?.addEventListener('change', e => {
    window.xrfPlanState.status = e.target.value;
    window.xrfPlanState.page = 1;
    render();
  });

  let searchTimer = null;
  $('#xrf-plan-search')?.addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      window.xrfPlanState.q = e.target.value;
      window.xrfPlanState.page = 1;
      render();
    }, 300);
  });

  $('#xrf-plan-reset')?.addEventListener('click', () => {
    window.xrfPlanCache = null;
    window.xrfPlanState = {
      year: new Date().getFullYear(),
      tab: 'matrix',
      project: '',
      category: '',
      status: '',
      q: '',
      page: 1,
      size: 15
    };
    render();
  });

  // Instant tab switching without full render/reload
  const matrixWrap = $('#xrf-matrix-wrapper');
  const rulesWrap = $('#xrf-rules-wrapper');
  const matrixBtn = $('#tab-xrf-matrix-btn');
  const rulesBtn = $('#tab-xrf-rules-btn');

  matrixBtn?.addEventListener('click', () => {
    window.xrfPlanState.tab = 'matrix';
    if (matrixWrap && rulesWrap) {
      matrixWrap.style.display = 'flex';
      rulesWrap.style.display = 'none';
      matrixBtn.style.background = '#fff';
      matrixBtn.style.color = '#0f172a';
      matrixBtn.style.fontWeight = '700';
      matrixBtn.style.boxShadow = '0 1px 2px rgba(0,0,0,0.06)';
      rulesBtn.style.background = 'transparent';
      rulesBtn.style.color = '#64748b';
      rulesBtn.style.fontWeight = '500';
      rulesBtn.style.boxShadow = 'none';
    } else {
      render();
    }
  });

  rulesBtn?.addEventListener('click', () => {
    window.xrfPlanState.tab = 'rules';
    if (matrixWrap && rulesWrap) {
      matrixWrap.style.display = 'none';
      rulesWrap.style.display = 'flex';
      rulesBtn.style.background = '#fff';
      rulesBtn.style.color = '#0f172a';
      rulesBtn.style.fontWeight = '700';
      rulesBtn.style.boxShadow = '0 1px 2px rgba(0,0,0,0.06)';
      matrixBtn.style.background = 'transparent';
      matrixBtn.style.color = '#64748b';
      matrixBtn.style.fontWeight = '500';
      matrixBtn.style.boxShadow = 'none';
    } else {
      render();
    }
  });

  $('#xrf-plan-prev')?.addEventListener('click', () => {
    if (window.xrfPlanState.page > 1) {
      window.xrfPlanState.page--;
      render();
    }
  });
  $('#xrf-plan-next')?.addEventListener('click', () => {
    window.xrfPlanState.page++;
    render();
  });

  $('#xrf-plan-export-btn')?.addEventListener('click', () => {
    exportXrfPlanExcel();
  });

  $('#xrf-plan-add-btn')?.addEventListener('click', () => {
    recordForm('xrf-plan');
  });

  content.querySelectorAll('.xrf-matrix-cell').forEach(btn => {
    btn.onclick = () => {
      const cellKey = btn.dataset.cellKey;
      const cellInfo = window.xrfCellDetailStore?.[cellKey];
      if (!cellInfo) return;
      openXrfCellDetailModal(cellInfo);
    };
  });
}

let cachedTestTypes = null;
async function getTestTypesList() {
  if (cachedTestTypes) return cachedTestTypes;
  try {
    const res = await api('/records?module=test-types&size=200');
    if (res?.items?.length) {
      cachedTestTypes = res.items.map(r => r.data?.name).filter(Boolean);
      return cachedTestTypes;
    }
  } catch(e) {}
  return ['RoHS', 'Halogen-Free', 'REACH / SVHC', 'PFOA & PFOS', 'VOC', 'PFAS'];
}

async function openQuickEditTests(row) {
  const testTypes = await getTestTypesList();
  const currentTests = String(row.data.required_tests || '').split(',').map(s=>s.trim()).filter(Boolean);
  const options = [...new Set([...testTypes, ...currentTests])];
  openModal('Cấu hình loại kiểm nghiệm: ' + (row.data.material_code || label(row)), `
    <div style="margin-bottom:12px;font-size:12px;color:#64748b">
      Chọn các loại báo cáo kiểm nghiệm bắt buộc áp dụng cho vật liệu này (dữ liệu lấy từ Cài đặt):
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;padding:12px;background:#f8fafc;border:1px solid #dce3ec;border-radius:8px;margin-bottom:14px">
      ${options.map(t => {
        const checked = currentTests.includes(t);
        return `<label style="cursor:pointer;display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:${checked?'#eff6ff':'#fff'};border:1px solid ${checked?'#3b82f6':'#cbd5e1'};border-radius:6px;font-size:12px;color:${checked?'#1e40af':'#334155'};font-weight:${checked?'600':'400'};user-select:none;margin:0">
          <input type="checkbox" value="${esc(t)}" class="quick-test-toggle" ${checked?'checked':''} style="margin:0">
          <span>${esc(t)}</span>
        </label>`;
      }).join('')}
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center">
      <a href="#/test-types" target="_blank" style="font-size:11px;color:#2563eb;text-decoration:none">⚙️ Quản lý danh mục loại kiểm nghiệm trong Cài đặt →</a>
    </div>
  `, `
    <button data-close>Hủy</button>
    <button type="button" class="primary" id="save-quick-tests-btn">Lưu cấu hình</button>
  `);

  modal.querySelectorAll('.quick-test-toggle').forEach(chk => {
    chk.onchange = () => {
      const lbl = chk.closest('label');
      if (lbl) {
        lbl.style.background = chk.checked ? '#eff6ff' : '#fff';
        lbl.style.borderColor = chk.checked ? '#3b82f6' : '#cbd5e1';
        lbl.style.color = chk.checked ? '#1e40af' : '#334155';
        lbl.style.fontWeight = chk.checked ? '600' : '400';
      }
    };
  });

  const btn = $('#save-quick-tests-btn');
  if (btn) btn.onclick = async () => {
    btn.disabled = true;
    try {
      const selected = Array.from(modal.querySelectorAll('.quick-test-toggle:checked')).map(c => c.value);
      const updatedData = { ...row.data, required_tests: selected.join(', ') };
      await api('/records/' + row.id, {
        method: 'PUT',
        body: JSON.stringify({ module: 'materials', data: updatedData, version: row.version })
      });
      modal.close();
      notify('Đã cập nhật loại kiểm nghiệm thành công.');
      render();
    } catch(err) {
      alert('Lỗi: ' + err.message);
    } finally {
      if ($('#save-quick-tests-btn')) $('#save-quick-tests-btn').disabled = false;
    }
  };
}

function openAttachFileModal(reportId, reportNumber) {
  openModal('Đính kèm file PDF: ' + (reportNumber || '#' + reportId), `
    <form id="attach-file-form" style="display:flex;flex-direction:column;gap:12px">
      <div style="font-size:12px;color:#64748b">
        Chọn file báo cáo kiểm nghiệm dạng PDF hoặc ảnh để đính kèm vào mã số <b>${esc(reportNumber || '')}</b>:
      </div>
      <div id="attach-drop-zone" style="border:2px dashed #3b82f6;border-radius:8px;padding:20px;text-align:center;background:#f8fafc;cursor:pointer">
        <input type="file" id="attach-file-input" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx" style="display:none">
        <div style="font-size:28px;margin-bottom:4px">📎</div>
        <b style="color:#2563eb;font-size:13px;display:block" id="attach-file-label">Bấm vào đây để chọn file PDF</b>
        <p style="margin:4px 0 0;font-size:11px;color:#94a3b8">Hỗ trợ .PDF, .PNG, .JPG (tối đa 50MB) · Kéo thả file vào đây</p>
      </div>
      <div id="attach-file-error" class="form-error"></div>
    </form>
  `, `
    <button data-close>Hủy</button>
    <button type="submit" form="attach-file-form" class="primary" id="save-attach-file-btn">Tải lên file</button>
  `);

  const fileInput = modal.querySelector('#attach-file-input');
  const dropZone = modal.querySelector('#attach-drop-zone');

  if (dropZone && fileInput) {
    dropZone.onclick = () => fileInput.click();
    dropZone.ondragover = (e) => { e.preventDefault(); dropZone.style.background = '#eff6ff'; dropZone.style.borderColor = '#2563eb'; };
    dropZone.ondragleave = () => { dropZone.style.background = '#f8fafc'; dropZone.style.borderColor = '#3b82f6'; };
    dropZone.ondrop = (e) => {
      e.preventDefault();
      dropZone.style.background = '#f8fafc';
      dropZone.style.borderColor = '#3b82f6';
      if (e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        fileInput.dispatchEvent(new Event('change'));
      }
    };
  }

  fileInput.onchange = () => {
    if (fileInput.files[0]) {
      const f = fileInput.files[0];
      const lbl = modal.querySelector('#attach-file-label');
      if (lbl) lbl.innerHTML = `<span style="color:#16a34a">✓ Đã chọn: <b>${esc(f.name)}</b> (${(f.size/1024).toFixed(1)} KB)</span>`;
      if (dropZone) {
        dropZone.style.background = '#f0fdf4';
        dropZone.style.borderColor = '#22c55e';
      }
    }
  };

  $('#attach-file-form').onsubmit = async (e) => {
    e.preventDefault();
    if (!fileInput.files[0]) {
      $('#attach-file-error').textContent = 'Vui lòng chọn 1 tệp PDF hoặc ảnh đính kèm.';
      return;
    }
    $('#save-attach-file-btn').disabled = true;
    try {
      const body = new FormData();
      body.append('file', fileInput.files[0]);
      await api('/records/' + reportId + '/evidence', { method: 'POST', body });
      modal.close();
      notify('Đã đính kèm file PDF thành công.');
      render();
    } catch(err) {
      $('#attach-file-error').textContent = err.message;
    } finally {
      if ($('#save-attach-file-btn')) $('#save-attach-file-btn').disabled = false;
    }
  };
}

function openAttachMsdsModal(row) {
  const code = row.data?.material_code || '';
  const matName = row.data?.material_name || code;
  const supplier = row.data?.supplier || '';
  const todayStr = new Date().toISOString().slice(0, 10);
  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 1);
  const nextYearStr = nextYear.toISOString().slice(0, 10);

  const related = row.related || [];
  const documents = related.filter(r => r.module === 'documents');
  const existingMsdsDoc = documents.find(r => (code && r.data?.material_code === code) && (r.data?.category === 'MSDS' || String(r.data?.document_no||'').startsWith('MSDS-') || String(r.data?.document_name||'').toLowerCase().includes('msds')));

  const modalHtml = `
    <form id="attach-msds-form" style="display:flex;flex-direction:column;gap:12px">
      <div style="font-size:12px;color:#334155;line-height:1.5">
        Đính kèm tệp Bảng chỉ dẫn an toàn hóa chất (MSDS / SDS) cho vật liệu: <b>${esc(code)}</b> — ${esc(matName)}
      </div>
      <div id="msds-drop-zone" style="border:2px dashed #3b82f6;border-radius:8px;padding:22px 16px;text-align:center;background:#eff6ff;cursor:pointer;transition:all .2s">
        <div style="font-size:28px;margin-bottom:6px">📑</div>
        <div style="font-weight:650;font-size:13px;color:#1e40af">Bấm để chọn tệp MSDS / SDS hoặc kéo thả vào đây</div>
        <div style="font-size:11px;color:#64748b;margin-top:4px">Định dạng hỗ trợ: PDF, Word (.docx), Excel (.xlsx), Ảnh (PNG, JPG) · Tối đa 10 MB</div>
        <input type="file" id="quick-msds-file-input" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx,.doc,.txt" style="display:none">
        <div id="quick-msds-selected-label" style="margin-top:8px;font-size:11.5px;font-weight:600;color:#059669"></div>
      </div>
      <div id="attach-msds-error" class="form-error"></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:4px">
        <button type="button" data-close>Hủy</button>
        <button type="submit" class="primary" id="save-quick-msds-btn" style="padding:6px 16px;font-weight:600">💾 Tải lên & Lưu tệp MSDS</button>
      </div>
    </form>
  `;

  openModal('📑 Đính kèm tệp MSDS / SDS', modalHtml);
  modal.style.maxWidth = '540px';

  const dropZone = modal.querySelector('#msds-drop-zone');
  const fileInput = modal.querySelector('#quick-msds-file-input');
  const lbl = modal.querySelector('#quick-msds-selected-label');

  if (dropZone && fileInput) {
    dropZone.onclick = (e) => {
      if (e.target !== fileInput) fileInput.click();
    };
    dropZone.ondragover = (e) => {
      e.preventDefault();
      dropZone.style.background = '#dbeafe';
      dropZone.style.borderColor = '#2563eb';
    };
    dropZone.ondragleave = () => {
      dropZone.style.background = '#eff6ff';
      dropZone.style.borderColor = '#3b82f6';
    };
    dropZone.ondrop = (e) => {
      e.preventDefault();
      dropZone.style.background = '#eff6ff';
      dropZone.style.borderColor = '#3b82f6';
      if (e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        fileInput.dispatchEvent(new Event('change'));
      }
    };
  }

  if (fileInput) {
    fileInput.onchange = () => {
      if (fileInput.files[0]) {
        const f = fileInput.files[0];
        if (lbl) lbl.innerHTML = `<span style="color:#16a34a">✓ Đã chọn: <b>${esc(f.name)}</b> (${(f.size/1024).toFixed(1)} KB)</span>`;
        if (dropZone) {
          dropZone.style.background = '#f0fdf4';
          dropZone.style.borderColor = '#22c55e';
        }
      }
    };
  }

  const form = modal.querySelector('#attach-msds-form');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (!fileInput.files[0]) {
        $('#attach-msds-error').textContent = 'Vui lòng chọn 1 tệp MSDS (PDF, Word, Excel).';
        return;
      }
      const saveBtn = $('#save-quick-msds-btn');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Đang tải lên...';
      }
      try {
        const msdsDocData = {
          document_no: `MSDS-${code}`,
          document_name: `MSDS - ${matName}`,
          category: 'MSDS',
          material_code: code,
          owner: supplier || 'Supplier',
          effective_date: todayStr,
          review_date: nextYearStr,
          tags: 'MSDS, SDS, Safety Data Sheet'
        };
        let msdsRecId = existingMsdsDoc ? existingMsdsDoc.id : null;
        if (msdsRecId) {
          await api('/records/' + msdsRecId, {
            method: 'PUT',
            body: JSON.stringify({ module: 'documents', data: msdsDocData, version: existingMsdsDoc.version })
          });
        } else {
          const createdDoc = await api('/records', {
            method: 'POST',
            body: JSON.stringify({ module: 'documents', data: msdsDocData })
          });
          msdsRecId = createdDoc.id;
        }
        const mBody = new FormData();
        mBody.append('file', fileInput.files[0]);
        await api('/records/' + msdsRecId + '/evidence', { method: 'POST', body: mBody });
        modal.close();
        notify('Đã tải lên tệp MSDS / SDS thành công.');
        render();
      } catch(err) {
        $('#attach-msds-error').textContent = err.message;
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = '💾 Tải lên & Lưu tệp MSDS';
        }
      }
    };
  }
}

async function openMaterialEditModal(row, focusTest = null, focusSection = null) {
  if (!row) row = { data: { usage_status: 'Đang sử dụng', required_tests: '' } };
  if (!row.data) row.data = {};
  if (row.id && (!row.related || !row.files)) {
    try {
      const fullRow = await api('/records/' + row.id);
      if (fullRow) row = fullRow;
    } catch(e) { console.error(e); }
  }
  const testTypes = await getTestTypesList();
  let reqTests = String(row.data?.required_tests || '').split(',').map(s=>s.trim()).filter(Boolean);
  const allAvailableTestTypes = [...new Set([...testTypes, ...reqTests])];

  const related = row.related || [];
  const existingReports = related.filter(r => r.module === 'reports');
  const existingFmd = related.filter(r => r.module === 'fmd');
  const declarations = related.filter(r => ['declarations', 'material-declarations'].includes(r.module));
  const existingDecl = declarations.find(r => (row.data.material_code && r.data.material_code === row.data.material_code) || (row.data.supplier && r.data.supplier === row.data.supplier));
  const hasExistingDeclFile = existingDecl?.files && existingDecl.files.length > 0;
  const existingDeclFile = hasExistingDeclFile ? existingDecl.files[0] : null;

  const documents = related.filter(r => r.module === 'documents');
  const existingMsdsDoc = documents.find(r => (row.data.material_code && r.data?.material_code === row.data.material_code) && (r.data?.category === 'MSDS' || String(r.data?.document_no||'').startsWith('MSDS-') || String(r.data?.document_name||'').toLowerCase().includes('msds')));
  const hasExistingMsdsFile = !!(existingMsdsDoc?.files && existingMsdsDoc.files.length > 0);
  const existingMsdsFile = hasExistingMsdsFile ? existingMsdsDoc.files[0] : (row.evidence || []).find(e => e.name.toLowerCase().includes('msds') || e.name.toLowerCase().includes('sds'));

  const availableReportIds = [...new Set(existingReports.map(r => r.data?.report_id).filter(Boolean))];

  function findLatestReport(testType) {
    const matching = existingReports.filter(r => r.data.test_type === testType || String(r.data.test_type||'').toLowerCase() === testType.toLowerCase());
    if (!matching.length) return null;
    return matching.sort((a,b) => String(b.data.expiry_date || '9999').localeCompare(String(a.data.expiry_date || '9999')))[0];
  }

  let displayedTests = [...new Set([...reqTests, ...existingReports.map(r => r.data.test_type).filter(Boolean)])];
  if (focusTest && !displayedTests.includes(focusTest)) {
    displayedTests.push(focusTest);
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 1);
  const nextYearStr = nextYear.toISOString().slice(0, 10);

  function renderReportCard(testType) {
    const rep = findLatestReport(testType);
    const hasF = rep?.files && rep.files.length > 0;
    const fId = hasF ? rep.files[0].id : null;
    const fName = hasF ? rep.files[0].name : '';
    const isRequired = reqTests.includes(testType);

    return `
      <div class="mat-report-card" data-test-type="${esc(testType)}" data-report-id="${rep?.id || ''}" data-report-version="${rep?.version || ''}" data-original-number="${esc(rep?.data?.report_id || '')}" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;display:flex;flex-direction:column;gap:8px;transition:border-color .2s">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-weight:700;font-size:13px;color:#1e40af;background:#eff6ff;padding:2px 8px;border-radius:4px;border:1px solid #bfdbfe">${esc(testType)}</span>
            ${rep ? `<span class="badge ${rep.data?.result==='PASS'?'good':'bad'}" style="font-size:10px">${esc(rep.data?.result || 'PASS')}</span>` : `<span class="badge warn" style="font-size:10px">Chưa nộp báo cáo</span>`}
            ${isRequired ? '<span style="font-size:10.5px;color:#059669;font-weight:600">✓ Bắt buộc</span>' : '<span style="font-size:10.5px;color:#94a3b8">(Tùy chọn)</span>'}
          </div>
          <div style="font-size:11px;color:#64748b;display:flex;align-items:center;gap:8px">
            ${rep ? `<span>Bản ghi #${rep.id}</span>` : ''}
            <button type="button" class="remove-test-card-btn link-button" data-test-type="${esc(testType)}" style="color:#ef4444;font-size:11px" title="Xóa khỏi danh sách báo cáo này">✕ Xóa</button>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1.5fr 1.2fr 0.95fr 0.95fr 0.85fr;gap:8px;align-items:end">
          <label style="margin:0;font-size:11px;color:#475569">
            Số báo cáo (Report ID)
            <input type="text" class="rep-id-input" value="${esc(rep?.data?.report_id || '')}" placeholder="VD: VNHL2510035392EE" style="margin-top:3px;font-weight:600">
          </label>
          <label style="margin:0;font-size:11px;color:#475569">
            Phòng Lab
            <input type="text" class="rep-lab-input" list="lab-suggestions" value="${esc(rep?.data?.lab || 'SGS Vietnam LTD')}" placeholder="SGS, CTI, Eurofins..." style="margin-top:3px">
          </label>
          <label style="margin:0;font-size:11px;color:#475569">
            Ngày phát hành
            <input type="date" class="rep-issue-input" value="${esc(rep?.data?.issue_date || todayStr)}" style="margin-top:3px">
          </label>
          <label style="margin:0;font-size:11px;color:#475569">
            Hạn báo cáo
            <input type="date" class="rep-expiry-input" value="${esc(rep?.data?.expiry_date || nextYearStr)}" style="margin-top:3px">
          </label>
          <label style="margin:0;font-size:11px;color:#475569">
            Kết quả
            <select class="rep-result-select" style="margin-top:3px">
              <option value="PASS" ${(!rep || rep.data?.result==='PASS')?'selected':''}>PASS</option>
              <option value="FAIL" ${(rep && rep.data?.result==='FAIL')?'selected':''}>FAIL</option>
            </select>
          </label>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;background:#fff;border:1px dashed #cbd5e1;border-radius:6px;padding:6px 12px;font-size:11.5px">
          <div class="rep-current-file">
            ${hasF
              ? `<span style="color:#059669;font-weight:600">📄 File PDF hiện có:</span> <a href="/api/evidence/${fId}" target="_blank" style="color:#2563eb;text-decoration:underline;font-weight:600">${esc(fName)}</a>`
              : `<span style="color:#d97706">⚠️ Chưa có file PDF đính kèm</span>`
            }
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <label style="cursor:pointer;display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:4px;border:1px solid #3b82f6;background:#eff6ff;color:#1d4ed8;font-size:11px;font-weight:600;margin:0">
              <input type="file" class="rep-file-input" accept=".pdf,.png,.jpg,.jpeg,.xlsx" style="display:none">
              <span>${hasF ? '🔄 Thay file PDF khác' : '📎 Chọn tệp PDF'}</span>
            </label>
            <span class="rep-selected-file-label" style="font-size:11px;font-weight:600;color:#059669"></span>
          </div>
        </div>
      </div>
    `;
  }

  function renderFmdRow(f = null) {
    const fd = f?.data || {};
    const fmdId = f?.id || '';
    const fmdVer = f?.version || '';
    const flag = fd.flag || '';
    return `
      <tr class="fmd-substance-row" data-fmd-id="${fmdId}" data-fmd-version="${fmdVer}" style="border-bottom:1px solid #f1f5f9;transition:background .15s">
        <td style="padding:6px 8px">
          <input type="text" class="fmd-cas-input" value="${esc(fd.cas || '')}" placeholder="VD: 68037-87-6" style="margin:0;padding:4px 8px;font-size:11.5px;font-family:monospace;width:100%;box-sizing:border-box">
        </td>
        <td style="padding:6px 8px">
          <input type="text" class="fmd-substance-input" value="${esc(fd.substance || '')}" placeholder="Tên hợp chất hóa học *" required style="margin:0;padding:4px 8px;font-size:11.5px;font-weight:600;width:100%;box-sizing:border-box">
        </td>
        <td style="padding:6px 8px">
          <input type="text" class="fmd-comp-input" value="${esc(fd.composition || '')}" placeholder="VD: 0.27%, ≤ 9%" style="margin:0;padding:4px 8px;font-size:11.5px;font-weight:600;color:#2563eb;width:100%;box-sizing:border-box">
        </td>
        <td style="padding:6px 8px">
          <select class="fmd-flag-select" style="margin:0;padding:4px 6px;font-size:11px;width:100%;box-sizing:border-box">
            <option value="" ${!flag ? 'selected' : ''}>✓ An toàn</option>
            <option value="SVHC" ${flag==='SVHC' ? 'selected' : ''}>⚠️ SVHC</option>
            <option value="RoHS" ${flag==='RoHS' ? 'selected' : ''}>⚠️ Vượt ngưỡng RoHS</option>
            <option value="Halogen" ${flag==='Halogen' ? 'selected' : ''}>⚠️ Halogen</option>
            <option value="Cảnh báo" ${flag && !['SVHC','RoHS','Halogen'].includes(flag) ? 'selected' : ''}>⚠️ ${esc(flag || 'Cảnh báo')}</option>
          </select>
        </td>
        <td style="padding:6px 8px">
          <input type="text" class="fmd-report-input" list="fmd-rep-suggestions" value="${esc(fd.report_id || '')}" placeholder="Số báo cáo đối chiếu" style="margin:0;padding:4px 8px;font-size:11px;width:100%;box-sizing:border-box">
        </td>
        <td style="padding:6px 4px;text-align:center">
          <button type="button" class="remove-fmd-row-btn link-button" style="color:#ef4444;font-size:13px;padding:2px 6px;cursor:pointer" title="Xóa chất này khỏi FMD">✕</button>
        </td>
      </tr>
    `;
  }

  const modalHtml = `
    <datalist id="lab-suggestions">
      <option value="SGS Vietnam LTD">
      <option value="CTI (Centre Testing International)">
      <option value="Eurofins">
      <option value="Bureau Veritas (BV)">
      <option value="TÜV Rheinland">
      <option value="Intertek">
    </datalist>
    <datalist id="fmd-rep-suggestions">
      ${availableReportIds.map(id => `<option value="${esc(id)}">`).join('')}
    </datalist>
    <div class="mat-edit-all-in-one" style="display:flex;flex-direction:column;gap:14px;max-height:76vh;overflow-y:auto;padding-right:4px">
      <!-- Card 1: Thông tin vật liệu -->
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px">
        <div style="font-size:12.5px;font-weight:700;color:#0f172a;margin-bottom:10px;display:flex;align-items:center;gap:6px">
          <span>📦 Thông tin hồ sơ vật liệu</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
          <label style="margin:0;font-size:11px;color:#475569">
            Mã vật liệu *
            <input type="text" id="edit-mat-code" value="${esc(row.data.material_code||'')}" required style="margin-top:4px;font-weight:650">
          </label>
          <label style="margin:0;font-size:11px;color:#475569">
            Tên vật liệu *
            <input type="text" id="edit-mat-name" value="${esc(row.data.material_name||'')}" required style="margin-top:4px">
          </label>
          <label style="margin:0;font-size:11px;color:#475569">
            Phân loại (Category)
            <select id="edit-mat-category" style="margin-top:4px">
              <option value="Direct Material" ${['direct material','direct'].includes(String(row.data?.category||'').trim().toLowerCase())?'selected':''}>Direct Material (Vật liệu trực tiếp)</option>
              <option value="Indirect Material" ${['indirect material','indirect'].includes(String(row.data?.category||'').trim().toLowerCase())?'selected':''}>Indirect Material (Vật liệu gián tiếp)</option>
              <option value="Raw material" ${String(row.data?.category||'').trim().toLowerCase()==='raw material'?'selected':''}>Raw material (Nguyên vật liệu chính)</option>
              <option value="Packing material" ${['packing material','packaging'].includes(String(row.data?.category||'').trim().toLowerCase())?'selected':''}>Packing material (Bao bì, đóng gói)</option>
              <option value="Finish Good" ${['finish good','finished goods'].includes(String(row.data?.category||'').trim().toLowerCase())?'selected':''}>Finish Good (Thành phẩm)</option>
              <option value="Part" ${String(row.data?.category||'').trim().toLowerCase()==='part'?'selected':''}>Part (Linh kiện phụ)</option>
              <option value="Chemical" ${String(row.data?.category||'').trim().toLowerCase()==='chemical'?'selected':''}>Chemical (Hóa chất)</option>
              ${row.data?.category && !['direct material','indirect material','raw material','packing material','finish good','finished goods','part','chemical','direct','indirect','packaging'].includes(String(row.data.category).trim().toLowerCase()) ? `<option value="${esc(row.data.category)}" selected>${esc(row.data.category)}</option>` : ''}
            </select>
          </label>
          <label style="margin:0;font-size:11px;color:#475569">
            Nhà cung cấp
            <input type="text" id="edit-mat-supplier" value="${esc(row.data.supplier||'')}" style="margin-top:4px">
          </label>
          <label style="margin:0;font-size:11px;color:#475569">
            Dự án (Model)
            <input type="text" id="edit-mat-project" value="${esc(row.data.project||'')}" style="margin-top:4px">
          </label>
          <label style="margin:0;font-size:11px;color:#475569">
            Tình trạng sử dụng
            <select id="edit-mat-status" style="margin-top:4px">
              <option value="Đang sử dụng" ${row.data.usage_status==='Đang sử dụng'?'selected':''}>Đang sử dụng</option>
              <option value="Tạm ngưng" ${row.data.usage_status==='Tạm ngưng'?'selected':''}>Tạm ngưng</option>
              <option value="Ngừng sử dụng" ${row.data.usage_status==='Ngừng sử dụng'?'selected':''}>Ngừng sử dụng</option>
            </select>
          </label>

          <!-- Ô chọn tệp Cam kết Declaration PDF của Nhà cung cấp -->
          <div style="grid-column:span 3;background:#fff;border:1px dashed #cbd5e1;border-radius:6px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:2px">
            <div>
              <span style="font-weight:650;color:#1e40af;font-size:12px;display:flex;align-items:center;gap:5px">
                📜 Tệp Cam kết của Nhà cung cấp (Supplier Declaration PDF)
              </span>
              <div id="decl-file-status" style="margin-top:2px;font-size:11px;color:#64748b">
                ${hasExistingDeclFile ? `
                  <span style="color:#059669;font-weight:600">✓ Đã có file:</span> <a href="/api/evidence/${existingDeclFile.id}" target="_blank" style="color:#2563eb;text-decoration:underline;font-weight:600">${esc(existingDeclFile.name)}</a>
                ` : `
                  <span style="color:#d97706">⚠️ Chưa có file Declaration đính kèm cho nhà cung cấp này</span>
                `}
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <label style="cursor:pointer;display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:4px;border:1px solid #3b82f6;background:#eff6ff;color:#1d4ed8;font-size:11px;font-weight:600;margin:0">
                <input type="file" id="edit-mat-decl-file" accept=".pdf,.png,.jpg,.jpeg,.xlsx" style="display:none">
                <span>${hasExistingDeclFile ? '🔄 Thay file Declaration khác' : '📎 Chọn file Declaration PDF'}</span>
              </label>
              <span id="decl-selected-label" style="font-size:11px;font-weight:600;color:#059669"></span>
            </div>
          </div>
        </div>
      </div>

      <!-- Card 2: Yêu cầu kiểm nghiệm (Required Tests) -->
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:12.5px;font-weight:700;color:#0f172a;display:flex;align-items:center;gap:6px">
            <span>⚙️ Chọn các loại kiểm nghiệm bắt buộc</span>
            <small style="font-weight:normal;color:#64748b">(Tick chọn để thêm vào danh mục báo cáo cần nộp)</small>
          </div>
          <a href="#/test-types" target="_blank" style="font-size:11px;color:#2563eb;text-decoration:none">⚙️ Quản lý loại kiểm nghiệm trong Cài đặt →</a>
        </div>
        <div id="mat-test-checkboxes" style="display:flex;flex-wrap:wrap;gap:6px">
          ${allAvailableTestTypes.map(t => {
            const isChecked = reqTests.includes(t);
            return `<label style="cursor:pointer;display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:${isChecked?'#eff6ff':'#fff'};border:1px solid ${isChecked?'#3b82f6':'#cbd5e1'};border-radius:5px;font-size:11.5px;color:${isChecked?'#1e40af':'#334155'};font-weight:${isChecked?'600':'400'};user-select:none;margin:0">
              <input type="checkbox" value="${esc(t)}" class="mat-test-type-toggle" ${isChecked?'checked':''} style="margin:0">
              <span>${esc(t)}</span>
            </label>`;
          }).join('')}
        </div>
      </div>

      <!-- Card 3: Báo cáo kiểm nghiệm phòng Lab (TRM) -->
      <div style="background:#fff;border:1px solid #dce3ec;border-radius:8px;padding:14px 16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div>
            <div style="font-size:13px;font-weight:700;color:#0f172a;display:flex;align-items:center;gap:6px">
              <span>🔬 Báo cáo kiểm nghiệm phòng Lab (TRM)</span>
            </div>
            <p style="margin:2px 0 0;font-size:11px;color:#64748b">
              Chỉnh sửa thông tin báo cáo, cập nhật hạn dùng, và tải lên file PDF trực tiếp tại đây.
            </p>
          </div>
          <button type="button" id="btn-add-extra-test-report" style="font-size:11px;padding:4px 10px;border-radius:5px;border:1px solid #cbd5e1;background:#f8fafc;color:#2563eb;font-weight:600;cursor:pointer">+ Thêm loại báo cáo khác</button>
        </div>

        <div id="mat-report-cards-list" style="display:flex;flex-direction:column;gap:10px">
          ${displayedTests.map(t => renderReportCard(t)).join('')}
        </div>
      </div>

      <!-- Card 4: Tệp MSDS / SDS & Khai báo thành phần FMD -->
      <div id="card-fmd-msds" style="background:#fff;border:1px solid #dce3ec;border-radius:8px;padding:14px 16px;transition:border-color .2s, box-shadow .2s">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <div>
            <div style="font-size:13px;font-weight:700;color:#0f172a;display:flex;align-items:center;gap:6px">
              <span>📋 Tệp MSDS / SDS & Khai báo thành phần FMD</span>
            </div>
            <p style="margin:2px 0 0;font-size:11px;color:#64748b">
              Đính kèm tệp Bảng chỉ dẫn an toàn hóa chất (MSDS / SDS) từ Nhà cung cấp và khai báo danh mục hợp chất (tùy chọn).
            </p>
          </div>
        </div>

        <!-- Khối 1: Tệp MSDS / SDS (Safety Data Sheet) -->
        <div style="background:#f8fafc;border:1px dashed #cbd5e1;border-radius:6px;padding:10px 14px;margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
            <div style="flex:1;min-width:240px">
              <span style="font-weight:700;color:#0f172a;font-size:12px;display:flex;align-items:center;gap:6px">
                📑 Tệp Bảng chỉ dẫn an toàn hóa chất (MSDS / SDS Document)
              </span>
              <div id="msds-file-status" style="margin-top:4px;font-size:11px;color:#64748b">
                ${existingMsdsFile ? `
                  <span style="color:#059669;font-weight:600">✓ Đã có file:</span> <a href="/api/evidence/${existingMsdsFile.id}" target="_blank" style="color:#2563eb;text-decoration:underline;font-weight:600">${esc(existingMsdsFile.name)}</a>
                ` : `
                  <span style="color:#d97706">⚠️ Chưa có tệp MSDS / SDS đính kèm cho vật liệu này</span>
                `}
              </div>
              <p style="margin:4px 0 0;font-size:10.5px;color:#64748b;font-style:italic">
                💡 Bạn chỉ cần tải lên file MSDS / SDS gốc của Nhà cung cấp (PDF, Word, Excel). Không bắt buộc phải nhập chi tiết từng chất hóa học bên dưới nếu đã có file này.
              </p>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              ${existingMsdsFile ? `
                <button type="button" id="btn-remove-msds-file" class="link-button" style="font-size:11px;color:#ef4444;cursor:pointer" title="Gỡ file MSDS này">🗑️ Gỡ file</button>
              ` : ''}
              <label style="cursor:pointer;display:inline-flex;align-items:center;gap:4px;padding:4px 12px;border-radius:5px;border:1px solid #3b82f6;background:#eff6ff;color:#1d4ed8;font-size:11px;font-weight:600;margin:0">
                <input type="file" id="edit-mat-msds-file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx,.doc,.txt" style="display:none">
                <span>${existingMsdsFile ? '🔄 Thay file MSDS khác' : '📎 Chọn file MSDS / SDS'}</span>
              </label>
              <span id="msds-selected-label" style="font-size:11px;font-weight:600;color:#059669"></span>
            </div>
          </div>
        </div>

        <!-- Khối 2: Bảng kê hợp chất hóa học (FMD - Tùy chọn) -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px">
          <div>
            <div style="font-size:12px;font-weight:700;color:#334155;display:flex;align-items:center;gap:6px">
              <span>Chi tiết các hợp chất hóa học (FMD - Tùy chọn)</span>
              <span id="fmd-substance-count-badge" class="badge" style="background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;font-size:10.5px">
                ${existingFmd.length} chất
              </span>
            </div>
            <p style="margin:2px 0 0;font-size:10.5px;color:#94a3b8">
              Kê khai số CAS, tên chất và hàm lượng % (chỉ cần nhập khi muốn bóc tách chi tiết từng chất).
            </p>
          </div>
          <button type="button" id="btn-add-fmd-row" class="secondary" style="font-size:11px;padding:3px 10px;border-radius:4px;display:flex;align-items:center;gap:4px;cursor:pointer">
            + Thêm chất FMD (tùy chọn)
          </button>
        </div>

        <div style="border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;background:#fff">
          <div class="table-scroll" style="max-height:240px;overflow-y:auto">
            <table style="margin:0;font-size:11.5px;width:100%;border-collapse:collapse">
              <thead style="position:sticky;top:0;background:#f8fafc;z-index:2;border-bottom:1px solid #cbd5e1">
                <tr>
                  <th style="padding:7px 8px;width:130px;font-weight:600;color:#334155;text-align:left">Số CAS (CAS No.)</th>
                  <th style="padding:7px 8px;font-weight:600;color:#334155;text-align:left">Tên hợp chất (Substance) *</th>
                  <th style="padding:7px 8px;width:110px;font-weight:600;color:#334155;text-align:left">Hàm lượng (%)</th>
                  <th style="padding:7px 8px;width:135px;font-weight:600;color:#334155;text-align:left">Cảnh báo (Flag)</th>
                  <th style="padding:7px 8px;width:180px;font-weight:600;color:#334155;text-align:left">Báo cáo đối chiếu</th>
                  <th style="padding:7px 6px;width:40px;text-align:center"></th>
                </tr>
              </thead>
              <tbody id="fmd-substances-tbody">
                ${existingFmd.map(renderFmdRow).join('')}
                <tr id="fmd-empty-row" style="${existingFmd.length ? 'display:none' : ''}">
                  <td colspan="6" style="text-align:center;padding:16px;color:#94a3b8;font-size:11px">
                    Chưa có hợp chất nào được nhập riêng lẻ. <i>(Nếu đã đính kèm file MSDS ở trên thì không cần nhập thêm các chất này).</i>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div id="mat-edit-all-error" class="form-error"></div>
    </div>
  `;

  openModal('✏️ Chỉnh sửa hồ sơ vật liệu: ' + (row.data.material_code || label(row)), modalHtml, `
    <button data-close>Hủy</button>
    <button type="button" class="primary" id="save-mat-all-btn" style="padding:6px 18px;font-size:12.5px;font-weight:600">💾 Lưu tất cả thay đổi</button>
  `);

  modal.style.maxWidth = '960px';
  modal.style.width = '95vw';

  function bindCardEvents(card) {
    const fileInp = card.querySelector('.rep-file-input');
    const fileLbl = card.querySelector('.rep-selected-file-label');
    const repIdInp = card.querySelector('.rep-id-input');
    const issueInp = card.querySelector('.rep-issue-input');
    const expInp = card.querySelector('.rep-expiry-input');

    if (fileInp) {
      fileInp.onchange = () => {
        if (fileInp.files[0]) {
          const f = fileInp.files[0];
          fileLbl.textContent = `✓ Đã chọn: ${f.name} (${(f.size/1024).toFixed(1)} KB)`;
          if (repIdInp && !repIdInp.value.trim()) {
            repIdInp.value = f.name.replace(/\.[^/.]+$/, '');
          }
        }
      };
    }

    if (issueInp && expInp) {
      issueInp.onchange = () => {
        if (issueInp.value) {
          const d = new Date(issueInp.value);
          d.setFullYear(d.getFullYear() + 1);
          expInp.value = d.toISOString().slice(0, 10);
        }
      };
    }
  }

  modal.querySelectorAll('.mat-report-card').forEach(bindCardEvents);

  const declFileInput = modal.querySelector('#edit-mat-decl-file');
  const declFileLabel = modal.querySelector('#decl-selected-label');
  if (declFileInput && declFileLabel) {
    declFileInput.onchange = () => {
      if (declFileInput.files[0]) {
        const f = declFileInput.files[0];
        declFileLabel.textContent = `✓ Đã chọn: ${f.name} (${(f.size/1024).toFixed(1)} KB)`;
      }
    };
  }

  modal.querySelectorAll('.mat-test-type-toggle').forEach(chk => {
    chk.onchange = () => {
      const t = chk.value;
      const lbl = chk.closest('label');
      if (lbl) {
        lbl.style.background = chk.checked ? '#eff6ff' : '#fff';
        lbl.style.borderColor = chk.checked ? '#3b82f6' : '#cbd5e1';
        lbl.style.color = chk.checked ? '#1e40af' : '#334155';
        lbl.style.fontWeight = chk.checked ? '600' : '400';
      }

      if (chk.checked) {
        if (!reqTests.includes(t)) reqTests.push(t);
        const existingCard = modal.querySelector(`.mat-report-card[data-test-type="${CSS.escape(t)}"]`);
        if (!existingCard) {
          const list = modal.querySelector('#mat-report-cards-list');
          const temp = document.createElement('div');
          temp.innerHTML = renderReportCard(t);
          const newCard = temp.firstElementChild;
          list.appendChild(newCard);
          bindCardEvents(newCard);
          bindDeleteCard(newCard);
        }
      } else {
        reqTests = reqTests.filter(x => x !== t);
      }
    };
  });

  function bindDeleteCard(card) {
    const delBtn = card.querySelector('.remove-test-card-btn');
    if (delBtn) {
      delBtn.onclick = () => {
        const testType = card.dataset.testType;
        const repId = card.dataset.reportId;
        if (repId) {
          if (!confirm(`Xóa phần nhập báo cáo cho ${testType}? Báo cáo cũ vẫn được bảo lưu trong cơ sở dữ liệu.`)) return;
        }
        card.remove();
        const chk = modal.querySelector(`.mat-test-type-toggle[value="${CSS.escape(testType)}"]`);
        if (chk) {
          chk.checked = false;
          chk.dispatchEvent(new Event('change'));
        }
      };
    }
  }

  modal.querySelectorAll('.mat-report-card').forEach(bindDeleteCard);

  const addExtraBtn = modal.querySelector('#btn-add-extra-test-report');
  if (addExtraBtn) {
    addExtraBtn.onclick = () => {
      const extraName = prompt('Nhập tên loại kiểm nghiệm mới (VD: PFAS, Antimony, SCCP, PAHs...):');
      if (!extraName || !extraName.trim()) return;
      const t = extraName.trim();
      const existingCard = modal.querySelector(`.mat-report-card[data-test-type="${CSS.escape(t)}"]`);
      if (existingCard) {
        existingCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        existingCard.style.borderColor = '#2563eb';
        return;
      }
      if (!reqTests.includes(t)) reqTests.push(t);
      const list = modal.querySelector('#mat-report-cards-list');
      const temp = document.createElement('div');
      temp.innerHTML = renderReportCard(t);
      const newCard = temp.firstElementChild;
      list.appendChild(newCard);
      bindCardEvents(newCard);
      bindDeleteCard(newCard);
      newCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      newCard.style.borderColor = '#2563eb';
    };
  }

  if (focusTest) {
    setTimeout(() => {
      const targetCard = modal.querySelector(`.mat-report-card[data-test-type="${CSS.escape(focusTest)}"]`);
      if (targetCard) {
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetCard.style.borderColor = '#2563eb';
        targetCard.style.boxShadow = '0 0 0 2px #bfdbfe';
      }
    }, 150);
  }

  const deletedFmdIds = new Set();

  function updateFmdCount() {
    const rows = modal.querySelectorAll('.fmd-substance-row');
    const badge = modal.querySelector('#fmd-substance-count-badge');
    if (badge) badge.textContent = `${rows.length} chất`;
    const emptyRow = modal.querySelector('#fmd-empty-row');
    if (emptyRow) {
      emptyRow.style.display = rows.length === 0 ? '' : 'none';
    }
  }

  function bindFmdRowEvents(rowEl) {
    const delBtn = rowEl.querySelector('.remove-fmd-row-btn');
    if (delBtn) {
      delBtn.onclick = () => {
        const fmdId = rowEl.dataset.fmdId;
        const subName = rowEl.querySelector('.fmd-substance-input')?.value || 'chất này';
        if (fmdId) {
          if (!confirm(`Xác nhận xóa hợp chất "${subName}" khỏi khai báo FMD / MSDS?`)) return;
          deletedFmdIds.add(fmdId);
        }
        rowEl.remove();
        updateFmdCount();
      };
    }
  }

  modal.querySelectorAll('.fmd-substance-row').forEach(bindFmdRowEvents);

  const addFmdRowBtn = modal.querySelector('#btn-add-fmd-row');
  if (addFmdRowBtn) {
    addFmdRowBtn.onclick = () => {
      const tbody = modal.querySelector('#fmd-substances-tbody');
      const temp = document.createElement('tbody');
      temp.innerHTML = renderFmdRow(null);
      const newRow = temp.firstElementChild;
      const emptyRow = modal.querySelector('#fmd-empty-row');
      if (emptyRow) emptyRow.style.display = 'none';
      tbody.appendChild(newRow);
      bindFmdRowEvents(newRow);
      updateFmdCount();
      newRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const inp = newRow.querySelector('.fmd-substance-input');
      if (inp) inp.focus();
    };
  }

  if (focusSection === 'fmd') {
    setTimeout(() => {
      const fmdCard = modal.querySelector('#card-fmd-msds');
      if (fmdCard) {
        fmdCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        fmdCard.style.borderColor = '#2563eb';
        fmdCard.style.boxShadow = '0 0 0 2px #bfdbfe';
      }
    }, 200);
  }

  let removeExistingMsds = false;
  const msdsFileInput = modal.querySelector('#edit-mat-msds-file');
  const msdsFileLabel = modal.querySelector('#msds-selected-label');
  const removeMsdsBtn = modal.querySelector('#btn-remove-msds-file');
  const msdsStatus = modal.querySelector('#msds-file-status');

  if (msdsFileInput) {
    msdsFileInput.onchange = () => {
      if (msdsFileInput.files[0]) {
        const f = msdsFileInput.files[0];
        removeExistingMsds = false;
        if (msdsFileLabel) msdsFileLabel.textContent = `✓ Đã chọn: ${f.name} (${(f.size/1024).toFixed(1)} KB)`;
        if (msdsStatus) msdsStatus.innerHTML = `<span style="color:#059669;font-weight:600">✓ Đã chọn file mới:</span> <b>${esc(f.name)}</b> (${(f.size/1024).toFixed(1)} KB)`;
        if (removeMsdsBtn) removeMsdsBtn.style.display = '';
      }
    };
  }

  if (removeMsdsBtn) {
    removeMsdsBtn.onclick = () => {
      if (confirm('Xác nhận gỡ tệp MSDS / SDS này khỏi hồ sơ vật liệu?')) {
        removeExistingMsds = true;
        if (msdsFileInput) msdsFileInput.value = '';
        if (msdsFileLabel) msdsFileLabel.textContent = '';
        if (msdsStatus) msdsStatus.innerHTML = `<span style="color:#ef4444;font-weight:600">✕ Sẽ gỡ tệp MSDS khi lưu</span>`;
        removeMsdsBtn.style.display = 'none';
      }
    };
  }

  const saveBtn = modal.querySelector('#save-mat-all-btn');
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const code = modal.querySelector('#edit-mat-code').value.trim();
      const name = modal.querySelector('#edit-mat-name').value.trim();
      const errBox = modal.querySelector('#mat-edit-all-error');

      if (!code || !name) {
        errBox.textContent = 'Vui lòng nhập đầy đủ Mã vật liệu và Tên vật liệu.';
        return;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = 'Đang lưu dữ liệu...';

      try {
        const checkedTests = Array.from(modal.querySelectorAll('.mat-test-type-toggle:checked')).map(c => c.value);

        const updatedMatData = {
          ...row.data,
          material_code: code,
          material_name: name,
          category: modal.querySelector('#edit-mat-category').value.trim(),
          supplier: modal.querySelector('#edit-mat-supplier').value.trim(),
          project: modal.querySelector('#edit-mat-project').value.trim(),
          usage_status: modal.querySelector('#edit-mat-status').value,
          required_tests: checkedTests.join(', ')
        };
        delete updatedMatData.status;

        if (row.id) {
          await api('/records/' + row.id, {
            method: 'PUT',
            body: JSON.stringify({ module: 'materials', data: updatedMatData, version: row.version })
          });
        } else {
          const createdMat = await api('/records', {
            method: 'POST',
            body: JSON.stringify({ module: 'materials', data: updatedMatData })
          });
          row.id = createdMat.id;
        }

        // Save Supplier Declaration file if selected
        if (declFileInput && declFileInput.files && declFileInput.files[0]) {
          const dFile = declFileInput.files[0];
          const supName = updatedMatData.supplier || 'Supplier';
          const declData = {
            declaration_no: `${supName}_Declaration`,
            material_code: code,
            supplier: updatedMatData.supplier || '',
            scope: `Cam kết tuân thủ của nhà cung cấp cho ${code}`,
            issue_date: todayStr,
            expiry_date: nextYearStr,
            approval: 'Approved',
            status: 'Completed'
          };

          let declRecId = existingDecl ? existingDecl.id : null;
          if (declRecId) {
            await api('/records/' + declRecId, {
              method: 'PUT',
              body: JSON.stringify({ module: 'material-declarations', data: declData, version: existingDecl.version })
            });
          } else {
            const createdDecl = await api('/records', {
              method: 'POST',
              body: JSON.stringify({ module: 'material-declarations', data: declData })
            });
            declRecId = createdDecl.id;
          }

          const dBody = new FormData();
          dBody.append('file', dFile);
          await api('/records/' + declRecId + '/evidence', { method: 'POST', body: dBody });
        }

        // Save MSDS file if removed or selected
        if (removeExistingMsds && existingMsdsDoc) {
          try {
            await api('/records/' + existingMsdsDoc.id + '?version=' + existingMsdsDoc.version, { method: 'DELETE' });
          } catch(e) { console.warn('Could not archive old MSDS doc:', e); }
        }

        if (msdsFileInput && msdsFileInput.files && msdsFileInput.files[0]) {
          const mFile = msdsFileInput.files[0];
          const msdsDocData = {
            document_no: `MSDS-${code}`,
            document_name: `MSDS - ${updatedMatData.material_name || code}`,
            category: 'MSDS',
            material_code: code,
            owner: updatedMatData.supplier || 'Supplier',
            effective_date: todayStr,
            review_date: nextYearStr,
            tags: 'MSDS, SDS, Safety Data Sheet'
          };

          let msdsRecId = existingMsdsDoc && !removeExistingMsds ? existingMsdsDoc.id : null;
          if (msdsRecId) {
            await api('/records/' + msdsRecId, {
              method: 'PUT',
              body: JSON.stringify({ module: 'documents', data: msdsDocData, version: existingMsdsDoc.version })
            });
          } else {
            const createdDoc = await api('/records', {
              method: 'POST',
              body: JSON.stringify({ module: 'documents', data: msdsDocData })
            });
            msdsRecId = createdDoc.id;
          }

          const mBody = new FormData();
          mBody.append('file', mFile);
          await api('/records/' + msdsRecId + '/evidence', { method: 'POST', body: mBody });
        }

        const cards = modal.querySelectorAll('.mat-report-card');
        let repCreated = 0;
        let repUpdated = 0;

        for (const card of cards) {
          const testType = card.dataset.testType;
          const repId = card.querySelector('.rep-id-input').value.trim();
          const lab = card.querySelector('.rep-lab-input').value.trim();
          const issueDate = card.querySelector('.rep-issue-input').value;
          const expiryDate = card.querySelector('.rep-expiry-input').value;
          const result = card.querySelector('.rep-result-select').value;
          const fileInput = card.querySelector('.rep-file-input');
          const hasNewFile = fileInput && fileInput.files && fileInput.files[0];
          const existingRecId = card.dataset.reportId;
          const existingVersion = Number(card.dataset.reportVersion);
          const origNumber = card.dataset.originalNumber;

          if (!repId && !hasNewFile) {
            continue;
          }

          const repData = {
            material_code: updatedMatData.material_code,
            material_name: updatedMatData.material_name,
            supplier: updatedMatData.supplier,
            project: updatedMatData.project,
            category: updatedMatData.category,
            test_type: testType,
            report_id: repId,
            lab: lab,
            result: result,
            issue_date: issueDate,
            expiry_date: expiryDate,
            status: result === 'PASS' ? 'Completed' : 'NG'
          };

          let targetReportId = null;

          if (existingRecId && (!origNumber || origNumber === repId)) {
            await api('/records/' + existingRecId, {
              method: 'PUT',
              body: JSON.stringify({ module: 'reports', data: repData, version: existingVersion })
            });
            targetReportId = existingRecId;
            repUpdated++;
          } else {
            const created = await api('/records', {
              method: 'POST',
              body: JSON.stringify({ module: 'reports', data: repData })
            });
            targetReportId = created.id;
            repCreated++;
          }

          if (hasNewFile && targetReportId) {
            const body = new FormData();
            body.append('file', fileInput.files[0]);
            await api('/records/' + targetReportId + '/evidence', { method: 'POST', body });
          }
        }

        // Save FMD & MSDS rows
        const fmdRowEls = modal.querySelectorAll('.fmd-substance-row');
        let fmdCreated = 0;
        let fmdUpdated = 0;
        let fmdDeleted = 0;

        for (const fRow of fmdRowEls) {
          const cas = fRow.querySelector('.fmd-cas-input')?.value.trim() || '';
          const substance = fRow.querySelector('.fmd-substance-input')?.value.trim() || '';
          const composition = fRow.querySelector('.fmd-comp-input')?.value.trim() || '';
          const flag = fRow.querySelector('.fmd-flag-select')?.value.trim() || '';
          const reportId = fRow.querySelector('.fmd-report-input')?.value.trim() || '';
          const fmdId = fRow.dataset.fmdId;
          const fmdVer = Number(fRow.dataset.fmdVersion) || 1;

          if (!cas && !substance && !composition && !reportId) continue;

          if (!substance) {
            errBox.textContent = 'Vui lòng nhập Tên hợp chất cho tất cả các dòng trong bảng FMD & MSDS.';
            saveBtn.disabled = false;
            saveBtn.textContent = '💾 Lưu tất cả thay đổi';
            return;
          }

          const fmdData = {
            material_code: updatedMatData.material_code,
            material_name: updatedMatData.material_name,
            supplier: updatedMatData.supplier,
            project: updatedMatData.project,
            cas: cas,
            substance: substance,
            composition: composition,
            flag: flag,
            report_id: reportId,
            result: flag ? 'WARNING' : 'PASS',
            status: 'Completed'
          };

          if (fmdId) {
            await api('/records/' + fmdId, {
              method: 'PUT',
              body: JSON.stringify({ module: 'fmd', data: fmdData, version: fmdVer })
            });
            fmdUpdated++;
          } else {
            await api('/records', {
              method: 'POST',
              body: JSON.stringify({ module: 'fmd', data: fmdData })
            });
            fmdCreated++;
          }
        }

        for (const delId of deletedFmdIds) {
          const ef = existingFmd.find(x => String(x.id) === String(delId));
          if (ef) {
            await api('/records/' + ef.id + '?version=' + ef.version, { method: 'DELETE' });
            fmdDeleted++;
          }
        }

        modal.close();
        modal.style.maxWidth = '';
        modal.style.width = '';
        const fmdSummary = (fmdCreated || fmdUpdated || fmdDeleted) ? ` [FMD: ${fmdCreated ? `+${fmdCreated} chất, ` : ''}${fmdUpdated ? `${fmdUpdated} cập nhật, ` : ''}${fmdDeleted ? `-${fmdDeleted} xóa` : ''}]` : '';
        notify(`Đã lưu thay đổi hồ sơ vật liệu thành công! ${repCreated ? `(+${repCreated} báo cáo mới) ` : ''}${repUpdated ? `(${repUpdated} báo cáo đã cập nhật)` : ''}${fmdSummary}`);
        render();
      } catch(err) {
        errBox.textContent = err.message;
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = '💾 Lưu tất cả thay đổi';
        }
      }
    };
  }
}

const openUploadReportModal = openMaterialEditModal;

function detailPage(row){
  const config=catalog.modules[row.module];
  const d=row.data;
  let xrfLinkHtml = '';
  if (row.module === 'xrf-iqc') {
    xrfLinkHtml = '<div id="xrf-link-info" style="margin-bottom:15px;padding:12px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;display:flex;align-items:center;gap:8px;"><span class="spinner" style="width:16px;height:16px;border-width:2px;"></span> Đang kiểm tra liên kết danh mục NVL...</div>';
  }
  let materialHistoryHtml = '';
  if (row.module === 'materials') {
    materialHistoryHtml = '<div id="material-xrf-history" style="margin-top:20px;"><div style="padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;display:flex;align-items:center;gap:8px;"><span class="spinner" style="width:16px;height:16px;border-width:2px;"></span> Đang tải lịch sử test XRF...</div></div>';
  }

  const sections=config.fields.filter(f=>d[f.key]!==undefined&&d[f.key]!=='');
  let actionsHtml=`<button data-route="${row.module}">← Danh sách</button>${can(row.module,'Edit')?'<button id="edit-record" class="primary">Chỉnh sửa</button>':''}${can(row.module,'Delete')?'<button id="archive-record" class="danger">Lưu trữ</button>':''}`;

  if (row.module === 'materials') {
    let req_tests = d.required_tests;
    if(typeof req_tests === 'string') req_tests = req_tests.split(',').map(x => x.trim()).filter(Boolean);
    if(!Array.isArray(req_tests)) req_tests = [];

    const related = row.related || [];
    const boms = related.filter(r => r.module === 'bom');
    const testReports = related.filter(r => r.module === 'reports');
    const fmdRecords = related.filter(r => r.module === 'fmd');
    const declarations = related.filter(r => ['declarations', 'material-declarations'].includes(r.module));
    const decl = declarations.find(r => (d.material_code && r.data.material_code === d.material_code) || (d.supplier && r.data.supplier === d.supplier));
    const hasDeclFile = decl?.files && decl.files.length > 0;
    const declFile = hasDeclFile ? decl.files[0] : null;
    const declName = decl?.data?.declaration_no || (d.supplier ? `${d.supplier}_Declaration` : 'Declaration');

    const documents = related.filter(r => r.module === 'documents');
    const msdsDoc = documents.find(r => (d.material_code && r.data?.material_code === d.material_code) && (r.data?.category === 'MSDS' || String(r.data?.document_no||'').startsWith('MSDS-') || String(r.data?.document_name||'').toLowerCase().includes('msds')));
    const msdsDocFile = msdsDoc?.files && msdsDoc.files.length > 0 ? msdsDoc.files[0] : null;
    const matMsdsEvidence = (row.evidence || []).find(e => e.name.toLowerCase().includes('msds') || e.name.toLowerCase().includes('sds'));
    const msdsFile = msdsDocFile || matMsdsEvidence;
    const hasMsds = !!msdsFile;
    const msdsFileName = msdsFile ? msdsFile.name : (d.msds_file_name || 'Tệp MSDS / SDS');

    let reqValid = 0;
    const activeReports = [];
    const archivedReports = [];

    req_tests.forEach(rt => {
      const matching = testReports.filter(r => r.data.test_type === rt || String(r.data.test_type || '').toLowerCase() === rt.toLowerCase());
      if (!matching.length) {
        activeReports.push({ test: rt, status: 'Missing', statusText: 'Chưa có báo cáo', report: null });
        return;
      }
      const sorted = matching.sort((a,b) => String(b.data.expiry_date || '9999').localeCompare(String(a.data.expiry_date || '9999')));
      const latest = sorted[0];
      const res = String(latest.data.result || '').toUpperCase();
      const validity = latest.display_status;
      if (res === 'FAIL' || ['Expired', 'Overdue', 'NG'].includes(validity)) {
        activeReports.push({ test: rt, status: 'NG', statusText: res === 'FAIL' ? 'FAIL' : 'Quá hạn', report: latest });
      } else if (res === 'PASS') {
        reqValid++;
        activeReports.push({ test: rt, status: validity === 'Expiring Soon' ? 'Expiring' : 'PASS', statusText: validity === 'Expiring Soon' ? 'Sắp hết hạn' : 'PASS', report: latest });
      } else {
        activeReports.push({ test: rt, status: 'Pending', statusText: 'Chờ đánh giá', report: latest });
      }

      for (let i = 1; i < sorted.length; i++) {
        archivedReports.push({ test: rt, report: sorted[i], reason: 'Đã được thay thế bởi phiên bản mới' });
      }
    });

    const usedIds = new Set(activeReports.map(a => a.report?.id).filter(Boolean).concat(archivedReports.map(a => a.report?.id).filter(Boolean)));
    const otherReports = testReports.filter(r => !usedIds.has(r.id));
    otherReports.forEach(r => {
      const validity = r.display_status;
      if (['Expired', 'NG', 'Overdue'].includes(validity)) {
        archivedReports.push({ test: r.data.test_type || 'Khác', report: r, reason: 'Báo cáo đã hết hạn' });
      } else {
        activeReports.push({ test: r.data.test_type || 'Khác', status: 'PASS', statusText: 'Bổ sung', report: r });
      }
    });

    const isAllPass = req_tests.length > 0 && reqValid === req_tests.length;
    const hasNG = activeReports.some(t => t.status === 'NG');
    const compStatus = hasNG ? 'Non-Compliant' : isAllPass ? 'Compliant' : (req_tests.length ? 'Pending' : 'N/A');

    let statusBadge = '';
    if (compStatus === 'Compliant') {
      statusBadge = `<span class="badge good" style="font-size:11px;font-weight:600">✓ Đạt chuẩn (HSF Compliant)</span>`;
    } else if (compStatus === 'Non-Compliant') {
      statusBadge = `<span class="badge bad" style="font-size:11px;font-weight:600">✕ Rủi ro (NG / Quá hạn)</span>`;
    } else if (compStatus === 'Pending') {
      statusBadge = `<span class="badge warn" style="font-size:11px;font-weight:600">⚠️ Chờ bổ sung (${reqValid}/${req_tests.length})</span>`;
    } else {
      statusBadge = `<span class="badge" style="font-size:11px;background:#f1f5f9;color:#475569;border:1px solid #cbd5e1">Không yêu cầu kiểm nghiệm</span>`;
    }
    const usageBadge = `<span class="badge ${d.usage_status==='Ngừng sử dụng'?'bad':d.usage_status==='Tạm ngưng'?'warn':'good'}" style="font-size:11px">${esc(d.usage_status || 'Đang sử dụng')}</span>`;

    // Build Active Test Report Rows (Laboratory test reports only - TRM)
    let reportRowsHtml = '';
    activeReports.forEach(td => {
      if (td.report) {
        const r = td.report;
        const hasF = r.files && r.files.length > 0;
        const fId = hasF ? r.files[0].id : null;
        const resPass = String(r.data.result || '').toUpperCase() === 'PASS';
        reportRowsHtml += `<tr>
          <td><b style="color:#0f172a">${esc(td.test)}</b></td>
          <td>
            ${hasF
              ? `<a href="/api/evidence/${fId}" target="_blank" style="font-weight:650;color:#2563eb;text-decoration:none" title="Bấm để mở / tải file PDF về máy">${esc(r.data.report_id || label(r))} 📄</a>`
              : `<button type="button" class="link-button" data-attach-report-file="${r.id}" data-report-name="${esc(r.data.report_id || label(r))}" style="font-weight:600;color:#334155" title="Chưa có file PDF đính kèm. Bấm để tải file lên!">${esc(r.data.report_id || label(r))} <small style="color:#d97706;font-size:10px;font-weight:normal">⚠️ Chưa có file</small></button>`
            }
          </td>
          <td>${esc(r.data.lab || '—')}</td>
          <td>${r.data.expiry_date ? dateText(r.data.expiry_date) : '—'}</td>
          <td><span class="badge ${resPass?'good':'bad'}">${esc(r.data.result || 'PASS')}</span></td>
          <td>${badge(r.display_status)}</td>
          <td>
            ${hasF
              ? `<a href="/api/evidence/${fId}" target="_blank" class="badge good" style="font-size:10.5px;text-decoration:none;font-weight:600" title="Tải file PDF về máy">📥 Tải PDF</a>`
              : `<button type="button" class="link-button" data-attach-report-file="${r.id}" data-report-name="${esc(r.data.report_id || label(r))}" style="font-size:11px;color:#2563eb;font-weight:600">+ Đính kèm PDF</button>`
            }
          </td>
        </tr>`;
      } else {
        reportRowsHtml += `<tr style="background:#fffbeb">
          <td><b style="color:#92400e">${esc(td.test)}</b></td>
          <td colspan="4" style="color:#d97706;font-size:11.5px">⚠️ Chưa nộp báo cáo kiểm nghiệm cho mục này</td>
          <td><span class="badge warn">Thiếu</span></td>
          <td style="color:#94a3b8;font-size:11.5px">—</td>
        </tr>`;
      }
    });

    if (!reportRowsHtml) {
      reportRowsHtml = req_tests.length
        ? `<tr><td colspan="7" class="muted" style="text-align:center;padding:24px">Chưa có dữ liệu báo cáo kiểm nghiệm phòng Lab cho vật liệu này.</td></tr>`
        : `<tr><td colspan="7" class="muted" style="text-align:center;padding:24px">Không yêu cầu báo cáo kiểm nghiệm cho vật liệu này.</td></tr>`;
    }

    const archivedHtml = `
      <details style="margin:4px 8px 6px;border:1px solid #e2e8f0;border-radius:6px;background:#f8fafc;padding:4px 8px;font-size:11px">
        <summary style="cursor:pointer;font-weight:600;color:#475569;display:flex;justify-content:space-between;align-items:center;user-select:none">
          <span>🗄️ Kho lưu trữ & Lịch sử báo cáo cũ (${archivedReports.length})</span>
          <small style="font-weight:normal;color:#94a3b8">Báo cáo các năm trước được lưu trữ tự động khi gia hạn</small>
        </summary>
        <div style="margin-top:6px;background:#fff;border-radius:4px;border:1px solid #e2e8f0;overflow:hidden">
          ${archivedReports.length ? `
            <table>
              <thead>
                <tr>
                  <th>Loại test</th>
                  <th>Số báo cáo cũ</th>
                  <th>Phòng Lab</th>
                  <th>Hạn dùng cũ</th>
                  <th>Kết quả</th>
                  <th>Trạng thái</th>
                  <th>Lý do lưu trữ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${archivedReports.map(ar => {
                  const r = ar.report;
                  const hasF = r.files && r.files.length > 0;
                  const fId = hasF ? r.files[0].id : null;
                  return `<tr style="opacity:0.85;background:#fcfcfc">
                    <td><b>${esc(ar.test)}</b></td>
                    <td>${hasF ? `<a href="/api/evidence/${fId}" target="_blank" style="color:#2563eb;font-weight:600;text-decoration:none">${esc(r.data.report_id || label(r))} 📄</a>` : `<button type="button" class="link-button" data-attach-report-file="${r.id}" data-report-name="${esc(r.data.report_id || label(r))}">${esc(r.data.report_id || label(r))} <small style="color:#f59e0b">⚠️ Chưa có file</small></button>`}</td>
                    <td>${esc(r.data.lab || '—')}</td>
                    <td>${r.data.expiry_date ? dateText(r.data.expiry_date) : '—'}</td>
                    <td>${r.data.result ? `<span class="badge ${r.data.result==='PASS'?'good':'bad'}">${esc(r.data.result)}</span>` : '—'}</td>
                    <td><span class="badge bad">${esc(r.display_status || 'Expired')}</span></td>
                    <td style="color:#64748b;font-size:10.5px">${esc(ar.reason)}</td>
                    <td>${hasF ? `<a href="/api/evidence/${fId}" target="_blank" class="badge" style="text-decoration:none;font-size:10px">📥 Tải PDF</a>` : `<button type="button" class="link-button" data-attach-report-file="${r.id}" data-report-name="${esc(r.data.report_id || label(r))}" style="font-size:10.5px;color:#2563eb">+ Đính kèm PDF</button>`}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          ` : '<div style="padding:10px;text-align:center;color:#94a3b8;font-size:11px">Chưa có báo cáo cũ nào trong kho lưu trữ (tất cả báo cáo hiện tại đều đang là phiên bản mới nhất).</div>'}
        </div>
      </details>
    `;

    // Build FMD & MSDS Rows (Chemical composition / CAS disclosure)
    let fmdRowsHtml = '';
    if (fmdRecords.length) {
      fmdRowsHtml = fmdRecords.map(f => {
        const fd = f.data || {};
        const hasFlag = !!fd.flag;
        return `<tr>
          <td><code style="font-size:11px;background:#f1f5f9;padding:1px 5px;border-radius:4px;color:#0f172a">${esc(fd.cas || '—')}</code></td>
          <td><b style="color:#0f172a">${esc(fd.substance || '—')}</b></td>
          <td><span style="font-weight:600;color:#2563eb">${esc(fd.composition || '—')}</span></td>
          <td>${hasFlag ? `<span class="badge bad" title="${esc(fd.investigation||'')}">⚠️ ${esc(fd.flag)}</span>` : '<span class="badge good">An toàn</span>'}</td>
          <td>${fd.report_id ? `<span style="font-size:11px;color:#475569">${esc(fd.report_id)}</span>` : '—'}</td>
          <td><button class="link-button" data-open="${f.id}">Xem FMD →</button></td>
        </tr>`;
      }).join('');
    } else {
      fmdRowsHtml = `<tr><td colspan="6" class="muted" style="text-align:center;padding:24px">
        ${hasMsds ? 'Hồ sơ an toàn hóa chất đã được lưu trữ qua tệp MSDS / SDS đính kèm ở trên. (Không bắt buộc phải nhập chi tiết từng chất hóa học).' : 'Chưa có dữ liệu khai báo thành phần FMD & MSDS cho vật liệu này.'}
        ${can('materials','Edit')||can('documents','Create')?`<div style="margin-top:6px"><button type="button" class="link-button" id="empty-add-fmd-btn" style="color:#2563eb;font-size:11.5px;font-weight:600;cursor:pointer">✏️ Bấm vào 'Chỉnh sửa' để tải file MSDS hoặc khai báo FMD →</button></div>`:''}
      </td></tr>`;
    }

    const historyHtml = `<section class="card detail-compact-card" style="margin-bottom:8px"><div class="card-header" style="padding:6px 14px"><h3 style="font-size:12px;margin:0">Evidence & phiên bản file (${row.evidence?.length||0})</h3>${can(row.module,'Upload')?'<label style="margin:0"><input type="file" id="evidence-file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx,.txt" hidden><button id="upload-evidence" style="padding:2px 8px;font-size:11px">↑ Đính kèm file</button></label>':''}</div>${row.evidence.length?`<div class="table-scroll"><table><thead><tr><th>File</th><th>Người upload</th><th>Ngày</th><th>Dung lượng</th><th></th></tr></thead><tbody>${row.evidence.map(e=>`<tr><td title="SHA256: ${e.checksum}">${esc(e.name)}</td><td>${esc(e.uploader)}</td><td>${dateText(e.created_at)}</td><td>${(e.size/1024).toFixed(1)} KB</td><td>${['application/pdf','image/png','image/jpeg'].includes(e.mime)?`<button class="link-button" data-preview="${e.id}">Preview</button> · `:''}<a href="/api/evidence/${e.id}">Tải xuống</a></td></tr>`).join('')}</tbody></table></div>`:empty('Chưa có file evidence','Chưa có tệp đính kèm nào.')}</section><section class="card detail-compact-card" style="margin:0"><div class="card-header" style="padding:6px 14px"><h3 style="font-size:12px;margin:0">Lịch sử thay đổi & Audit trail (${row.history?.length||0})</h3></div><div class="card-body" style="padding:8px 14px">${row.history.map(h=>`<details style="margin-top:4px"><summary style="font-size:11px">${timeText(h.at)} · ${esc(h.actor)} · ${esc(h.action)}</summary><div class="form-grid" style="gap:8px;margin-top:4px"><pre style="padding:6px;font-size:10.5px">Trước\n${esc(JSON.stringify(h.before,null,2))}</pre><pre style="padding:6px;font-size:10.5px">Sau\n${esc(JSON.stringify(h.after,null,2))}</pre></div></details>`).join('')||'<p class="muted" style="margin:0;font-size:11px">Chưa có thay đổi sau khi nhập dữ liệu nguồn.</p>'}</div></section>`;

    const matActionsHtml = `${can(row.module,'Edit')?'<button id="edit-record" class="primary" style="font-size:12px;padding:4px 12px;display:flex;align-items:center;gap:4px">✏️ Chỉnh sửa</button>':''}${can(row.module,'Delete')?'<button id="archive-record" class="danger" style="font-size:12px;padding:4px 10px;display:flex;align-items:center;gap:4px" title="Lưu trữ / Vô hiệu hóa vật liệu này">🗑️ Lưu trữ</button>':''}`;

    return `
      <div class="detail-top-bar" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:12px; flex-wrap:wrap">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap">
          <button class="link-button" data-route="materials" style="font-size:12.5px; color:#475569; display:flex; align-items:center; gap:4px; font-weight:500">← Danh mục NVL</button>
          <span style="color:#cbd5e1">/</span>
          <b style="font-size:14px; color:#0f172a">${esc(d.material_code || label(row))}</b>
          <span style="font-size:13px; color:#475569">— ${esc(d.material_name || '')}</span>
          <span style="font-size:11px; color:var(--muted); margin-left:2px">(Rev ${row.version})</span>
          ${usageBadge}
          ${statusBadge}
        </div>
        <div style="display:flex; align-items:center; gap:8px">
          <div class="head-actions" style="display:flex;gap:6px;flex-shrink:0">${matActionsHtml}</div>
        </div>
      </div>

      <!-- Card 1: Thông tin vật liệu & Yêu cầu kiểm nghiệm -->
      <section class="card detail-compact-card" style="margin-bottom:8px;flex-shrink:0">
        <div class="card-header" style="padding:5px 14px"><h3 style="font-size:11.5px;margin:0">Thông tin hồ sơ vật liệu</h3></div>
        <div class="card-body" style="padding:8px 14px">
          <div class="mat-detail-grid">
            <div class="detail-item"><small>Mã vật liệu</small><div style="font-weight:650;color:#0f172a">${esc(d.material_code || '—')}</div></div>
            <div class="detail-item"><small>Tên vật liệu</small><div style="font-weight:650;color:#0f172a">${esc(d.material_name || '—')}</div></div>
            <div class="detail-item"><small>Category</small><div>${esc(d.category || 'Raw material')}</div></div>
            <div class="detail-item"><small>Nhà cung cấp</small><div>
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                <span style="font-weight:650;color:#0f172a">${esc(d.supplier || '—')}</span>
                ${hasDeclFile ? `
                  <a href="/api/evidence/${declFile.id}" target="_blank" style="font-size:10.5px;color:#2563eb;font-weight:600;text-decoration:none;display:inline-flex;align-items:center;gap:3px;background:#eff6ff;padding:1px 6px;border-radius:4px;border:1px solid #bfdbfe" title="Bấm để xem / tải về file Cam kết Declaration của Nhà cung cấp">
                    📄 ${esc(declName)} 📥
                  </a>
                ` : d.supplier ? `
                  <span style="font-size:10px;color:#94a3b8" title="Chưa có file cam kết Declaration. Bấm Chỉnh sửa để tải lên.">(Chưa có Declaration)</span>
                ` : ''}
              </div>
            </div></div>
            <div class="detail-item"><small>Dự án (Model)</small><div>${esc(d.project || '—')}</div></div>
            <div class="detail-item"><small>Tình trạng sử dụng</small><div>${esc(d.usage_status || 'Đang sử dụng')}</div></div>
            <div class="detail-item"><small>Kiểm nghiệm phòng Lab</small><div>${req_tests.length ? `<b>${reqValid} / ${req_tests.length}</b> Đạt chuẩn` : '<span style="color:#475569;font-weight:600">Không yêu cầu</span>'}</div></div>
            <div class="detail-item"><small>Khai báo FMD / MSDS</small><div>${
              hasMsds && fmdRecords.length
                ? `<span class="badge good" style="font-size:10.5px">✓ Có MSDS (File + ${fmdRecords.length} chất)</span>`
                : hasMsds
                ? `<span class="badge good" style="font-size:10.5px">✓ Đã có file MSDS 📄</span>`
                : fmdRecords.length
                ? `<span class="badge good" style="font-size:10.5px">✓ Có FMD (${fmdRecords.length} chất)</span>`
                : `<span class="badge warn" style="font-size:10.5px">⚠️ Chưa có MSDS / FMD</span>`
            }</div></div>
            <div class="detail-item" style="grid-column: span 2"><small>Yêu cầu kiểm nghiệm</small><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              ${req_tests.map(t=>`<span style="display:inline-block;padding:1px 6px;border-radius:4px;background:#eff6ff;color:#1e40af;font-size:10.5px;font-weight:600;border:1px solid #bfdbfe">${esc(t)}</span>`).join('') || '<span class="badge" style="background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;font-size:10.5px">Không yêu cầu</span>'}
              <button type="button" id="quick-edit-tests-btn" style="padding:1px 6px;font-size:10px;border-radius:4px;border:1px solid #cbd5e1;background:#fff;cursor:pointer;color:#2563eb;font-weight:500" title="Chọn loại báo cáo kiểm nghiệm từ Cài đặt">⚙️ Đổi</button>
            </div></div>
          </div>
        </div>
      </section>

      <!-- Middle Split Row: 2 Balanced Cards -->
      <div class="mat-detail-split-row" style="display:flex;gap:10px;flex:1;min-height:0;margin-bottom:4px">
        <!-- Cột trái: Segmented Switcher giữa Kiểm nghiệm phòng Lab (TRM) & Thành phần FMD & MSDS -->
        <section class="card detail-compact-card" style="flex:1.25;min-width:0;display:flex;flex-direction:column;margin:0">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;padding:5px 12px;gap:8px">
            <div style="display:inline-flex;gap:3px;background:#f1f5f9;padding:2px;border-radius:6px;border:1px solid #e2e8f0">
              <button type="button" id="tab-btn-tests" style="border:none;background:#fff;padding:3px 10px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;color:#0f172a;box-shadow:0 1px 2px rgba(0,0,0,0.06)">
                🔬 Báo cáo kiểm nghiệm (${testReports.length})
              </button>
              <button type="button" id="tab-btn-fmd" style="border:none;background:transparent;padding:3px 10px;border-radius:4px;font-size:11px;font-weight:500;cursor:pointer;color:#64748b">
                📋 MSDS & FMD (${hasMsds ? '1 file' + (fmdRecords.length ? ` · ${fmdRecords.length} chất` : '') : `${fmdRecords.length} chất`})
              </button>
            </div>
            <div id="fmd-actions" style="display:none"></div>
          </div>

          <!-- Bảng 1: Báo cáo kiểm nghiệm phòng Lab -->
          <div id="panel-tests" style="flex:1;min-height:0;display:flex;flex-direction:column;overflow-y:auto">
            <div class="table-scroll" style="flex:1;min-height:0;overflow-y:auto">
              <table>
                <thead>
                  <tr>
                    <th>Loại kiểm nghiệm</th>
                    <th>Số báo cáo</th>
                    <th>Phòng Lab</th>
                    <th>Hạn báo cáo</th>
                    <th>Kết quả</th>
                    <th>Đánh giá</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${reportRowsHtml}
                </tbody>
              </table>
            </div>
            ${archivedHtml}
          </div>

          <!-- Bảng 2: Khai báo thành phần FMD & MSDS -->
          <div id="panel-fmd" style="flex:1;min-height:0;display:flex;flex-direction:column;overflow-y:auto;display:none">
            <!-- Khối tệp tài liệu MSDS / SDS đính kèm -->
            <div style="margin:8px 8px 6px;padding:10px 14px;background:#f8fafc;border:1px solid ${hasMsds ? '#bbf7d0' : '#fed7aa'};border-radius:6px;flex-shrink:0">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
                <div style="display:flex;align-items:center;gap:10px">
                  <span style="font-size:20px">${hasMsds ? '📑' : '⚠️'}</span>
                  <div>
                    <div style="font-size:12px;font-weight:700;color:#0f172a">
                      Tài liệu Bảng chỉ dẫn an toàn hóa chất (MSDS / SDS)
                    </div>
                    <div style="font-size:11px;color:#64748b;margin-top:2px">
                      ${hasMsds ? `
                        <span style="color:#059669;font-weight:600">✓ Đã đính kèm:</span>
                        <a href="/api/evidence/${msdsFile.id}" target="_blank" style="color:#2563eb;font-weight:600;text-decoration:underline" title="Bấm để mở / tải về tệp MSDS">
                          📄 ${esc(msdsFileName)}
                        </a>
                      ` : `
                        <span style="color:#d97706">Chưa có tệp MSDS / SDS đính kèm cho vật liệu này.</span>
                      `}
                    </div>
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:6px">
                  ${hasMsds ? `
                    <a href="/api/evidence/${msdsFile.id}" target="_blank" class="badge good" style="text-decoration:none;font-size:11px;padding:3px 10px;font-weight:600" title="Tải về máy">📥 Tải MSDS</a>
                    ${can('materials','Edit')||can('documents','Create') ? `
                      <button type="button" class="link-button" id="btn-quick-msds-upload" style="font-size:11px;color:#2563eb;font-weight:600">🔄 Đổi file</button>
                    ` : ''}
                  ` : `
                    ${can('materials','Edit')||can('documents','Create') ? `
                      <button type="button" class="primary" id="btn-quick-msds-upload" style="font-size:11px;padding:3px 10px;border-radius:4px;cursor:pointer">📎 Tải lên file MSDS</button>
                    ` : ''}
                  `}
                </div>
              </div>
            </div>

            <!-- Bảng danh mục chất FMD -->
            <div class="table-scroll" style="flex:1;min-height:0;overflow-y:auto">
              <div style="padding:4px 10px;font-size:11px;font-weight:600;color:#64748b;background:#f1f5f9;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center">
                <span>Danh mục hợp chất hóa học bóc tách (FMD - Tùy chọn)</span>
                <span class="badge" style="font-size:10px">${fmdRecords.length} chất</span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>CAS No.</th>
                    <th>Tên hợp chất (Substance)</th>
                    <th>Hàm lượng (%)</th>
                    <th>Cảnh báo (Flag)</th>
                    <th>Báo cáo đối chiếu</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${fmdRowsHtml}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <!-- BOM Usage -->
        <section class="card detail-compact-card" style="flex:1;min-width:0;display:flex;flex-direction:column;margin:0">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;padding:5px 14px">
            <h3 style="font-size:11.5px;margin:0">Sử dụng trong BOM / Sản phẩm (${boms.length})</h3>
          </div>
          <div class="table-scroll" style="flex:1;min-height:0;overflow-y:auto">
            <table>
              <thead>
                <tr>
                  <th>Dự án / Model</th>
                  <th>Mã thành phẩm</th>
                  <th>Định mức</th>
                  <th>Đơn vị</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${boms.map(b=>`<tr>
                  <td><b>${esc(b.data?.project||'—')}</b></td>
                  <td>${esc(b.data?.parent_code||'—')}</td>
                  <td>${esc(b.data?.norm||'—')}</td>
                  <td>${esc(b.data?.unit||'—')}</td>
                  <td><button class="link-button" data-open="${b.id}">Xem BOM →</button></td>
                </tr>`).join('') || '<tr><td colspan="5" class="muted" style="text-align:center;padding:24px">Vật liệu chưa được liên kết trong BOM nào.</td></tr>'}
              </tbody>
            </table>
          </div>
      </div>

      <!-- Bottom Collapsible: Evidence & Audit History -->
      <details style="margin-top:2px;font-size:11px;color:#64748b;flex-shrink:0">
        <summary style="cursor:pointer;font-weight:500;padding:2px 0">📁 Tệp bằng chứng Evidence (${row.evidence?.length||0}) & Lịch sử thay đổi (${row.history?.length||0})</summary>
        <div style="margin-top:6px;max-height:160px;overflow-y:auto;background:#fff;border:1px solid var(--line);border-radius:6px;padding:8px">${historyHtml}</div>
      </details>
    `;
  }

  let chipsHtml=config.fields.some(f=>f.key==='dri')?`<div class="chips" style="display:inline-flex;gap:6px">${badge(row.display_status)}<span class="badge">${esc(row.module)}</span><span class="badge">DRI: ${esc(d.dri||'Chưa phân công')}</span></div>`:'';
  let html=`<div class="detail-top-bar" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:12px"><div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap"><span style="font-size:11.5px; color:var(--muted)">${esc(config.title)} · Rev ${row.version} · ${timeText(row.updated_at)}</span>${chipsHtml}</div><div class="head-actions" style="display:flex;gap:6px;flex-shrink:0">${actionsHtml}</div></div>`;
  if(row.conflicts?.length)html+=`<div class="alert" style="margin-bottom:8px;padding:6px 12px;font-size:11.5px">Mapping FMD / TRM không khớp: ${row.conflicts.map(c=>`${esc(c.test_type)}: FMD ${esc(c.fmd.join(', '))}; TRM ${esc(c.trm.join(', '))}`).join(' · ')}. Cần xác minh báo cáo gốc.</div>`;
  if(row.module==='capa'){const stages=[['issue','Issue'],['containment','Containment'],['root_cause','Root Cause'],['corrective','Corrective Action'],['evidence','Evidence'],['verification','Verification'],['closure','Closure']];html+=`<div class="timeline" style="margin-bottom:8px;padding-bottom:8px">${stages.map(([k,t])=>`<div class="timeline-step ${(k==='evidence'?row.evidence.length:d[k])?'done':''}"><b>${t}</b><small>${(k==='evidence'?row.evidence.length:d[k])?'Đã ghi nhận':'Chưa ghi nhận'}</small></div>`).join('')}</div>`;}
  let infoHtml=`<section class="card detail-compact-card" style="margin-bottom:8px;flex-shrink:0"><div class="card-header"><h3 style="font-size:12px;margin:0">Thông tin hồ sơ</h3></div><div class="card-body"><div class="detail-grid" style="grid-template-columns:repeat(4,1fr);gap:8px 14px">${sections.map(f=>`<div class="detail-item"><small style="display:block;font-size:10px;color:var(--muted);margin-bottom:2px;text-transform:uppercase;font-weight:600">${esc(f.label)}</small><div style="font-size:11.5px">${esc(d[f.key])}</div></div>`).join('')}</div>${d._source?`<div class="source" style="margin-top:12px;padding:8px 12px">${sourceText(d._source)}<details><summary>Xem ô nguồn / công thức</summary><pre style="padding:8px">${esc(JSON.stringify(d._source,null,2))}</pre></details></div>`:''}${d._sources?`<details style="margin-top:8px"><summary>${d._sources.length} dòng nguồn tạo hồ sơ vật liệu</summary>${d._sources.map(s=>`<p class="source" style="padding:4px 8px;margin:3px 0">${sourceText(s)}</p>`).join('')}</details>`:''}</div></section>`;
  const historyHtml=`<section class="card detail-compact-card" style="margin-bottom:8px"><div class="card-header"><h3 style="font-size:12px;margin:0">Evidence & phiên bản file</h3>${can(row.module,'Upload')?'<label style="margin:0"><input type="file" id="evidence-file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx,.txt" hidden><button id="upload-evidence" style="padding:2px 8px;font-size:11px">↑ Đính kèm file</button></label>':''}</div>${row.evidence.length?`<div class="table-scroll"><table><thead><tr><th>File</th><th>Người upload</th><th>Ngày</th><th>Dung lượng</th><th></th></tr></thead><tbody>${row.evidence.map(e=>`<tr><td title="SHA256: ${e.checksum}">${esc(e.name)}</td><td>${esc(e.uploader)}</td><td>${dateText(e.created_at)}</td><td>${(e.size/1024).toFixed(1)} KB</td><td>${['application/pdf','image/png','image/jpeg'].includes(e.mime)?`<button class="link-button" data-preview="${e.id}">Preview</button> · `:''}<a href="/api/evidence/${e.id}">Tải xuống</a></td></tr>`).join('')}</tbody></table></div>`:empty('Chưa có file evidence','File gốc trong workbook không tự động được coi là evidence đính kèm.')}</section><section class="card detail-compact-card" style="margin:0"><div class="card-header"><h3 style="font-size:12px;margin:0">Lịch sử thay đổi & Audit trail</h3></div><div class="card-body" style="padding:8px 14px">${row.history.map(h=>`<details style="margin-top:6px"><summary>${timeText(h.at)} · ${esc(h.actor)} · ${esc(h.action)}</summary><div class="form-grid" style="gap:8px"><pre style="padding:6px">Trước\n${esc(JSON.stringify(h.before,null,2))}</pre><pre style="padding:6px">Sau\n${esc(JSON.stringify(h.after,null,2))}</pre></div></details>`).join('')||'<p class="muted">Chưa có thay đổi sau khi nhập dữ liệu nguồn.</p>'}</div></section>`;
  html+=infoHtml;
  if(row.module==='suppliers')html+=supplierContext(row);
  if(row.module==='bom')html+=`<section class="card detail-compact-card"><div class="card-header"><h3 style="font-size:12px;margin:0">Nguyên vật liệu trong BOM</h3></div>${rowTable(row.materials||[])}</section>`;
  if(row.evaluation)html+=`<section class="card detail-compact-card"><div class="card-header"><h3 style="font-size:12px;margin:0">Đánh giá XRF theo Control Limit</h3>${badge(row.evaluation.status)}</div><div class="table-scroll"><table><thead><tr><th>Chất</th><th>Kết quả ppm</th><th>Giới hạn ppm</th><th>Quy tắc</th><th>Kết luận</th></tr></thead><tbody>${row.evaluation.checks.map(c=>`<tr><td>${esc(c.element)}</td><td>${c.value??'Chưa có'}</td><td>${c.limit??'Chưa khai báo'}</td><td>${esc(c.rule)}</td><td>${badge(c.status)}</td></tr>`).join('')}</tbody></table></div><div class="card-body muted" style="padding:6px 14px"><small>${esc(row.evaluation.basis)}</small></div></section>`;
  html+=historyHtml;
  return html;
}


function formField(f,value='',testTypesList=[]){
  if (f.key === 'required_tests') {
    const selected = String(value || '').split(',').map(s => s.trim()).filter(Boolean);
    const options = [...new Set([...testTypesList, ...selected])];
    return `<div class="wide" style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:12px;font-weight:600;color:#334155">${esc(f.label)} <small style="color:var(--muted);font-weight:normal">(Chọn từ Cài đặt)</small></span>
        <button type="button" class="link-button" onclick="window.open('#/test-types')" style="font-size:11px;color:#2563eb">⚙️ Cấu hình loại kiểm nghiệm →</button>
      </div>
      <div class="test-type-selector-box" style="display:flex;flex-wrap:wrap;gap:6px;padding:8px 10px;background:#f8fafc;border:1px solid #dce3ec;border-radius:6px">
        ${options.map(t => {
          const isChecked = selected.includes(t);
          return `<label style="cursor:pointer;display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:${isChecked?'#eff6ff':'#fff'};border:1px solid ${isChecked?'#3b82f6':'#cbd5e1'};border-radius:5px;font-size:11.5px;color:${isChecked?'#1e40af':'#334155'};font-weight:${isChecked?'600':'400'};user-select:none;margin:0">
            <input type="checkbox" value="${esc(t)}" class="test-type-toggle" ${isChecked?'checked':''} style="margin:0">
            <span>${esc(t)}</span>
          </label>`;
        }).join('')}
      </div>
      <input type="hidden" name="required_tests" id="field-required-tests" value="${esc(selected.join(', '))}">
    </div>`;
  }
  const attrs=`name="${esc(f.key)}" ${f.required?'required':''}`;
  let control;
  if(f.type==='select')control=`<select ${attrs}><option value="">Chọn…</option>${f.options.map(o=>`<option value="${esc(o)}" ${String(value)===o?'selected':''}>${esc(o)}</option>`).join('')}</select>`;
  else if(f.type==='textarea')control=`<textarea ${attrs} maxlength="10000">${esc(value)}</textarea>`;
  else control=`<input ${attrs} type="${f.type}" ${f.type==='number'?'min="0" step="any"':''} value="${esc(value)}" maxlength="10000">`;
  return `<label class="${f.type==='textarea'?'wide':''}">${esc(f.label)}${f.required?' *':''}${control}</label>`;
}

async function recordForm(module,row=null,defaults={}){
  const config=catalog.modules[module];
  let testTypesList = [];
  if (module === 'materials' || config.fields.some(f => f.key === 'required_tests')) {
    testTypesList = await getTestTypesList();
  }
  openModal((row?'Chỉnh sửa: ':'Thêm: ')+config.title,`<form id="record-form"><div class="form-grid">${config.fields.map(f=>formField(f,row?.data[f.key]??defaults[f.key]??(f.key==='status'?'Pending':f.key==='dri'?user.name:''),testTypesList)).join('')}</div><div id="record-error" class="form-error" role="alert"></div></form>`,`<button data-cancel>Hủy</button><button type="submit" form="record-form" class="primary" id="save-record">Lưu hồ sơ</button>`);
  modal.querySelectorAll('.test-type-toggle').forEach(chk => {
    chk.onchange = () => {
      const checked = Array.from(modal.querySelectorAll('.test-type-toggle:checked')).map(c => c.value);
      const hidden = modal.querySelector('#field-required-tests');
      if (hidden) hidden.value = checked.join(', ');
      const lbl = chk.closest('label');
      if (lbl) {
        lbl.style.background = chk.checked ? '#eff6ff' : '#fff';
        lbl.style.borderColor = chk.checked ? '#3b82f6' : '#cbd5e1';
        lbl.style.color = chk.checked ? '#1e40af' : '#334155';
        lbl.style.fontWeight = chk.checked ? '600' : '400';
      }
    };
  });
  modal.querySelector('[data-cancel]').onclick=()=>modal.close();
  $('#record-form').onsubmit=async e=>{
    e.preventDefault();
    $('#save-record').disabled=true;
    try{
      const data=Object.fromEntries(new FormData(e.target));
      const result=await api('/records'+(row?'/'+row.id:''),{method:row?'PUT':'POST',body:JSON.stringify({module,data,version:row?.version})});
      modal.close();
      notify('Đã lưu hồ sơ thành công.');
      goto('record/'+result.id);
    }catch(error){
      $('#record-error').textContent=error.message;
    }finally{
      if($('#save-record'))$('#save-record').disabled=false;
    }
  };
}

function groupPage(id){const group=catalog.groups.find(g=>g.id===id);if(!group)return empty('Không tìm thấy nhóm');return head(group.name,'')+`<div class="folder-grid">${group.items.filter(i=>!catalog.modules[i.id]||can(i.id,'View')).map(i=>`<button class="folder" data-route="${i.id}"><h3>${esc(i.name)}</h3><p>${esc(catalog.modules[i.id]?.description||'Mở danh sách và quản lý hồ sơ')}</p></button>`).join('')}</div>`;}
async function importsPage(){const data=await api('/imports');return head('Nguồn Excel & đối chiếu','',user.role==='Admin'?'<button class="primary" id="import-workbooks">Kiểm tra / nhập workbook mới</button>':'')+`<div class="folder-grid">${data.files.map(f=>`<article class="folder"><h3>${esc(f.file)}</h3><p>Nhập ${timeText(f.at)}</p><p>${Object.entries(f.summary.counts).map(([m,n])=>`${esc(title(m))}: <b>${n}</b>`).join('<br>')}</p><details><summary>${f.summary.sheets.length} sheet đã đọc</summary>${f.summary.sheets.map(s=>`<p>${esc(s.name)} · ${s.populated_rows} dòng có nội dung / ${s.rows} dòng định dạng</p>`).join('')}<p>SHA256: ${esc(f.checksum)}</p></details>${['Admin','QA Manager','Auditor'].includes(user.role)?`<a href="/api/imports/${f.id}/download">Tải workbook nguồn</a>`:''}</article>`).join('')}</div><section class="card" style="margin-top:20px"><div class="card-header"><h3>Chênh lệch FMD / TRM cần xác minh</h3></div>${data.conflicts.length?`<div class="table-scroll"><table><thead><tr><th>Vật liệu</th><th>Test</th><th>FMD</th><th>TRM</th><th>Trạng thái</th></tr></thead><tbody>${data.conflicts.map(c=>`<tr><td>${esc(c.material_code)}</td><td>${esc(c.test_type)}</td><td>${esc(c.fmd.join(', '))}</td><td>${esc(c.trm.join(', '))}</td><td>${badge('Warning')}</td></tr>`).join('')}</tbody></table></div>`:empty('Không phát hiện chênh lệch')}</section><section class="card"><div class="card-header"><h3>Chất lượng dữ liệu nguồn</h3></div><div class="card-body">${data.files.flatMap(f=>f.summary.issues.map(i=>`<div class="alert">${esc(f.file)} · ${esc(i.sheet)} · ${esc(i.cell)}: <b>${esc(i.value)}</b></div>`)).join('')||'<p>Không có lỗi ô Excel được ghi nhận.</p>'}<p class="muted">IQC Trend được tính lại từ dữ liệu kết quả IQC/OQC, không lấy giá trị pivot cache làm dữ liệu độc lập. Các ô thiếu giới hạn hoặc thiếu kết quả giữ trạng thái Pending.</p></div></section>`;}
async function trendPage(element='pb',stage=''){const data=await api('/xrf-trend?element='+element+'&stage='+encodeURIComponent(stage));window.psTrend=data;const byMonth={};for(const i of data.items)byMonth[i.month]=Math.max(byMonth[i.month]||0,i.maximum);const max=Math.max(1,...Object.values(byMonth));return head('Xu hướng XRF & thực hiện kế hoạch','')+`<section class="card"><div class="card-header"><h3>Giá trị lớn nhất theo tháng · ppm</h3><select id="trend-element" aria-label="Chất phân tích">${['pb','cd','hg','cr','br','cl'].map(e=>`<option value="${e}" ${element===e?'selected':''}>${e.toUpperCase()}</option>`).join('')}</select></div><div class="card-body"><div class="trend-bars">${Object.entries(byMonth).map(([m,v])=>`<div class="trend-bar"><b>${v.toFixed(1)}</b><i style="height:${Math.max(1,150*v/max)}px"></i><span>${m}</span></div>`).join('')||'<p>Chưa có số đo.</p>'}</div><p class="muted" style="margin-top:18px"><small>${esc(data.basis)}</small></p></div></section><section class="card"><div class="card-header"><h3>Chi tiết theo vật liệu</h3></div><div class="table-scroll"><table><thead><tr><th>Tháng</th><th>Mã vật liệu</th><th>Số mẫu</th><th>Max ppm</th><th>Average ppm</th></tr></thead><tbody>${data.items.map(i=>`<tr><td>${i.month}</td><td>${esc(i.material_code)}</td><td>${i.count}</td><td>${i.maximum}</td><td>${i.average}</td></tr>`).join('')}</tbody></table></div></section><section class="card"><div class="card-header"><h3>Kế hoạch so với kết quả thực hiện</h3><select id="coverage-filter" aria-label="Lọc thực hiện"><option value="">Tất cả</option><option>Overdue</option><option>Pending</option><option>Completed</option><option>Scheduled</option></select></div><div class="table-scroll" id="coverage-table">${coverageTable(data.coverage)}</div></section>`;}
function coverageTable(rows){return `<table><thead><tr><th>Tháng</th><th>Vật liệu</th><th>Test</th><th>Kết quả đã ghi nhận</th><th>Trạng thái</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.month}</td><td><button class="link-button" data-open="${r.plan_id}">${esc(r.material_code)}</button></td><td>${esc(r.test)}</td><td>${r.tests}</td><td>${badge(r.status)}</td></tr>`).join('')}</tbody></table>`;}

async function usersPage(){if(user.role!=='Admin')return head('Quản lý người dùng')+empty('Chỉ Admin được quản lý tài khoản','Liên hệ Admin để kích hoạt tài khoản hoặc thay đổi quyền.');const users=await api('/users');const page=listState.page||1;const pageSize=Number(listState.size)||getOptimalPageSize();const total=users.length;const pagedUsers=users.slice((page-1)*pageSize,page*pageSize);const pagination=paginationHtml(page,total,pageSize);const userOptHtml=[15,20,25,50,2000].map(v=>`<option value="${v}" ${pageSize===v?'selected':''}>${v===2000?`Tất cả (${total} tài khoản)`:`${v} / trang`}</option>`).join('');return head('Quản lý người dùng','')+`<section class="card fill-card"><div class="toolbar"><select id="page-size-select" title="Số lượng dòng mỗi trang" aria-label="Số dòng mỗi trang">${userOptHtml}</select></div><div class="table-scroll"><table><thead><tr><th>Họ tên</th><th>Mã nhân viên</th><th>Email</th><th>Phòng ban</th><th>Role</th><th>Trạng thái</th><th></th></tr></thead><tbody>${pagedUsers.map(u=>`<tr><td>${esc(u.name)}</td><td>${esc(u.employee_id)}</td><td>${esc(u.email)}</td><td>${esc(u.department)}</td><td><select data-user-role="${u.id}" ${u.id===user.id?'disabled':''}>${catalog.roles.map(r=>`<option ${r===u.role?'selected':''}>${r}</option>`).join('')}</select></td><td><label style="margin:0"><input type="checkbox" data-user-active="${u.id}" ${u.active?'checked':''} ${u.id===user.id?'disabled':''}>Kích hoạt</label></td><td><button data-save-user="${u.id}" ${u.id===user.id?'disabled':''}>Lưu</button></td></tr>`).join('')}</tbody></table></div>${pagination}</section>`;}
let roleSettings;
async function rolesPage(){roleSettings=await api('/settings/permissions');const role=Object.keys(roleSettings)[0];return head('Vai trò & Phân quyền','',user.role==='Admin'?'<button class="primary" id="save-roles">Lưu phân quyền</button>':'')+`<section class="card"><div class="toolbar"><label>Role<select id="role-select">${Object.keys(roleSettings).map(r=>`<option>${r}</option>`).join('')}</select></label><small class="muted">Admin luôn có toàn quyền.</small></div><div id="role-matrix" class="table-scroll">${roleMatrix(role)}</div></section>`;}
function roleMatrix(role){return `<table><thead><tr><th>Module</th>${['View','Create','Edit','Delete','Upload','Approve','Close'].map(a=>`<th>${a}</th>`).join('')}</tr></thead><tbody>${Object.keys(catalog.modules).map(m=>`<tr><td>${esc(title(m))}</td>${['View','Create','Edit','Delete','Upload','Approve','Close'].map(a=>`<td><input type="checkbox" aria-label="${esc(title(m)+' '+a)}" data-permission="${m}:${a}" ${roleSettings[role]?.[m]?.[a]?'checked':''} ${user.role==='Admin'?'':'disabled'}></td>`).join('')}</tr>`).join('')}</tbody></table>`;}
async function settingsPage(key){const data=await api('/settings/'+key);let form='';if(key==='notifications')form=`<label>Ngưỡng cảnh báo<select name="days">${[30,60,90].map(n=>`<option value="${n}" ${data.days===n?'selected':''}>${n} ngày</option>`).join('')}</select></label>`+[['reports','Test Report sắp hết hạn'],['training','Training sắp hết hạn'],['capa','CAPA quá hạn'],['documents','Document đến hạn review'],['compliance','Compliance cần renewal']].map(([k,t])=>`<label><input type="checkbox" name="${k}" ${data[k]!==false?'checked':''}>${t}</label>`).join('');else if(key==='retention')form=[['documents','Tài liệu'],['samples','Sample'],['reports','Test Report'],['audit','Audit Record'],['training','Training Record']].map(([k,t])=>`<label>${t} (năm)<input type="number" name="${k}" min="1" max="100" value="${data[k]||5}" required></label>`).join('');else form=[['site_name','Tên hệ thống'],['factory','Nhà máy'],['timezone','Múi giờ hiển thị']].map(([k,t])=>`<label>${t}<input name="${k}" value="${esc(data[k])}" maxlength="200" required ${k==='timezone'?'readonly':''}></label>`).join('');return head(names[key],'')+`<section class="card"><div class="card-body"><form id="settings-form"><fieldset style="border:0;padding:0" ${user.role!=='Admin'?'disabled':''}><div class="form-grid">${form}</div>${user.role==='Admin'?'<button class="primary" type="submit">Lưu cài đặt</button>':'<p class="muted">Chỉ Admin được thay đổi cấu hình.</p>'}</fieldset></form></div></section>`;}

function bindCommon(root=content){
  root.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>goto('record/'+b.dataset.open));
  root.querySelectorAll('[data-route]').forEach(b=>b.onclick=()=>goto(b.dataset.route));
  root.querySelectorAll('[data-status-filter]').forEach(b=>{
    b.onclick=(e)=>{
      e.preventDefault();
      listState.status=b.dataset.statusFilter??'';
      listState.page=1;
      render();
    };
  });
}
function bindPage(id){bindCommon();
if(id==='organization'){bindOrganization();return;}
if(id==='xrf-plan'){bindXrfPlanPage();return;}
if(id==='inspection-plans'){
  content.querySelectorAll('[data-plan-page]').forEach(b=>b.onclick=()=>{listState.page=Number(b.dataset.planPage);return render();});
  if($('#plan-prev')) $('#plan-prev').onclick=()=>{if(listState.page>1){listState.page--;render();}};
  if($('#plan-next')) $('#plan-next').onclick=()=>{listState.page=(listState.page||1)+1;render();};
  if($('#page-size-select')) $('#page-size-select').onchange=e=>{listState.size=Number(e.target.value);listState.page=1;render();};
}
if(id==='dashboard'){
  $('#dashboard-material-type').onchange=e=>{dashboardMaterialType=e.target.value;return render();};
  $('#dashboard-element').onchange=e=>{dashboardElement=e.target.value;return render();};
  content.querySelectorAll('[data-report-validity]').forEach(b=>b.onclick=()=>dashboardReportList(b.dataset.reportValidity).catch(e=>notify(e.message)));
  content.querySelectorAll('[data-report-days]').forEach(b=>b.onclick=()=>dashboardReportList('',Number(b.dataset.reportDays)).catch(e=>notify(e.message)));
  content.querySelectorAll('[data-trend-stage]').forEach(b=>b.onclick=()=>{location.hash='#/xrf-trend/'+b.dataset.trendStage;});
  $('#dashboard-alerts').onclick=()=>{openModal('Việc cần xử lý',rowTable(overview.alerts));modal.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{modal.close();goto('record/'+b.dataset.open);});};
}
const gs = document.querySelector('.global-search'); if(gs) gs.style.display = id === 'cts-1' ? 'none' : '';
if(catalog.modules[id] || id==='bom' || id==='xrf' || id==='inspection-plans'){
  const module = $('#filters')?.dataset?.module || $('#export')?.dataset?.module || id;
  if($('#filters')) $('#filters').onsubmit=e=>{e.preventDefault();Object.assign(listState,Object.fromEntries(new FormData(e.target)),{page:1});render();};
  if($('#page-size-select')) $('#page-size-select').onchange=e=>{
    const val = Number(e.target.value);
    listState.size = val;
    if(module==='suppliers'||id==='suppliers') listState.supplierSize = val;
    if(module==='materials'||id==='materials') listState.materialSize = val;
    if(module==='xrf-iqc'||module==='xrf-oqc'||id==='xrf-iqc'||id==='xrf-oqc'||id==='xrf') listState.xrfSize = val;
    if(module==='test-plan'||id==='test-plan'||id==='inspection-plans') listState.planSize = val;
    listState.page = 1;
    render();
  };
  if($('#reset-filter')) $('#reset-filter').onclick=()=>{listState={page:1,q:'',status:'',project:'',phase:'',category:'',start:'',end:'',sort:'updated_at',direction:'desc',size:listState.size||getOptimalPageSize()};render();};
  if($('#project-filter')) $('#project-filter').onchange=()=>{listState.project=$('#project-filter').value;listState.page=1;render();};
  if($('#phase-filter')) $('#phase-filter').onchange=()=>{listState.phase=$('#phase-filter').value;listState.page=1;render();};
  if($('#category-filter')) $('#category-filter').onchange=()=>{listState.category=$('#category-filter').value;listState.page=1;render();};
  if($('#status-filter')) $('#status-filter').onchange=()=>{listState.status=$('#status-filter').value;listState.page=1;render();};
  if($('#import-bom-btn')) $('#import-bom-btn').onclick=()=>confirmAction('Cập nhật dữ liệu BOM từ file Material report for SE-CM project.xlsx?',async()=>{try{const res=await api('/bom/import',{method:'POST'});notify(`Đã cập nhật BOM: +${res.bom_added} BOM, +${res.materials_added} NVL.`);render();}catch(err){notify(err.message);}});
  if($('#save-bom-btn')) $('#save-bom-btn').onclick=async()=>{try{try{await api('/bom/save',{method:'POST'});}catch(e){}notify('Đã lưu và xuất dữ liệu BOM thành công.');location.href='/api/export/bom';}catch(err){notify(err.message);}};
  if($('#delete-bom-btn')) $('#delete-bom-btn').onclick=()=>confirmAction('Bạn có chắc chắn muốn xóa TOÀN BỘ dữ liệu BOM? Danh mục NVL liên quan sẽ được tự động cập nhật theo.',async()=>{try{try{const res=await api('/bom',{method:'DELETE'});notify(`Đã xóa ${res.count} bản ghi BOM và cập nhật ${res.materials_count||0} NVL trong Danh mục.`);}catch(e){const allBom=await api('/records?module=bom&size=2000');const bomCodes=new Set(allBom.items.map(r=>r.data.material_code).filter(Boolean));for(const r of allBom.items){await api('/records/'+r.id+'?version='+r.version,{method:'DELETE'});}const allMats=await api('/records?module=materials&size=2000');let mCount=0;for(const m of allMats.items){if(bomCodes.has(m.data.material_code)){await api('/records/'+m.id+'?version='+m.version,{method:'DELETE'});mCount++;}}notify(`Đã xóa ${allBom.items.length} bản ghi BOM và đồng bộ ${mCount} NVL.`);}render();}catch(err){notify(err.message);}});
  content.querySelectorAll('.delete-project-btn').forEach(b=>b.onclick=()=>{const proj=b.dataset.project;confirmAction(`Xóa toàn bộ dữ liệu BOM của dự án "${proj}"? Danh mục NVL của dự án sẽ được tự động cập nhật theo.`,async()=>{try{try{const res=await api('/bom?project='+encodeURIComponent(proj),{method:'DELETE'});notify(`Đã xóa ${res.count} BOM dự án "${proj}" và cập nhật ${res.materials_count||0} NVL.`);}catch(e){const allBom=await api('/records?module=bom&size=2000');const projBom=allBom.items.filter(r=>r.data.project===proj||r.data.parent_code===proj);const projCodes=new Set(projBom.map(r=>r.data.material_code).filter(Boolean));const otherCodes=new Set(allBom.items.filter(r=>r.data.project!==proj&&r.data.parent_code!==proj).map(r=>r.data.material_code).filter(Boolean));for(const r of projBom){await api('/records/'+r.id+'?version='+r.version,{method:'DELETE'});}const allMats=await api('/records?module=materials&size=2000');let mCount=0;for(const m of allMats.items){if(m.data.project===proj||(projCodes.has(m.data.material_code)&&!otherCodes.has(m.data.material_code))){await api('/records/'+m.id+'?version='+m.version,{method:'DELETE'});mCount++;}}notify(`Đã xóa ${projBom.length} BOM dự án "${proj}" và cập nhật ${mCount} NVL.`);}render();}catch(err){notify(err.message);}});});
  if($('#prev-page')) $('#prev-page').onclick=()=>{if(listState.page>1){listState.page--;render();}};
  if($('#next-page')) $('#next-page').onclick=()=>{listState.page=(listState.page||1)+1;render();};
  content.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{listState.page=Number(b.dataset.page);render();});
  document.querySelectorAll('[data-sort]').forEach(b=>b.onclick=()=>{listState.direction=listState.sort===b.dataset.sort&&listState.direction==='asc'?'desc':'asc';listState.sort=b.dataset.sort;render();});
  $('#add-record')?.addEventListener('click',()=>module==='suppliers'?openSupplierEvaluationModal():module==='materials'?openMaterialEditModal():recordForm(module));
  if($('#export')) $('#export').onclick=()=>{const q=new URLSearchParams({q:listState.q,status:listState.status,start:listState.start,end:listState.end});location.href='/api/export/'+module+'?'+q;};
  if(id==='suppliers'||module==='suppliers'){
    content.querySelectorAll('[data-supplier-filter]').forEach(b=>{
      b.onclick=()=>{
        pendingMaterialSupplierFilter = b.dataset.supplierFilter || '';
        goto('materials');
      };
    });
    content.querySelectorAll('.evaluate-supplier-btn').forEach(b=>{
      b.onclick=()=>{
        const sid=Number(b.dataset.supplierId);
        const sRow=window.psSuppliersMap?.[sid];
        if(sRow)openSupplierEvaluationModal(sRow);
      };
    });
    $('#add-supplier-eval-btn')?.addEventListener('click',()=>openSupplierEvaluationModal());
  }
  content.querySelectorAll('.edit-xrf-btn').forEach(b=>{
    b.onclick=async()=>{
      const rid=Number(b.dataset.recordId);
      const mod=b.dataset.recordModule;
      const row=await api('/records/'+rid);
      recordForm(mod,row);
    };
  });
  if(id==='materials'||module==='materials'){
  content.querySelectorAll('.edit-material-btn').forEach(b=>{
      b.onclick=async()=>{
        const mid=Number(b.dataset.materialId);
        const mRow=window.psMaterialsMap?.[mid];
        if(mRow) openMaterialEditModal(mRow);
      };
    });
    $('#add-material-btn')?.addEventListener('click',()=>openMaterialEditModal());
  }
}
if(id==='product-bom'){
  content.querySelectorAll('[data-bom-page]').forEach(b=>b.onclick=()=>{window.psBomMatPage=Number(b.dataset.bomPage);render();});
  if($('#bom-prev')) $('#bom-prev').onclick=()=>{if(window.psBomMatPage>1){window.psBomMatPage--;render();}};
  if($('#bom-next')) $('#bom-next').onclick=()=>{window.psBomMatPage=(window.psBomMatPage||1)+1;render();};
  if($('#bom-size-select')) $('#bom-size-select').onchange=e=>{listState.size=Number(e.target.value);window.psBomMatPage=1;render();};
  if($('#save-proj-bom-btn')) $('#save-proj-bom-btn').onclick=async()=>{try{try{await api('/bom/save',{method:'POST'});}catch(e){}notify('Đã lưu dữ liệu BOM.');location.href='/api/export/bom';}catch(err){notify(err.message);}};
  if($('#delete-proj-bom-btn')) $('#delete-proj-bom-btn').onclick=()=>{const proj=$('#delete-proj-bom-btn').dataset.project;confirmAction(`Xóa toàn bộ dữ liệu BOM của dự án "${proj}"? Danh mục NVL của dự án sẽ được tự động cập nhật theo.`,async()=>{try{try{const res=await api('/bom?project='+encodeURIComponent(proj),{method:'DELETE'});notify(`Đã xóa ${res.count} bản ghi BOM dự án "${proj}" và cập nhật ${res.materials_count||0} NVL.`);}catch(e){const allBom=await api('/records?module=bom&size=2000');const projBom=allBom.items.filter(r=>r.data.project===proj||r.data.parent_code===proj);const projCodes=new Set(projBom.map(r=>r.data.material_code).filter(Boolean));const otherCodes=new Set(allBom.items.filter(r=>r.data.project!==proj&&r.data.parent_code!==proj).map(r=>r.data.material_code).filter(Boolean));for(const r of projBom){await api('/records/'+r.id+'?version='+r.version,{method:'DELETE'});}const allMats=await api('/records?module=materials&size=2000');let mCount=0;for(const m of allMats.items){if(m.data.project===proj||(projCodes.has(m.data.material_code)&&!otherCodes.has(m.data.material_code))){await api('/records/'+m.id+'?version='+m.version,{method:'DELETE'});mCount++;}}notify(`Đã xóa ${projBom.length} bản ghi BOM dự án "${proj}" và cập nhật ${mCount} NVL.`);}goto('bom');}catch(err){notify(err.message);}});};
}
if(id==='users'){
  content.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{listState.page=Number(b.dataset.page);render();});
  if($('#prev-page')) $('#prev-page').onclick=()=>{if(listState.page>1){listState.page--;render();}};
  if($('#next-page')) $('#next-page').onclick=()=>{listState.page=(listState.page||1)+1;render();};
  if($('#page-size-select')) $('#page-size-select').onchange=e=>{listState.size=Number(e.target.value);listState.page=1;render();};
}
if(id==='record'){const row=currentDetail;bindSupplyContext(row);$('#edit-record')?.addEventListener('click',()=>row.module==='materials'?openMaterialEditModal(row):row.module==='suppliers'?openSupplierEvaluationModal(row):recordForm(row.module,row));$('#edit-supplier-eval-btn')?.addEventListener('click',()=>openSupplierEvaluationModal(row));$('#archive-record')?.addEventListener('click',()=>confirmAction('Lưu trữ hồ sơ này? Hồ sơ sẽ rời danh sách nhưng audit history vẫn được giữ.',async()=>{await api('/records/'+row.id+'?version='+row.version,{method:'DELETE'});goto(row.module);}));$('#upload-evidence')?.addEventListener('click',()=>$('#evidence-file').click());$('#evidence-file')?.addEventListener('change',async e=>{if(!e.target.files[0])return;const body=new FormData();body.append('file',e.target.files[0]);try{await api('/records/'+row.id+'/evidence',{method:'POST',body});notify('Đã lưu evidence.');render();}catch(error){notify(error.message);}});document.querySelectorAll('[data-preview]').forEach(b=>b.onclick=()=>openModal('Preview evidence',`<iframe title="Nội dung evidence" class="preview-frame" src="/api/evidence/${b.dataset.preview}?inline=true"></iframe>`));$('#add-material-report')?.addEventListener('click',()=>{openModal('Thêm báo cáo / Tải file', `<div class="folder-grid"><button data-quick="reports" class="folder"><h3>Test Report</h3><p>RoHS, Halogen-Free...</p></button><button data-quick="documents" class="folder"><h3>Document</h3><p>SDS, MSDS, FMD...</p></button></div>`);modal.querySelectorAll('[data-quick]').forEach(b=>b.onclick=()=>{recordForm(b.dataset.quick,null,{material_code:row.data.material_code});});});$('#quick-edit-tests-btn')?.addEventListener('click',()=>openMaterialEditModal(row));$('#add-material-report-btn')?.addEventListener('click',()=>openMaterialEditModal(row));content.querySelectorAll('[data-upload-test]').forEach(b=>b.onclick=()=>openMaterialEditModal(row,b.dataset.uploadTest));content.querySelectorAll('[data-attach-report-file]').forEach(b=>b.onclick=()=>openAttachFileModal(b.dataset.attachReportFile,b.dataset.reportName));$('#btn-quick-msds-upload')?.addEventListener('click',()=>openAttachMsdsModal(row));const tabTests=$('#tab-btn-tests'),tabFmd=$('#tab-btn-fmd'),panelTests=$('#panel-tests'),panelFmd=$('#panel-fmd'),actTests=$('#tests-actions'),actFmd=$('#fmd-actions');if(tabTests&&tabFmd){tabTests.onclick=()=>{tabTests.style.background='#fff';tabTests.style.color='#0f172a';tabTests.style.fontWeight='600';tabTests.style.boxShadow='0 1px 2px rgba(0,0,0,0.06)';tabFmd.style.background='transparent';tabFmd.style.color='#64748b';tabFmd.style.fontWeight='500';tabFmd.style.boxShadow='none';if(panelTests)panelTests.style.display='';if(panelFmd)panelFmd.style.display='none';if(actTests)actTests.style.display='';if(actFmd)actFmd.style.display='none';};tabFmd.onclick=()=>{tabFmd.style.background='#fff';tabFmd.style.color='#0f172a';tabFmd.style.fontWeight='600';tabFmd.style.boxShadow='0 1px 2px rgba(0,0,0,0.06)';tabTests.style.background='transparent';tabTests.style.color='#64748b';tabTests.style.fontWeight='500';tabTests.style.boxShadow='none';if(panelTests)panelTests.style.display='none';if(panelFmd)panelFmd.style.display='';if(actTests)actTests.style.display='none';if(actFmd)actFmd.style.display='';};}$('#add-fmd-btn')?.addEventListener('click',()=>openMaterialEditModal(row,null,'fmd'));$('#empty-add-fmd-btn')?.addEventListener('click',()=>openMaterialEditModal(row,null,'fmd'));}
if(id==='imports')$('#import-workbooks')?.addEventListener('click',()=>confirmAction('Kiểm tra ba workbook trong thư mục dự án và nhập file chưa có. File đã thay đổi sẽ được báo cần review, không ghi đè.',async()=>{const result=await api('/imports',{method:'POST'});notify(result.map(r=>r.file+': '+r.state).join(' · '));render();}));
if(id==='xrf-trend'){$('#trend-element').onchange=async e=>{try{content.innerHTML=await trendPage(e.target.value,window.psTrend.stage||'');bindPage(id);}catch(error){notify(error.message);}};$('#coverage-filter').onchange=e=>{$('#coverage-table').innerHTML=coverageTable(window.psTrend.coverage.filter(r=>!e.target.value||r.status===e.target.value));bindCommon($('#coverage-table'));};}
if(id==='users')document.querySelectorAll('[data-save-user]').forEach(b=>b.onclick=()=>{const uid=b.dataset.saveUser;const role=document.querySelector(`[data-user-role="${uid}"]`).value;const active=document.querySelector(`[data-user-active="${uid}"]`).checked;confirmAction('Lưu trạng thái và quyền truy cập tài khoản này?',async()=>{await api('/users/'+uid,{method:'PUT',body:JSON.stringify({role,active})});notify('Đã cập nhật tài khoản.');render();});});
if(id==='roles'){const bindMatrix=()=>document.querySelectorAll('[data-permission]').forEach(box=>box.onchange=()=>{const role=$('#role-select').value;const [m,a]=box.dataset.permission.split(':');roleSettings[role][m]??={};roleSettings[role][m][a]=box.checked;});$('#role-select').onchange=e=>{$('#role-matrix').innerHTML=roleMatrix(e.target.value);bindMatrix();};bindMatrix();$('#save-roles')?.addEventListener('click',()=>confirmAction('Áp dụng phân quyền mới cho các role?',async()=>{await api('/settings/permissions',{method:'PUT',body:JSON.stringify(roleSettings)});notify('Đã lưu phân quyền.');}));}
if(['notifications','retention','system'].includes(id))$('#settings-form').onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));if(id==='notifications'){data.days=Number(data.days);for(const k of ['reports','training','capa','documents','compliance'])data[k]=!!e.target.elements[k].checked;}if(id==='retention')for(const k in data)data[k]=Number(data[k]);try{await api('/settings/'+id,{method:'PUT',body:JSON.stringify(data)});notify('Đã lưu cài đặt.');}catch(error){notify(error.message);}};
if(id==='xrf-standard'){
  if($('#seed-defaults')) $('#seed-defaults').onclick=()=>confirmAction('Khôi phục giá trị Polymers mặc định? Các giá trị đã có sẽ không bị ghi đè.',async()=>{try{const res=await api('/xrf-limits/seed',{method:'POST'});notify(`Đã tạo ${res.created} giới hạn. Tổng: ${res.total}`);render();}catch(e){notify(e.message);}});
  if($('#add-material-group')) $('#add-material-group').onclick=()=>{const mt=prompt('Tên nhóm vật liệu mới (VD: Metals/Ceramic/Glass):');if(!mt||!mt.trim())return;const elements=['Cd (Cadmium)','Pb (Lead)','Hg (Mercury)','Cr (Chromium)','Br (Bromine)','Cl (Chlorine)'];confirmAction(`Tạo 6 chất cho nhóm "${mt.trim()}" với giá trị rỗng?`,async()=>{try{for(const el of elements){await api('/records',{method:'POST',body:JSON.stringify({module:'xrf-standard',data:{element:el,material_type:mt.trim(),control_limit:null,spec_limit:null,rule:'≤ Control Limit'}})});}notify('Đã tạo nhóm '+mt.trim());render();}catch(e){notify(e.message);}});};
  content.querySelectorAll('.save-limit-btn').forEach(b=>b.onclick=async()=>{const tr=b.closest('tr');const id=b.dataset.id;const inputs=tr.querySelectorAll('.xrf-input');const updates={};inputs.forEach(inp=>{const field=inp.dataset.field;const val=inp.type==='number'?(inp.value?Number(inp.value):null):inp.value;updates[field]=val;});try{const current=await api('/records/'+id);const newData={...current.data,...updates};await api('/records/'+id,{method:'PUT',body:JSON.stringify({module:'xrf-standard',data:newData,version:current.version})});notify('Đã lưu giới hạn.');render();}catch(e){notify(e.message);}});
  content.querySelectorAll('.delete-limit-btn').forEach(b=>b.onclick=()=>confirmAction('Xóa giới hạn này?',async()=>{try{const current=await api('/records/'+b.dataset.id);await api('/records/'+b.dataset.id+'?version='+current.version,{method:'DELETE'});notify('Đã xóa.');render();}catch(e){notify(e.message);}}));
  content.querySelectorAll('.add-element-btn').forEach(b=>b.onclick=()=>{const el=prompt('Tên chất (VD: Cd (Cadmium)):');if(!el||!el.trim())return;(async()=>{try{await api('/records',{method:'POST',body:JSON.stringify({module:'xrf-standard',data:{element:el.trim(),material_type:b.dataset.mt,control_limit:null,spec_limit:null,rule:'≤ Control Limit'}})});notify('Đã thêm '+el.trim());render();}catch(e){notify(e.message);}})();});
  content.querySelectorAll('.delete-group-btn').forEach(b=>b.onclick=()=>confirmAction(`Xóa toàn bộ nhóm "${b.dataset.mt}"? Thao tác này không thể hoàn tác.`,async()=>{try{const all=await api('/xrf-limits');const toDelete=all.filter(r=>r.data.material_type===b.dataset.mt);for(const r of toDelete){await api('/records/'+r.id+'?version='+r.version,{method:'DELETE'});}notify(`Đã xóa ${toDelete.length} giới hạn.`);render();}catch(e){notify(e.message);}}));
}
}

if($('#quick-add')) $('#quick-add').onclick=()=>{const choices=[['materials','Thêm vật liệu'],['reports','Upload Test Report'],['declarations','Thêm Declaration'],['ncr','Tạo NCR'],['capa','Tạo CAPA'],['documents','Upload Document']].filter(([m])=>can(m,'Create'));openModal('Thêm nhanh',choices.length?`<div class="folder-grid">${choices.map(([m,n])=>`<button data-quick="${m}" class="folder">${n}</button>`).join('')}</div>`:empty('Bạn có quyền chỉ xem','Liên hệ Admin nếu cần tạo hoặc upload hồ sơ.'));modal.querySelectorAll('[data-quick]').forEach(b=>b.onclick=()=>recordForm(b.dataset.quick));};
if($('#notifications-button')) $('#notifications-button').onclick=async()=>{try{overview=await api('/overview');openModal('Thông báo & công việc',rowTable(overview.alerts,['name','module','status']));bindCommon(modal);modal.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{modal.close();goto('record/'+b.dataset.open);});}catch(e){notify(e.message);}};
if($('#profile-button')) $('#profile-button').onclick=()=>{openModal('Tài khoản của bạn',`<p><b>${esc(user.name)}</b><br>${esc(user.email)} · ${esc(user.role)}</p><form id="password-form"><label>Mật khẩu hiện tại<input type="password" name="current_password" required autocomplete="current-password"></label><label>Mật khẩu mới<input type="password" name="new_password" minlength="10" maxlength="128" required autocomplete="new-password"></label><div id="password-error" class="form-error"></div><button class="primary" type="submit">Đổi mật khẩu</button></form>`,`<button id="logout" class="danger">Đăng xuất</button>`);$('#logout').onclick=async()=>{try{await api('/auth/logout',{method:'POST'});location.replace('/login');}catch(e){notify(e.message);}};$('#password-form').onsubmit=async e=>{e.preventDefault();try{await api('/auth/password',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});location.replace('/login');}catch(err){$('#password-error').textContent=err.message;}};};
let searchTimer,searchSequence=0;if($('#global-search')) $('#global-search').oninput=e=>{clearTimeout(searchTimer);const q=e.target.value;const seq=++searchSequence;if(q.length<2){$('#search-results').hidden=true;return;}searchTimer=setTimeout(async()=>{try{const rows=await api('/search?q='+encodeURIComponent(q));if(seq!==searchSequence)return;$('#search-results').innerHTML=rows.map(r=>`<button class="search-result" data-search-open="${r.id}">${esc(label(r))}<small>${esc(title(r.module))} · ${esc(r.data.material_code||r.data.report_id||'')}</small></button>`).join('')||'<div class="empty">Không tìm thấy kết quả</div>';$('#search-results').hidden=false;document.querySelectorAll('[data-search-open]').forEach(b=>b.onclick=()=>{$('#search-results').hidden=true;goto('record/'+b.dataset.searchOpen);});}catch(e){notify(e.message);}},250);};document.addEventListener('click',e=>{if(!e.target.closest('.global-search'))if($('#search-results'))$('#search-results').hidden=true;});document.addEventListener('keydown',e=>{if(e.key==='Escape')if($('#search-results'))$('#search-results').hidden=true;});


function toggleSidebar(force) {
    const sb = document.getElementById('sidebar');
    if(!sb) return;
    const collapsed = force !== undefined ? force : !sb.classList.contains('collapsed');
    sb.classList.toggle('collapsed', collapsed);
    localStorage.setItem('ps_sidebar_collapsed', collapsed);
    const btn = document.getElementById('collapse');
    if(btn) btn.setAttribute('aria-expanded', !collapsed);
}

function declarationRows(rows){return rows.filter(r=>['declarations','material-declarations'].includes(r.module));}
function materialSuppliers(row){
  const related=row.related||[],declarations=declarationRows(related);
  const names=[...new Set([...(row.supplier_names||[]),row.data.supplier,...declarations.map(r=>r.data.supplier)].filter(Boolean))];
  return `<section class="card"><div class="card-header"><h3>Nhà cung cấp & Cam kết áp dụng</h3>${can('suppliers','Create')?'<button id="context-add-supplier">+ Thêm nhà cung cấp</button>':''}</div><div class="card-body">${names.map((name,index)=>{
    const supplier=related.find(r=>r.module==='suppliers'&&r.data.supplier===name),docs=declarations.filter(r=>r.data.supplier===name);
    return `<section class="supplier-context"><h3>${supplier?`<button class="link-button" data-open="${supplier.id}">${esc(name)} →</button>`:esc(name)}</h3>${!supplier?'<small class="muted">Chưa có hồ sơ nhà cung cấp riêng.</small>':''}${can('material-declarations','Create')?`<button data-context-declaration="${esc(name)}">+ Thêm cam kết cho NVL này</button>`:''}${rowTable(docs,['name','status','expiry'])}</section>`;
  }).join('')||empty('Chưa xác định nhà cung cấp','Bổ sung nhà cung cấp trong thông tin NVL hoặc hồ sơ nguồn.')} ${declarations.some(r=>!r.data.supplier)?`<h3>Cam kết chưa xác định nhà cung cấp</h3>${rowTable(declarations.filter(r=>!r.data.supplier))}`:''}</div></section>`;
}
function supplierContext(row){
  const d = row.data || {};
  const related = row.related || [];
  const declarations = declarationRows(related);
  const materials = row.materials || [];
  const now = new Date();

  const status = d.evaluation_status || 'Pending';
  const grade = d.audit_grade || 'Chưa xếp loại';
  const lastAudit = d.last_audit_date;
  const nextAudit = d.next_audit_date;

  let scheduleBadge = '<span style="color:#94a3b8">—</span>';
  if (nextAudit) {
    const days = Math.ceil((new Date(nextAudit) - now) / (1000 * 60 * 60 * 24));
    if (days < 0) {
      scheduleBadge = `<span class="badge" style="background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;font-size:11px;font-weight:700">✕ Quá hạn ${Math.abs(days)} ngày</span>`;
    } else if (days <= 60) {
      scheduleBadge = `<span class="badge" style="background:#fef3c7;color:#b45309;border:1px solid #fde68a;font-size:11px;font-weight:700">⚠️ Sắp đến hạn (${days} ngày)</span>`;
    } else {
      scheduleBadge = `<span class="badge" style="background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;font-size:11px;font-weight:700">✓ Còn ${days} ngày</span>`;
    }
  }

  return `
    <!-- Card 1: Hồ sơ Đánh giá định kỳ & Audit Schedule -->
    <section class="card detail-compact-card" style="margin-bottom:8px">
      <div class="card-header" style="padding:8px 14px;display:flex;justify-content:space-between;align-items:center">
        <div style="display:flex;align-items:center;gap:8px">
          <h3 style="font-size:13px;margin:0;font-weight:700;color:#0f172a">📋 Hồ sơ Đánh giá định kỳ & Audit Schedule</h3>
          ${badge(status)}
          <span class="badge" style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;font-weight:600">${esc(grade)}</span>
        </div>
        <button type="button" class="primary" id="edit-supplier-eval-btn" style="padding:4px 12px;font-size:11.5px;display:flex;align-items:center;gap:4px">
          ✏️ Cập nhật đánh giá
        </button>
      </div>
      <div class="card-body" style="padding:10px 14px">
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px">
          <div class="detail-item">
            <small style="text-transform:uppercase;color:#64748b;font-weight:600;font-size:10px">Tình trạng đánh giá</small>
            <div style="margin-top:2px">${badge(status)}</div>
          </div>
          <div class="detail-item">
            <small style="text-transform:uppercase;color:#64748b;font-weight:600;font-size:10px">Xếp loại chất lượng</small>
            <div style="font-weight:650;color:#0f172a;font-size:12px;margin-top:2px">${esc(grade)}</div>
          </div>
          <div class="detail-item">
            <small style="text-transform:uppercase;color:#64748b;font-weight:600;font-size:10px">Ngày đánh giá gần nhất</small>
            <div style="font-weight:600;font-size:12px;margin-top:2px">${dateText(lastAudit)}</div>
          </div>
          <div class="detail-item">
            <small style="text-transform:uppercase;color:#64748b;font-weight:600;font-size:10px">Hạn đánh giá tiếp theo</small>
            <div style="display:flex;align-items:center;gap:6px;margin-top:2px">
              <span style="font-weight:650;font-size:12px">${dateText(nextAudit)}</span>
              ${scheduleBadge}
            </div>
          </div>
        </div>
        ${d.evaluation_notes ? `
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 12px;margin-top:4px">
            <small style="font-weight:700;color:#475569;display:block;margin-bottom:2px">Ghi chú & Nhận xét đánh giá:</small>
            <p style="margin:0;font-size:11.5px;color:#334155;white-space:pre-wrap">${esc(d.evaluation_notes)}</p>
          </div>
        ` : ''}
      </div>
    </section>

    <!-- Card 2: Danh sách NVL NCC đang cung cấp -->
    <section class="card detail-compact-card" style="margin-bottom:8px">
      <div class="card-header" style="padding:8px 14px;display:flex;justify-content:space-between;align-items:center">
        <h3 style="font-size:12.5px;margin:0;font-weight:700;color:#0f172a">
          📦 Danh sách các NVL NCC đang cấp (${materials.length} NVL)
        </h3>
        ${can('materials','Create')?`<button type="button" class="link-button" onclick="recordForm('materials',null,{supplier:'${esc(d.supplier||'')}'})" style="font-size:11px">+ Thêm NVL cho NCC này</button>`:''}
      </div>
      ${materials.length ? `
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Mã NVL</th>
                <th>Tên NVL</th>
                <th>Phân loại</th>
                <th>Dự án</th>
                <th>Trạng thái sử dụng</th>
                <th>Tuân thủ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${materials.map(m => `
                <tr>
                  <td><button type="button" class="link-button" data-open="${m.id}" style="font-weight:700;font-size:12px">${esc(m.data?.material_code || '—')}</button></td>
                  <td>${esc(m.data?.material_name || '—')}</td>
                  <td><span class="badge" style="background:#f1f5f9;color:#334155">${esc(m.data?.category || 'Raw material')}</span></td>
                  <td>${esc(m.data?.project || '—')}</td>
                  <td><span class="badge" style="background:#f8fafc;border:1px solid #cbd5e1;color:#475569">${esc(m.data?.usage_status || 'Đang sử dụng')}</span></td>
                  <td>${badge(m.display_status)}</td>
                  <td><button type="button" class="link-button" data-open="${m.id}">👁️ Chi tiết</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : empty('Chưa có danh mục NVL', 'Nhà cung cấp này chưa được gán cho vật liệu nào trong Danh mục NVL hoặc BOM.')}
    </section>

    <!-- Card 3: Cam kết Declaration & MSDS -->
    <section class="card detail-compact-card" style="margin-bottom:8px">
      <div class="card-header" style="padding:8px 14px;display:flex;justify-content:space-between;align-items:center">
        <h3 style="font-size:12.5px;margin:0;font-weight:700;color:#0f172a">
          📜 Cam kết & Tuyên bố tuân thủ (Declarations & MSDS) (${declarations.length})
        </h3>
        ${can('declarations','Create')?`<button type="button" data-context-declaration="${esc(d.supplier||'')}" style="font-size:11px;padding:2px 8px">+ Thêm cam kết</button>`:''}
      </div>
      ${declarations.length ? `
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Tên Cam kết / Số hiệu</th>
                <th>Mã NVL áp dụng</th>
                <th>Ngày cấp</th>
                <th>Hạn cam kết</th>
                <th>Tệp đính kèm</th>
                <th>Trạng thái</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${declarations.map(dc => {
                const f = dc.files && dc.files.length > 0 ? dc.files[0] : null;
                return `
                  <tr>
                    <td><b>${esc(dc.data?.declaration_no || 'Declaration')}</b></td>
                    <td>${esc(dc.data?.material_code || 'Chung cho NCC')}</td>
                    <td>${dateText(dc.data?.issue_date)}</td>
                    <td>${dateText(dc.data?.expiry_date)}</td>
                    <td>
                      ${f ? `
                        <a href="/api/evidence/${f.id}" target="_blank" style="color:#2563eb;font-weight:600;font-size:11px;text-decoration:none">
                          📄 ${esc(f.name)} 📥
                        </a>
                      ` : '<span style="color:#94a3b8;font-size:11px">—</span>'}
                    </td>
                    <td>${badge(dc.display_status || dc.data?.approval || 'Approved')}</td>
                    <td><button type="button" class="link-button" data-open="${dc.id}">Xem →</button></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      ` : empty('Chưa có bản cam kết Declaration', 'Bấm nút "+ Thêm cam kết" để bổ sung file cam kết tuân thủ của nhà cung cấp.')}
    </section>
  `;
}
function bindSupplyContext(row){
  content.querySelectorAll('[data-material-tab]').forEach(b=>b.onclick=()=>{
    content.querySelectorAll('[data-material-tab]').forEach(t=>{t.classList.toggle('active',t===b);t.setAttribute('aria-pressed',String(t===b));});
    content.querySelectorAll('[data-material-panel]').forEach(p=>p.hidden=p.dataset.materialPanel!==b.dataset.materialTab);
  });
  content.querySelectorAll('[data-context-declaration]').forEach(b=>b.onclick=()=>recordForm(row.module==='materials'?'material-declarations':'declarations',null,{material_code:row.module==='materials'?row.data.material_code:'',supplier:b.dataset.contextDeclaration}));
  $('#context-add-supplier')?.addEventListener('click',()=>recordForm('suppliers',null,{supplier:row.data.supplier||'',material_codes:row.data.material_code||''}));
}
async function xrfPage(tab) {
    tab = tab || 'overview';
    const tabs = `<div class="tabs" style="margin-bottom:12px">
      <button ${tab==='overview'?'class="active"':''} data-route="xrf/overview">Tổng quan</button>
      <button ${tab==='plan'?'class="active"':''} data-route="xrf/plan">Kế hoạch</button>
      <button ${tab==='iqc'?'class="active"':''} data-route="xrf/iqc">IQC</button>
      <button ${tab==='oqc'?'class="active"':''} data-route="xrf/oqc">OQC</button>
      <button ${tab==='change'?'class="active"':''} data-route="xrf/change">Change Control</button>
      <button ${tab==='trend'?'class="active"':''} data-route="xrf/trend">Xu hướng</button>
    </div>`;
    
    let pageHtml = '';
    if (tab === 'overview') {
        const d = await api('/overview');
        pageHtml = `<section class="card"><div class="card-header"><div><h3>Tổng quan giám sát XRF</h3><small style="color:var(--muted)">Đo quang phổ huỳnh quang tia X kiểm soát hàm lượng kim loại nặng (Pb, Cd, Hg, Cr, Br, Cl)</small></div><div style="display:flex;gap:8px"><button data-route="xrf/iqc" class="primary">Xem dữ liệu IQC →</button><button data-route="xrf/trend">Xem biểu đồ Trend →</button></div></div><div class="card-body"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:16px"><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px"><span style="font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase">Vật liệu đã đo XRF</span><div style="font-size:24px;font-weight:700;color:#0f172a;margin:4px 0">${d.coverage.xrf} / ${d.coverage.total_materials}</div><small style="color:#059669">Đạt tỷ lệ ${d.coverage.total_materials ? Math.round(100*d.coverage.xrf/d.coverage.total_materials) : 0}% danh mục BOM</small></div><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px"><span style="font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase">Ngưỡng kiểm soát RoHS</span><div style="font-size:24px;font-weight:700;color:#059669;margin:4px 0">100% Đạt</div><small style="color:#64748b">Không có mẫu vượt Control Limit</small></div><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px"><span style="font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase">Quy trình áp dụng</span><div style="font-size:24px;font-weight:700;color:#0284c7;margin:4px 0">IQC & OQC</div><small style="color:#64748b">Đo đầu vào & thành phẩm xuất xưởng</small></div></div><p style="font-size:12px;color:var(--muted);margin:0">Chọn các tab phía trên (Kế hoạch, IQC, OQC, Change Control, Xu hướng) để xem bảng dữ liệu chi tiết và phân tích xu hướng.</p></div></section>`;
    } else if (tab === 'trend') {
        pageHtml = await trendPage('pb', '');
    } else if (tab === 'iqc' || tab === 'oqc') {
        pageHtml = await xrfDataListPage(tab === 'iqc' ? 'xrf-iqc' : 'xrf-oqc');
    } else {
        const modMap = {'plan': 'xrf-plan', 'iqc': 'xrf-iqc', 'oqc': 'xrf-oqc', 'change': 'change-control'};
        const module = modMap[tab];
        const pageSize = Number(listState.size) || getOptimalPageSize();
        const query=new URLSearchParams({module, ...listState, size:pageSize});
        const result=await api('/records?'+query);
        const config=catalog.modules[module];
        const keys=columnPreferences[module]||config.fields.slice(0,5).map(f=>f.key);
        const columns=keys.map(key=>config.fields.find(f=>f.key===key)).filter(Boolean);
        const pagination = paginationHtml(result.page, result.total, pageSize);
        const hasDri = config.fields.some(f=>f.key==='dri');
        const hasStatus = config.fields.some(f=>f.key==='status') || result.items.some(r=>r.display_status);
        const xrfOptHtml = [15,20,25,50,2000].map(v=>`<option value="${v}" ${pageSize===v?'selected':''}>${v===2000?`Tất cả (${result.total} mục)`:`${v} / trang`}</option>`).join('');
        pageHtml = `<section class="card"><form class="toolbar" id="filters" data-module="${module}"><input type="search" name="q" placeholder="Tìm mã NVL, tên, lô…" value="${esc(listState.q)}" aria-label="Tìm trong bảng">${hasStatus ? `<select name="status" title="Lọc theo Trạng thái" aria-label="Trạng thái"><option value="">Tất cả trạng thái</option>${['Pending','Compliant','NG','Pass','Valid','Expiring Soon','Expired','Overdue','Open','Closed','Completed','Due Soon','Not Applicable'].map(s=>`<option ${listState.status===s?'selected':''}>${s}</option>`).join('')}</select>` : ''}${config.fields.some(f=>f.type==='date') ? `<label style="margin:0;display:flex;align-items:center;gap:3px;font-size:11px;color:var(--muted)">Từ<input type="date" name="start" value="${esc(listState.start)}" style="width:120px"></label><label style="margin:0;display:flex;align-items:center;gap:3px;font-size:11px;color:var(--muted)">Đến<input type="date" name="end" value="${esc(listState.end)}" style="width:120px"></label>` : ''}<select name="size" id="page-size-select" title="Số lượng dòng mỗi trang" aria-label="Số dòng mỗi trang">${xrfOptHtml}</select><div class="toolbar-actions-group"><button type="submit" class="toolbar-btn" title="Áp dụng tìm kiếm & bộ lọc" aria-label="Áp dụng bộ lọc"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg></button><button type="button" id="reset-filter" class="toolbar-btn" title="Xóa toàn bộ bộ lọc & làm mới" aria-label="Xóa bộ lọc"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg></button></div><div class="toolbar-actions-right"><button type="button" id="export" class="toolbar-btn" data-module="${module}" title="Xuất danh sách ra file Excel" aria-label="Xuất file Excel"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>${can(module,'Create')?`<button type="button" class="primary toolbar-btn" id="add-record" data-module="${module}" title="Thêm hồ sơ mới" aria-label="Thêm hồ sơ mới"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>`:''}</div></form><div class="table-scroll"><table><thead><tr>${columns.map(f=>`<th><button class="link-button" data-sort="${f.key}">${esc(f.label)} ${listState.sort===f.key?(listState.direction==='asc'?'↑':'↓'):'↕'}</button></th>`).join('')}${hasDri ? '<th>DRI</th>' : ''}${hasStatus ? '<th>Trạng thái</th>' : ''}<th></th></tr></thead><tbody>
    ${result.items.map(r => {
        if (module === 'xrf-iqc' || module === 'xrf-oqc') {
            const d = r.data || {};
            const code = d.material_code || '';
            const name = d.material_name || '';
            const lot = d.lot || '-';
            const date = d.test_date ? new Date(d.test_date).toLocaleDateString('vi-VN') : '-';
            const type = d.material_type || '';
            const pb = d.pb || '0';
            const res = (d.result || r.display_status || 'PASS').toUpperCase();
            
            let resBadge = '';
            if (res === 'PASS' || res === 'OK') resBadge = '<span class="badge" style="background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;font-weight:600">PASS</span>';
            else resBadge = '<span class="badge" style="background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;font-weight:600">' + esc(res) + '</span>';
            
            let html = `<tr>`;
            html += `<td style="padding:6px 10px"><button class="link-button" data-open="${r.id}" style="font-weight:700;font-size:12.5px;color:#0f172a;font-family:monospace">${esc(code)}</button></td>`;
            html += `<td style="padding:6px 10px"><div style="font-size:11px;color:#64748b;white-space:normal;max-width:200px">${esc(name)}</div></td>`;
            html += `<td style="padding:6px 10px;font-family:monospace;font-size:12px">${esc(lot)}</td>`;
            html += `<td style="padding:6px 10px;font-size:12px">${esc(date)}</td>`;
            html += `<td style="padding:6px 10px"><span class="badge" style="background:#f1f5f9;color:#334155;border:1px solid #e2e8f0;font-size:10.5px">${esc(type)}</span></td>`;
            html += `<td style="padding:6px 10px;font-weight:600">${esc(pb)}</td>`;
            if (hasDri) html += `<td style="padding:6px 10px">${esc(d.dri||'Chưa phân công')}</td>`;
            if (hasStatus) html += `<td style="padding:6px 10px">${resBadge}</td>`;
            html += `<td style="padding:6px 10px"><button class="link-button" data-open="${r.id}" style="font-size:11.5px">Chi tiết</button></td>`;
            html += `</tr>`;
            return html;
        } else {
            return `<tr>${columns.map((f,i)=>`<td title="${esc(r.data[f.key])}">${i===0?`<button class="link-button" data-open="${r.id}">${esc(r.data[f.key]||label(r))}</button>`:esc(r.data[f.key]??'')}</td>`).join('')}${hasDri ? `<td>${esc(r.data.dri||'Chưa phân công')}</td>` : ''}${hasStatus ? `<td>${badge(r.display_status)}</td>` : ''}<td><button class="link-button" data-open="${r.id}">Chi tiết</button></td></tr>`;
        }
    }).join('')}
    </tbody></table></div>${result.items.length?'':empty(result.total?'Không có kết quả trên trang này':'Chưa có hồ sơ phù hợp','Thêm hồ sơ hoặc thay đổi bộ lọc để tiếp tục.')}${pagination}</section>`;
    }
    
    return head('XRF Monitoring', '') + tabs + pageHtml;
}

async function productBomPage(key) {
    if(!window.psBomProjects) { goto('bom'); return 'Loading...'; }
    const p = window.psBomProjects[key];
    if(!p) return empty('Không tìm thấy dữ liệu BOM');
    
    window.psBomMatPage = window.psBomMatPage || 1;
    const pageSize = Number(listState.size) || getOptimalPageSize();
    const totalItems = p.items.length;
    const currentPage = window.psBomMatPage;
    const paginatedItems = p.items.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    const pagination = paginationHtml(currentPage, totalItems, pageSize, 'data-bom-page', 'bom-prev', 'bom-next');
    const projOptHtml = [15,20,25,50,2000].map(v=>`<option value="${v}" ${pageSize===v?'selected':''}>${v===2000?`Tất cả (${totalItems} mục)`:`${v} / trang`}</option>`).join('');
    
    return head('BOM Dự án: ' + (p.product || p.project), '', '<button data-route="bom">← Trở lại danh sách BOM</button>') + `<section class="card fill-card"><div class="toolbar"><select id="bom-size-select" title="Số lượng dòng mỗi trang" aria-label="Số dòng mỗi trang">${projOptHtml}</select><div class="toolbar-actions-right"><button type="button" class="toolbar-btn" id="save-proj-bom-btn" title="Lưu / Xuất dữ liệu BOM ra Excel" aria-label="Lưu dữ liệu BOM"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></button><button type="button" class="toolbar-btn danger" id="delete-proj-bom-btn" data-project="${esc(p.project)}" title="Xóa toàn bộ BOM dự án này" aria-label="Xóa BOM dự án"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button></div></div><div class="table-scroll"><table><thead><tr><th>Phân loại</th><th>Mã NVL (Material Code)</th><th>Tên vật liệu (Material Name)</th><th>Nhà cung cấp</th><th>Đơn vị</th><th>Định mức (BOM)</th><th>Compliance Status</th><th></th></tr></thead><tbody>${paginatedItems.map(i=>{
        const m = i.mat;
        const b = i.bom.data || {};
        const cat = b.category || m?.data?.category || 'Raw material';
        const unit = b.unit || m?.data?.unit || '—';
        const norm = b.norm || '—';
        const code = b.material_code || m?.data?.material_code || '—';
        const name = b.material_name || m?.data?.material_name || '—';
        const sup = b.supplier || m?.data?.supplier || '—';
        const comp = m ? badge(m.display_status) : badge('Pending');
        const targetId = m ? m.id : i.bom.id;
        
        return `<tr><td><span class="badge" style="background:#f1f5f9;color:#334155;font-weight:600">${esc(cat)}</span></td><td><button class="link-button" data-open="${targetId}"><b>${esc(code)}</b></button></td><td title="${esc(name)}">${esc(name)}</td><td>${esc(sup)}</td><td>${esc(unit)}</td><td>${esc(norm)}</td><td>${comp}</td><td><button class="link-button" data-open="${targetId}">👁️ Xem chi tiết</button></td></tr>`;
    }).join('')}</tbody></table></div>${pagination}</section>`;
}

async function planningPage(){
  return await finishedGoodsTestPlanPage();
}

async function xrfStandardPage(){
  const data = await api('/xrf-limits');
  // Group by material_type
  const groups = {};
  for(const r of data){
    const mt = r.data.material_type || 'Không xác định';
    if(!groups[mt]) groups[mt] = [];
    groups[mt].push(r);
  }
  const elementOrder = ['Cd','Pb','Hg','Cr','Br','Cl'];
  for(const mt in groups){
    groups[mt].sort((a,b)=>{
      const ai = elementOrder.indexOf(a.data.element?.split(' ')[0]||'');
      const bi = elementOrder.indexOf(b.data.element?.split(' ')[0]||'');
      return (ai===-1?99:ai) - (bi===-1?99:bi);
    });
  }
  const materialTypes = Object.keys(groups);

  let html = head('XRF – Giới hạn kiểm soát','Quản lý Control Limit & Spec Limit cho máy XRF theo nhóm vật liệu');
  html += `<section class="card" style="padding:16px">
    <div class="toolbar" style="margin-bottom:16px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="primary" id="seed-defaults" style="font-size:12px">🔄 Khôi phục Polymers mặc định</button>
      <button id="add-material-group" style="font-size:12px">➕ Thêm nhóm vật liệu</button>
    </div>`;

  if(materialTypes.length === 0){
    html += `<div style="text-align:center;padding:40px;color:#64748b">
      <p style="font-size:14px;font-weight:600">Chưa có giới hạn kiểm soát nào</p>
      <p style="font-size:12px">Nhấn "Khôi phục Polymers mặc định" để tạo bộ giá trị chuẩn.</p>
    </div>`;
  }

  for(const mt of materialTypes){
    const rows = groups[mt];
    html += `<div class="xrf-group" style="margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h3 style="margin:0;font-size:13px;font-weight:700;color:#1e293b">📋 ${esc(mt)}</h3>
        <div style="display:flex;gap:6px">
          <button class="add-element-btn" data-mt="${esc(mt)}" style="font-size:11px;padding:4px 10px">➕ Thêm chất</button>
          <button class="delete-group-btn danger" data-mt="${esc(mt)}" style="font-size:11px;padding:4px 10px">🗑 Xóa nhóm</button>
        </div>
      </div>
      <div class="table-scroll"><table>
        <thead><tr>
          <th style="width:200px">Chất</th>
          <th style="width:150px">Control Limit (ppm)</th>
          <th style="width:150px">Spec Limit (ppm)</th>
          <th>Quy tắc</th>
          <th style="width:120px">Hành động</th>
        </tr></thead>
        <tbody>`;
    for(const r of rows){
      const d = r.data;
      html += `<tr data-id="${r.id}">
        <td><b>${esc(d.element||'')}</b></td>
        <td><input type="number" class="xrf-input" data-field="control_limit" value="${d.control_limit??''}" style="width:100px;padding:4px 8px;font-size:12px;border:1px solid #e2e8f0;border-radius:4px"></td>
        <td><input type="number" class="xrf-input" data-field="spec_limit" value="${d.spec_limit??''}" style="width:100px;padding:4px 8px;font-size:12px;border:1px solid #e2e8f0;border-radius:4px"></td>
        <td><input type="text" class="xrf-input" data-field="rule" value="${esc(d.rule||'')}" style="width:100%;padding:4px 8px;font-size:12px;border:1px solid #e2e8f0;border-radius:4px"></td>
        <td style="display:flex;gap:4px">
          <button class="save-limit-btn primary" data-id="${r.id}" style="font-size:11px;padding:4px 8px">💾 Lưu</button>
          <button class="delete-limit-btn danger" data-id="${r.id}" style="font-size:11px;padding:4px 8px">🗑</button>
        </td>
      </tr>`;
    }
    html += `</tbody></table></div></div>`;
  }
  html += `</section>`;
  return html;
}


const LIVE_REFRESH_MS=15000;
let liveTimer,liveRendering=false,liveDirty=false,liveInteraction=0,livePath='',liveUpdatedAt=null;
function liveBlocked(){
  return liveDirty || !!document.querySelector('dialog[open]') ||
    !!document.activeElement?.matches('input,textarea,select,[contenteditable="true"]');
}
function showLiveStatus(state='ready'){
  const line=$('#topbar-updated');if(!line)return;
  const labels={ready:'Trực tiếp',loading:'Đang cập nhật',paused:'Tạm dừng khi nhập liệu',error:'Mất kết nối · Thử lại',offline:'Ngoại tuyến'};
  const time=liveUpdatedAt?liveUpdatedAt.toLocaleTimeString('vi-VN',{hour12:false}):'—';
  line.hidden=false;
  line.innerHTML=`<span class="live-state live-${state}">● ${labels[state]}</span><span> · Cập nhật lúc <time>${time}</time></span> <button id="page-refresh-btn" type="button" title="Lấy dữ liệu mới từ máy chủ; tự cập nhật mỗi 15 giây" ${state==='loading'?'disabled':''}>↻ Làm mới</button>`;
  $('#page-refresh-btn').onclick=()=>refreshLivePage(true);
}
function scheduleLiveRefresh(){
  clearTimeout(liveTimer);
  liveTimer=setTimeout(()=>refreshLivePage(),LIVE_REFRESH_MS);
}
async function refreshLivePage(manual=false){
  if(liveRendering){return;}
  if(!manual&&document.visibilityState==='hidden'){scheduleLiveRefresh();return;}
  if(navigator.onLine===false){showLiveStatus('offline');scheduleLiveRefresh();return;}
  if(liveBlocked()){
    showLiveStatus('paused');scheduleLiveRefresh();
    if(manual)notify('Hoàn tất hoặc hủy phần đang nhập trước khi làm mới để tránh mất dữ liệu.');
    return;
  }
  await render({liveRefresh:true});
}
content.addEventListener('input',()=>{liveDirty=true;liveInteraction++;showLiveStatus('paused');});
content.addEventListener('change',()=>{liveDirty=true;liveInteraction++;});
content.addEventListener('click',()=>{liveInteraction++;});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshLivePage();});
window.addEventListener('online',()=>refreshLivePage());
window.addEventListener('offline',()=>showLiveStatus('offline'));

async function render(options={}) {
  const background=options?.liveRefresh===true;
  clearTimeout(liveTimer);
  liveRendering=true;
  const interaction=liveInteraction;
  const scrollPositions=[...content.querySelectorAll('.table-scroll,.org-matrix,[data-material-panel]')].map(el=>[el.scrollLeft,el.scrollTop]);
  const contentScroll=[content.scrollLeft,content.scrollTop];
  const windowScroll=[window.scrollX,window.scrollY];
  if(!background)liveDirty=false;
  invalidateApiCache();
  const ticket=++requestId;
  const path=(location.hash || '#/dashboard').replace(/^#\//,'');
  if(path!==livePath){livePath=path;liveUpdatedAt=null;}
  const [route,parameter]=path.split('/');
  if(currentModule!==route){
    currentModule=route;
    listState={page:1,q:'',status:'',start:'',end:'',sort:'updated_at',direction:'desc',size:listState.size||getOptimalPageSize()};
    if(route==='materials' && pendingMaterialSupplierFilter){
      listState.q = pendingMaterialSupplierFilter;
      pendingMaterialSupplierFilter = '';
    }
    window.listState = listState;
  }
  content.classList.toggle('quality-dashboard-page',route==='dashboard');
  showLiveStatus('loading');
  nav(route==='group'?'group/'+parameter:route);
  let pageTitle=route==='dashboard'?'Product Safety Dashboard':title(route);
  const heading=document.getElementById('topbar-title');
  if(heading)heading.textContent=pageTitle;
  const showLoadingTimer = setTimeout(() => {
    if(ticket === requestId && !background) {
      content.innerHTML='<div class="loading">Đang tải dữ liệu…</div>';
    }
  }, 100);
  try {
    let html;
    if(route==='xrf') {
        html = await xrfPage(parameter);
        pageTitle = 'XRF';
        nav('xrf');
      }
      else if(route==='product-bom') {
        html = await productBomPage(decodeURIComponent(parameter));
        pageTitle = 'BOM Detail';
        nav('bom');
      }
      else if(route==='dashboard')html=await dashboard();
    else if(route==='record'){
      const detail=await api('/records/'+encodeURIComponent(parameter || ''));
      if(ticket!==requestId)return;
      currentDetail=detail;
      html=detailPage(detail);
      pageTitle=label(detail);
      nav(detail.module);
    }
    else if(route==='group'){
      html=groupPage(parameter);
      pageTitle=catalog.groups.find(group=>group.id===parameter)?.name || 'Product Safety';
    }
    else if(route==='users')html=await usersPage();
    else if(route==='roles')html=await rolesPage();
    else if(['notifications','retention','system'].includes(route))html=await settingsPage(route);
    else if(route==='xrf-trend')html=await trendPage(dashboardElement,parameter||'');
    else if(route==='imports')html=await importsPage();
    else if(route==='inspection-plans')html=await planningPage();
    else if(route==='xrf-standard')html=await xrfStandardPage();
    else if(route==='test-plan') html=await finishedGoodsTestPlanPage();
    else if(route==='xrf-plan') html=await xrfPlanPage();
    else if(catalog.modules[route])html=await listPage(route);
    else html=empty('Không tìm thấy trang','Đường dẫn không hợp lệ. Chọn một mục trong menu.');
    clearTimeout(showLoadingTimer);
    if(ticket!==requestId)return;
    if(background&&(liveBlocked()||interaction!==liveInteraction)){
      showLiveStatus('paused');return;
    }
    content.innerHTML=html;
    const heading=document.getElementById('topbar-title');
    if(heading)heading.textContent=pageTitle;
    if(route==='xrf-trend'&&parameter)$('#topbar-title').textContent=parameter+' Trend';
    bindPage(route);
    liveDirty=false;
    liveUpdatedAt=new Date();
    showLiveStatus('ready');
    if(background){
      content.querySelectorAll('.table-scroll,.org-matrix,[data-material-panel]').forEach((el,i)=>{if(scrollPositions[i]){el.scrollLeft=scrollPositions[i][0];el.scrollTop=scrollPositions[i][1];}});
      content.scrollLeft=contentScroll[0];content.scrollTop=contentScroll[1];
      if(window.scrollX!==windowScroll[0]||window.scrollY!==windowScroll[1])window.scrollTo(...windowScroll);
    }
  } catch(error) {
    clearTimeout(showLoadingTimer);
    if(ticket!==requestId)return;
    showLiveStatus(navigator.onLine===false?'offline':'error');
    if(background)return;
    content.innerHTML=`<div class="alert error">${esc(error.message)}</div><button id="retry-page">Thử lại</button>`;
    $('#retry-page').onclick=render;
  } finally {
    clearTimeout(showLoadingTimer);
    if(ticket===requestId){liveRendering=false;scheduleLiveRefresh();}
  }
}

window.render = render;
window.setFilterStatus = (status) => {
  listState.status = status || '';
  listState.page = 1;
  render();
};

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-status-filter]');
  if (btn) {
    e.preventDefault();
    const val = btn.dataset.statusFilter || '';
    listState.status = (listState.status === val && val !== '') ? '' : val;
    listState.page = 1;
    render();
  }
});

const collapseBtn = document.getElementById('collapse');
if(collapseBtn) collapseBtn.onclick = () => toggleSidebar();
window.addEventListener('hashchange', render);

(async function init() {
  try {
    const auth = await api('/auth/me');
    user = auth.user;
    csrf = auth.csrf;
    loginAt = auth.login_at;
    catalog = await api('/catalog');
    const pn = $('#profile-name'); if(pn) pn.textContent = user.name || '';
    const pr = $('#profile-role'); if(pr) pr.textContent = user.role || '';
    const av = $('#avatar');
    if(av) {
      const parts = (user.name || 'Admin').trim().split(/\s+/);
      av.textContent = parts.map(p => p[0]).slice(-2).join('').toUpperCase();
    }
    toggleSidebar(localStorage.getItem('ps_sidebar_collapsed') === 'true' || innerWidth < 760);
    await render();
    // Warm in-memory cache in background for instantaneous sub-10ms route navigation
    setTimeout(() => {
      api('/overview').catch(() => {});
      api('/records?module=materials&size=2000').catch(() => {});
      api('/records?module=xrf-iqc&size=2000').catch(() => {});
      api('/records?module=xrf-oqc&size=2000').catch(() => {});
      api('/records?module=xrf-plan&size=2000').catch(() => {});
    }, 250);
  } catch(error) {
    console.error('Init error:', error);
    if(content) {
      content.innerHTML = `<div class="alert error"><b>Lỗi tải hệ thống:</b> ${esc(error.message)}</div><button id="retry-init">Thử lại</button>`;
      const rb = $('#retry-init'); if(rb) rb.onclick = () => location.reload();
    }
  }
})();

