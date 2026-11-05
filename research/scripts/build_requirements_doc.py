from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.section import WD_SECTION

OUT = r"G:\zu-xiao-shen-main\需求分析与需求验证方法论.docx"
doc = Document()
sec = doc.sections[0]
sec.top_margin = Inches(0.65); sec.bottom_margin = Inches(0.65)
sec.left_margin = Inches(0.75); sec.right_margin = Inches(0.75)

styles = doc.styles
styles['Normal'].font.name = 'Microsoft YaHei'; styles['Normal']._element.rPr.rFonts.set(qn('w:eastAsia'), 'Microsoft YaHei'); styles['Normal'].font.size = Pt(10.5)
for s, size, color in [('Title', 23, '000000'), ('Heading 1', 16, '000000'), ('Heading 2', 12, '000000'), ('Heading 3', 10.5, '000000')]:
    st=styles[s]; st.font.name='Microsoft YaHei'; st._element.rPr.rFonts.set(qn('w:eastAsia'),'Microsoft YaHei'); st.font.size=Pt(size); st.font.bold=True; st.font.color.rgb=RGBColor.from_string(color)
styles['Normal'].paragraph_format.space_after = Pt(5); styles['Normal'].paragraph_format.line_spacing = 1.18
for s in ['Heading 1','Heading 2','Heading 3']:
    styles[s].paragraph_format.space_before=Pt(10); styles[s].paragraph_format.space_after=Pt(4)

def shade(cell, fill):
    tcPr=cell._tc.get_or_add_tcPr(); shd=tcPr.find(qn('w:shd'))
    if shd is None: shd=OxmlElement('w:shd'); tcPr.append(shd)
    shd.set(qn('w:fill'), fill)
def borders(table, color='D9D9D9'):
    tblPr=table._tbl.tblPr; b=tblPr.first_child_found_in('w:tblBorders')
    if b is None: b=OxmlElement('w:tblBorders'); tblPr.append(b)
    for edge in ('top','left','bottom','right','insideH','insideV'):
        tag='w:'+edge; el=b.find(qn(tag))
        if el is None: el=OxmlElement(tag); b.append(el)
        el.set(qn('w:val'),'single'); el.set(qn('w:sz'),'4'); el.set(qn('w:color'),color)
def set_cell(cell, text, bold=False, color='000000', size=9.2):
    cell.text=''; p=cell.paragraphs[0]; p.paragraph_format.space_after=Pt(2)
    r=p.add_run(text); r.bold=bold; r.font.name='Microsoft YaHei'; r._element.rPr.rFonts.set(qn('w:eastAsia'),'Microsoft YaHei'); r.font.size=Pt(size); r.font.color.rgb=RGBColor.from_string(color)
    cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
def table(headers, rows, widths=None):
    t=doc.add_table(rows=1, cols=len(headers)); t.alignment=WD_TABLE_ALIGNMENT.CENTER; t.autofit=False; borders(t)
    for i,h in enumerate(headers):
        set_cell(t.rows[0].cells[i], h, True, 'FFFFFF', 9); shade(t.rows[0].cells[i], '1F4E79')
    for ri,row in enumerate(rows):
        cells=t.add_row().cells
        for i,val in enumerate(row):
            set_cell(cells[i], str(val), False, '000000', 8.7); shade(cells[i], 'F3F6F9' if ri%2 else 'FFFFFF')
    if widths:
        for row in t.rows:
            for i,w in enumerate(widths): row.cells[i].width=Inches(w)
    doc.add_paragraph().paragraph_format.space_after=Pt(1)
    return t
def para(text='', boldlead=None):
    p=doc.add_paragraph()
    if boldlead and text.startswith(boldlead):
        p.add_run(boldlead).bold=True; p.add_run(text[len(boldlead):])
    else: p.add_run(text)
    return p
def bullet(text, level=0):
    p=doc.add_paragraph(style='List Bullet' if level==0 else 'List Bullet 2'); p.paragraph_format.space_after=Pt(2); p.add_run(text); return p

title=doc.add_paragraph(style='Title'); title.alignment=WD_ALIGN_PARAGRAPH.CENTER; title.add_run('需求分析与需求验证方法论')
sub=doc.add_paragraph(); sub.alignment=WD_ALIGN_PARAGRAPH.CENTER; r=sub.add_run('从发现痛点到验证需求成立的完整工作手册'); r.font.size=Pt(11); r.font.color.rgb=RGBColor.from_string('666666')
para('本手册将需求分析与用户调研、原型验证、MVP 实验和数据分析整合为一套可执行流程。核心结论是：不要验证用户是否喜欢一个想法，而要验证用户是否正在为某个问题持续付出时间、金钱或其他成本。')

