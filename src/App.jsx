import { useState, useMemo } from "react";

const DEAL_TYPES = [
  { key: "new_client",       label: "عميل جديد",              icon: "🌟", multiplier: 1.0,  color: "#3b82f6", desc: "أول صفقة — سيُحوَّل لعميل قديم بعد التكويد" },
  { key: "existing_big",     label: "عميل قديم — صفقة كبيرة", icon: "💼", multiplier: 0.5,  color: "#10b981", desc: "عميل موجود — صفقة غير روتينية أو كبيرة" },
  { key: "existing_routine", label: "عميل قديم — طلب روتيني", icon: "🔄", multiplier: 0.25, color: "#f97316", desc: "طلب تلقائي متكرر" },
];

const INITIAL_TARGET_TIERS = [
  { id:1, from:0,   to:50,  commMultiplier:0    },
  { id:2, from:50,  to:80,  commMultiplier:0.5  },
  { id:3, from:80,  to:100, commMultiplier:0.75 },
  { id:4, from:100, to:null,commMultiplier:1.0  },
];

const INITIAL_TIERS = [
  { id:1, from:0,      to:50000,  rate:2 },
  { id:2, from:50000,  to:100000, rate:3 },
  { id:3, from:100000, to:null,   rate:5 },
];

const INITIAL_AGENTS = [
  { empId:"EMP-001", name:"أحمد سامي",  monthlyTarget:200000 },
  { empId:"EMP-002", name:"منى محمد",   monthlyTarget:150000 },
  { empId:"EMP-003", name:"خالد يوسف",  monthlyTarget:250000 },
];

const ACQUISITION_BONUS_RATE      = 0.10;
const ACQUISITION_BONUS_THRESHOLD = 100000;

const INITIAL_DEALS = [
  { id:1, empId:"EMP-001", project:"مشروع A", dealType:"new_client",       saleValue:80000,  collected:80000,  startDate:"2026-06-01", endDate:"2026-06-10", clientCode:"" },
  { id:2, empId:"EMP-002", project:"مشروع B", dealType:"existing_big",     saleValue:120000, collected:60000,  startDate:"2026-05-01", endDate:"2026-06-15", clientCode:"" },
  { id:3, empId:"EMP-001", project:"مشروع C", dealType:"existing_routine", saleValue:45000,  collected:45000,  startDate:"2026-06-05", endDate:"2026-06-20", clientCode:"" },
  { id:4, empId:"EMP-003", project:"مشروع D", dealType:"new_client",       saleValue:200000, collected:200000, startDate:"2026-06-01", endDate:"2026-06-01", clientCode:"C-2024" },
  { id:5, empId:"EMP-002", project:"مشروع E", dealType:"existing_routine", saleValue:30000,  collected:30000,  startDate:"2026-06-03", endDate:"2026-06-03", clientCode:"" },
];

const INITIAL_ACQ = {
  "C-2024": { empId:"EMP-003", clientName:"شركة الدلتا", collected:200000, bonusPaid:false },
};

// ── helpers ────────────────────────────────────────────────────────────────
function calcBase(amount, tiers) {
  let c=0, r=amount;
  for (const t of tiers) {
    const mx = t.to!==null?t.to:Infinity;
    if (r<=0||amount<=t.from) break;
    const ap=Math.min(r,mx-t.from,amount-t.from);
    if (ap<=0) break;
    c+=ap*(t.rate/100); r-=ap;
    if (t.to===null) break;
  }
  return c;
}
function getTgtMult(p,tt) { return [...tt].sort((a,b)=>b.from-a.from).find(t=>p>=t.from)?.commMultiplier??0; }
function getDT(k)  { return DEAL_TYPES.find(t=>t.key===k)||DEAL_TYPES[0]; }
function fmt(n)    { return n.toLocaleString("ar-EG",{minimumFractionDigits:0,maximumFractionDigits:0}); }
function pct(n)    { return `${Math.round(n)}%`; }
function achClr(p) { return p>=100?"#10b981":p>=80?"#f59e0b":p>=50?"#f97316":"#ef4444"; }
function mOf(d)    { return d?d.slice(0,7):""; }
function getMths(deals) { return [...new Set(deals.map(d=>mOf(d.endDate)).filter(Boolean))].sort().reverse(); }

