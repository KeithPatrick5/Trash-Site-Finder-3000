import { listLeads } from '@/lib/store'

export async function GET() {
  const leads = await listLeads()
  const headers = ['businessName','profession','city','website','email','phone','score','status','replyIntent','pagespeedMobile','forms','ctas','textLength','issues','subject','message','lastReply']
  const rows = [headers.join(',')].concat(leads.map(l => headers.map(h => csv(valueFor(l, h))).join(',')))
  return new Response(rows.join('\n'), { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="trash-site-leads-v2.csv"' } })
}

function valueFor(l: any, h: string) {
  if (h === 'issues') return l.issues.map((i: any) => i.label).join('; ')
  if (h === 'forms') return l.visualAudit?.formCount ?? ''
  if (h === 'ctas') return l.visualAudit?.ctaCount ?? ''
  if (h === 'textLength') return l.visualAudit?.textLength ?? ''
  return l[h] ?? ''
}
function csv(v: any) { return `"${String(v).replace(/"/g,'""')}"` }
