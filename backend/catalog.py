"""Shared forms, table columns and navigation for the operational application."""
def field(key, label, kind='text', options=None, required=False):
    return {'key': key, 'label': label, 'type': kind, 'options': options or [], 'required': required}


def fields(spec):
    return [field(*entry) for entry in spec]


STATUS = ['Pending', 'Compliant', 'NG', 'Not Applicable', 'Open', 'On-going', 'Pending Verification', 'Closed', 'Completed']
COMMON = fields([('dri', 'DRI'), ('department', 'Department'), ('due_date', 'Hạn xử lý / review', 'date'), ('status', 'Trạng thái', 'select', STATUS), ('notes', 'Ghi chú', 'textarea')])
MATERIAL = fields([('material_code','Part Code','text',None,True),('material_name','Part Name','text',None,True),('category','Category','select',['Direct Material','Indirect Material','Raw material','Packing material','Finish Good','Part','Chemical']),('supplier','Nhà cung cấp'),('manufacturer','Nhà sản xuất'),('material_type','Loại vật liệu'),('project','Project'),('phase','Giai đoạn'),('application','Ứng dụng'),('cts_category','CTS Category'),('requirement','Requirement áp dụng'),('approval','Phê duyệt','select',['Pending','Approved','Rejected']),('required_tests','Yêu cầu kiểm nghiệm','text'),('usage_status','Tình trạng sử dụng','select',['Đang sử dụng','Tạm ngưng','Ngừng sử dụng'])])
REPORT = fields([('report_id','Số báo cáo','text',None,True),('test_type','Loại test'),('material_code','Part Code'),('material_name','Vật liệu / Thành phẩm'),('project','Project'),('supplier','Nhà cung cấp'),('manufacturer','Nhà sản xuất'),('lab','Phòng Lab'),('method','Phương pháp test','textarea'),('issue_date','Ngày phát hành','date'),('expiry_date','Ngày hết hạn','date'),('result','Kết quả nguồn'),('file_reference','File trong workbook')])
REQUIREMENT = fields([('requirement_id','Requirement ID','text',None,True),('requirement','Nội dung yêu cầu','textarea',None,True),('category','Category'),('frequency','Tần suất'),('last_review','Review gần nhất','date')])
DOC = fields([('document_no','Document No.','text',None,True),('document_name','Tên tài liệu','text',None,True),('category','Nhóm tài liệu'),('revision','Revision'),('owner','Owner'),('effective_date','Ngày hiệu lực','date'),('review_date','Ngày review','date'),('tags','Tags'),('material_code','Mã vật liệu liên quan')])
XRF = fields([('material_code','Part Code','text',None,True),('material_name','Part Name'),('phase','Giai đoạn'),('project','Dự án / Model'),('supplier','Supplier'),('category','Category'),('build','Build'),('material_type','Nhóm vật liệu','select',['Polymers','Metals/Ceramic/Glass','Composite','Packaging']),('lot','Lot No.'),('arrival_date','Ngày nhận','date'),('test_date','Ngày test','date'),('br','Br (ppm)','number'),('cl','Cl (ppm)','number'),('cd','Cd (ppm)','number'),('pb','Pb (ppm)','number'),('cr','Cr (ppm)','number'),('hg','Hg (ppm)','number'),('result','Kết quả nguồn')])

MODULES = {}


def module(key, title, group, form, description='', common=True):
    MODULES[key] = {'id':key,'title':title,'group':group,'fields':form + (COMMON if common else []),'description':description}


RSS_FIELDS = fields([('chemical_group','Chemical or Group','text',None,True),('cas_no','CAS No.','text',None,True),('limit','Threshold Limit','textarea'),('scope','Scope','textarea'),('example','Example','textarea')])

for key, title in [('cts-2','CTS_2 – IQC / OQC'),('cts-3','CTS_3 – VOC / SVHC')]:
    module(key,title,'materials',REQUIREMENT,'')