// ── شاشة تفاصيل الصفقة ─────────────────────────────────────────────────────
function DealDetail({ deal, agents, tiers, targetTiers, onClose }) {
  const ag   = agents.find(a=>a.empId===deal.empId);
  const dt   = getDT(deal.dealType);
  const full = deal.collected >= deal.saleValue;

  // تحصيل المندوب في شهر انتهاء الصفقة
  const tgt    = ag?.monthlyTarget||1;
  const achPct = deal._achPct ?? 0;
  const tMult  = getTgtMult(achPct, targetTiers);
  const base   = full ? calcBase(deal.collected, tiers) : 0;
  const afterDT= base * dt.multiplier;
  const finalC = afterDT * tMult;

  // شرائح تفصيلية
  const tierBreakdown = [];
  if (full) {
    let rem = deal.collected;
    for (const t of tiers) {
      const mx = t.to!==null?t.to:Infinity;
      if (rem<=0||deal.collected<=t.from) break;
      const ap=Math.min(rem,mx-t.from,deal.collected-t.from);
      if (ap<=0) break;
      tierBreakdown.push({ range:`${fmt(t.from)} — ${t.to?fmt(t.to):"∞"}`, amount:ap, rate:t.rate, comm:ap*(t.rate/100) });
      rem-=ap;
      if (t.to===null) break;
    }
  }

  const Row = ({label, value, color="#e2e8f0", bold=false, big=false}) => (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px", borderBottom:"1px solid #0f172a" }}>
      <span style={{ color:"#94a3b8", fontSize:13 }}>{label}</span>
      <span style={{ color, fontWeight:bold?800:500, fontSize:big?20:14 }}>{value}</span>
    </div>
  );

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth:520 }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div style={S.modalTitle}>📊 تفاصيل الحساب</div>
          <button onClick={onClose} style={{ background:"#334155",color:"#fff",border:"none",borderRadius:8,padding:"6px 12px",cursor:"pointer" }}>✕ إغلاق</button>
        </div>

        {/* بيانات الصفقة */}
        <div style={{ background:"#0f172a", borderRadius:12, marginBottom:16, overflow:"hidden" }}>
          <div style={{ background:dt.color+"22", borderBottom:`2px solid ${dt.color}`, padding:"10px 14px" }}>
            <div style={{ fontWeight:800, fontSize:16, color:"#f1f5f9" }}>{deal.project}</div>
            <div style={{ color:"#94a3b8", fontSize:12, marginTop:3 }}>
              {dt.icon} {dt.label} &nbsp;·&nbsp; 👤 {ag?.name} ({ag?.empId}) &nbsp;·&nbsp; 📅 {deal.startDate} ← {deal.endDate}
            </div>
          </div>
          <Row label="قيمة البيع"     value={`${fmt(deal.saleValue)} ج`} />
          <Row label="المحصَّل فعلياً" value={`${fmt(deal.collected)} ج`} color="#10b981" bold />
          <Row label="نسبة التحصيل"   value={pct((deal.collected/deal.saleValue)*100)} color={full?"#10b981":"#f97316"} />
        </div>

        {/* خطوة ١: الشرائح */}
        <div style={{ background:"#0f172a", borderRadius:12, marginBottom:16, overflow:"hidden" }}>
          <div style={{ padding:"10px 14px", background:"#1e3a5f", borderBottom:"1px solid #1e293b" }}>
            <span style={{ color:"#60a5fa", fontWeight:700 }}>الخطوة ١ — العمولة الأساسية (الشرائح)</span>
          </div>
          {full ? (
            <>
              {tierBreakdown.map((t,i) => (
                <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"8px 14px", borderBottom:"1px solid #1e293b", fontSize:13 }}>
                  <span style={{ color:"#64748b" }}>{t.range} ج &nbsp;→&nbsp; {fmt(t.amount)} ج × {t.rate}%</span>
                  <span style={{ color:"#c084fc", fontWeight:700 }}>{fmt(t.comm)} ج</span>
                </div>
              ))}
              <Row label="مجموع العمولة الأساسية" value={`${fmt(base)} ج`} color="#c084fc" bold />
            </>
          ) : (
            <div style={{ padding:"12px 14px", color:"#475569", fontSize:13 }}>⏳ لم يكتمل التحصيل بعد</div>
          )}
        </div>

        {/* خطوة ٢: نوع الصفقة */}
        <div style={{ background:"#0f172a", borderRadius:12, marginBottom:16, overflow:"hidden" }}>
          <div style={{ padding:"10px 14px", background:"#1e3a5f", borderBottom:"1px solid #1e293b" }}>
            <span style={{ color:"#60a5fa", fontWeight:700 }}>الخطوة ٢ — معامل نوع الصفقة</span>
          </div>
          <Row label="نوع الصفقة"     value={`${dt.icon} ${dt.label}`} />
          <Row label="المعامل"         value={`× ${dt.multiplier} (${dt.multiplier*100}%)`} color={dt.color} bold />
          <Row label="العمولة بعد النوع" value={full?`${fmt(afterDT)} ج`:"—"} color="#a78bfa" bold />
        </div>

        {/* خطوة ٣: التارجت */}
        <div style={{ background:"#0f172a", borderRadius:12, marginBottom:16, overflow:"hidden" }}>
          <div style={{ padding:"10px 14px", background:"#1e3a5f", borderBottom:"1px solid #1e293b" }}>
            <span style={{ color:"#60a5fa", fontWeight:700 }}>الخطوة ٣ — معامل التارجت الشهري</span>
          </div>
          <Row label="التارجت الشهري"  value={`${fmt(tgt)} ج`} />
          <Row label="نسبة الإنجاز"    value={pct(achPct)} color={achClr(achPct)} bold />
          <Row label="معامل التارجت"    value={`× ${tMult}`} color={achClr(achPct)} bold />
          {tMult === 0 && <div style={{ padding:"8px 14px", color:"#ef4444", fontSize:12 }}>⚠️ الإنجاز أقل من 50% — لا عمولة هذا الشهر</div>}
        </div>

        {/* النتيجة النهائية */}
        <div style={{ background: finalC > 0 ? "#1a2f0a" : "#1a0a0a", border:`2px solid ${finalC>0?"#f59e0b":"#475569"}`, borderRadius:12, padding:16, textAlign:"center" }}>
          <div style={{ color:"#94a3b8", fontSize:12, marginBottom:6 }}>العمولة النهائية المستحقة</div>
          <div style={{ color: finalC>0?"#f59e0b":"#475569", fontSize:28, fontWeight:900 }}>
            {full ? `${fmt(finalC)} ج` : "⏳ في الانتظار"}
          </div>
          {full && (
            <div style={{ color:"#64748b", fontSize:11, marginTop:8 }}>
              {fmt(base)} × {dt.multiplier} × {tMult} = {fmt(finalC)} ج
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── المكوّن الرئيسي ────────────────────────────────────────────────────────
export default function App() {
  const [agents,      setAgents]      = useState(INITIAL_AGENTS);
  const [deals,       setDeals]       = useState(INITIAL_DEALS);
  const [tiers,       setTiers]       = useState(INITIAL_TIERS);
  const [targetTiers, setTargetTiers] = useState(INITIAL_TARGET_TIERS);
  const [acqBonuses,  setAcqBonuses]  = useState(INITIAL_ACQ);
  const [paidDeals,   setPaidDeals]   = useState(new Set());

  const [tab,         setTab]         = useState("dashboard");
  const [filterMonth, setFilterMonth] = useState("الكل");
  const [filterEmp,   setFilterEmp]   = useState("الكل");
  const [filterType,  setFilterType]  = useState("الكل");

  const [showAddDeal,   setShowAddDeal]   = useState(false);
  const [showEditDeal,  setShowEditDeal]  = useState(null);
  const [showDealDetail,setShowDealDetail]= useState(null);
  const [showAddAgent,  setShowAddAgent]  = useState(false);
  const [showEditAgent, setShowEditAgent] = useState(null);
  const [showAddBonus,  setShowAddBonus]  = useState(false);
  const [showTierEd,    setShowTierEd]    = useState(false);
  const [showTgtTierEd, setShowTgtTierEd] = useState(false);
  const [editTiers,     setEditTiers]     = useState(tiers);
  const [editTgtTiers,  setEditTgtTiers]  = useState(targetTiers);

  const emptyDeal = { empId:"", project:"", dealType:"new_client", saleValue:"", collected:"", startDate:new Date().toISOString().slice(0,10), endDate:new Date().toISOString().slice(0,10), clientCode:"" };
  const [newDeal,  setNewDeal]  = useState(emptyDeal);
  const [newBonus, setNewBonus] = useState({ clientCode:"", clientName:"", empId:"", collected:"" });
  const [newAgent, setNewAgent] = useState({ empId:"", name:"", monthlyTarget:"" });

  const months = useMemo(() => getMths(deals), [deals]);

  const enriched = useMemo(() => deals.map(d => {
    const ag   = agents.find(a=>a.empId===d.empId);
    const dt   = getDT(d.dealType);
    const full = d.collected >= d.saleValue;
    const dMonth = mOf(d.endDate);
    const monthlyC = deals.filter(x=>x.empId===d.empId&&mOf(x.endDate)===dMonth&&x.collected>=x.saleValue).reduce((s,x)=>s+x.collected,0);
    const tgt    = ag?.monthlyTarget||1;
    const achPct = (monthlyC/tgt)*100;
    const tMult  = getTgtMult(achPct, targetTiers);
    const base   = full ? calcBase(d.collected, tiers) : 0;
    const afterDT= base * dt.multiplier;
    const finalC = afterDT * tMult;
    const eligible = full && dt.multiplier>0 && tMult>0;
    const paid   = paidDeals.has(d.id);
    return { ...d, ag, dt, base, afterDT, finalC, achPct, tMult, eligible, paid, _achPct:achPct, collRate:(d.collected/d.saleValue)*100 };
  }), [deals, agents, tiers, targetTiers, paidDeals]);

  const filtered = useMemo(() => {
    let r = enriched;
    if (filterMonth !== "الكل") r = r.filter(d=>mOf(d.endDate)===filterMonth);
    if (filterEmp   !== "الكل") r = r.filter(d=>d.empId===filterEmp);
    if (filterType  !== "الكل") r = r.filter(d=>d.dealType===filterType);
    return r;
  }, [enriched, filterMonth, filterEmp, filterType]);

  const agentSummary = useMemo(() => agents.map(ag => {
    const agD = filterMonth==="الكل" ? enriched.filter(d=>d.empId===ag.empId) : enriched.filter(d=>d.empId===ag.empId&&mOf(d.endDate)===filterMonth);
    const totalSales     = agD.reduce((s,d)=>s+d.saleValue,0);
    const totalCollected = agD.filter(d=>d.collected>=d.saleValue).reduce((s,d)=>s+d.collected,0);
    const pendingComm    = agD.filter(d=>d.eligible&&!d.paid).reduce((s,d)=>s+d.finalC,0);
    const paidComm       = agD.filter(d=>d.paid).reduce((s,d)=>s+d.finalC,0);
    const monthlyC       = filterMonth!=="الكل" ? agD.filter(d=>d.collected>=d.saleValue).reduce((s,d)=>s+d.collected,0) : 0;
    const achPct         = filterMonth!=="الكل" ? (monthlyC/(ag.monthlyTarget||1))*100 : 0;
    const tMult          = getTgtMult(achPct, targetTiers);
    const bonuses        = Object.values(acqBonuses).filter(b=>b.empId===ag.empId);
    const pendingBonus   = bonuses.filter(b=>!b.bonusPaid&&b.collected>=ACQUISITION_BONUS_THRESHOLD).reduce((s,b)=>s+b.collected*ACQUISITION_BONUS_RATE,0);
    return { ...ag, totalSales, totalCollected, pendingComm, paidComm, monthlyC, achPct, tMult, pendingBonus, deals:agD.length };
  }), [agents, enriched, filterMonth, targetTiers, acqBonuses]);

  const bonusList = useMemo(() => Object.entries(acqBonuses).map(([code,b]) => ({
    code, ...b, bonus:b.collected*ACQUISITION_BONUS_RATE,
    eligible:b.collected>=ACQUISITION_BONUS_THRESHOLD,
    agName:agents.find(a=>a.empId===b.empId)?.name||b.empId,
  })), [acqBonuses, agents]);

  const totals = useMemo(() => ({
    sales:       filtered.reduce((s,d)=>s+d.saleValue,0),
    collected:   filtered.filter(d=>d.collected>=d.saleValue).reduce((s,d)=>s+d.collected,0),
    pendingComm: filtered.filter(d=>d.eligible&&!d.paid).reduce((s,d)=>s+d.finalC,0),
    pendingBonus:bonusList.filter(b=>b.eligible&&!b.bonusPaid).reduce((s,b)=>s+b.bonus,0),
  }), [filtered, bonusList]);

  function addDeal()   { if(!newDeal.empId||!newDeal.project||!newDeal.saleValue) return; setDeals([...deals,{...newDeal,id:Date.now(),saleValue:+newDeal.saleValue,collected:+newDeal.collected||0}]); setNewDeal(emptyDeal); setShowAddDeal(false); }
  function saveDeal(d) { setDeals(deals.map(x=>x.id===d.id?{...d,saleValue:+d.saleValue,collected:+d.collected}:x)); setShowEditDeal(null); }
  function delDeal(id) { if(!window.confirm("حذف الصفقة؟")) return; setDeals(deals.filter(d=>d.id!==id)); }
  function addAgent()  { if(!newAgent.empId||!newAgent.name||!newAgent.monthlyTarget) return; setAgents([...agents,{...newAgent,monthlyTarget:+newAgent.monthlyTarget}]); setNewAgent({empId:"",name:"",monthlyTarget:""}); setShowAddAgent(false); }
  function saveAgent(a){ setAgents(agents.map(x=>x.empId===a.empId?{...a,monthlyTarget:+a.monthlyTarget}:x)); setShowEditAgent(null); }
  function delAgent(id){ if(!window.confirm("حذف المندوب؟")) return; setAgents(agents.filter(a=>a.empId!==id)); }
  function addBonus()  { if(!newBonus.clientCode||!newBonus.empId||!newBonus.collected||!newBonus.clientName) return; setAcqBonuses({...acqBonuses,[newBonus.clientCode]:{empId:newBonus.empId,clientName:newBonus.clientName,collected:+newBonus.collected,bonusPaid:false}}); setNewBonus({clientCode:"",clientName:"",empId:"",collected:""}); setShowAddBonus(false); }
  function markPaid(id)       { setPaidDeals(p=>{const s=new Set(p);s.add(id);return s;}); }
  function markBonusPaid(code){ setAcqBonuses(p=>({...p,[code]:{...p[code],bonusPaid:true}})); }

  const statusBadge = d => {
    if (d.paid)    return <span style={S.badge("paid")}>✓ مصروف</span>;
    if (!d.eligible&&d.collected>=d.saleValue&&d.tMult===0) return <span style={S.badge("notarget")}>🎯 تحت التارجت</span>;
    if (d.eligible) return <span style={S.badge("ready")}>⚡ مستحق</span>;
    return           <span style={S.badge("pending")}>⏳ جاري</span>;
  };

  // ── modal للإدخال: صفقة (إضافة أو تعديل) ───────────────────────────────
  function DealForm({ data, setData, onSave, onClose, title }) {
    return (
      <div style={S.overlay} onClick={onClose}>
        <div style={S.modal} onClick={e=>e.stopPropagation()}>
          <div style={S.modalTitle}>{title}</div>
          <div style={{ marginBottom:10 }}>
            <label style={S.label}>المندوب</label>
            <select value={data.empId} onChange={e=>setData({...data,empId:e.target.value})} style={S.input}>
              <option value="">اختر المندوب</option>
              {agents.map(a=><option key={a.empId} value={a.empId}>{a.empId} — {a.name}</option>)}
            </select>
          </div>
          {[["project","اسم المشروع","text"],["saleValue","قيمة البيع (ج)","number"],["collected","المحصَّل (ج)","number"],["startDate","تاريخ البداية","date"],["endDate","تاريخ النهاية","date"],["clientCode","كود العميل (اختياري)","text"]].map(([k,l,t])=>(
            <div key={k} style={{ marginBottom:10 }}>
              <label style={S.label}>{l}</label>
              <input type={t} value={data[k]||""} onChange={e=>setData({...data,[k]:e.target.value})} style={S.input} placeholder={l} />
            </div>
          ))}
          <div style={{ marginBottom:14 }}>
            <label style={S.label}>نوع الصفقة</label>
            {DEAL_TYPES.map(dt=>(
              <div key={dt.key} onClick={()=>setData({...data,dealType:dt.key})}
                style={{ background:data.dealType===dt.key?dt.color+"22":"#0f172a", border:`2px solid ${data.dealType===dt.key?dt.color:"#334155"}`, borderRadius:10, padding:"8px 12px", cursor:"pointer", marginTop:6 }}>
                <div style={{ color:data.dealType===dt.key?dt.color:"#e2e8f0", fontWeight:700, fontSize:13 }}>{dt.icon} {dt.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <button onClick={onSave} style={S.btn}>حفظ</button>
            <button onClick={onClose} style={{...S.btn,background:"#334155"}}>إلغاء</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <div style={S.headerTitle}>🏆 نظام الكوميشنز</div>
          <div style={S.headerSub}>Rhythm Integrated Solutions</div>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <button onClick={()=>setShowAddBonus(true)} style={{...S.btn,background:"#7c3aed"}}>🌟 بونص</button>
          <button onClick={()=>setShowAddDeal(true)}  style={S.btn}>+ صفقة</button>
          <button onClick={()=>setShowAddAgent(true)} style={{...S.btn,background:"#0f766e"}}>+ مندوب</button>
        </div>
      </div>

      {/* فلاتر */}
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        <select value={filterMonth} onChange={e=>setFilterMonth(e.target.value)} style={S.select}>
          <option value="الكل">كل الأشهر</option>
          {months.map(m=><option key={m} value={m}>{m}</option>)}
        </select>
        <select value={filterEmp} onChange={e=>setFilterEmp(e.target.value)} style={S.select}>
          <option value="الكل">كل المندوبين</option>
          {agents.map(a=><option key={a.empId} value={a.empId}>{a.empId} — {a.name}</option>)}
        </select>
        <select value={filterType} onChange={e=>setFilterType(e.target.value)} style={S.select}>
          <option value="الكل">كل الأنواع</option>
          {DEAL_TYPES.map(dt=><option key={dt.key} value={dt.key}>{dt.label}</option>)}
        </select>
      </div>

      {/* Nav */}
      <div style={S.nav}>
        {[["dashboard","📊 الرئيسية"],["deals","📋 الصفقات"],["bonuses","🌟 بونص"],["agents","👥 المندوبين"],["settings","⚙️ الإعدادات"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={S.navBtn(tab===k)}>{l}</button>
        ))}
      </div>

      {/* ── DASHBOARD ── */}
      {tab==="dashboard" && (
        <div>
          <div style={S.cards}>
            <StatCard label="إجمالي المبيعات"  value={`${fmt(totals.sales)} ج`}        color="#3b82f6" icon="💰" />
            <StatCard label="إجمالي التحصيل"   value={`${fmt(totals.collected)} ج`}     color="#10b981" icon="🏦" />
            <StatCard label="كوميشن مستحق"     value={`${fmt(totals.pendingComm)} ج`}   color="#f59e0b" icon="⚡" />
            <StatCard label="بونص إحضار مستحق" value={`${fmt(totals.pendingBonus)} ج`}  color="#7c3aed" icon="🌟" />
          </div>
          <div style={S.section}>
            <div style={S.sectionTitle}>ملخص المندوبين {filterMonth!=="الكل"?`— ${filterMonth}`:""}</div>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13, minWidth:700 }}>
                <thead>
                  <tr style={{ background:"#0f172a" }}>
                    {["رقم الموظف","الاسم","صفقات","المبيعات","التحصيل","التارجت","الإنجاز","المعامل","كوميشن","بونص"].map(h=>(
                      <th key={h} style={{ padding:"10px 8px", color:"#64748b", textAlign:"center", fontWeight:700, whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {agentSummary.map((a,i)=>(
                    <tr key={a.empId} style={{ background:i%2===0?"#0f172a":"#1e293b" }}>
                      <td style={{ padding:"9px 8px", textAlign:"center", color:"#a78bfa", fontWeight:700 }}>{a.empId}</td>
                      <td style={{ padding:"9px 8px", textAlign:"center", color:"#f1f5f9", fontWeight:700 }}>{a.name}</td>
                      <td style={{ padding:"9px 8px", textAlign:"center", color:"#94a3b8" }}>{a.deals}</td>
                      <td style={{ padding:"9px 8px", textAlign:"center", color:"#94a3b8" }}>{fmt(a.totalSales)} ج</td>
                      <td style={{ padding:"9px 8px", textAlign:"center", color:"#10b981" }}>{fmt(a.totalCollected)} ج</td>
                      <td style={{ padding:"9px 8px", textAlign:"center", color:"#94a3b8" }}>{filterMonth!=="الكل"?`${fmt(a.monthlyTarget)} ج`:"—"}</td>
                      <td style={{ padding:"9px 8px", textAlign:"center", color:achClr(a.achPct), fontWeight:700 }}>{filterMonth!=="الكل"?pct(a.achPct):"—"}</td>
                      <td style={{ padding:"9px 8px", textAlign:"center", color:"#f59e0b", fontWeight:700 }}>{filterMonth!=="الكل"?`×${a.tMult}`:"—"}</td>
                      <td style={{ padding:"9px 8px", textAlign:"center", color:a.pendingComm>0?"#f59e0b":"#475569", fontWeight:700 }}>{fmt(a.pendingComm)} ج</td>
                      <td style={{ padding:"9px 8px", textAlign:"center", color:a.pendingBonus>0?"#a78bfa":"#475569", fontWeight:700 }}>{fmt(a.pendingBonus)} ج</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── DEALS ── */}
      {tab==="deals" && (
        <div style={S.section}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <div style={S.sectionTitle}>الصفقات ({filtered.length})</div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {filtered.map(d=>(
              <div key={d.id} style={S.dealCard(d.paid, d.eligible, d.dealType)}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12, flexWrap:"wrap", gap:8 }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:15, color:"#f1f5f9" }}>{d.project}</div>
                    <div style={{ color:"#64748b", fontSize:12, marginTop:4, display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                      <span style={{ color:"#a78bfa" }}>#{d.ag?.empId}</span>
                      <span>👤 {d.ag?.name}</span>
                      <span style={{ background:d.dt.color+"22", color:d.dt.color, border:`1px solid ${d.dt.color}`, borderRadius:10, padding:"1px 8px", fontSize:11, fontWeight:700 }}>{d.dt.icon} {d.dt.label}</span>
                    </div>
                    <div style={{ color:"#475569", fontSize:11, marginTop:4 }}>📅 {d.startDate} ← {d.endDate}</div>
                  </div>
                  <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", justifyContent:"flex-end" }}>
                    {statusBadge(d)}
                    <button onClick={()=>setShowDealDetail(d)} style={{...S.payBtn,background:"#1d4ed8"}}>📊 تفاصيل</button>
                    <button onClick={()=>setShowEditDeal({...d})} style={{...S.payBtn,background:"#334155"}}>✏️ تعديل</button>
                    <button onClick={()=>delDeal(d.id)} style={{...S.payBtn,background:"#7f1d1d"}}>🗑 حذف</button>
                    {d.eligible&&!d.paid&&<button onClick={()=>markPaid(d.id)} style={S.payBtn}>صرف</button>}
                  </div>
                </div>
                <div style={{ display:"flex", gap:8, background:"#0f172a", borderRadius:10, padding:"10px 8px", flexWrap:"wrap" }}>
                  {[
                    ["قيمة البيع", fmt(d.saleValue)+" ج", "#94a3b8"],
                    ["المحصَّل",   fmt(d.collected)+" ج", "#10b981"],
                    ["الأساسي",   d.collected>=d.saleValue?fmt(d.base)+" ج":"—","#94a3b8"],
                    ["بعد النوع", d.collected>=d.saleValue?fmt(d.afterDT)+" ج":"—","#c084fc"],
                    ["الكوميشن",  d.collected>=d.saleValue?fmt(d.finalC)+" ج":"—",d.eligible?"#f59e0b":"#475569"],
                  ].map(([l,v,c])=>(
                    <div key={l} style={{ textAlign:"center", flex:1, minWidth:70 }}>
                      <div style={{ color:"#475569", fontSize:10, marginBottom:3 }}>{l}</div>
                      <div style={{ color:c, fontSize:13, fontWeight:700 }}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ height:4, background:"#0f172a", borderRadius:99, overflow:"hidden", marginTop:10 }}>
                  <div style={{ height:"100%", width:`${Math.min(d.collRate,100)}%`, background:d.paid?"#16a34a":d.collRate>=100?"#f59e0b":"#3b82f6", borderRadius:99 }} />
                </div>
              </div>
            ))}
            {filtered.length===0&&<div style={{ textAlign:"center", color:"#475569", padding:"30px 0" }}>لا توجد صفقات</div>}
          </div>
        </div>
      )}

      {/* ── BONUSES ── */}
      {tab==="bonuses" && (
        <div style={S.section}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <div style={S.sectionTitle}>🌟 بونص إحضار عملاء جدد</div>
            <button onClick={()=>setShowAddBonus(true)} style={{...S.btn,background:"#7c3aed"}}>+ تسجيل</button>
          </div>
          <div style={{ background:"#2e1065", border:"1px solid #7c3aed44", borderRadius:12, padding:12, marginBottom:16, fontSize:12, color:"#c4b5fd" }}>
            10% من التحصيل الكامل · حد أدنى {fmt(ACQUISITION_BONUS_THRESHOLD)} ج · مرة واحدة · بدون تارجت
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {bonusList.map(b=>(
              <div key={b.code} style={{ background:b.bonusPaid?"#0f2a1a":b.eligible?"#1e0a3a":"#0f172a", border:`1px solid ${b.bonusPaid?"#16a34a44":b.eligible?"#7c3aed":"#334155"}`, borderRadius:14, padding:16 }}>
                <div style={{ display:"flex", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
                  <div>
                    <div style={{ fontWeight:700, color:"#f1f5f9" }}>{b.clientName}</div>
                    <div style={{ color:"#64748b", fontSize:12, marginTop:3 }}>👤 {b.agName} · <span style={{ color:"#a78bfa" }}>{b.code}</span></div>
                  </div>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    {b.bonusPaid?<span style={S.badge("paid")}>✓ مصروف</span>
                      :b.eligible?<><span style={S.badge("bonus")}>🌟 مستحق</span><button onClick={()=>markBonusPaid(b.code)} style={{...S.payBtn,background:"#7c3aed"}}>صرف</button></>
                      :<span style={S.badge("notarget")}>⚠️ تحت الحد</span>}
                  </div>
                </div>
                <div style={{ display:"flex", gap:12, background:"#0f172a", borderRadius:10, padding:"10px 8px", marginTop:12 }}>
                  {[["التحصيل",fmt(b.collected)+" ج","#10b981"],["النسبة","10%","#a78bfa"],["البونص",b.eligible?fmt(b.bonus)+" ج":"—",b.eligible?"#a78bfa":"#475569"]].map(([l,v,c])=>(
                    <div key={l} style={{ textAlign:"center", flex:1 }}>
                      <div style={{ color:"#475569", fontSize:10, marginBottom:3 }}>{l}</div>
                      <div style={{ color:c, fontSize:16, fontWeight:800 }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {bonusList.length===0&&<div style={{ textAlign:"center", color:"#475569", padding:"30px 0" }}>لا توجد بونصات مسجَّلة</div>}
          </div>
        </div>
      )}

      {/* ── AGENTS ── */}
      {tab==="agents" && (
        <div style={S.section}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <div style={S.sectionTitle}>👥 إدارة المندوبين</div>
            <button onClick={()=>setShowAddAgent(true)} style={{...S.btn,background:"#0f766e"}}>+ إضافة</button>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {agents.map(a=>{
              const sum=agentSummary.find(s=>s.empId===a.empId);
              return (
                <div key={a.empId} style={{ background:"#0f172a", borderRadius:14, padding:16, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
                  <div style={{ display:"flex", gap:14, alignItems:"center" }}>
                    <div style={{ width:44, height:44, borderRadius:"50%", background:"linear-gradient(135deg,#3b82f6,#8b5cf6)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:800 }}>{a.name.charAt(0)}</div>
                    <div>
                      <div style={{ fontWeight:700, color:"#f1f5f9" }}>{a.name}</div>
                      <div style={{ color:"#a78bfa", fontSize:12 }}>{a.empId}</div>
                      <div style={{ color:"#64748b", fontSize:12 }}>التارجت: {fmt(a.monthlyTarget)} ج / شهر</div>
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:12, flexWrap:"wrap", alignItems:"center" }}>
                    {sum&&<>
                      <div style={{ textAlign:"center" }}><div style={{ color:"#475569", fontSize:11 }}>صفقات</div><div style={{ color:"#e2e8f0", fontWeight:700 }}>{sum.deals}</div></div>
                      <div style={{ textAlign:"center" }}><div style={{ color:"#475569", fontSize:11 }}>تحصيل</div><div style={{ color:"#10b981", fontWeight:700 }}>{fmt(sum.totalCollected)} ج</div></div>
                      <div style={{ textAlign:"center" }}><div style={{ color:"#475569", fontSize:11 }}>كوميشن</div><div style={{ color:"#f59e0b", fontWeight:700 }}>{fmt(sum.pendingComm)} ج</div></div>
                    </>}
                    <button onClick={()=>setShowEditAgent({...a})} style={{...S.payBtn,background:"#1d4ed8"}}>✏️ تعديل</button>
                    <button onClick={()=>delAgent(a.empId)} style={{...S.payBtn,background:"#7f1d1d"}}>🗑 حذف</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── SETTINGS ── */}
      {tab==="settings" && (
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <div style={S.section}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div style={S.sectionTitle}>📊 شرائح معامل التارجت</div>
              <button onClick={()=>{setEditTgtTiers(targetTiers);setShowTgtTierEd(true);}} style={S.payBtn}>تعديل</button>
            </div>
            {targetTiers.map((t,i)=>{const c=["#ef4444","#f97316","#f59e0b","#10b981"][i]||"#8b5cf6"; return(
              <div key={t.id} style={{ background:"#0f172a", borderRadius:12, padding:"12px 16px", marginBottom:8, borderRight:`4px solid ${c}`, display:"flex", justifyContent:"space-between" }}>
                <div style={{ color:"#e2e8f0", fontWeight:700 }}>{t.from}% — {t.to!==null?`${t.to}%`:"ما فوق"}</div>
                <div style={{ fontSize:22, fontWeight:900, color:c }}>×{t.commMultiplier}</div>
              </div>
            );})}
          </div>
          <div style={S.section}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div style={S.sectionTitle}>⚙️ شرائح العمولة الأساسية</div>
              <button onClick={()=>{setEditTiers(tiers);setShowTierEd(true);}} style={S.payBtn}>تعديل</button>
            </div>
            {tiers.map((t,i)=>(
              <div key={t.id} style={{ background:"#0f172a", borderRadius:12, padding:"12px 16px", marginBottom:8, borderRight:`4px solid ${["#3b82f6","#10b981","#f59e0b"][i]||"#8b5cf6"}`, display:"flex", justifyContent:"space-between" }}>
                <div style={{ color:"#e2e8f0", fontWeight:700 }}>{fmt(t.from)} — {t.to!==null?`${fmt(t.to)} ج`:"ما فوق"}</div>
                <div style={{ fontSize:22, fontWeight:900, color:"#f59e0b" }}>{t.rate}%</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── تفاصيل الصفقة ── */}
      {showDealDetail && <DealDetail deal={showDealDetail} agents={agents} tiers={tiers} targetTiers={targetTiers} onClose={()=>setShowDealDetail(null)} />}

      {/* ── إضافة صفقة ── */}
      {showAddDeal && <DealForm data={newDeal} setData={setNewDeal} onSave={addDeal} onClose={()=>setShowAddDeal(false)} title="➕ صفقة جديدة" />}

      {/* ── تعديل صفقة ── */}
      {showEditDeal && <DealForm data={showEditDeal} setData={setShowEditDeal} onSave={()=>saveDeal(showEditDeal)} onClose={()=>setShowEditDeal(null)} title="✏️ تعديل الصفقة" />}

      {/* ── إضافة مندوب ── */}
      {showAddAgent && (
        <div style={S.overlay} onClick={()=>setShowAddAgent(false)}>
          <div style={S.modal} onClick={e=>e.stopPropagation()}>
            <div style={S.modalTitle}>👤 مندوب جديد</div>
            {[["empId","رقم الموظف (EMP-XXX)","text"],["name","الاسم","text"],["monthlyTarget","التارجت الشهري (ج)","number"]].map(([k,l,t])=>(
              <div key={k} style={{ marginBottom:10 }}><label style={S.label}>{l}</label><input type={t} value={newAgent[k]} onChange={e=>setNewAgent({...newAgent,[k]:e.target.value})} style={S.input} placeholder={l} /></div>
            ))}
            <div style={{ display:"flex", gap:10 }}><button onClick={addAgent} style={{...S.btn,background:"#0f766e"}}>إضافة</button><button onClick={()=>setShowAddAgent(false)} style={{...S.btn,background:"#334155"}}>إلغاء</button></div>
          </div>
        </div>
      )}

      {/* ── تعديل مندوب ── */}
      {showEditAgent && (
        <div style={S.overlay} onClick={()=>setShowEditAgent(null)}>
          <div style={S.modal} onClick={e=>e.stopPropagation()}>
            <div style={S.modalTitle}>✏️ تعديل المندوب</div>
            {[["empId","رقم الموظف","text"],["name","الاسم","text"],["monthlyTarget","التارجت الشهري (ج)","number"]].map(([k,l,t])=>(
              <div key={k} style={{ marginBottom:10 }}><label style={S.label}>{l}</label><input type={t} value={showEditAgent[k]} onChange={e=>setShowEditAgent({...showEditAgent,[k]:e.target.value})} style={S.input} disabled={k==="empId"} /></div>
            ))}
            <div style={{ display:"flex", gap:10 }}><button onClick={()=>saveAgent(showEditAgent)} style={S.btn}>حفظ</button><button onClick={()=>setShowEditAgent(null)} style={{...S.btn,background:"#334155"}}>إلغاء</button></div>
          </div>
        </div>
      )}

      {/* ── بونص إحضار ── */}
      {showAddBonus && (
        <div style={S.overlay} onClick={()=>setShowAddBonus(false)}>
          <div style={S.modal} onClick={e=>e.stopPropagation()}>
            <div style={S.modalTitle}>🌟 تسجيل بونص إحضار</div>
            <div style={{ marginBottom:10 }}><label style={S.label}>المندوب</label>
              <select value={newBonus.empId} onChange={e=>setNewBonus({...newBonus,empId:e.target.value})} style={S.input}>
                <option value="">اختر</option>{agents.map(a=><option key={a.empId} value={a.empId}>{a.empId} — {a.name}</option>)}
              </select>
            </div>
            {[["clientCode","كود العميل","text"],["clientName","اسم العميل","text"],["collected","إجمالي التحصيل (ج)","number"]].map(([k,l,t])=>(
              <div key={k} style={{ marginBottom:10 }}><label style={S.label}>{l}</label><input type={t} value={newBonus[k]} onChange={e=>setNewBonus({...newBonus,[k]:e.target.value})} style={S.input} /></div>
            ))}
            {newBonus.collected&&+newBonus.collected>=ACQUISITION_BONUS_THRESHOLD&&(
              <div style={{ background:"#2e1065", borderRadius:10, padding:12, marginBottom:12, color:"#a78bfa", fontWeight:700, textAlign:"center" }}>قيمة البونص = {fmt(+newBonus.collected*ACQUISITION_BONUS_RATE)} ج</div>
            )}
            <div style={{ display:"flex", gap:10 }}><button onClick={addBonus} style={{...S.btn,background:"#7c3aed"}}>تسجيل</button><button onClick={()=>setShowAddBonus(false)} style={{...S.btn,background:"#334155"}}>إلغاء</button></div>
          </div>
        </div>
      )}

      {/* ── شرائح التارجت ── */}
      {showTgtTierEd && (
        <div style={S.overlay} onClick={()=>setShowTgtTierEd(false)}>
          <div style={S.modal} onClick={e=>e.stopPropagation()}>
            <div style={S.modalTitle}>📊 شرائح التارجت</div>
            {editTgtTiers.map((t,i)=>(
              <div key={t.id} style={{ display:"flex", gap:8, marginBottom:10, alignItems:"center" }}>
                <input type="number" value={t.from} onChange={e=>{const a=[...editTgtTiers];a[i]={...a[i],from:+e.target.value};setEditTgtTiers(a);}} style={{...S.input,width:60}} />
                <span style={{ color:"#94a3b8" }}>—</span>
                <input type="number" value={t.to||""} onChange={e=>{const a=[...editTgtTiers];a[i]={...a[i],to:e.target.value?+e.target.value:null};setEditTgtTiers(a);}} style={{...S.input,width:60}} placeholder="∞" />
                <input type="number" step="0.05" value={t.commMultiplier} onChange={e=>{const a=[...editTgtTiers];a[i]={...a[i],commMultiplier:+e.target.value};setEditTgtTiers(a);}} style={{...S.input,width:60}} />
                <button onClick={()=>setEditTgtTiers(editTgtTiers.filter((_,j)=>j!==i))} style={{ background:"#7f1d1d",color:"#fff",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer" }}>✕</button>
              </div>
            ))}
            <button onClick={()=>setEditTgtTiers([...editTgtTiers,{id:Date.now(),from:0,to:null,commMultiplier:1}])} style={{...S.payBtn,marginBottom:12}}>+ شريحة</button>
            <div style={{ display:"flex", gap:10 }}><button onClick={()=>{setTargetTiers(editTgtTiers);setShowTgtTierEd(false);}} style={S.btn}>حفظ</button><button onClick={()=>setShowTgtTierEd(false)} style={{...S.btn,background:"#334155"}}>إلغاء</button></div>
          </div>
        </div>
      )}

      {/* ── شرائح العمولة ── */}
      {showTierEd && (
        <div style={S.overlay} onClick={()=>setShowTierEd(false)}>
          <div style={S.modal} onClick={e=>e.stopPropagation()}>
            <div style={S.modalTitle}>⚙️ شرائح العمولة</div>
            {editTiers.map((t,i)=>(
              <div key={t.id} style={{ display:"flex", gap:8, marginBottom:10, alignItems:"center" }}>
                <input type="number" value={t.from} onChange={e=>{const a=[...editTiers];a[i]={...a[i],from:+e.target.value};setEditTiers(a);}} style={{...S.input,width:90}} />
                <span style={{ color:"#94a3b8" }}>—</span>
                <input type="number" value={t.to||""} onChange={e=>{const a=[...editTiers];a[i]={...a[i],to:e.target.value?+e.target.value:null};setEditTiers(a);}} style={{...S.input,width:90}} placeholder="ما فوق" />
                <input type="number" value={t.rate} onChange={e=>{const a=[...editTiers];a[i]={...a[i],rate:+e.target.value};setEditTiers(a);}} style={{...S.input,width:55}} />
                <span style={{ color:"#f59e0b" }}>%</span>
                <button onClick={()=>setEditTiers(editTiers.filter((_,j)=>j!==i))} style={{ background:"#7f1d1d",color:"#fff",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer" }}>✕</button>
              </div>
            ))}
            <button onClick={()=>setEditTiers([...editTiers,{id:Date.now(),from:0,to:null,rate:3}])} style={{...S.payBtn,marginBottom:12}}>+ شريحة</button>
            <div style={{ display:"flex", gap:10 }}><button onClick={()=>{setTiers(editTiers);setShowTierEd(false);}} style={S.btn}>حفظ</button><button onClick={()=>setShowTierEd(false)} style={{...S.btn,background:"#334155"}}>إلغاء</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({label,value,color,icon}) {
  return (
    <div style={{ background:"#1e293b",borderRadius:14,padding:"18px 20px",borderTop:`3px solid ${color}`,flex:1,minWidth:150 }}>
      <div style={{ fontSize:24 }}>{icon}</div>
      <div style={{ color:"#94a3b8",fontSize:12,marginTop:6 }}>{label}</div>
      <div style={{ color,fontSize:20,fontWeight:800,marginTop:4,direction:"ltr",textAlign:"right" }}>{value}</div>
    </div>
  );
}

const S = {
  root:        { background:"#0f172a",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Cairo','Segoe UI',sans-serif",direction:"rtl",padding:20,maxWidth:1100,margin:"0 auto" },
  header:      { display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,paddingBottom:16,borderBottom:"1px solid #1e293b",flexWrap:"wrap",gap:10 },
  headerTitle: { fontSize:24,fontWeight:800,color:"#f1f5f9" },
  headerSub:   { fontSize:11,color:"#64748b",marginTop:2 },
  nav:         { display:"flex",gap:8,marginBottom:20,flexWrap:"wrap" },
  navBtn:      a=>({ background:a?"#3b82f6":"#1e293b",color:a?"#fff":"#94a3b8",border:"none",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontFamily:"inherit",fontWeight:600,fontSize:13 }),
  cards:       { display:"flex",gap:14,marginBottom:16,flexWrap:"wrap" },
  section:     { background:"#1e293b",borderRadius:16,padding:20 },
  sectionTitle:{ fontSize:16,fontWeight:700,marginBottom:14,color:"#f1f5f9" },
  dealCard:    (paid,eligible,type)=>({ background:paid?"#0f2a1a":type==="existing_routine"?"#111827":eligible?"#1a1f0a":"#0f172a", border:`1px solid ${paid?"#16a34a33":type==="existing_routine"?"#334155":eligible?"#d97706":"#1e293b"}`,borderRadius:14,padding:16 }),
  badge:       t=>({ padding:"3px 9px",borderRadius:20,fontSize:11,fontWeight:700,
    background:t==="paid"?"#16a34a22":t==="ready"?"#f59e0b22":t==="bonus"?"#7c3aed22":t==="notarget"?"#ef444422":"#3b82f622",
    color:     t==="paid"?"#16a34a"  :t==="ready"?"#f59e0b"  :t==="bonus"?"#a78bfa"  :t==="notarget"?"#ef4444"  :"#3b82f6",
    border:`1px solid ${t==="paid"?"#16a34a":t==="ready"?"#f59e0b":t==="bonus"?"#7c3aed":t==="notarget"?"#ef4444":"#3b82f6"}` }),
  payBtn:      { background:"#d97706",color:"#fff",border:"none",borderRadius:8,padding:"6px 10px",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:12 },
  btn:         { background:"#3b82f6",color:"#fff",border:"none",borderRadius:10,padding:"10px 16px",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:14 },
  select:      { background:"#1e293b",color:"#e2e8f0",border:"1px solid #334155",borderRadius:8,padding:"7px 12px",fontFamily:"inherit",fontSize:13 },
  overlay:     { position:"fixed",inset:0,background:"#00000088",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:20,overflowY:"auto" },
  modal:       { background:"#1e293b",borderRadius:16,padding:24,width:"90%",maxWidth:440,maxHeight:"90vh",overflowY:"auto" },
  modalTitle:  { fontSize:18,fontWeight:800,marginBottom:18,color:"#f1f5f9" },
  label:       { display:"block",fontSize:12,color:"#94a3b8",marginBottom:4 },
  input:       { background:"#0f172a",border:"1px solid #334155",borderRadius:8,color:"#e2e8f0",padding:"8px 12px",width:"100%",fontFamily:"inherit",fontSize:14,boxSizing:"border-box" },
};
