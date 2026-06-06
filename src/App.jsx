import { useState, useMemo, useEffect } from "react";
import { db } from "./firebase";
import {
  collection, doc, getDocs, setDoc, deleteDoc,
  onSnapshot, writeBatch
} from "firebase/firestore";

// ══ AUTH ════════════════════════════════════════════════════════════════════
const SALT = "RhythmIS2026";
const USERS = [
  { username:"admin", role:"admin",    name:"Gamal Hussein",
    hash:"daf8d15a3f67b639f9a96f15bd6d8039fe4e5e628e64d80b9c94a1c89fad2d39" },
];
async function hashPass(p) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(SALT+p));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

// ══ CONSTANTS ════════════════════════════════════════════════════════════════
const DEAL_TYPES = [
  { key:"new_client",       label:"عميل جديد",              icon:"🌟", multiplier:1.0,  color:"#3b82f6", desc:"أول صفقة" },
  { key:"existing_big",     label:"عميل قديم — صفقة كبيرة", icon:"💼", multiplier:0.5,  color:"#10b981", desc:"صفقة غير روتينية" },
  { key:"existing_routine", label:"عميل قديم — طلب روتيني", icon:"🔄", multiplier:0.25, color:"#f97316", desc:"طلب تلقائي" },
];
const INIT_TARGET_TIERS = [
  {id:1,from:0,  to:50,  commMultiplier:0   },
  {id:2,from:50, to:80,  commMultiplier:0.5 },
  {id:3,from:80, to:100, commMultiplier:0.75},
  {id:4,from:100,to:null,commMultiplier:1.0 },
];
const INIT_TIERS = [
  {id:1,from:0,     to:50000, rate:2},
  {id:2,from:50000, to:100000,rate:3},
  {id:3,from:100000,to:null,  rate:5},
];
const ACQ_RATE=0.10, ACQ_MIN=100000;

// ══ HELPERS ══════════════════════════════════════════════════════════════════
function calcBase(amt,tiers){let c=0,r=amt;for(const t of tiers){const mx=t.to!==null?t.to:Infinity;if(r<=0||amt<=t.from)break;const ap=Math.min(r,mx-t.from,amt-t.from);if(ap<=0)break;c+=ap*(t.rate/100);r-=ap;if(t.to===null)break;}return c;}
function getTgtMult(p,tt){return[...tt].sort((a,b)=>b.from-a.from).find(t=>p>=t.from)?.commMultiplier??0;}
function getDT(k){return DEAL_TYPES.find(t=>t.key===k)||DEAL_TYPES[0];}
function fmt(n){return n.toLocaleString("ar-EG",{minimumFractionDigits:0,maximumFractionDigits:0});}
function pct(n){return`${Math.round(n)}%`;}
function achClr(p){return p>=100?"#10b981":p>=80?"#f59e0b":p>=50?"#f97316":"#ef4444";}
function mOf(d){return d?d.slice(0,7):"";}
function getMths(deals){return[...new Set(deals.map(d=>mOf(d.endDate)).filter(Boolean))].sort().reverse();}

// ══ FIRESTORE HELPERS ════════════════════════════════════════════════════════
const COL = {
  deals:"deals", agents:"agents", bonuses:"bonuses",
  tiers:"settings", requests:"requests"
};

