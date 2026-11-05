from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

OUT = r'G:\\zu-xiao-shen-main\\签前有数_MVP及需求优先级分析报告.docx'
def shade(c, fill):
    tcPr=c._tc.get_or_add_tcPr(); shd=OxmlElement('w:shd'); shd.set(qn('w:fill'),fill); tcPr.append(shd)
def settext(c, text, bold=False, color=None, size=9):
    c.text=''; p=c.paragraphs[0]; p.paragraph_format.space_after=Pt(0); r=p.add_run(str(text)); r.bold=bold; r.font.size=Pt(size)
    if color: r.font.color.rgb=RGBColor(*color)
def addtable(doc, headers, rows):
    t=doc.add_table(rows=1, cols=len(headers)); t.style='Table Grid'; t.alignment=WD_TABLE_ALIGNMENT.CENTER
    for i,h in enumerate(headers): settext(t.rows[0].cells[i],h,True,(255,255,255)); shade(t.rows[0].cells[i],'1F4E79')
    for row in rows:
        cells=t.add_row().cells
        for i,v in enumerate(row): settext(cells[i],v,size=8.5)
    doc.add_paragraph()
doc=Document(); sec=doc.sections[0]
sec.top_margin=Inches(.65); sec.bottom_margin=Inches(.65); sec.left_margin=Inches(.72); sec.right_margin=Inches(.72)
for name,size,color in [('Normal',10,'000000'),('Title',22,'17365D'),('Heading 1',15,'1F4E79'),('Heading 2',11,'2F75B2')]:
    s=doc.styles[name]; s.font.name='Microsoft YaHei'; s._element.rPr.rFonts.set(qn('w:eastAsia'),'Microsoft YaHei'); s.font.size=Pt(size); s.font.color.rgb=RGBColor.from_string(color)
    if name!='Normal': s.font.bold=True
