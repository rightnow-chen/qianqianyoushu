from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

OUT = r'G:\\qianqianyoushu\\签约有数_产品方案策划.docx'
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
p=doc.add_paragraph(style='Title'); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; p.add_run('签约有数 产品方案策划')
p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; p.add_run('基于最佳实践与微创新的签约前 AI 工具方案').italic=True
p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; p.add_run('版本：V1.0  |  日期：2026年10月27日')
doc.add_heading('一、方案结论',1)
p=doc.add_paragraph(); p.add_run('签约有数定位为：').bold=True; p.add_run('面向首次租房者的签约前合同风险与沟通 AI 工具。')
doc.add_paragraph('它不是 Agent，不替用户自主执行任务，不自动代表用户谈判，也不负责调用多个外部系统完成复杂任务。它通过固定、可解释、用户可控的分析流程，把合同内容转化为风险清单、修改文字、沟通话术和待核实事项。')
doc.add_paragraph('核心价值是：让用户在签约前几分钟内完成一次低门槛、可行动的合同初筛。')
doc.add_heading('二、用户问题与需求依据',1)
addtable(doc,['用户问题','验证依据','方案回应'],[
['合同阅读不足','多人在签约当天、签约后才认真查看合同','提供快速初筛和重点风险排序'],['高风险集中在押金、退租、维修和附加费用','访谈与问卷B4共同支持','建立租客场景重点规则'],['用户不只想知道风险，还想知道怎么改、怎么说','访谈明确提出修改建议和沟通话术','输出可复制的修改文字和话术'],['纸质和图片合同占比高','64/91，70.3%','图片/PDF输入与OCR前置'],['AI有期待但信任存疑','40/91使用过AI，访谈要求准确、可解释','原文定位、依据说明、风险等级和边界提示'],['口头承诺可能不在合同中','多名受访者提及','提供待核实清单，并验证合同内外一致性']])
doc.add_heading('三、最佳实践分析',1)
doc.add_heading('3.1 直接竞品可复用的成熟能力',2)
addtable(doc,['参考对象','可复用最佳实践','签约有数的取舍'],[
['通义法睿','审查立场、三级风险、原文对照、报告输出','保留租客立场、风险等级和原文定位，降低复杂参数'],['得理 AI 合同审查','风险跳转、修改建议、依据可溯源','保留原文证据和建议，不追求律师级复杂度'],['TheLeaseCheck','评分、红旗、谈判信、风险到行动','借鉴风险到行动，转化为中文沟通话术'],['LeaseSnipe / ClearSign','免费扫描、问房东问题、不存储、红旗清单','借鉴低门槛、待核实清单和隐私表达'],['通用大模型','自然语言输入、灵活追问、低使用门槛','用固定结构和租房规则提升稳定性']])
doc.add_heading('3.2 最佳实践的不足',2)
for x in ['多数产品解决“看出风险”，但没有完整解决“如何修改、如何沟通”。','通用大模型可以生成分析，但输出结构不稳定，用户需要自己设计提示词。','合同外口头承诺、附加费用和出租人权限等事项，通常需要用户主动想到并整理。','法律 AI 的复杂功能较多，不一定适合签约时间紧、法律知识弱的首次租房者。']:
    doc.add_paragraph(x,style='List Bullet')
doc.add_heading('四、微创新方案',1)
doc.add_paragraph('本方案只聚焦两个微创新方向，不扩展为复杂 Agent 或全能租房平台。')
addtable(doc,['微创新方向','方案设计','增量价值'],[
['角色升级：从审查工具到签约前决策工具','在风险标注之后固定输出修改建议、沟通话术和待核实清单','减少用户从“发现问题”到“采取行动”的决策成本'],['场景整合：把签约前动作串成闭环','上传合同→识别风险→解释后果→修改→沟通→核对→决定是否签约','减少用户在 AI、搜索、亲友和文档之间来回切换']])
doc.add_heading('五、产品定位与边界',1)
p=doc.add_paragraph(); p.add_run('一句话定位：').bold=True; p.add_run('签约有数，帮首次租房者在签约前看懂合同、找出高风险、知道怎么改、知道怎么和房东说。')
addtable(doc,['做什么','不做什么'],[
['合同原文风险识别和定位','不判断房东身份真伪'],['租客视角的风险解释和修改建议','不替代律师，不承诺法律结论'],['礼貌版和协商版沟通话术','不自动发送消息，不替用户谈判'],['合同外待核实清单','不做平台担保和纠纷兜底'],['口头承诺与合同一致性核对（P1验证）','不做入住、验房、退租取证管理'],['隐私脱敏和不存储说明','不在首版覆盖所有短租、二房东和隔断房专项']])
doc.add_heading('六、产品模块设计',1)
addtable(doc,['模块','核心功能','用户产出'],[
['合同输入','图片、PDF、Word、文本；OCR和敏感信息提示','可分析的合同文本'],['快速审查','默认租客立场；提取重点条款；风险分类','高风险、需确认、一般提醒清单'],['证据解释','原文片段、页码/条款位置、可能后果','用户知道为什么被标记'],['修改建议','生成补充、替换或删除建议','可直接复制的合同修改文字'],['沟通话术','礼貌版、协商版，必要时附解释理由','可直接发送或口头表达的话术'],['签前核对','待核实清单；房东身份、出租权、口头承诺、费用等提醒','签约前问题清单'],['结果与边界','风险摘要、决定建议、非法律意见和专业咨询提示','继续签、要求修改或进一步咨询的参考']])
doc.add_heading('七、核心用户流程',1)
for x in ['进入工具，选择“我是租客，准备签约”。','上传合同图片、PDF或Word；系统提示用户先脱敏敏感信息。','系统提取合同文本并展示识别状态，避免用户误以为已经完成法律审查。','优先展示最高风险事项，按“风险—后果—原文—建议”组织。','用户查看修改建议，选择复制条款或继续查看其他风险。','用户查看礼貌版和协商版沟通话术。','系统生成合同外待核实清单；若用户填写口头承诺，则给出合同内外一致性对照。','用户获得签约前行动摘要：必须修改、需要确认、可接受但需留意。']:
    doc.add_paragraph(x,style='List Number')
