# -*- coding: utf-8 -*-
"""Generate a sample US residential lease agreement (PDF) for testing Leaseify."""
from fpdf import FPDF

class LeasePDF(FPDF):
    def header(self):
        pass
    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.cell(0, 10, f"Page {self.page_no()} / {{nb}}  |  SAMPLE DOCUMENT FOR TESTING", align="C")

pdf = LeasePDF("P", "mm", "Letter")
pdf.alias_nb_pages()
pdf.set_auto_page_break(auto=True, margin=20)
pdf.set_margins(20, 18, 20)

def _clean(text):
    return (text.replace("\u201c", '"').replace("\u201d", '"')
                .replace("\u2018", "'").replace("\u2019", "'")
                .replace("\u2013", "-").replace("\u2014", "-"))

def title(text, size=15, before=2, after=5):
    pdf.ln(before)
    pdf.set_font("Helvetica", "B", size)
    pdf.multi_cell(0, 7, _clean(text), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(after)

def heading(text):
    pdf.set_font("Helvetica", "B", 11)
    pdf.multi_cell(0, 6, _clean(text), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)

def body(text):
    pdf.set_font("Helvetica", "", 10)
    pdf.multi_cell(0, 5.5, _clean(text), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1.5)

pdf.add_page()

# ---- Title ----
title("RESIDENTIAL LEASE AGREEMENT", 16, before=0)
body("This Residential Lease Agreement (the \u201cAgreement\u201d) is made and entered into on this 1st day of October, 2026, by and between:")
body("LANDLORD: Meridian Property Holdings LLC, 4200 Wilshire Blvd, Suite 300, Los Angeles, CA 90010")
body("TENANT(S): Alex Rivera (and all other residents listed in Section 7 below)")
body("The parties agree as follows:")

# ---- 1. Property ----
heading("1. PROPERTY")
body("Landlord leases to Tenant, and Tenant leases from Landlord, the residential premises located at 1188 Sunset Terrace, Unit 2B, Los Angeles, CA 90027 (the \u201cPremises\u201d), together with the parking space described in Section 9.")

# ---- 2. Term ----
heading("2. TERM")
body("The initial term of this Agreement shall commence on November 1, 2026, and shall terminate on October 31, 2027 (a fixed term of twelve (12) months). Upon expiration of the term, this Agreement shall automatically renew for successive terms of twelve (12) months each unless Tenant provides written notice of non-renewal at least ninety (90) days prior to the expiration of the then-current term.")

# ---- 3. Rent ----
heading("3. RENT")
body("Tenant shall pay rent in the amount of $2,400.00 per month (the \u201cBase Rent\u201d), due and payable in advance on or before the first (1st) day of each month, without demand, deduction, or setoff. Rent shall be paid by check, cashier\u2019s check, or online payment portal. Rent received after the fifth (5th) day of the month shall be subject to a late charge as set forth in Section 5.")
body("In addition to Base Rent, Tenant shall pay the following monthly charges, collectively the \u201cTotal Monthly Payment\u201d:")
body("   - Pet rent: $50.00 per month (if a pet is kept, see Section 8)\n   - Parking: $150.00 per month (assigned space #14)\n   - Trash and recycling service: $35.00 per month\n   - Water/sewer utility fee: $60.00 per month (flat fee, regardless of usage)")
body("Total Monthly Payment if all charges apply: $2,695.00.")

# ---- 4. Security Deposit ----
heading("4. SECURITY DEPOSIT")
body("Upon execution of this Agreement, Tenant shall pay Landlord a security deposit of $3,600.00. Of this amount, $1,800.00 is a non-refundable cleaning and re-keying fee that shall not be returned to Tenant under any circumstances. The remaining $1,800.00 shall be held as a refundable security deposit.")
body("The security deposit may be applied by Landlord to (a) unpaid rent or other charges; (b) the cost of repairing damage to the Premises beyond ordinary wear and tear; and (c) cleaning the Premises to Landlord\u2019s satisfaction, including carpet shampooing and wall repainting, whether or not any damage exists.")
body("Landlord shall return the refundable portion of the security deposit, if any, within sixty (60) days after the termination of this Agreement, together with an itemized statement of any deductions. Tenant shall not be entitled to any interest on the security deposit.")

# ---- 5. Late Fees ----
heading("5. LATE CHARGES AND RETURNED PAYMENTS")
body("If any rent or other charge is not received by Landlord by the third (3rd) day of the month, Tenant shall pay a late charge equal to ten percent (10%) of the unpaid amount, plus an additional ten percent (10%) for each additional day the payment remains outstanding. In addition, if any check or electronic payment is returned for insufficient funds, Tenant shall pay a returned-payment fee of $75.00.")

# ---- 6. Utilities ----
heading("6. UTILITIES")
body("Tenant shall be responsible for payment of all electricity, gas, internet, and cable television service to the Premises. Water and sewer charges shall be billed to Tenant as the flat fee set forth in Section 3, regardless of actual consumption. Landlord shall have no obligation to provide heating, air conditioning, or hot water during the term.")

# ---- 7. Occupants ----
heading("7. OCCUPANTS AND GUESTS")
body("Only the following persons may reside at the Premises: Alex Rivera and Jordan Rivera (spouse). No additional occupants shall be permitted without the prior written consent of Landlord. Guests may not stay at the Premises for more than five (5) consecutive days in any calendar month without becoming an unauthorized occupant, subject to an additional occupancy charge of $300.00 per month per unauthorized person.")

# ---- 8. Pets ----
heading("8. PETS")
body("No pets are permitted at the Premises except as expressly authorized below. Tenant is authorized to keep one (1) dog (breed: mixed, weight not to exceed 30 lbs). Tenant shall pay a non-refundable pet fee of $500.00 upon execution of this Agreement, plus pet rent of $50.00 per month. Tenant shall be strictly liable for any damage caused by the pet, including damage to common areas, and shall indemnify Landlord against all claims arising from the pet.")

# ---- 9. Parking ----
heading("9. PARKING")
body("Tenant is assigned parking space #14 in the building garage, at the monthly charge set forth in Section 3. Landlord assumes no responsibility for loss of or damage to any vehicle or its contents, whether by theft, fire, collision, or otherwise.")

# ---- 10. Maintenance and Repairs ----
heading("10. MAINTENANCE AND REPAIRS")
body("Tenant shall be responsible, at Tenant\u2019s sole cost and expense, for all maintenance and repairs to the Premises, including but not limited to plumbing, electrical, heating and cooling systems, appliances, and all interior surfaces. Tenant waives any right to have repairs performed by Landlord and agrees to hold Landlord harmless from any claim arising from the condition of the Premises. Tenant shall keep the Premises in clean and sanitary condition at all times.")

# ---- 11. Entry and Inspection ----
heading("11. ENTRY AND INSPECTION")
body("Landlord and Landlord\u2019s agents reserve the right to enter the Premises at any time, with or without prior notice, for any purpose, including inspection, repair, showing to prospective tenants or buyers, and to address any condition Landlord deems an emergency. Tenant hereby waives any right to prior notice of entry.")

# ---- 12. Early Termination ----
heading("12. EARLY TERMINATION")
body("If Tenant vacates the Premises prior to the expiration of the term, Tenant shall be liable for, and shall pay to Landlord, as liquidated damages: (a) the entire rent for the remainder of the term; and (b) the full forfeiture of the security deposit. No mitigation of damages by re-renting shall be required of Landlord. This provision shall survive the termination of this Agreement.")

# ---- 13. Subletting and Assignment ----
heading("13. SUBLETTING AND ASSIGNMENT")
body("Tenant shall not assign this Agreement or sublet any portion of the Premises without the prior written consent of Landlord, which consent may be withheld for any reason or no reason. Any attempted assignment or subletting shall be void and shall constitute a material breach of this Agreement.")

# ---- 14. Alterations ----
heading("14. ALTERATIONS")
body("Tenant shall not make any alterations, additions, or improvements to the Premises without the prior written consent of Landlord. All improvements, including any fixtures, hardware, or paint, shall become the property of Landlord upon installation and shall not be removed by Tenant.")

# ---- 15. Default and Waiver ----
heading("15. DEFAULT, WAIVER, AND LEGAL RIGHTS")
body("In the event of any default by Tenant, Landlord may pursue all remedies available at law or in equity. Tenant hereby waives any right to a jury trial in any action arising out of this Agreement, and waives any right to recover attorneys\u2019 fees or costs in any dispute with Landlord. Tenant acknowledges that Landlord makes no warranties, express or implied, as to the habitability, fitness, or condition of the Premises, and Tenant waives the implied warranty of habitability to the fullest extent permitted by law.")

# ---- 16. Notices ----
heading("16. NOTICES")
body("All notices under this Agreement shall be in writing. Notices to Tenant may be delivered by posting on the door of the Premises or by email. Notices to Landlord shall be delivered to the address set forth above. Notice shall be deemed effective upon posting or sending, as applicable.")

# ---- 17. Governing Law and Severability ----
heading("17. GOVERNING LAW AND SEVERABILITY")
body("This Agreement shall be governed by and construed in accordance with the laws of the State of California. If any provision of this Agreement is held to be invalid or unenforceable, the remaining provisions shall remain in full force and effect, and the invalid provision shall be deemed modified to the minimum extent necessary to make it valid and enforceable.")

# ---- 18. Entire Agreement ----
heading("18. ENTIRE AGREEMENT")
body("This Agreement constitutes the entire agreement between the parties and supersedes all prior negotiations, representations, and agreements. No amendment shall be effective unless in writing and signed by both parties.")

# ---- Signature block ----
pdf.ln(3)
body("IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above.")

pdf.ln(4)
pdf.set_font("Helvetica", "", 10)
pdf.cell(0, 6, "LANDLORD:", new_x="LMARGIN", new_y="NEXT")
pdf.cell(0, 6, "", new_x="LMARGIN", new_y="NEXT")
pdf.cell(0, 6, "By: _________________________________", new_x="LMARGIN", new_y="NEXT")
pdf.cell(0, 6, "Name: Meridian Property Holdings LLC", new_x="LMARGIN", new_y="NEXT")
pdf.cell(0, 6, "Date: _______________________________", new_x="LMARGIN", new_y="NEXT")

pdf.ln(5)
pdf.cell(0, 6, "TENANT(S):", new_x="LMARGIN", new_y="NEXT")
pdf.cell(0, 6, "", new_x="LMARGIN", new_y="NEXT")
pdf.cell(0, 6, "______________________________________", new_x="LMARGIN", new_y="NEXT")
pdf.cell(0, 6, "Alex Rivera", new_x="LMARGIN", new_y="NEXT")
pdf.cell(0, 6, "______________________________________", new_x="LMARGIN", new_y="NEXT")
pdf.cell(0, 6, "Jordan Rivera", new_x="LMARGIN", new_y="NEXT")

out = r"G:\qianqianyoushu\sample-rental-lease-agreement.pdf"
pdf.output(out)
print("PDF written:", out)