module('cts-1', 'CTS_1 – Chất hạn chế', 'materials', RSS_FIELDS, '', common=False)
module('declarations','Tuyên bố tuân thủ','materials',fields([('declaration_no','Declaration No.','text',None,True),('material_code','Part Code'),('supplier','Nhà cung cấp'),('scope','Phạm vi','textarea'),('issue_date','Ngày phát hành','date'),('expiry_date','Ngày hết hạn','date'),('approval','Phê duyệt','select',['Pending','Approved','Rejected'])]))
module('materials','Danh mục NVL','materials',MATERIAL,'')
module('suppliers','Nhà cung cấp','materials',fields([('supplier','Nhà cung cấp','text',None,True),('evaluation_status','Tình trạng đánh giá','select',['Approved','Qualified','Conditional','Pending','Blacklist']),('audit_grade','Xếp loại / Grade','select',['Hạng A (Xuất sắc)','Hạng B (Đạt)','Hạng C (Cần cải tiến)','Hạng D (Không đạt)']),('last_audit_date','Ngày đánh giá gần nhất','date'),('next_audit_date','Hạn đánh giá tiếp theo','date'),('contact','Người liên hệ'),('email','Email','email'),('phone','Điện thoại'),('address','Địa chỉ','textarea'),('evaluation_notes','Ghi chú đánh giá','textarea')]), '', False)
module('reports','Báo cáo thử nghiệm / TRM','materials',REPORT,'')
module('material-declarations','Tuyên bố / Declaration','materials',MODULES['declarations']['fields'],common=False)
module('fmd','FMD – Thành phần & CAS','materials',fields([('material_code','Part Code','text',None,True),('material_name','Part Name'),('project','Project'),('supplier','Supplier'),('cas','CAS No.'),('substance','Substance Name','text',None,True),('composition','Composition (%)'),('test_type','Test Report'),('report_id','Test Report ID'),('lab','Test Lab'),('issue_date','Certification Date','date'),('expiry_date','Expiration Date','date'),('flag','Flag','textarea'),('investigation','Flag Investigation','textarea'),('result','Kết quả nguồn')]),'')
module('bom','Quản lý & Cập nhật BOM','settings',fields([('customer','Customer'),('config','Config'),('parent_code','Mã thành phẩm'),('project','Model'),('category','Category'),('level','Level','number'),('material_code','Part Code','text',None,True),('material_name','Part Name'),('supplier','Supplier'),('norm','NORM')]))
module('test-plan','XRF data','materials',fields([('material_name','Tên Thành phẩm','text',None,True),('material_code','Mã thành phẩm (Part Code)'),('test_type','Loại test'),('test','Loại test mẫu (bên thứ 3)'),('category','Category'),('report_deadline','Thời hạn báo cáo','date'),('report_result','Kết quả báo cáo','select',['Pending','Pass','Fail','NG','Khác'])]))
module('oqc-reports','Báo cáo thành phẩm / OQC','materials',REPORT)
module('xrf-plan','XRF plan','xrf-group',fields([('material_code','Part Code','text',None,True),('material_name','Part Name'),('year_month','Kỳ kế hoạch / Tháng','text',None,True),('plan_type','Loại kế hoạch / Khai báo','select',['carry_over','exemption','scheduled']),('inherited_lot','Mã Lot kế thừa'),('inherited_test_date','Ngày test của Lot kế thừa','date'),('declared_by','Người khai báo'),('test','Loại test'),('category','Category'),('npi_phase','NPI Phase'),('mp_phase','MP phase')]))
for key,title in [('xrf-iqc','IQC data'),('xrf-oqc','OQC data'),('change-control','Change Control')]:
    module(key,title,'xrf-group',XRF,'')