doc.add_heading('一 需求分析的目标', level=1)
para('需求分析不是把用户说的话直接翻译成功能，而是判断产品应该为谁解决什么问题、先做什么、暂时不做什么，以及如何用低成本证据证明需求值得投入。')
table(['目标','要回答的问题'],[
['识别真实痛点','用户遇到了什么问题？问题在什么场景发生？'],
['判断需求真假','这是持续存在的问题，还是一时兴起的想法？'],
['控制产品范围','最小 MVP 是什么？哪些功能暂不做？'],
['形成产品差异化','为什么用户选择这个产品，而不是现有替代方案？'],
['验证商业价值','用户是否愿意持续使用、提供真实数据或付费？']], [1.45,5.7])

doc.add_heading('二 从痛点到可验证假设', level=1)
para('发现痛点后，先不要急着设计功能。将观察转化为一条可验证假设：')
para('对于【目标用户】，在【具体场景】中，他们需要完成【任务】，但因为【现有障碍】而产生【时间、金钱、错误或机会成本】；如果提供【解决结果】，他们可能愿意通过【使用、提供资料、付费或其他行为】来交换。')
table(['要素','示例'],[
['目标用户','准备 KET 的学生与家长'],['具体场景','每周检查口语和作文作业'],['真实问题','缺少即时、可信、可理解的反馈'],['当前替代方案','家长人工检查、找老师、使用通用 AI'],['付出成本','每周约 2 小时，且反馈质量不稳定'],['待验证价值','自动纠错、解释原因并生成训练建议'],['行为假设','愿意上传真实作业并持续使用']], [1.55,5.6])

doc.add_heading('三 判断需求是否真实', level=1)
para('真需求通常同时具备明确场景、重复发生、当前成本和用户行动。仅凭“用户说需要”不能证明需求成立。')
table(['判断维度','真需求信号','伪需求信号'],[
['场景','能描述最近一次真实经历','只能泛泛说“以后可能会用”'],
['频率','每天、每周或稳定重复发生','偶尔想到，使用场景不清楚'],
['痛度','不解决会导致明显损失','只是觉得更方便、更有趣'],
['替代方案','已经用人工、工具或付费服务解决','没有任何替代行为'],
['投入意愿','愿意提供资料、试用、持续使用或付费','只愿意口头表达兴趣']], [1.2,3.0,2.95])
doc.add_heading('四 需求分析的核心步骤', level=1)
doc.add_heading('1 分辨需求真伪', level=2)
bullet('焦点追问：围绕“为什么”追问表面需求背后的真实动机。')
bullet('用户分层：区分核心用户、付费者、实际使用者、决策者和边缘用户。')
bullet('成本收益判断：比较研发、维护、学习成本与效率、体验和商业收益。')
bullet('MVP 验证：先做最小闭环，观察真实使用和持续性。')
doc.add_heading('2 确定需求范围', level=2)
bullet('最小 MVP：只保留能解决核心痛点、能验证价值的功能。')
bullet('独立模块闭环：每个模块都要能完成“输入—处理—结果—反馈或下一步”。')
bullet('产品路线图：用 V1.0、V1.1、V2.0 分阶段迭代，不一次性追求大而全。')
bullet('流程分层：区分主流程、边缘流程和异常流程。')
doc.add_heading('3 划分需求优先级', level=2)
para('优先级建议从影响面、痛度和频次三个维度评估。')
table(['等级','定义','典型判断'],[
['P0','核心刚需','没有它，产品无法成立或核心任务无法完成'],
['P1','高价值需求','显著提升体验，强化核心价值或形成差异化'],
['P2-P3','中低优先级','锦上添花、增长辅助或阶段性需求'],
['P4-P5','暂不做','低频、低痛、替代方案充足或成本收益比差']], [1.0,1.7,4.45])

doc.add_heading('五 大厂常用的需求调研行为', level=1)
doc.add_heading('1 桌面研究与替代方案分析', level=2)
para('先研究用户现在如何解决问题，而不是先研究自己想做的功能。关注竞品、人工服务、表格、微信群、搜索、通用 AI 以及“什么都不做”等替代方案。')
bullet('查找搜索词、社区讨论、客服记录、工单、退款原因、流失原因和历史反馈。')
bullet('记录每种替代方案的流程、成本、频率、不满点和用户放弃原因。')
doc.add_heading('2 半结构化深度访谈', level=2)
para('访谈重点是过去发生过什么，而不是用户对未来功能的想象。探索阶段可先访谈 5—8 人；单一用户群体通常访谈 10—15 人，直到主要主题趋于稳定。')
table(['推荐问法','不推荐问法'],[
['请回忆最近一次遇到这个问题的情况。','如果有这个功能，你会用吗？'],
['当时你具体做了什么？','你觉得这个想法怎么样？'],
['用了哪些工具？花了多久？','你愿意付多少钱？'],
['为什么没有继续使用原来的方法？','你是不是也觉得这个功能很有用？']], [3.45,3.7])
doc.add_heading('3 情境观察与日记研究', level=2)
bullet('情境观察：观察用户完成任务时的停顿、切换、复制粘贴、返工、询问和绕行行为。')
bullet('日记研究：适合低频或长周期问题，让用户记录 1—2 周内的发生时间、行为、成本、情绪和结果。')
doc.add_heading('4 量化问卷', level=2)
para('问卷用于判断规模和分群，不替代访谈。先问过去的行为，再问态度和意愿。早期探索可收集 100—300 份有效样本；需要分群比较时，应保证每个关键群体都有足够样本。')
doc.add_heading('5 原型与可用性测试', level=2)
bullet('概念测试：验证用户是否理解产品解决什么问题。')
bullet('任务测试：让用户完成具体任务，观察是否卡住、是否信任结果、是否需要人工修正。')
bullet('Wizard of Oz：用户以为系统自动完成，实际由人工完成部分流程，用于低成本验证结果价值。')
bullet('Concierge MVP：先用人工提供完整服务，验证用户是否愿意持续使用或付费。')
doc.add_heading('6 MVP 与真实行为实验', level=2)
para('MVP 不是功能很少，而是用最少能力验证最关键的价值假设。至少应包含一个明确用户群、一个高频或高痛场景、一条完整任务链、一个可观测结果和失败补救机制。')