doc.add_heading('八、AI工具工作流',1)
doc.add_paragraph('签约有数采用“固定流程+结构化输出”的 AI 工具工作流，不采用自主 Agent 架构。')
addtable(doc,['步骤','AI工具承担的工作','用户控制点'],[
['1. 文档解析','OCR、文本抽取、条款分段','确认识别文本是否完整'],['2. 场景识别','识别租赁合同和租客视角','可修改身份或重新上传'],['3. 规则审查','按租房风险规则识别重点事项','查看风险原文和依据'],['4. 结果生成','生成后果解释、修改建议和话术','逐条查看、复制或忽略'],['5. 一致性核对','对比用户填写的口头承诺与合同内容（P1）','确认哪些承诺是真实存在的'],['6. 输出摘要','生成签约前行动清单','由用户决定签约、协商或咨询']])
doc.add_paragraph('关键原则：AI只提出分析和建议，不主动执行外部操作；每条结论尽量关联合同原文；不确定内容明确标注；用户可以逐条忽略、修改或重新询问。')
doc.add_heading('九、MVP 与需求优先级',1)
addtable(doc,['优先级','功能范围','进入版本的理由'],[
['P0','图片/PDF/Word/文本输入；租客视角；重点风险识别；原文定位；三档风险；后果解释；修改建议；两类沟通话术；隐私和责任边界','构成从发现风险到采取行动的最小闭环'],['P1','待核实清单；口头承诺录入；合同内外一致性；修改后复查；损失金额汇总','验证差异化价值，补上合同审查之外的签约动作'],['P2','确定性分级；律师转介；城市法规库；多合同对比','需要准确性、合规或商业化验证'],['P3-P5','家庭协作、历史记录、验房、退租证据、补贴匹配、平台兜底','不属于签约前核心场景或资源成本过高']])
doc.add_heading('十、关键策略',1)
doc.add_heading('10.1 输出策略：先行动，后解释',2)
doc.add_paragraph('首屏先展示“必须处理的事项”，每个事项按风险等级、可能后果、合同原文、修改建议、沟通话术展开。避免先输出长篇法律解释。')
doc.add_heading('10.2 可信度策略：证据可见，不做过度承诺',2)
doc.add_paragraph('每条风险尽量绑定原文位置；将“合同明确写明”“需要进一步确认”“可能存在风险”区分开；对复杂或高风险问题提示咨询专业人士。')
doc.add_heading('10.3 低门槛策略：减少提示词和参数',2)
doc.add_paragraph('默认租客立场和租房场景，不要求用户配置复杂审查规则。用户只需上传合同并回答少量关键问题。')
doc.add_heading('10.4 隐私策略：上传前提醒，结果可控',2)
doc.add_paragraph('提示用户脱敏姓名、身份证号、手机号、详细住址等信息；明确文件保存方式和删除机制；不把隐私合规只放在免责声明中。')
doc.add_heading('十一、验证方案与成功指标',1)
addtable(doc,['验证问题','方法','核心指标'],[
['用户是否能完成签前闭环','脱敏真实合同可用性测试','3分钟内找到最高风险；任务完成率'],['建议是否能促成行动','观察用户是否修改或复制话术','修改建议采纳率；话术复制率'],['差异化是否成立','与通用大模型和竞品横测','风险识别准确性；行动建议完整度；用户偏好'],['口头承诺核对是否有价值','输入访谈中的真实承诺并对照合同','未写入事项识别率；用户认为有帮助的比例'],['AI结果是否可信','专业人士对照评测集','关键风险一致率；漏报率；误报率'],['隐私是否影响使用','上传前后访谈和行为观察','上传完成率；敏感信息担忧比例'],['是否值得持续使用','一周内复测和访谈','重复使用意愿；推荐意愿；付费意愿']])
doc.add_heading('十二、迭代路线',1)
addtable(doc,['版本','产品目标','主要范围'],[
['V0.1','验证核心闭环','上传、风险、原文、后果、修改、话术、待核实清单'],['V0.2','验证微创新','口头承诺、一致性核对、修改后复查、损失金额提示'],['V1.0','形成稳定工具','稳定OCR、稳定规则、结构化结果、隐私机制、错误反馈'],['V2.0','扩展服务价值','确定性分级、专业人士转介、城市规则和增值服务']])
doc.add_heading('十三、最终判断标准',1)
for x in ['用户能在签约前发现最重要的风险。','用户能拿到可直接修改的合同文字。','用户能把建议转化为与房东沟通的行动。','AI工具的分析过程可解释、可控，不把不确定结论包装成法律结论。']:
    doc.add_paragraph(x,style='List Number')
doc.add_heading('附录：方案依据',1)
doc.add_paragraph('本方案综合《租房合同审查产品需求验证分析报告》《签前有数 竞品分析报告 v0.2》及《方案策划——最佳实践与微创新》的方法整理。竞品材料中标注“待核实”“待实测”的内容，本方案仅作为待验证假设。')
for section in doc.sections:
    f=section.footer.paragraphs[0]; f.alignment=WD_ALIGN_PARAGRAPH.CENTER; f.add_run('签约有数 | 产品方案策划').font.size=Pt(8)
doc.save(OUT); print(OUT)