module('xrf-standard','XRF – Giới hạn kiểm soát','settings',fields([('element','Chất','text',None,True),('material_type','Nhóm vật liệu','text',None,True),('control_limit','Control Limit (ppm)','number'),('spec_limit','Spec Limit (ppm)','number'),('rule','Quy tắc kết hợp','textarea')]),'')
module('xrf', 'XRF', 'materials', [], '', common=False)
module('organization','Cơ cấu tổ chức & DRI','management',fields([('department_name','Department','text',None,True),('role','Vai trò'),('primary','Người phụ trách'),('backup','Người backup'),('responsibility','Trách nhiệm','textarea'),('email','Email','email')]))
module('training','Đào tạo','management',fields([('course','Khóa học','text',None,True),('employee','Nhân viên','text',None,True),('training_date','Ngày đào tạo','date'),('expiry_date','Ngày hết hạn','date'),('trainer','Trainer'),('certificate','Certificate')]))
module('risk','Công đoạn rủi ro cao','management',fields([('process','Process','text',None,True),('risk_category','Risk Category'),('concern','Mối nguy','textarea'),('substance','Chất liên quan'),('control','Kiểm soát','textarea'),('frequency','Tần suất')]))
module('ncr','Non-Conformity','management',fields([('ncr_no','NCR No.','text',None,True),('issue_date','Ngày phát sinh','date'),('source','Nguồn phát hiện'),('material_code','Vật liệu / Process'),('issue','Issue','textarea',None,True),('severity','Severity','select',['Minor','Major','Critical']),('containment','Containment','textarea')]))
module('capa','CAPA','management',fields([('capa_no','CAPA No.','text',None,True),('ncr_no','NCR liên quan'),('material_code','Part Code'),('issue','Issue','textarea'),('containment','Containment','textarea'),('root_cause','Root Cause','textarea'),('corrective','Corrective Action','textarea'),('preventive','Preventive Action','textarea'),('verification','Verification','textarea'),('closure','Closure','textarea')]),'')
for key,title in [('procedures','Quy trình & Tiêu chuẩn'),('documents','Hồ sơ'),('retention-records','Lưu mẫu / Lưu dữ liệu'),('appendices','Phụ lục')]:
    module(key,title,'documents',DOC)
module('master-data','Master Data','settings',fields([('category','Danh mục','select',['Supplier','Manufacturer','Material Type','Project','CTS Category','Compliance Status','Department','Test Type','Laboratory','Document Category','Risk Category'],True),('value','Giá trị','text',None,True)]))
module('test-types','Cấu hình loại kiểm nghiệm','settings',fields([('name','Tên loại kiểm nghiệm','text',None,True),('standard','Tiêu chuẩn áp dụng','text'),('description','Mô tả & Ghi chú','textarea'),('default_selected','Mặc định áp dụng','select',['Có','Không'])]),'',False)

GROUPS = [('dashboard','Dashboard'),('materials','Sản phẩm & Vật liệu'),('xrf-group','XRF data'),('management','Quản lý'),('documents','Trung tâm tài liệu'),('settings','Cài đặt')]
SPECIAL = {'dashboard': [('dashboard','Dashboard')], 'materials':[('xrf-trend','XRF – Xu hướng & thực hiện')], 'documents':[('imports','Nguồn Excel & đối chiếu')], 'settings':[('users','Quản lý người dùng'),('roles','Vai trò & Phân quyền'),('notifications','Cài đặt thông báo'),('retention','Quy định lưu trữ'),('system','Cấu hình hệ thống')]}


def catalog():
    groups=[]
    materials_order = ['suppliers', 'materials']
    settings_order = ['xrf-standard', 'bom', 'test-types', 'master-data', 'users', 'roles', 'notifications', 'retention', 'system']
    for key,title in GROUPS:
        items=[{'id':k,'name':v['title']} for k,v in MODULES.items() if v['group']==key]
        items += [{'id':k,'name':v} for k,v in SPECIAL.get(key,[])]
        if key=='materials':
            items = [i for i in items if i['id'] in materials_order]
            items.sort(key=lambda x: materials_order.index(x['id']))
        if key=='settings':
            items.sort(key=lambda x: settings_order.index(x['id']) if x['id'] in settings_order else 99)
        groups.append({'id':key,'name':title,'items':items})
    return {'modules':MODULES,'groups':groups}