// ══ LOGIN ════════════════════════════════════════════════════════════════════
function LoginScreen({onLogin}){
  const [u,setU]=useState(""); const [p,setP]=useState(""); const [err,setErr]=useState(""); const [load,setLoad]=useState(false);
  async function go(){setLoad(true);setErr("");const h=await hashPass(p);const user=USERS.find(x=>x.username===u&&x.hash===h);if(user)onLogin(user);else setErr("اسم المستخدم أو كلمة المرور غلط");setLoad(false);}
  return(
    <div style={{background:"#0f172a",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Cairo','Segoe UI',sans-serif",direction:"rtl"}}>
      <div style={{background:"#1e293b",borderRadius:20,padding:"40px 36px",width:"100%",maxWidth:380,boxShadow:"0 25px 60px #00000066"}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{fontSize:40,marginBottom:12}}>🏆</div>
          <div style={{fontSize:22,fontWeight:800,color:"#f1f5f9"}}>نظام الكوميشنز</div>
          <div style={{fontSize:12,color:"#64748b",marginTop:4}}>Rhythm Integrated Solutions</div>
        </div>
        {[["اسم المستخدم",u,setU,"text"],["كلمة المرور",p,setP,"password"]].map(([l,v,s,t])=>(
          <div key={l} style={{marginBottom:14}}>
            <label style={{display:"block",fontSize:12,color:"#94a3b8",marginBottom:6}}>{l}</label>
            <input type={t} value={v} onChange={e=>s(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()}
              style={{background:"#0f172a",border:"1px solid #334155",borderRadius:10,color:"#e2e8f0",padding:"11px 14px",width:"100%",fontFamily:"inherit",fontSize:14,boxSizing:"border-box"}} />
          </div>
        ))}
        {err&&<div style={{background:"#7f1d1d22",border:"1px solid #ef444444",borderRadius:8,padding:"8px 12px",color:"#ef4444",fontSize:13,marginBottom:16,textAlign:"center"}}>{err}</div>}
        <button onClick={go} disabled={load} style={{background:"#3b82f6",color:"#fff",border:"none",borderRadius:10,padding:"12px",width:"100%",fontFamily:"inherit",fontWeight:700,fontSize:15,cursor:"pointer",opacity:load?0.7:1}}>
          {load?"جاري التحقق...":"دخول"}
        </button>
      </div>
    </div>
  );
}

// ══ DEAL DETAIL ══════════════════════════════════════════════════════════════
function DealDetail({deal,agents,tiers,targetTiers,onClose}){
  const ag=agents.find(a=>a.empId===deal.empId);
  const dt=getDT(deal.dealType);
  const full=deal.collected>=deal.saleValue;
  const achPct=deal._achPct??0;
  const tMult=getTgtMult(achPct,targetTiers);
  const base=full?calcBase(deal.collected,tiers):0;
  const afterDT=base*dt.multiplier;
  const finalC=afterDT*tMult;
  const tgt=ag?.monthlyTarget||1;
  const bd=[];
  if(full){let r=deal.collected;for(const t of tiers){const mx=t.to!==null?t.to:Infinity;if(r<=0||deal.collected<=t.from)break;const ap=Math.min(r,mx-t.from,deal.collected-t.from);if(ap<=0)break;bd.push({range:`${fmt(t.from)}—${t.to?fmt(t.to):"∞"}`,amount:ap,rate:t.rate,comm:ap*(t.rate/100)});r-=ap;if(t.to===null)break;}}
  const Row=({label,value,color="#e2e8f0",bold=false})=>(<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 14px",borderBottom:"1px solid #0f172a"}}><span style={{color:"#94a3b8",fontSize:13}}>{label}</span><span style={{color,fontWeight:bold?800:500,fontSize:14}}>{value}</span></div>);
  return(
    <div style={S.overlay} onClick={onClose}>
      <div style={{...S.modal,maxWidth:520}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={S.modalTitle}>📊 تفاصيل الحساب</div>
          <button onClick={onClose} style={{background:"#334155",color:"#fff",border:"none",borderRadius:8,padding:"6px 12px",cursor:"pointer"}}>✕</button>
        </div>
        <div style={{background:"#0f172a",borderRadius:12,marginBottom:14,overflow:"hidden"}}>
          <div style={{background:dt.color+"22",borderBottom:`2px solid ${dt.color}`,padding:"10px 14px"}}>
            <div style={{fontWeight:800,fontSize:15,color:"#f1f5f9"}}>{deal.project}</div>
            <div style={{color:"#94a3b8",fontSize:12,marginTop:3}}>{dt.icon} {dt.label} · 👤 {ag?.name} · 📅 {deal.startDate} ← {deal.endDate}</div>
          </div>
          <Row label="قيمة البيع" value={`${fmt(deal.saleValue)} ج`}/>
          <Row label="المحصَّل" value={`${fmt(deal.collected)} ج`} color="#10b981" bold/>
          <Row label="نسبة التحصيل" value={pct((deal.collected/deal.saleValue)*100)} color={full?"#10b981":"#f97316"}/>
        </div>
        <div style={{background:"#0f172a",borderRadius:12,marginBottom:14,overflow:"hidden"}}>
          <div style={{padding:"9px 14px",background:"#1e3a5f",borderBottom:"1px solid #1e293b"}}><span style={{color:"#60a5fa",fontWeight:700,fontSize:13}}>الخطوة ١ — العمولة الأساسية</span></div>
          {full?<>{bd.map((t,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 14px",borderBottom:"1px solid #1e293b",fontSize:12}}><span style={{color:"#64748b"}}>{t.range} · {fmt(t.amount)} ج × {t.rate}%</span><span style={{color:"#c084fc",fontWeight:700}}>{fmt(t.comm)} ج</span></div>))}<Row label="مجموع الأساسي" value={`${fmt(base)} ج`} color="#c084fc" bold/></>:<div style={{padding:"12px 14px",color:"#475569",fontSize:13}}>⏳ لم يكتمل التحصيل</div>}
        </div>
        <div style={{background:"#0f172a",borderRadius:12,marginBottom:14,overflow:"hidden"}}>
          <div style={{padding:"9px 14px",background:"#1e3a5f",borderBottom:"1px solid #1e293b"}}><span style={{color:"#60a5fa",fontWeight:700,fontSize:13}}>الخطوة ٢ — معامل نوع الصفقة</span></div>
          <Row label="النوع" value={`${dt.icon} ${dt.label}`}/>
          <Row label="المعامل" value={`× ${dt.multiplier} (${dt.multiplier*100}%)`} color={dt.color} bold/>
          <Row label="بعد النوع" value={full?`${fmt(afterDT)} ج`:"—"} color="#a78bfa" bold/>
        </div>
        <div style={{background:"#0f172a",borderRadius:12,marginBottom:14,overflow:"hidden"}}>
          <div style={{padding:"9px 14px",background:"#1e3a5f",borderBottom:"1px solid #1e293b"}}><span style={{color:"#60a5fa",fontWeight:700,fontSize:13}}>الخطوة ٣ — معامل التارجت</span></div>
          <Row label="التارجت الشهري" value={`${fmt(tgt)} ج`}/>
          <Row label="نسبة الإنجاز" value={pct(achPct)} color={achClr(achPct)} bold/>
          <Row label="معامل التارجت" value={`× ${tMult}`} color={achClr(achPct)} bold/>
          {tMult===0&&<div style={{padding:"8px 14px",color:"#ef4444",fontSize:12}}>⚠️ الإنجاز أقل من 50%</div>}
        </div>
        <div style={{background:finalC>0?"#1a2f0a":"#1a0a0a",border:`2px solid ${finalC>0?"#f59e0b":"#475569"}`,borderRadius:12,padding:16,textAlign:"center"}}>
          <div style={{color:"#94a3b8",fontSize:12,marginBottom:6}}>العمولة النهائية</div>
          <div style={{color:finalC>0?"#f59e0b":"#475569",fontSize:28,fontWeight:900}}>{full?`${fmt(finalC)} ج`:"⏳"}</div>
          {full&&<div style={{color:"#64748b",fontSize:11,marginTop:8}}>{fmt(base)} × {dt.multiplier} × {tMult} = {fmt(finalC)} ج</div>}
        </div>
      </div>
    </div>
  );
}

// ══ DEAL FORM ════════════════════════════════════════════════════════════════
function DealForm({data,setData,onSave,onClose,title,agents}){
  return(
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e=>e.stopPropagation()}>
        <div style={S.modalTitle}>{title}</div>
        <div style={{marginBottom:10}}>
          <label style={S.label}>المندوب</label>
          <select value={data.empId} onChange={e=>setData({...data,empId:e.target.value})} style={S.input}>
            <option value="">اختر</option>
            {agents.map(a=><option key={a.empId} value={a.empId}>{a.empId} — {a.name}</option>)}
          </select>
        </div>
        {[["project","اسم المشروع","text"],["saleValue","قيمة البيع (ج)","number"],["collected","المحصَّل (ج)","number"],["startDate","تاريخ البداية","date"],["endDate","تاريخ النهاية","date"],["clientCode","كود العميل (اختياري)","text"]].map(([k,l,t])=>(
          <div key={k} style={{marginBottom:10}}>
            <label style={S.label}>{l}</label>
            <input type={t} value={data[k]||""} onChange={e=>setData({...data,[k]:e.target.value})} style={S.input} placeholder={l}/>
          </div>
        ))}
        <div style={{marginBottom:14}}>
          <label style={S.label}>نوع الصفقة</label>
          {DEAL_TYPES.map(dt=>(
            <div key={dt.key} onClick={()=>setData({...data,dealType:dt.key})}
              style={{background:data.dealType===dt.key?dt.color+"22":"#0f172a",border:`2px solid ${data.dealType===dt.key?dt.color:"#334155"}`,borderRadius:10,padding:"8px 12px",cursor:"pointer",marginTop:6}}>
              <div style={{color:data.dealType===dt.key?dt.color:"#e2e8f0",fontWeight:700,fontSize:13}}>{dt.icon} {dt.label}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onSave} style={S.btn}>حفظ</button>
          <button onClick={onClose} style={{...S.btn,background:"#334155"}}>إلغاء</button>
        </div>
      </div>
    </div>
  );
}

// ══ LOADING ══════════════════════════════════════════════════════════════════
function Loading(){
  return(
    <div style={{background:"#0f172a",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <div style={{fontSize:40}}>🏆</div>
      <div style={{color:"#94a3b8",fontSize:14,fontFamily:"'Cairo',sans-serif"}}>جاري تحميل البيانات...</div>
    </div>
  );
}

// ══ MAIN APP ═════════════════════════════════════════════════════════════════
export default function App(){
  const [currentUser,setCurrentUser]=useState(null);
  const [loading,setLoading]=useState(true);

  // Firebase state
  const [agents,     setAgents]     = useState([]);
  const [deals,      setDeals]      = useState([]);
  const [bonuses,    setBonuses]    = useState({});
  const [tiers,      setTiers]      = useState(INIT_TIERS);
  const [targetTiers,setTargetTiers]= useState(INIT_TARGET_TIERS);
  const [requests,   setRequests]   = useState([]);
  const [paidDeals,  setPaidDeals]  = useState(new Set());

  const [tab,        setTab]        = useState("dashboard");
  const [filterMonth,setFilterMonth]= useState("الكل");
  const [filterEmp,  setFilterEmp]  = useState("الكل");
  const [filterType, setFilterType] = useState("الكل");

  const [showAddDeal,   setShowAddDeal]   = useState(false);
  const [showEditDeal,  setShowEditDeal]  = useState(null);
  const [showDealDetail,setShowDealDetail]= useState(null);
  const [showAddAgent,  setShowAddAgent]  = useState(false);
  const [showEditAgent, setShowEditAgent] = useState(null);
  const [showAddBonus,  setShowAddBonus]  = useState(false);
  const [showEditBonus, setShowEditBonus] = useState(null);
  const [showTierEd,    setShowTierEd]    = useState(false);
  const [showTgtTierEd, setShowTgtTierEd] = useState(false);
  const [editTiers,     setEditTiers]     = useState(tiers);
  const [editTgtTiers,  setEditTgtTiers]  = useState(targetTiers);

  const emptyDeal={empId:"",project:"",dealType:"new_client",saleValue:"",collected:"",startDate:new Date().toISOString().slice(0,10),endDate:new Date().toISOString().slice(0,10),clientCode:""};
  const [newDeal, setNewDeal] =useState(emptyDeal);
  const [newBonus,setNewBonus]=useState({clientCode:"",clientName:"",empId:"",collected:""});
  const [newAgent,setNewAgent]=useState({empId:"",name:"",monthlyTarget:""});

  const isAdmin=currentUser?.role==="admin";

  // ── Firestore listeners ──────────────────────────────────────────────────
  useEffect(()=>{
    const unsubs=[];
    unsubs.push(onSnapshot(collection(db,"agents"),snap=>{setAgents(snap.docs.map(d=>({...d.data(),_id:d.id})));}));
    unsubs.push(onSnapshot(collection(db,"deals"), snap=>{setDeals(snap.docs.map(d=>({...d.data(),id:d.id})));}));
    unsubs.push(onSnapshot(collection(db,"bonuses"),snap=>{const m={};snap.docs.forEach(d=>{m[d.id]={...d.data()};});setBonuses(m);}));
    unsubs.push(onSnapshot(collection(db,"requests"),snap=>{setRequests(snap.docs.map(d=>({...d.data(),id:d.id})));}));
    unsubs.push(onSnapshot(doc(db,"settings","tiers"),snap=>{if(snap.exists()){const d=snap.data();if(d.tiers)setTiers(d.tiers);if(d.targetTiers)setTargetTiers(d.targetTiers);}}));
    Promise.all([getDocs(collection(db,"agents")),getDocs(collection(db,"deals"))]).then(()=>setLoading(false));
    return()=>unsubs.forEach(u=>u());
  },[]);

  // ── Computed ────────────────────────────────────────────────────────────
  const months=useMemo(()=>getMths(deals),[deals]);

  const enriched=useMemo(()=>deals.map(d=>{
    const ag=agents.find(a=>a.empId===d.empId);
    const dt=getDT(d.dealType);
    const full=d.collected>=d.saleValue;
    const dMonth=mOf(d.endDate);
    const monthlyC=deals.filter(x=>x.empId===d.empId&&mOf(x.endDate)===dMonth&&x.collected>=x.saleValue).reduce((s,x)=>s+x.collected,0);
    const achPct=((monthlyC)/(ag?.monthlyTarget||1))*100;
    const tMult=getTgtMult(achPct,targetTiers);
    const base=full?calcBase(d.collected,tiers):0;
    const afterDT=base*dt.multiplier;
    const finalC=afterDT*tMult;
    const eligible=full&&dt.multiplier>0&&tMult>0;
    const paid=paidDeals.has(d.id);
    return{...d,ag,dt,base,afterDT,finalC,achPct,tMult,eligible,paid,_achPct:achPct,collRate:(d.collected/d.saleValue)*100};
  }),[deals,agents,tiers,targetTiers,paidDeals]);

  const filtered=useMemo(()=>{
    let r=enriched;
    if(filterMonth!=="الكل")r=r.filter(d=>mOf(d.endDate)===filterMonth);
    if(filterEmp!=="الكل")r=r.filter(d=>d.empId===filterEmp);
    if(filterType!=="الكل")r=r.filter(d=>d.dealType===filterType);
    return r;
  },[enriched,filterMonth,filterEmp,filterType]);

  const agentSummary=useMemo(()=>agents.map(ag=>{
    const agD=filterMonth==="الكل"?enriched.filter(d=>d.empId===ag.empId):enriched.filter(d=>d.empId===ag.empId&&mOf(d.endDate)===filterMonth);
    const totalSales=agD.reduce((s,d)=>s+d.saleValue,0);
    const totalCollected=agD.filter(d=>d.collected>=d.saleValue).reduce((s,d)=>s+d.collected,0);
    const pendingComm=agD.filter(d=>d.eligible&&!d.paid).reduce((s,d)=>s+d.finalC,0);
    const monthlyC=filterMonth!=="الكل"?agD.filter(d=>d.collected>=d.saleValue).reduce((s,d)=>s+d.collected,0):0;
    const achPct=filterMonth!=="الكل"?(monthlyC/(ag.monthlyTarget||1))*100:0;
    const tMult=getTgtMult(achPct,targetTiers);
    const pendingBonus=Object.values(bonuses).filter(b=>b.empId===ag.empId&&!b.bonusPaid&&b.collected>=ACQ_MIN).reduce((s,b)=>s+b.collected*ACQ_RATE,0);
    return{...ag,totalSales,totalCollected,pendingComm,monthlyC,achPct,tMult,pendingBonus,deals:agD.length};
  }),[agents,enriched,filterMonth,targetTiers,bonuses]);

  const bonusList=useMemo(()=>Object.entries(bonuses).map(([code,b])=>({
    code,...b,bonus:b.collected*ACQ_RATE,eligible:b.collected>=ACQ_MIN,
    agName:agents.find(a=>a.empId===b.empId)?.name||b.empId,
  })),[bonuses,agents]);

  const totals=useMemo(()=>({
    sales:filtered.reduce((s,d)=>s+d.saleValue,0),
    collected:filtered.filter(d=>d.collected>=d.saleValue).reduce((s,d)=>s+d.collected,0),
    pendingComm:filtered.filter(d=>d.eligible&&!d.paid).reduce((s,d)=>s+d.finalC,0),
    pendingBonus:bonusList.filter(b=>b.eligible&&!b.bonusPaid).reduce((s,b)=>s+b.bonus,0),
  }),[filtered,bonusList]);

  // ── Firestore actions ────────────────────────────────────────────────────
  async function addDeal(){
    if(!newDeal.empId||!newDeal.project||!newDeal.saleValue)return;
    const id=`deal_${Date.now()}`;
    await setDoc(doc(db,"deals",id),{...newDeal,id,saleValue:+newDeal.saleValue,collected:+newDeal.collected||0});
    setNewDeal(emptyDeal);setShowAddDeal(false);
  }
  async function saveDeal(d){
    await setDoc(doc(db,"deals",d.id),{...d,saleValue:+d.saleValue,collected:+d.collected});
    setShowEditDeal(null);
  }
  async function delDeal(id){if(!window.confirm("حذف الصفقة؟"))return;await deleteDoc(doc(db,"deals",id));}

  async function addAgent(){
    if(!newAgent.empId||!newAgent.name||!newAgent.monthlyTarget)return;
    await setDoc(doc(db,"agents",newAgent.empId),{...newAgent,monthlyTarget:+newAgent.monthlyTarget});
    setNewAgent({empId:"",name:"",monthlyTarget:""});setShowAddAgent(false);
  }
  async function saveAgent(a){await setDoc(doc(db,"agents",a.empId),{...a,monthlyTarget:+a.monthlyTarget});setShowEditAgent(null);}
  async function delAgent(id){if(!window.confirm("حذف المندوب؟"))return;await deleteDoc(doc(db,"agents",id));}

  async function addBonus(){
    if(!newBonus.clientCode||!newBonus.empId||!newBonus.collected||!newBonus.clientName)return;
    await setDoc(doc(db,"bonuses",newBonus.clientCode),{empId:newBonus.empId,clientName:newBonus.clientName,collected:+newBonus.collected,bonusPaid:false});
    setNewBonus({clientCode:"",clientName:"",empId:"",collected:""});setShowAddBonus(false);
  }
  async function saveBonus(code,data){await setDoc(doc(db,"bonuses",code),{...bonuses[code],...data,collected:+data.collected});setShowEditBonus(null);}
  async function delBonus(code){if(!window.confirm("حذف البونص؟"))return;await deleteDoc(doc(db,"bonuses",code));}
  async function markBonusPaid(code){await setDoc(doc(db,"bonuses",code),{...bonuses[code],bonusPaid:true});}
  async function markPaid(id){setPaidDeals(p=>{const s=new Set(p);s.add(id);return s;});}

  async function saveTiers(){await setDoc(doc(db,"settings","tiers"),{tiers:editTiers,targetTiers});setTiers(editTiers);setShowTierEd(false);}
  async function saveTgtTiers(){await setDoc(doc(db,"settings","tiers"),{tiers,targetTiers:editTgtTiers});setTargetTiers(editTgtTiers);setShowTgtTierEd(false);}

  // طلبات الموظفين
  function requestOrDo(type,targetId,payload,directAction){
    if(isAdmin){directAction();}
    else{
      const id=`req_${Date.now()}`;
      setDoc(doc(db,"requests",id),{id,type,targetId,payload:payload||null,requestedBy:currentUser.name,requestedAt:new Date().toLocaleString("ar-EG")});
      alert("✅ تم إرسال الطلب للمدير");
    }
  }
  function handleEditDeal(d){requestOrDo("edit_deal",d.id,d,()=>saveDeal(d));if(!isAdmin)setShowEditDeal(null);}
  function handleDelDeal(id){requestOrDo("delete_deal",id,null,()=>delDeal(id));}
  function handleEditBonus(code,data){requestOrDo("edit_bonus",code,data,()=>saveBonus(code,data));if(!isAdmin)setShowEditBonus(null);}
  function handleDelBonus(code){requestOrDo("delete_bonus",code,null,()=>delBonus(code));}

  async function approveReq(req){
    if(req.type==="edit_deal")  await setDoc(doc(db,"deals",req.targetId),{...req.payload,saleValue:+req.payload.saleValue,collected:+req.payload.collected});
    if(req.type==="delete_deal")await deleteDoc(doc(db,"deals",req.targetId));
    if(req.type==="edit_bonus") await setDoc(doc(db,"bonuses",req.targetId),{...bonuses[req.targetId],...req.payload,collected:+req.payload.collected});
    if(req.type==="delete_bonus")await deleteDoc(doc(db,"bonuses",req.targetId));
    await deleteDoc(doc(db,"requests",req.id));
  }
  async function rejectReq(id){await deleteDoc(doc(db,"requests",id));}

  const statusBadge=d=>{
    if(d.paid)return<span style={S.badge("paid")}>✓ مصروف</span>;
    if(!d.eligible&&d.collected>=d.saleValue&&d.tMult===0)return<span style={S.badge("notarget")}>🎯 تحت التارجت</span>;
    if(d.eligible)return<span style={S.badge("ready")}>⚡ مستحق</span>;
    return<span style={S.badge("pending")}>⏳ جاري</span>;
  };

  if(loading)return<Loading/>;
  if(!currentUser)return<LoginScreen onLogin={setCurrentUser}/>;

  const pendingCount=requests.length;

  return(
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <div style={S.headerTitle}>🏆 نظام الكوميشنز</div>
          <div style={S.headerSub}>Rhythm Integrated Solutions</div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <div style={{background:"#1e293b",borderRadius:10,padding:"8px 14px",display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:18}}>{isAdmin?"👑":"👤"}</span>
            <div>
              <div style={{color:"#f1f5f9",fontSize:13,fontWeight:700}}>{currentUser.name}</div>
              <div style={{color:isAdmin?"#f59e0b":"#3b82f6",fontSize:11}}>{isAdmin?"مدير":"موظف"}</div>
            </div>
          </div>
          <button onClick={()=>setShowAddBonus(true)} style={{...S.btn,background:"#7c3aed"}}>🌟 بونص</button>
          <button onClick={()=>setShowAddDeal(true)} style={S.btn}>+ صفقة</button>
          {isAdmin&&<button onClick={()=>setShowAddAgent(true)} style={{...S.btn,background:"#0f766e"}}>+ مندوب</button>}
          <button onClick={()=>setCurrentUser(null)} style={{...S.btn,background:"#334155"}}>خروج</button>
        </div>
      </div>

      {/* فلاتر */}
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
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
        {[["dashboard","📊 الرئيسية"],["deals","📋 الصفقات"],["bonuses","🌟 بونص"],["agents","👥 المندوبين"],
          ...(isAdmin?[["approvals",pendingCount>0?`✅ موافقات (${pendingCount})`:"✅ موافقات"],["settings","⚙️ الإعدادات"]]:[])
        ].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{...S.navBtn(tab===k),...(k==="approvals"&&pendingCount>0?{background:tab===k?"#d97706":"#78350f",color:"#fbbf24"}:{})}}>{l}</button>
        ))}
      </div>

      {/* DASHBOARD */}
      {tab==="dashboard"&&(
        <div>
          <div style={S.cards}>
            <StatCard label="إجمالي المبيعات"  value={`${fmt(totals.sales)} ج`}       color="#3b82f6" icon="💰"/>
            <StatCard label="إجمالي التحصيل"   value={`${fmt(totals.collected)} ج`}    color="#10b981" icon="🏦"/>
            <StatCard label="كوميشن مستحق"     value={`${fmt(totals.pendingComm)} ج`}  color="#f59e0b" icon="⚡"/>
            <StatCard label="بونص إحضار مستحق" value={`${fmt(totals.pendingBonus)} ج`} color="#7c3aed" icon="🌟"/>
          </div>
          <div style={S.section}>
            <div style={S.sectionTitle}>ملخص المندوبين {filterMonth!=="الكل"?`— ${filterMonth}`:""}</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:700}}>
                <thead><tr style={{background:"#0f172a"}}>
                  {["رقم الموظف","الاسم","صفقات","المبيعات","التحصيل","التارجت","الإنجاز","المعامل","كوميشن","بونص"].map(h=>(
                    <th key={h} style={{padding:"10px 8px",color:"#64748b",textAlign:"center",fontWeight:700,whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {agentSummary.map((a,i)=>(
                    <tr key={a.empId} style={{background:i%2===0?"#0f172a":"#1e293b"}}>
                      <td style={{padding:"9px 8px",textAlign:"center",color:"#a78bfa",fontWeight:700}}>{a.empId}</td>
                      <td style={{padding:"9px 8px",textAlign:"center",color:"#f1f5f9",fontWeight:700}}>{a.name}</td>
                      <td style={{padding:"9px 8px",textAlign:"center",color:"#94a3b8"}}>{a.deals}</td>
                      <td style={{padding:"9px 8px",textAlign:"center",color:"#94a3b8"}}>{fmt(a.totalSales)} ج</td>
                      <td style={{padding:"9px 8px",textAlign:"center",color:"#10b981"}}>{fmt(a.totalCollected)} ج</td>
                      <td style={{padding:"9px 8px",textAlign:"center",color:"#94a3b8"}}>{filterMonth!=="الكل"?`${fmt(a.monthlyTarget)} ج`:"—"}</td>
                      <td style={{padding:"9px 8px",textAlign:"center",color:achClr(a.achPct),fontWeight:700}}>{filterMonth!=="الكل"?pct(a.achPct):"—"}</td>
                      <td style={{padding:"9px 8px",textAlign:"center",color:"#f59e0b",fontWeight:700}}>{filterMonth!=="الكل"?`×${a.tMult}`:"—"}</td>
                      <td style={{padding:"9px 8px",textAlign:"center",color:a.pendingComm>0?"#f59e0b":"#475569",fontWeight:700}}>{fmt(a.pendingComm)} ج</td>
                      <td style={{padding:"9px 8px",textAlign:"center",color:a.pendingBonus>0?"#a78bfa":"#475569",fontWeight:700}}>{fmt(a.pendingBonus)} ج</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* DEALS */}
      {tab==="deals"&&(
        <div style={S.section}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={S.sectionTitle}>الصفقات ({filtered.length})</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {filtered.map(d=>(
              <div key={d.id} style={S.dealCard(d.paid,d.eligible,d.dealType)}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12,flexWrap:"wrap",gap:8}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9"}}>{d.project}</div>
                    <div style={{color:"#64748b",fontSize:12,marginTop:4,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                      <span style={{color:"#a78bfa"}}>#{d.ag?.empId}</span>
                      <span>👤 {d.ag?.name}</span>
                      <span style={{background:d.dt.color+"22",color:d.dt.color,border:`1px solid ${d.dt.color}`,borderRadius:10,padding:"1px 8px",fontSize:11,fontWeight:700}}>{d.dt.icon} {d.dt.label}</span>
                    </div>
                    <div style={{color:"#475569",fontSize:11,marginTop:4}}>📅 {d.startDate} ← {d.endDate}</div>
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
                    {statusBadge(d)}
                    <button onClick={()=>setShowDealDetail(d)} style={{...S.payBtn,background:"#1d4ed8"}}>📊</button>
                    <button onClick={()=>setShowEditDeal({...d})} style={{...S.payBtn,background:"#334155"}}>{isAdmin?"✏️":"📝"}</button>
                    <button onClick={()=>handleDelDeal(d.id)} style={{...S.payBtn,background:"#7f1d1d"}}>🗑</button>
                    {isAdmin&&d.eligible&&!d.paid&&<button onClick={()=>markPaid(d.id)} style={S.payBtn}>صرف</button>}
                  </div>
                </div>
                <div style={{display:"flex",gap:8,background:"#0f172a",borderRadius:10,padding:"10px 8px",flexWrap:"wrap"}}>
                  {[["قيمة البيع",fmt(d.saleValue)+" ج","#94a3b8"],["المحصَّل",fmt(d.collected)+" ج","#10b981"],["الأساسي",d.collected>=d.saleValue?fmt(d.base)+" ج":"—","#94a3b8"],["بعد النوع",d.collected>=d.saleValue?fmt(d.afterDT)+" ج":"—","#c084fc"],["الكوميشن",d.collected>=d.saleValue?fmt(d.finalC)+" ج":"—",d.eligible?"#f59e0b":"#475569"]].map(([l,v,c])=>(
                    <div key={l} style={{textAlign:"center",flex:1,minWidth:70}}>
                      <div style={{color:"#475569",fontSize:10,marginBottom:3}}>{l}</div>
                      <div style={{color:c,fontSize:13,fontWeight:700}}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{height:4,background:"#0f172a",borderRadius:99,overflow:"hidden",marginTop:10}}>
                  <div style={{height:"100%",width:`${Math.min(d.collRate,100)}%`,background:d.paid?"#16a34a":d.collRate>=100?"#f59e0b":"#3b82f6",borderRadius:99}}/>
                </div>
              </div>
            ))}
            {filtered.length===0&&<div style={{textAlign:"center",color:"#475569",padding:"30px 0"}}>لا توجد صفقات</div>}
          </div>
        </div>
      )}

      {/* BONUSES */}
      {tab==="bonuses"&&(
        <div style={S.section}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={S.sectionTitle}>🌟 بونص إحضار</div>
            <button onClick={()=>setShowAddBonus(true)} style={{...S.btn,background:"#7c3aed"}}>+ تسجيل</button>
          </div>
          <div style={{background:"#2e1065",border:"1px solid #7c3aed44",borderRadius:12,padding:12,marginBottom:16,fontSize:12,color:"#c4b5fd"}}>
            10% من التحصيل · حد أدنى {fmt(ACQ_MIN)} ج · مرة واحدة · بدون تارجت
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {bonusList.map(b=>(
              <div key={b.code} style={{background:b.bonusPaid?"#0f2a1a":b.eligible?"#1e0a3a":"#0f172a",border:`1px solid ${b.bonusPaid?"#16a34a44":b.eligible?"#7c3aed":"#334155"}`,borderRadius:14,padding:16}}>
                <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
                  <div>
                    <div style={{fontWeight:700,color:"#f1f5f9"}}>{b.clientName}</div>
                    <div style={{color:"#64748b",fontSize:12,marginTop:3}}>👤 {b.agName} · <span style={{color:"#a78bfa"}}>{b.code}</span></div>
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                    {b.bonusPaid?<span style={S.badge("paid")}>✓ مصروف</span>
                      :b.eligible?<><span style={S.badge("bonus")}>🌟 مستحق</span>{isAdmin&&<button onClick={()=>markBonusPaid(b.code)} style={{...S.payBtn,background:"#7c3aed"}}>صرف</button>}</>
                      :<span style={S.badge("notarget")}>⚠️ تحت الحد</span>}
                    <button onClick={()=>setShowEditBonus({code:b.code,clientName:b.clientName,empId:b.empId,collected:String(b.collected)})} style={{...S.payBtn,background:"#334155"}}>{isAdmin?"✏️":"📝"}</button>
                    <button onClick={()=>handleDelBonus(b.code)} style={{...S.payBtn,background:"#7f1d1d"}}>🗑</button>
                  </div>
                </div>
                <div style={{display:"flex",gap:12,background:"#0f172a",borderRadius:10,padding:"10px 8px",marginTop:12}}>
                  {[["التحصيل",fmt(b.collected)+" ج","#10b981"],["النسبة","10%","#a78bfa"],["البونص",b.eligible?fmt(b.bonus)+" ج":"—",b.eligible?"#a78bfa":"#475569"]].map(([l,v,c])=>(
                    <div key={l} style={{textAlign:"center",flex:1}}>
                      <div style={{color:"#475569",fontSize:10,marginBottom:3}}>{l}</div>
                      <div style={{color:c,fontSize:16,fontWeight:800}}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {bonusList.length===0&&<div style={{textAlign:"center",color:"#475569",padding:"30px 0"}}>لا توجد بونصات</div>}
          </div>
        </div>
      )}

      {/* AGENTS */}
      {tab==="agents"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontSize:18,fontWeight:700,color:"#f1f5f9"}}>👥 المندوبين</div>
            {isAdmin&&<button onClick={()=>setShowAddAgent(true)} style={{...S.btn,background:"#0f766e"}}>+ إضافة مندوب</button>}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:20}}>
            {agents.map(a=>{
              const agDeals=enriched.filter(d=>d.empId===a.empId&&(filterMonth==="الكل"||mOf(d.endDate)===filterMonth));
              const agBonuses=bonusList.filter(b=>b.empId===a.empId);
              const totalCommEarned  =agDeals.filter(d=>d.eligible||d.paid).reduce((s,d)=>s+d.finalC,0);
              const totalCommPaid    =agDeals.filter(d=>d.paid).reduce((s,d)=>s+d.finalC,0);
              const totalCommPending =agDeals.filter(d=>d.eligible&&!d.paid).reduce((s,d)=>s+d.finalC,0);
              const totalBonusEarned =agBonuses.filter(b=>b.eligible).reduce((s,b)=>s+b.bonus,0);
              const totalBonusPaid   =agBonuses.filter(b=>b.bonusPaid).reduce((s,b)=>s+b.bonus,0);
              const totalBonusPending=agBonuses.filter(b=>b.eligible&&!b.bonusPaid).reduce((s,b)=>s+b.bonus,0);
              const grandTotal  =totalCommEarned+totalBonusEarned;
              const grandPaid   =totalCommPaid+totalBonusPaid;
              const grandPending=totalCommPending+totalBonusPending;
              return(
                <div key={a.empId} style={{background:"#1e293b",borderRadius:16,overflow:"hidden"}}>
                  {/* رأس المندوب */}
                  <div style={{background:"#0f172a",padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
                    <div style={{display:"flex",gap:14,alignItems:"center"}}>
                      <div style={{width:48,height:48,borderRadius:"50%",background:"linear-gradient(135deg,#3b82f6,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:800,flexShrink:0}}>{a.name.charAt(0)}</div>
                      <div>
                        <div style={{fontWeight:800,color:"#f1f5f9",fontSize:16}}>{a.name}</div>
                        <div style={{color:"#a78bfa",fontSize:12,marginTop:2}}>{a.empId}</div>
                        <div style={{color:"#64748b",fontSize:12}}>التارجت: {fmt(a.monthlyTarget)} ج / شهر</div>
                      </div>
                    </div>
                    {isAdmin&&<div style={{display:"flex",gap:8}}>
                      <button onClick={()=>setShowEditAgent({...a})} style={{...S.payBtn,background:"#1d4ed8"}}>✏️ تعديل</button>
                      <button onClick={()=>delAgent(a.empId)} style={{...S.payBtn,background:"#7f1d1d"}}>🗑 حذف</button>
                    </div>}
                  </div>

                  {/* ملخص المستحقات */}
                  <div style={{display:"flex",borderBottom:"1px solid #0f172a",flexWrap:"wrap"}}>
                    {[
                      ["إجمالي المستحقات",grandTotal,"#e2e8f0","💰"],
                      ["مُصرَف",grandPaid,"#10b981","✅"],
                      ["متبقي مستحق",grandPending,grandPending>0?"#f59e0b":"#475569","⏳"],
                    ].map(([l,v,c,ic])=>(
                      <div key={l} style={{flex:1,minWidth:130,padding:"14px 16px",textAlign:"center",borderLeft:"1px solid #0f172a"}}>
                        <div style={{fontSize:18,marginBottom:4}}>{ic}</div>
                        <div style={{color:"#64748b",fontSize:11,marginBottom:4}}>{l}</div>
                        <div style={{color:c,fontSize:18,fontWeight:800}}>{fmt(v)} ج</div>
                      </div>
                    ))}
                  </div>

                  {/* تفاصيل المعاملات */}
                  <div style={{padding:"16px 20px"}}>
                    <div style={{color:"#94a3b8",fontSize:13,fontWeight:700,marginBottom:12}}>
                      📋 تفاصيل المعاملات {filterMonth!=="الكل"?`— ${filterMonth}`:""}
                    </div>

                    {agDeals.length>0&&(
                      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:agBonuses.length>0?16:0}}>
                        {agDeals.map(d=>(
                          <div key={d.id} style={{background:"#0f172a",borderRadius:10,padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,borderRight:`3px solid ${d.paid?"#16a34a":d.eligible?"#f59e0b":d.dt.color}`}}>
                            <div>
                              <div style={{fontWeight:700,color:"#f1f5f9",fontSize:13}}>{d.project}</div>
                              <div style={{color:"#64748b",fontSize:11,marginTop:2,display:"flex",gap:6,flexWrap:"wrap"}}>
                                <span style={{color:d.dt.color}}>{d.dt.icon} {d.dt.label}</span>
                                <span>📅 {d.endDate}</span>
                              </div>
                            </div>
                            <div style={{display:"flex",gap:14,alignItems:"center",flexWrap:"wrap"}}>
                              <div style={{textAlign:"center"}}>
                                <div style={{color:"#475569",fontSize:10}}>التحصيل</div>
                                <div style={{color:"#10b981",fontWeight:700,fontSize:13}}>{fmt(d.collected)} ج</div>
                              </div>
                              <div style={{textAlign:"center"}}>
                                <div style={{color:"#475569",fontSize:10}}>الكوميشن</div>
                                <div style={{color:d.eligible||d.paid?"#f59e0b":"#475569",fontWeight:800,fontSize:14}}>{d.collected>=d.saleValue?`${fmt(d.finalC)} ج`:"—"}</div>
                              </div>
                              {d.paid?<span style={S.badge("paid")}>✓ مصروف</span>
                                :d.eligible?<span style={S.badge("ready")}>⚡ مستحق</span>
                                :d.tMult===0&&d.collected>=d.saleValue?<span style={S.badge("notarget")}>🎯 تحت التارجت</span>
                                :<span style={S.badge("pending")}>⏳ جاري</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {agBonuses.length>0&&(
                      <div style={{display:"flex",flexDirection:"column",gap:8}}>
                        <div style={{color:"#a78bfa",fontSize:12,fontWeight:700,marginBottom:4}}>🌟 بونص الإحضار</div>
                        {agBonuses.map(b=>(
                          <div key={b.code} style={{background:"#0f172a",borderRadius:10,padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,borderRight:`3px solid ${b.bonusPaid?"#16a34a":b.eligible?"#7c3aed":"#334155"}`}}>
                            <div>
                              <div style={{fontWeight:700,color:"#f1f5f9",fontSize:13}}>{b.clientName}</div>
                              <div style={{color:"#64748b",fontSize:11,marginTop:2}}>كود: <span style={{color:"#a78bfa"}}>{b.code}</span></div>
                            </div>
                            <div style={{display:"flex",gap:14,alignItems:"center",flexWrap:"wrap"}}>
                              <div style={{textAlign:"center"}}>
                                <div style={{color:"#475569",fontSize:10}}>التحصيل</div>
                                <div style={{color:"#10b981",fontWeight:700,fontSize:13}}>{fmt(b.collected)} ج</div>
                              </div>
                              <div style={{textAlign:"center"}}>
                                <div style={{color:"#475569",fontSize:10}}>البونص (10%)</div>
                                <div style={{color:b.eligible?"#a78bfa":"#475569",fontWeight:800,fontSize:14}}>{b.eligible?`${fmt(b.bonus)} ج`:"—"}</div>
                              </div>
                              {b.bonusPaid?<span style={S.badge("paid")}>✓ مصروف</span>
                                :b.eligible?<span style={S.badge("bonus")}>🌟 مستحق</span>
                                :<span style={S.badge("notarget")}>⚠️ تحت الحد</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {agDeals.length===0&&agBonuses.length===0&&(
                      <div style={{textAlign:"center",color:"#475569",padding:"20px 0",fontSize:13}}>لا توجد معاملات مسجَّلة</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* APPROVALS */}
      {tab==="approvals"&&isAdmin&&(
        <div style={S.section}>
          <div style={S.sectionTitle}>✅ طلبات الموافقة ({pendingCount})</div>
          {pendingCount===0&&<div style={{textAlign:"center",color:"#475569",padding:"30px 0"}}>لا توجد طلبات ✅</div>}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {requests.map(req=>{
              const typeLabel=req.type==="edit_deal"?"تعديل صفقة":req.type==="delete_deal"?"حذف صفقة":req.type==="edit_bonus"?"تعديل بونص":"حذف بونص";
              return(
                <div key={req.id} style={{background:"#0f172a",border:"1px solid #d97706",borderRadius:14,padding:16}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
                    <div>
                      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
                        <span style={{background:"#d9770622",color:"#f59e0b",border:"1px solid #d97706",borderRadius:10,padding:"2px 10px",fontSize:12,fontWeight:700}}>{typeLabel}</span>
                        <span style={{color:"#94a3b8",fontSize:12}}>من: <b style={{color:"#e2e8f0"}}>{req.requestedBy}</b></span>
                        <span style={{color:"#475569",fontSize:11}}>{req.requestedAt}</span>
                      </div>
                      {req.payload?.project&&<div style={{color:"#94a3b8",fontSize:13}}>المشروع: <b style={{color:"#f1f5f9"}}>{req.payload.project}</b></div>}
                      {req.payload?.clientName&&<div style={{color:"#94a3b8",fontSize:13}}>العميل: <b style={{color:"#f1f5f9"}}>{req.payload.clientName}</b></div>}
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>approveReq(req)} style={{...S.payBtn,background:"#16a34a"}}>✅ موافقة</button>
                      <button onClick={()=>rejectReq(req.id)} style={{...S.payBtn,background:"#7f1d1d"}}>❌ رفض</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SETTINGS */}
      {tab==="settings"&&isAdmin&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div style={S.section}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={S.sectionTitle}>📊 شرائح التارجت</div>
              <button onClick={()=>{setEditTgtTiers(targetTiers);setShowTgtTierEd(true);}} style={S.payBtn}>تعديل</button>
            </div>
            {targetTiers.map((t,i)=>{const c=["#ef4444","#f97316","#f59e0b","#10b981"][i]||"#8b5cf6";return(
              <div key={t.id} style={{background:"#0f172a",borderRadius:12,padding:"12px 16px",marginBottom:8,borderRight:`4px solid ${c}`,display:"flex",justifyContent:"space-between"}}>
                <div style={{color:"#e2e8f0",fontWeight:700}}>{t.from}% — {t.to!==null?`${t.to}%`:"ما فوق"}</div>
                <div style={{fontSize:22,fontWeight:900,color:c}}>×{t.commMultiplier}</div>
              </div>
            );})}
          </div>
          <div style={S.section}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={S.sectionTitle}>⚙️ شرائح العمولة</div>
              <button onClick={()=>{setEditTiers(tiers);setShowTierEd(true);}} style={S.payBtn}>تعديل</button>
            </div>
            {tiers.map((t,i)=>(
              <div key={t.id} style={{background:"#0f172a",borderRadius:12,padding:"12px 16px",marginBottom:8,borderRight:`4px solid ${["#3b82f6","#10b981","#f59e0b"][i]||"#8b5cf6"}`,display:"flex",justifyContent:"space-between"}}>
                <div style={{color:"#e2e8f0",fontWeight:700}}>{fmt(t.from)} — {t.to!==null?`${fmt(t.to)} ج`:"ما فوق"}</div>
                <div style={{fontSize:22,fontWeight:900,color:"#f59e0b"}}>{t.rate}%</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {showDealDetail&&<DealDetail deal={showDealDetail} agents={agents} tiers={tiers} targetTiers={targetTiers} onClose={()=>setShowDealDetail(null)}/>}
      {showAddDeal&&<DealForm data={newDeal} setData={setNewDeal} onSave={addDeal} onClose={()=>setShowAddDeal(false)} title="➕ صفقة جديدة" agents={agents}/>}
      {showEditDeal&&<DealForm data={showEditDeal} setData={setShowEditDeal} onSave={()=>handleEditDeal(showEditDeal)} onClose={()=>setShowEditDeal(null)} title={isAdmin?"✏️ تعديل":"📝 طلب تعديل"} agents={agents}/>}

      {/* تعديل بونص */}
      {showEditBonus&&(
        <div style={S.overlay} onClick={()=>setShowEditBonus(null)}>
          <div style={S.modal} onClick={e=>e.stopPropagation()}>
            <div style={S.modalTitle}>{isAdmin?"✏️ تعديل البونص":"📝 طلب تعديل"}</div>
            <div style={{marginBottom:10}}><label style={S.label}>المندوب</label>
              <select value={showEditBonus.empId} onChange={e=>setShowEditBonus({...showEditBonus,empId:e.target.value})} style={S.input}>
                {agents.map(a=><option key={a.empId} value={a.empId}>{a.empId} — {a.name}</option>)}
              </select>
            </div>
            {[["clientName","اسم العميل","text"],["collected","إجمالي التحصيل (ج)","number"]].map(([k,l,t])=>(
              <div key={k} style={{marginBottom:10}}><label style={S.label}>{l}</label>
                <input type={t} value={showEditBonus[k]||""} onChange={e=>setShowEditBonus({...showEditBonus,[k]:e.target.value})} style={S.input}/></div>
            ))}
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>handleEditBonus(showEditBonus.code,showEditBonus)} style={{...S.btn,background:"#7c3aed"}}>{isAdmin?"حفظ":"إرسال"}</button>
              <button onClick={()=>setShowEditBonus(null)} style={{...S.btn,background:"#334155"}}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* إضافة مندوب */}
      {showAddAgent&&(
        <div style={S.overlay} onClick={()=>setShowAddAgent(false)}>
          <div style={S.modal} onClick={e=>e.stopPropagation()}>
            <div style={S.modalTitle}>👤 مندوب جديد</div>
            {[["empId","رقم الموظف (EMP-XXX)","text"],["name","الاسم","text"],["monthlyTarget","التارجت الشهري (ج)","number"]].map(([k,l,t])=>(
              <div key={k} style={{marginBottom:10}}><label style={S.label}>{l}</label><input type={t} value={newAgent[k]} onChange={e=>setNewAgent({...newAgent,[k]:e.target.value})} style={S.input}/></div>
            ))}
            <div style={{display:"flex",gap:10}}><button onClick={addAgent} style={{...S.btn,background:"#0f766e"}}>إضافة</button><button onClick={()=>setShowAddAgent(false)} style={{...S.btn,background:"#334155"}}>إلغاء</button></div>
          </div>
        </div>
      )}

      {/* تعديل مندوب */}
      {showEditAgent&&(
        <div style={S.overlay} onClick={()=>setShowEditAgent(null)}>
          <div style={S.modal} onClick={e=>e.stopPropagation()}>
            <div style={S.modalTitle}>✏️ تعديل المندوب</div>
            {[["empId","رقم الموظف","text"],["name","الاسم","text"],["monthlyTarget","التارجت الشهري (ج)","number"]].map(([k,l,t])=>(
              <div key={k} style={{marginBottom:10}}><label style={S.label}>{l}</label><input type={t} value={showEditAgent[k]} onChange={e=>setShowEditAgent({...showEditAgent,[k]:e.target.value})} style={S.input} disabled={k==="empId"}/></div>
            ))}
            <div style={{display:"flex",gap:10}}><button onClick={()=>saveAgent(showEditAgent)} style={S.btn}>حفظ</button><button onClick={()=>setShowEditAgent(null)} style={{...S.btn,background:"#334155"}}>إلغاء</button></div>
          </div>
        </div>
      )}

      {/* إضافة بونص */}
      {showAddBonus&&(
        <div style={S.overlay} onClick={()=>setShowAddBonus(false)}>
          <div style={S.modal} onClick={e=>e.stopPropagation()}>
            <div style={S.modalTitle}>🌟 تسجيل بونص إحضار</div>
            <div style={{marginBottom:10}}><label style={S.label}>المندوب</label>
              <select value={newBonus.empId} onChange={e=>setNewBonus({...newBonus,empId:e.target.value})} style={S.input}>
                <option value="">اختر</option>{agents.map(a=><option key={a.empId} value={a.empId}>{a.empId} — {a.name}</option>)}
              </select>
            </div>
            {[["clientCode","كود العميل","text"],["clientName","اسم العميل","text"],["collected","إجمالي التحصيل (ج)","number"]].map(([k,l,t])=>(
              <div key={k} style={{marginBottom:10}}><label style={S.label}>{l}</label><input type={t} value={newBonus[k]} onChange={e=>setNewBonus({...newBonus,[k]:e.target.value})} style={S.input}/></div>
            ))}
            {newBonus.collected&&+newBonus.collected>=ACQ_MIN&&(
              <div style={{background:"#2e1065",borderRadius:10,padding:12,marginBottom:12,color:"#a78bfa",fontWeight:700,textAlign:"center"}}>قيمة البونص = {fmt(+newBonus.collected*ACQ_RATE)} ج</div>
            )}
            <div style={{display:"flex",gap:10}}><button onClick={addBonus} style={{...S.btn,background:"#7c3aed"}}>تسجيل</button><button onClick={()=>setShowAddBonus(false)} style={{...S.btn,background:"#334155"}}>إلغاء</button></div>
          </div>
        </div>
      )}

      {/* شرائح التارجت */}
      {showTgtTierEd&&(
        <div style={S.overlay} onClick={()=>setShowTgtTierEd(false)}>
          <div style={S.modal} onClick={e=>e.stopPropagation()}>
            <div style={S.modalTitle}>📊 شرائح التارجت</div>
            {editTgtTiers.map((t,i)=>(
              <div key={t.id} style={{display:"flex",gap:8,marginBottom:10,alignItems:"center"}}>
                <input type="number" value={t.from} onChange={e=>{const a=[...editTgtTiers];a[i]={...a[i],from:+e.target.value};setEditTgtTiers(a);}} style={{...S.input,width:60}}/>
                <span style={{color:"#94a3b8"}}>—</span>
                <input type="number" value={t.to||""} onChange={e=>{const a=[...editTgtTiers];a[i]={...a[i],to:e.target.value?+e.target.value:null};setEditTgtTiers(a);}} style={{...S.input,width:60}} placeholder="∞"/>
                <input type="number" step="0.05" value={t.commMultiplier} onChange={e=>{const a=[...editTgtTiers];a[i]={...a[i],commMultiplier:+e.target.value};setEditTgtTiers(a);}} style={{...S.input,width:60}}/>
                <button onClick={()=>setEditTgtTiers(editTgtTiers.filter((_,j)=>j!==i))} style={{background:"#7f1d1d",color:"#fff",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer"}}>✕</button>
              </div>
            ))}
            <button onClick={()=>setEditTgtTiers([...editTgtTiers,{id:Date.now(),from:0,to:null,commMultiplier:1}])} style={{...S.payBtn,marginBottom:12}}>+ شريحة</button>
            <div style={{display:"flex",gap:10}}><button onClick={saveTgtTiers} style={S.btn}>حفظ</button><button onClick={()=>setShowTgtTierEd(false)} style={{...S.btn,background:"#334155"}}>إلغاء</button></div>
          </div>
        </div>
      )}

      {/* شرائح العمولة */}
      {showTierEd&&(
        <div style={S.overlay} onClick={()=>setShowTierEd(false)}>
          <div style={S.modal} onClick={e=>e.stopPropagation()}>
            <div style={S.modalTitle}>⚙️ شرائح العمولة</div>
            {editTiers.map((t,i)=>(
              <div key={t.id} style={{display:"flex",gap:8,marginBottom:10,alignItems:"center"}}>
                <input type="number" value={t.from} onChange={e=>{const a=[...editTiers];a[i]={...a[i],from:+e.target.value};setEditTiers(a);}} style={{...S.input,width:90}}/>
                <span style={{color:"#94a3b8"}}>—</span>
                <input type="number" value={t.to||""} onChange={e=>{const a=[...editTiers];a[i]={...a[i],to:e.target.value?+e.target.value:null};setEditTiers(a);}} style={{...S.input,width:90}} placeholder="ما فوق"/>
                <input type="number" value={t.rate} onChange={e=>{const a=[...editTiers];a[i]={...a[i],rate:+e.target.value};setEditTiers(a);}} style={{...S.input,width:55}}/>
                <span style={{color:"#f59e0b"}}>%</span>
                <button onClick={()=>setEditTiers(editTiers.filter((_,j)=>j!==i))} style={{background:"#7f1d1d",color:"#fff",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer"}}>✕</button>
              </div>
            ))}
            <button onClick={()=>setEditTiers([...editTiers,{id:Date.now(),from:0,to:null,rate:3}])} style={{...S.payBtn,marginBottom:12}}>+ شريحة</button>
            <div style={{display:"flex",gap:10}}><button onClick={saveTiers} style={S.btn}>حفظ</button><button onClick={()=>setShowTierEd(false)} style={{...S.btn,background:"#334155"}}>إلغاء</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({label,value,color,icon}){
  return(
    <div style={{background:"#1e293b",borderRadius:14,padding:"18px 20px",borderTop:`3px solid ${color}`,flex:1,minWidth:150}}>
      <div style={{fontSize:24}}>{icon}</div>
      <div style={{color:"#94a3b8",fontSize:12,marginTop:6}}>{label}</div>
      <div style={{color,fontSize:20,fontWeight:800,marginTop:4,direction:"ltr",textAlign:"right"}}>{value}</div>
    </div>
  );
}

const S={
  root:{background:"#0f172a",minHeight:"100vh",color:"#e2e8f0",fontFamily:"'Cairo','Segoe UI',sans-serif",direction:"rtl",padding:20,maxWidth:1100,margin:"0 auto"},
  header:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,paddingBottom:16,borderBottom:"1px solid #1e293b",flexWrap:"wrap",gap:10},
  headerTitle:{fontSize:24,fontWeight:800,color:"#f1f5f9"},
  headerSub:{fontSize:11,color:"#64748b",marginTop:2},
  nav:{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"},
  navBtn:a=>({background:a?"#3b82f6":"#1e293b",color:a?"#fff":"#94a3b8",border:"none",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontFamily:"inherit",fontWeight:600,fontSize:13}),
  cards:{display:"flex",gap:14,marginBottom:16,flexWrap:"wrap"},
  section:{background:"#1e293b",borderRadius:16,padding:20},
  sectionTitle:{fontSize:16,fontWeight:700,marginBottom:14,color:"#f1f5f9"},
  dealCard:(paid,eligible,type)=>({background:paid?"#0f2a1a":type==="existing_routine"?"#111827":eligible?"#1a1f0a":"#0f172a",border:`1px solid ${paid?"#16a34a33":type==="existing_routine"?"#334155":eligible?"#d97706":"#1e293b"}`,borderRadius:14,padding:16}),
  badge:t=>({padding:"3px 9px",borderRadius:20,fontSize:11,fontWeight:700,
    background:t==="paid"?"#16a34a22":t==="ready"?"#f59e0b22":t==="bonus"?"#7c3aed22":t==="notarget"?"#ef444422":"#3b82f622",
    color:t==="paid"?"#16a34a":t==="ready"?"#f59e0b":t==="bonus"?"#a78bfa":t==="notarget"?"#ef4444":"#3b82f6",
    border:`1px solid ${t==="paid"?"#16a34a":t==="ready"?"#f59e0b":t==="bonus"?"#7c3aed":t==="notarget"?"#ef4444":"#3b82f6"}`}),
  payBtn:{background:"#d97706",color:"#fff",border:"none",borderRadius:8,padding:"6px 10px",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:12},
  btn:{background:"#3b82f6",color:"#fff",border:"none",borderRadius:10,padding:"10px 16px",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:14},
  select:{background:"#1e293b",color:"#e2e8f0",border:"1px solid #334155",borderRadius:8,padding:"7px 12px",fontFamily:"inherit",fontSize:13},
  overlay:{position:"fixed",inset:0,background:"#00000088",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:20,overflowY:"auto"},
  modal:{background:"#1e293b",borderRadius:16,padding:24,width:"90%",maxWidth:440,maxHeight:"90vh",overflowY:"auto"},
  modalTitle:{fontSize:18,fontWeight:800,marginBottom:18,color:"#f1f5f9"},
  label:{display:"block",fontSize:12,color:"#94a3b8",marginBottom:4},
  input:{background:"#0f172a",border:"1px solid #334155",borderRadius:8,color:"#e2e8f0",padding:"8px 12px",width:"100%",fontFamily:"inherit",fontSize:14,boxSizing:"border-box"},
};