doc.add_heading('六 证据等级与验证指标', level=1)
table(['证据等级','典型信号','说明'],[
['弱证据','口头说喜欢、问卷选择有兴趣、点赞、入口点击','只能说明态度或好奇心'],
['中等证据','报名测试、提交真实资料、完成任务、接受人工服务','开始出现实际投入'],
['强证据','持续使用、重复使用、付费、预订、签约、主动推荐','说明问题和价值都较强']], [1.25,3.25,2.65])
doc.add_heading('建议追踪的指标', level=2)
table(['指标层','指标示例'],[
['触达','到达率、注册率、激活率'],['使用','首次任务完成率、核心功能使用率、任务成功率'],['留存','次日、七日、三十日留存，重复使用率'],['价值','节省时间、减少错误、提高完成率、学习结果改善'],['商业','付费转化、续费率、退款率、客单价、获客成本']], [1.25,5.9])
para('A/B 测试前要明确假设、对照组、实验组、主指标、观察周期、成功标准和副作用。不要只看点击率，应重点看任务完成、重复使用、成本改善和付费行为。')

doc.add_heading('七 研究偏差与控制方法', level=1)
table(['常见偏差','表现','控制方法'],[
['选择偏差','只访谈朋友或积极用户','覆盖活跃、沉默、流失和不同付费层级用户'],
['诱导偏差','访谈者暗示答案','先问事实，再问态度，少介绍方案'],
['回忆偏差','用户记不清过去行为','追问最近一次，要求展示记录或实际流程'],
['解决方案偏差','用户评价的是功能而不是问题','先做问题验证，再做方案验证'],
['幸存者偏差','只分析成功使用者','专门访谈流失、退款和未完成任务用户'],
['样本偏差','样本不代表目标市场','设置筛选条件并按用户群体分层分析']], [1.25,2.65,3.25])

doc.add_heading('八 一套可执行的验证流程', level=1)
steps=['提出假设：明确用户、场景、问题、频率、损失和待验证价值。','桌面研究：分析竞品、替代方案、搜索、客服、工单和历史数据。','深度访谈：围绕最近一次真实经历追问行为与成本。','情境观察：观察任务流程中的停顿、切换、返工和绕行。','问卷量化：确认问题覆盖范围、频率、严重度和用户分群。','原型测试：验证理解、可用性、信任感和任务完成情况。','人工 MVP：验证服务结果是否有价值以及是否存在付费意愿。','产品 MVP：上线最小闭环，观察真实使用、留存和结果指标。','实验迭代：通过 A/B 测试和数据分析优化产品方案。','决策：继续投入、调整用户或场景，或停止需求。']
for i,s in enumerate(steps,1): bullet(f'{i}. {s}')

doc.add_heading('九 可直接填写的需求验证模板', level=1)
table(['字段','填写内容'],[
['需求名称',''],['目标用户',''],['触发场景',''],['用户要完成的任务',''],['当前解决方式',''],['真实痛点与损失',''],['发生频率',''],['核心用户还是边缘用户',''],['最小 MVP',''],['主流程闭环',''],['边缘流程',''],['异常流程',''],['优先级 P0-P5',''],['核心验证假设',''],['访谈计划与样本',''],['问卷计划与样本',''],['MVP 成功指标',''],['停止或继续标准','']], [2.2,4.95])

doc.add_heading('十 最终结论模板', level=1)
para('我的产品面向【目标用户】，在【具体场景】中解决【核心痛点】，先做【P0-P1 核心功能】形成【完整闭环】，暂不做【低价值或待验证功能】，通过【访谈、观察、原型、MVP 和数据指标】验证需求，并依靠【差异化优势】获得用户选择。')
para('判断标准：只有当需求具备明确场景、稳定频率、真实成本、持续行为和可量化改善时，才应进入持续研发。')

footer=sec.footer.paragraphs[0]; footer.alignment=WD_ALIGN_PARAGRAPH.CENTER; fr=footer.add_run('需求分析与需求验证方法论'); fr.font.size=Pt(8); fr.font.color.rgb=RGBColor.from_string('888888')
doc.save(OUT)
print(OUT)