p=doc.add_paragraph(style='Title'); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; p.add_run('签前有数 MVP 及需求优先级分析报告')
p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; p.add_run('基于用户需求验证与竞品差异分析').italic=True
p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; p.add_run('版本：V1.0  |  日期：2026年10月27日')
doc.add_heading('一、执行结论',1)
p=doc.add_paragraph(); p.add_run('建议将签前有数的 MVP 定义为：').bold=True; p.add_run('面向首次租房者的“签约前风险到行动闭环”。')
doc.add_paragraph('用户上传租房合同后，产品完成：识别高风险条款 → 解释可能后果 → 给出修改建议 → 生成与房东沟通的话术 → 列出合同外待核实事项。')
doc.add_paragraph('第一版不追求成为通用 AI 律师，而是解决用户在签约前几分钟内最关键的三个问题：有没有不能接受的风险、应该怎么改、应该怎么说。')
doc.add_heading('二、需求证据与产品判断',1)
addtable(doc,['证据','结果','产品含义'],[
['合同问题普遍性','53/91，58.2% 遇到过合同相关问题','需求成立，值得做签前初筛'],['损失严重度','21/91，23.1% 损失达到或超过2000元','风险解释需连接实际损失'],['输入门槛','64/91，70.3% 接触过纸质或图片合同','图片/OCR不是可选项'],['行动需求','31/91，34.1% 愿意修改对方合同','产品必须提供可执行修改文字'],['用户行为','访谈显示签约当天、签约后才认真阅读合同','入口必须靠近签约动作，流程要短'],['信任与隐私','用户期待 AI 初筛，但担心准确性和敏感信息泄露','需原文定位、边界说明、脱敏和不存储承诺']])
doc.add_heading('三、核心用户与使用场景',1); doc.add_heading('3.1 核心用户',2)
for x in ['刚毕业、第一次租房的年轻人','第一次在异地租房、缺少法律知识的租客','签约时间紧，希望快速判断但暂时不愿付费咨询律师']: doc.add_paragraph(x,style='List Bullet')
doc.add_heading('3.2 核心场景',2); doc.add_paragraph('用户拿到合同后，在签约前几分钟完成快速判断：')
for x in ['这份合同有没有不能接受的风险？','哪些条款必须修改？','应该怎么和房东或中介沟通？','哪些口头承诺没有写进合同？','哪些问题需要进一步咨询专业人士？']: doc.add_paragraph(x,style='List Number')
doc.add_heading('四、MVP 功能范围',1); doc.add_heading('4.1 P0：必须上线，构成最小闭环',2)
addtable(doc,['功能','MVP要求','优先级理由'],[
['合同输入','支持图片、PDF、Word、文本；至少保证图片和PDF可用','70.3%用户接触过纸质或图片合同'],['租客视角审查','默认租客立场，不要求用户理解复杂参数','符合核心用户认知水平'],['重点风险识别','押金、提前退租、维修、损坏、水电费、清洁费及其他附加费用','与访谈痛点和问卷B4一致'],['原文定位','标注页码、条款或原文片段','建立可解释性和可信度'],['风险等级','高风险 / 需确认 / 一般提醒三档','帮助用户在时间紧时先处理重点'],['风险后果解释','用普通语言说明可能产生的费用或纠纷','把法律问题转化为决策信息'],['修改建议','提供可直接替换或补充进合同的文字','支持用户实际修改合同'],['沟通话术','至少提供礼貌版和协商版','把识别结果转化为沟通行动'],['隐私与责任边界','上传前脱敏提示、不存储说明、非法律意见及高风险提示','降低上传顾虑，避免过度承诺']])
p=doc.add_paragraph(); p.add_run('P0闭环：').bold=True; p.add_run('上传合同 → 查看最高风险 → 阅读原文和后果 → 复制修改建议 → 复制沟通话术 → 完成签约前核对。')
doc.add_heading('4.2 P1：优先验证，形成差异化',2)
addtable(doc,['功能','验证目标'],[['合同外待核实清单','确认房东身份、出租权、转租授权、物业费、水电费、维修责任及设施现状'],['口头承诺录入','允许用户输入房东或中介说过的关键承诺'],['合同内外一致性核对','标出“对方说过但合同没有写”的事项'],['修改后复查','检查修改后风险是否消失'],['损失金额汇总','将押金、违约金及提前退租等影响转成金额提示'],['签约前问题清单','生成用户必须问房东的关键问题']])
doc.add_paragraph('其中，“口头承诺与合同一致性核对”最值得优先验证，但在横测和用户测试完成前，不应直接宣称为已成立的产品壁垒。')
doc.add_heading('4.3 P2：验证后再做',2)
addtable(doc,['功能','暂不优先原因'],[['确定性分级','需先验证“确定”判断与专业人士的一致率'],['律师转介','竞品已有类似能力，且高风险用户规模尚未验证'],['城市级法规库','建设与维护成本较高'],['多合同对比','属于增值功能，不影响核心闭环'],['在线签约嵌入','依赖平台合作，当前不可控'],['评分体系','可借鉴海外产品，但中国租房场景仍需验证']])
doc.add_heading('五、P0–P5 需求优先级总表',1)
addtable(doc,['优先级','需求','判定'],[['P0','图片/PDF/Word/文本输入；租客视角；重点风险识别；原文定位；风险等级；后果解释；修改建议；沟通话术；隐私与责任边界','必须做'],['P1','合同外待核实清单；口头承诺录入；合同内外一致性核对；修改后复查；损失金额汇总；关键问题清单','重点差异功能'],['P2','确定性分级；律师转介；城市法规和示范文本对照','需验证后做'],['P3','多合同比较；家庭协作；历史记录','非签约前刚需'],['P4','验房；退租证据包；入住后纠纷管理','超出当前场景'],['P5','补贴匹配；平台兜底；房东身份真实性判断','责任和资源成本过高']])
doc.add_heading('六、明确不做什么',1)
for x in ['不判断房东身份真伪，只生成核验提醒。','不承诺法律结论，不保证用户胜诉。','不做验房、退租取证和入住后纠纷管理。','不做短租、二房东、隔断房等复杂专项。','不做平台担保、租金垫付或纠纷兜底。','不在第一版建设完整城市法律数据库。','不把 AI 评分作为核心价值。']: doc.add_paragraph(x,style='List Bullet')
doc.add_heading('七、版本路线与验证指标',1)
addtable(doc,['版本','范围','核心验证指标'],[['V0.1 人工辅助验证版','图片/PDF、重点风险、原文定位、修改建议、两类话术、待核实清单','3分钟内找到最高风险；看懂比例；建议采纳率；话术复制率'],['V0.2 差异化验证版','口头承诺录入、合同内外一致性、合同外费用提醒、修改后复查','未写入事项识别率；用户认为有价值的比例；与通用大模型对比'],['V1.0 稳定可用版','稳定规则、稳定OCR、隐私机制、固定输出结构、高风险转专业提示','AI与专业判断一致率；漏报/误报率；重复使用率；用户推荐意愿']])
doc.add_heading('八、最终产品定位',1)
p=doc.add_paragraph(); p.add_run('建议对外定位：').bold=True; p.add_run('面向首次租房者的签约前合同风险与沟通助手：看懂合同、找出高风险、知道怎么改、知道怎么和房东说。')
p=doc.add_paragraph(); p.add_run('不建议定位为：').bold=True; p.add_run('AI律师、全能租房管家、房东身份鉴定工具，或自动替用户承担法律责任的合同审核平台。')
doc.add_heading('九、MVP 是否成立的最终判断标准',1)
for x in ['用户能在签约前发现最重要的风险。','用户能拿到可直接修改的合同文字。','用户能把建议转化为与房东沟通的行动。']: doc.add_paragraph(x,style='List Number')
doc.add_heading('附录：分析依据',1)
doc.add_paragraph('本报告依据《租房合同审查产品需求验证分析报告》和《签前有数 竞品分析报告 v0.2》整理。竞品报告中标注“待核实”“待实测”的内容，本报告仅作为待验证假设，不作为已证实事实。')
for section in doc.sections:
    f=section.footer.paragraphs[0]; f.alignment=WD_ALIGN_PARAGRAPH.CENTER; f.add_run('签前有数 | MVP及需求优先级分析报告').font.size=Pt(8)
doc.save(OUT); print(OUT)

