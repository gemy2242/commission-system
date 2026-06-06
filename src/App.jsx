import { useState, useMemo } from "react";

// ── أنواع الصفقات العادية (كوميشن + تارجت) ────────────────────────────────
const DEAL_TYPES = [
  { key: "new_client",       label: "عميل جديد",               icon: "🌟", multiplier: 1.0,  color: "#3b82f6", desc: "أول صفقة — سيُحوَّل لعميل قديم بعد التكويد" },
  { key: "existing_big",     label: "عميل قديم — صفقة كبيرة",  icon: "💼", multiplier: 0.5,  color: "#10b981", desc: "عميل موجود — صفقة غير روتينية أو كبيرة" },
  { key: "existing_routine", label: "عميل قديم — طلب روتيني",  icon: "🔄", multiplier: 0.25, color: "#f97316", desc: "طلب تلقائي متكرر" },
];

// ── شرائح التارجت الشهري ───────────────────────────────────────────────────
const INITIAL_TARGET_TIERS = [
  { id: 1, from: 0,   to: 50,  commMultiplier: 0,    label: "أقل من 50% — لا كوميشن" },
  { id: 2, from: 50,  to: 80,  commMultiplier: 0.5,  label: "50–79% — كوميشن 50%" },
  { id: 3, from: 80,  to: 100, commMultiplier: 0.75, label: "80–99% — كوميشن 75%" },
  { id: 4, from: 100, to: null,commMultiplier: 1.0,  label: "100%+ — كوميشن كامل" },
];

// ── شرائح العمولة الأساسية ─────────────────────────────────────────────────
const INITIAL_TIERS = [
  { id: 1, from: 0,      to: 50000,  rate: 2 },
  { id: 2, from: 50000,  to: 100000, rate: 3 },
  { id: 3, from: 100000, to: null,   rate: 5 },
];

// ── التارجت الشهري ─────────────────────────────────────────────────────────
const INITIAL_TARGETS = {
  "أحمد سامي": 200000,
  "منى محمد":  150000,
  "خالد يوسف": 250000,
};

const CURRENT_MONTH = "2026-06";

// ── بونص الإحضار: 10% على التحصيل الكامل — مرة واحدة — بدون تارجت ─────────
const ACQUISITION_BONUS_RATE = 0.10;
const ACQUISITION_BONUS_THRESHOLD = 100000; // الحد الأدنى للتحصيل لاستحقاق البونص

// ── الصفقات التجريبية ──────────────────────────────────────────────────────
const INITIAL_DEALS = [
  { id: 1, agent: "أحمد سامي",  project: "مشروع A", dealType: "new_client",       saleValue: 80000,  collected: 80000,  date: "2026-06-10", clientCode: "" },
  { id: 2, agent: "منى محمد",   project: "مشروع B", dealType: "existing_big",     saleValue: 120000, collected: 60000,  date: "2026-06-15", clientCode: "" },
  { id: 3, agent: "أحمد سامي",  project: "مشروع C", dealType: "existing_routine", saleValue: 45000,  collected: 45000,  date: "2026-06-20", clientCode: "" },
  { id: 4, agent: "خالد يوسف",  project: "مشروع D", dealType: "new_client",       saleValue: 200000, collected: 200000, date: "2026-06-01", clientCode: "C-2024" },
  { id: 5, agent: "منى محمد",   project: "مشروع E", dealType: "existing_routine", saleValue: 30000,  collected: 30000,  date: "2026-06-03", clientCode: "" },
];

// ── بونص الإحضار المسجَّلة ─────────────────────────────────────────────────
// clientCode → { agent, collected, bonusPaid }
const INITIAL_ACQUISITION_BONUSES = {
  "C-2024": { agent: "خالد يوسف", clientName: "شركة الدلتا", collected: 200000, bonusPaid: false },
};

// ── دوال مساعدة ────────────────────────────────────────────────────────────
function calcBaseCommission(amount, tiers) {
  let commission = 0, remaining = amount;
  for (const tier of tiers) {
    const tierMax = tier.to !== null ? tier.to : Infinity;
    if (remaining <= 0 || amount <= tier.from) break;
    const applicable = Math.min(remaining, tierMax - tier.from, amount - tier.from);
    if (applicable <= 0) break;
    commission += applicable * (tier.rate / 100);
    remaining -= applicable;
    if (tier.to === null) break;
  }
  return commission;
}

function getTargetMultiplier(pct, targetTiers) {
  return [...targetTiers].sort((a, b) => b.from - a.from).find((t) => pct >= t.from)?.commMultiplier ?? 0;
}

function getDealType(key) {
  return DEAL_TYPES.find((t) => t.key === key) || DEAL_TYPES[0];
}

function fmt(n) { return n.toLocaleString("ar-EG", { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function pct(n) { return `${Math.round(n)}%`; }
function achColor(p) { return p >= 100 ? "#10b981" : p >= 80 ? "#f59e0b" : p >= 50 ? "#f97316" : "#ef4444"; }

// ── المكوّن الرئيسي ────────────────────────────────────────────────────────
export default function CommissionSystem() {
  const [deals, setDeals] = useState(INITIAL_DEALS);
  const [tiers, setTiers] = useState(INITIAL_TIERS);
  const [targetTiers, setTargetTiers] = useState(INITIAL_TARGET_TIERS);
  const [targets, setTargets] = useState(INITIAL_TARGETS);
  const [acqBonuses, setAcqBonuses] = useState(INITIAL_ACQUISITION_BONUSES);

  const [tab, setTab] = useState("dashboard");
  const [paidDeals, setPaidDeals] = useState(new Set());
  const [filterAgent, setFilterAgent] = useState("الكل");
  const [filterType, setFilterType]   = useState("الكل");

  // modals
  const [showAddDeal, setShowAddDeal]               = useState(false);
  const [showAddBonus, setShowAddBonus]             = useState(false);
  const [showTierEditor, setShowTierEditor]         = useState(false);
  const [showTargetTierEd, setShowTargetTierEd]     = useState(false);
  const [showTargetEditor, setShowTargetEditor]     = useState(false);
  const [editTiers, setEditTiers]                   = useState(tiers);
  const [editTargetTiers, setEditTargetTiers]       = useState(targetTiers);
  const [editTargets, setEditTargets]               = useState(targets);

  const [newDeal, setNewDeal] = useState({
    agent: "", project: "", dealType: "new_client",
    saleValue: "", collected: "", date: new Date().toISOString().slice(0, 10), clientCode: "",
  });
  const [newBonus, setNewBonus] = useState({
    clientCode: "", clientName: "", agent: "", collected: "",
  });

  const agents = useMemo(() => ["الكل", ...new Set(deals.map((d) => d.agent))], [deals]);

  // تحصيل شهري لكل مندوب
  const monthlyCollected = useMemo(() => {
    const map = {};
    deals.forEach((d) => {
      if (d.date.startsWith(CURRENT_MONTH) && d.collected >= d.saleValue)
        map[d.agent] = (map[d.agent] || 0) + d.collected;
    });
    return map;
  }, [deals]);

  const agentAchievement = useMemo(() => {
    const map = {};
    Object.keys(targets).forEach((a) => {
      map[a] = ((monthlyCollected[a] || 0) / (targets[a] || 1)) * 100;
    });
    return map;
  }, [monthlyCollected, targets]);

  // إثراء الصفقات
  const enriched = useMemo(() => deals.map((d) => {
    const dt = getDealType(d.dealType);
    const fullyCollected = d.collected >= d.saleValue;
    const base = fullyCollected ? calcBaseCommission(d.collected, tiers) : 0;
    const afterDealType = base * dt.multiplier;
    const achPct = agentAchievement[d.agent] ?? 100;
    const targetMult = getTargetMultiplier(achPct, targetTiers);
    const finalCommission = afterDealType * targetMult;
    const eligible = fullyCollected && dt.multiplier > 0 && targetMult > 0;
    const paid = paidDeals.has(d.id);
    // بونص الإحضار مرتبط بـ clientCode
    const bonusRecord = d.clientCode ? acqBonuses[d.clientCode] : null;
    return { ...d, base, afterDealType, finalCommission, targetMult, achPct, eligible, paid, dt, bonusRecord, collectionRate: (d.collected / d.saleValue) * 100 };
  }), [deals, tiers, targetTiers, agentAchievement, paidDeals, acqBonuses]);

  const filtered = useMemo(() => {
    let r = filterAgent === "الكل" ? enriched : enriched.filter((d) => d.agent === filterAgent);
    if (filterType !== "الكل") r = r.filter((d) => d.dealType === filterType);
    return r;
  }, [enriched, filterAgent, filterType]);

  // ملخص بونص الإحضار
  const bonusSummary = useMemo(() => Object.entries(acqBonuses).map(([code, b]) => ({
    code, ...b,
    bonus: b.collected * ACQUISITION_BONUS_RATE,
    eligible: b.collected >= ACQUISITION_BONUS_THRESHOLD,
  })), [acqBonuses]);

  const agentSummary = useMemo(() => {
    const map = {};
    enriched.forEach((d) => {
      if (!map[d.agent]) map[d.agent] = {
        agent: d.agent, totalSales: 0, totalCollected: 0,
        pendingComm: 0, paidComm: 0, deals: 0,
        target: targets[d.agent] || 0,
        monthlyCollected: monthlyCollected[d.agent] || 0,
        achPct: agentAchievement[d.agent] || 0,
        targetMult: getTargetMultiplier(agentAchievement[d.agent] || 0, targetTiers),
        pendingBonus: 0, paidBonus: 0,
      };
      map[d.agent].totalSales     += d.saleValue;
      map[d.agent].totalCollected += d.collected;
      map[d.agent].deals          += 1;
      if (d.paid) map[d.agent].paidComm += d.finalCommission;
      else if (d.eligible) map[d.agent].pendingComm += d.finalCommission;
    });
    // أضف بونصات الإحضار
    bonusSummary.forEach((b) => {
      if (!map[b.agent]) return;
      if (b.bonusPaid) map[b.agent].paidBonus += b.bonus;
      else if (b.eligible) map[b.agent].pendingBonus += b.bonus;
    });
    Object.keys(targets).forEach((a) => {
      if (!map[a]) map[a] = { agent: a, totalSales: 0, totalCollected: 0, pendingComm: 0, paidComm: 0, deals: 0, target: targets[a], monthlyCollected: 0, achPct: 0, targetMult: 0, pendingBonus: 0, paidBonus: 0 };
    });
    return Object.values(map);
  }, [enriched, targets, monthlyCollected, agentAchievement, targetTiers, bonusSummary]);

  const totalStats = useMemo(() => ({
    sales:       enriched.reduce((s, d) => s + d.saleValue, 0),
    collected:   enriched.reduce((s, d) => s + d.collected, 0),
    pendingComm: enriched.filter((d) => d.eligible && !d.paid).reduce((s, d) => s + d.finalCommission, 0),
    paidComm:    enriched.filter((d) => d.paid).reduce((s, d) => s + d.finalCommission, 0),
    pendingBonus: bonusSummary.filter((b) => b.eligible && !b.bonusPaid).reduce((s, b) => s + b.bonus, 0),
  }), [enriched, bonusSummary]);

  function addDeal() {
    if (!newDeal.agent || !newDeal.project || !newDeal.saleValue) return;
    setDeals([...deals, { ...newDeal, id: Date.now(), saleValue: +newDeal.saleValue, collected: +newDeal.collected || 0 }]);
    setNewDeal({ agent: "", project: "", dealType: "new_client", saleValue: "", collected: "", date: new Date().toISOString().slice(0, 10), clientCode: "" });
    setShowAddDeal(false);
  }

  function addBonus() {
    if (!newBonus.clientCode || !newBonus.agent || !newBonus.collected || !newBonus.clientName) return;
    setAcqBonuses({ ...acqBonuses, [newBonus.clientCode]: { agent: newBonus.agent, clientName: newBonus.clientName, collected: +newBonus.collected, bonusPaid: false } });
    setNewBonus({ clientCode: "", clientName: "", agent: "", collected: "" });
    setShowAddBonus(false);
  }

  function markPaid(id)        { setPaidDeals((p) => { const s = new Set(p); s.add(id); return s; }); }
  function markBonusPaid(code) { setAcqBonuses((p) => ({ ...p, [code]: { ...p[code], bonusPaid: true } })); }

  const statusBadge = (d) => {
    if (d.paid) return <span style={S.badge("paid")}>✓ مصروف</span>;
    if (!d.eligible && d.collected >= d.saleValue && d.targetMult === 0)
      return <span style={S.badge("notarget")}>🎯 تحت التارجت</span>;
    if (d.eligible) return <span style={S.badge("ready")}>⚡ مستحق</span>;
    return <span style={S.badge("pending")}>⏳ جاري</span>;
  };

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <div style={S.headerTitle}>🏆 نظام الكوميشنز</div>
          <div style={S.headerSub}>عمولة شهرية · بونص إحضار · مرتبط بالتارجت</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowAddBonus(true)} style={{ ...S.addBtn, background: "#7c3aed" }}>🌟 بونص إحضار</button>
          <button onClick={() => setShowAddDeal(true)}  style={S.addBtn}>+ صفقة</button>
        </div>
      </div>

      {/* Nav */}
      <div style={S.nav}>
        {[["dashboard","📊 الرئيسية"],["deals","📋 الصفقات"],["bonuses","🌟 بونص الإحضار"],["agents","👥 المندوبين"],["tiers","⚙️ الإعدادات"]].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} style={S.navBtn(tab === k)}>{l}</button>
        ))}
      </div>

      {/* ── DASHBOARD ── */}
      {tab === "dashboard" && (
        <div>
          <div style={S.cards}>
            <StatCard label="إجمالي المبيعات"    value={`${fmt(totalStats.sales)} ج`}        color="#3b82f6" icon="💰" />
            <StatCard label="إجمالي التحصيل"     value={`${fmt(totalStats.collected)} ج`}     color="#10b981" icon="🏦" />
            <StatCard label="كوميشن مستحق"       value={`${fmt(totalStats.pendingComm)} ج`}   color="#f59e0b" icon="⚡" />
            <StatCard label="بونص إحضار مستحق"   value={`${fmt(totalStats.pendingBonus)} ج`}  color="#7c3aed" icon="🌟" />
          </div>

          {/* التارجت */}
          <div style={{ ...S.section, marginBottom: 16 }}>
            <div style={S.sectionTitle}>🎯 التارجت الشهري — {CURRENT_MONTH}</div>
            {agentSummary.map((a) => (
              <div key={a.agent} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 4 }}>
                  <span style={{ fontWeight: 700, color: "#e2e8f0" }}>{a.agent}</span>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ color: "#94a3b8", fontSize: 12 }}>{fmt(a.monthlyCollected)} / {fmt(a.target)} ج</span>
                    <span style={{ color: achColor(a.achPct), fontWeight: 800 }}>{pct(a.achPct)}</span>
                    <span style={{ ...S.badge("ready"), background: achColor(a.achPct)+"22", color: achColor(a.achPct), border: `1px solid ${achColor(a.achPct)}` }}>×{a.targetMult}</span>
                  </div>
                </div>
                <div style={{ height: 8, background: "#0f172a", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(a.achPct, 100)}%`, background: achColor(a.achPct), borderRadius: 99, transition: "width 1s" }} />
                </div>
              </div>
            ))}
          </div>

          {/* ملخص */}
          <div style={S.section}>
            <div style={S.sectionTitle}>ملخص المندوبين</div>
            <div style={S.table}>
              <div style={{ ...S.tableHeader, gridTemplateColumns: "2fr 1.2fr 1fr 1fr 1.3fr 1.3fr" }}>
                <span>المندوب</span><span>التحصيل</span><span>الإنجاز</span><span>المعامل</span><span>كوميشن مستحق</span><span>بونص إحضار</span>
              </div>
              {agentSummary.map((a) => (
                <div key={a.agent} style={{ ...S.tableRow, gridTemplateColumns: "2fr 1.2fr 1fr 1fr 1.3fr 1.3fr" }}>
                  <span style={{ fontWeight: 700, color: "#e2e8f0" }}>{a.agent}</span>
                  <span style={{ color: "#10b981" }}>{fmt(a.monthlyCollected)} ج</span>
                  <span style={{ color: achColor(a.achPct), fontWeight: 700 }}>{pct(a.achPct)}</span>
                  <span style={{ color: "#f59e0b", fontWeight: 700 }}>×{a.targetMult}</span>
                  <span style={{ color: a.pendingComm > 0 ? "#f59e0b" : "#64748b", fontWeight: 700 }}>{fmt(a.pendingComm)} ج</span>
                  <span style={{ color: a.pendingBonus > 0 ? "#a78bfa" : "#64748b", fontWeight: 700 }}>{fmt(a.pendingBonus)} ج</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── DEALS ── */}
      {tab === "deals" && (
        <div style={S.section}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <div style={S.sectionTitle}>كل الصفقات</div>
            <div style={{ display: "flex", gap: 8 }}>
              <select value={filterAgent} onChange={(e) => setFilterAgent(e.target.value)} style={S.select}>
                {agents.map((a) => <option key={a}>{a}</option>)}
              </select>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={S.select}>
                <option value="الكل">كل الأنواع</option>
                {DEAL_TYPES.map((dt) => <option key={dt.key} value={dt.key}>{dt.label}</option>)}
              </select>
            </div>
          </div>
          <div style={S.dealsList}>
            {filtered.map((d) => (
              <div key={d.id} style={S.dealCard(d.paid, d.eligible, d.dealType)}>
                <div style={S.dealTop}>
                  <div>
                    <div style={S.dealName}>{d.project}</div>
                    <div style={S.dealAgent}>
                      👤 {d.agent} · {d.date}
                      <span style={{ background: d.dt.color+"22", color: d.dt.color, border: `1px solid ${d.dt.color}`, borderRadius: 10, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>
                        {d.dt.icon} {d.dt.label}
                      </span>
                      {d.clientCode && <span style={{ background: "#7c3aed22", color: "#a78bfa", border: "1px solid #7c3aed", borderRadius: 10, padding: "1px 8px", fontSize: 11 }}>🌟 {d.clientCode}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {statusBadge(d)}
                    {d.eligible && !d.paid && <button onClick={() => markPaid(d.id)} style={S.payBtn}>صرف الكوميشن</button>}
                  </div>
                </div>
                <div style={S.dealNumbers}>
                  <div style={S.dealNum}>
                    <div style={S.dealNumLabel}>قيمة البيع</div>
                    <div style={S.dealNumVal}>{fmt(d.saleValue)} ج</div>
                  </div>
                  <div style={S.dealNum}>
                    <div style={S.dealNumLabel}>المحصَّل</div>
                    <div style={{ ...S.dealNumVal, color: "#10b981" }}>{fmt(d.collected)} ج</div>
                    <div style={S.dealNumSub}>{d.collectionRate.toFixed(0)}%</div>
                  </div>
                  <div style={S.dealNum}>
                    <div style={S.dealNumLabel}>الأساسي</div>
                    <div style={{ ...S.dealNumVal, color: "#94a3b8" }}>{d.collected >= d.saleValue ? `${fmt(d.base)} ج` : "—"}</div>
                  </div>
                  <div style={S.dealNum}>
                    <div style={S.dealNumLabel}>بعد النوع</div>
                    <div style={{ ...S.dealNumVal, color: "#c084fc" }}>{d.collected >= d.saleValue ? `${fmt(d.afterDealType)} ج` : "—"}</div>
                    <div style={S.dealNumSub}>×{d.dt.multiplier}</div>
                  </div>
                  <div style={S.dealNum}>
                    <div style={S.dealNumLabel}>النهائي</div>
                    <div style={{ ...S.dealNumVal, color: d.eligible ? "#f59e0b" : "#475569", fontSize: 16, fontWeight: 800 }}>
                      {d.collected >= d.saleValue ? `${fmt(d.finalCommission)} ج` : "—"}
                    </div>
                    <div style={{ ...S.dealNumSub, color: achColor(d.achPct) }}>تارجت {pct(d.achPct)} ×{d.targetMult}</div>
                  </div>
                </div>
                <div style={S.progressBar}><div style={S.progressFill(d.collectionRate, d.paid)} /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── BONUSES ── */}
      {tab === "bonuses" && (
        <div style={S.section}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={S.sectionTitle}>🌟 بونص إحضار عملاء جدد</div>
            <button onClick={() => setShowAddBonus(true)} style={{ ...S.addBtn, background: "#7c3aed" }}>+ تسجيل بونص</button>
          </div>

          {/* القاعدة */}
          <div style={{ background: "#2e1065", border: "1px solid #7c3aed44", borderRadius: 12, padding: 14, marginBottom: 16, fontSize: 13, color: "#c4b5fd" }}>
            <b style={{ color: "#a78bfa" }}>قاعدة بونص الإحضار:</b> 10% من التحصيل الكامل · الحد الأدنى للتحصيل {fmt(ACQUISITION_BONUS_THRESHOLD)} ج · مرة واحدة فقط · لا يشترط التارجت · يُصرف بعد التكويد والتسليم للمكتب الفني
          </div>

          {bonusSummary.length === 0 && (
            <div style={{ textAlign: "center", color: "#475569", padding: "30px 0" }}>لا توجد بونصات مسجَّلة بعد</div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {bonusSummary.map((b) => (
              <div key={b.code} style={{ background: b.bonusPaid ? "#0f2a1a" : b.eligible ? "#1e0a3a" : "#0f172a", border: `1px solid ${b.bonusPaid ? "#16a34a44" : b.eligible ? "#7c3aed" : "#334155"}`, borderRadius: 14, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: "#f1f5f9" }}>{b.clientName}</div>
                    <div style={{ color: "#64748b", fontSize: 12, marginTop: 3 }}>
                      👤 {b.agent} · كود: <span style={{ color: "#a78bfa" }}>{b.code}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {b.bonusPaid
                      ? <span style={S.badge("paid")}>✓ مصروف</span>
                      : b.eligible
                        ? <><span style={S.badge("bonus")}>🌟 مستحق</span><button onClick={() => markBonusPaid(b.code)} style={{ ...S.payBtn, background: "#7c3aed" }}>صرف البونص</button></>
                        : <span style={{ ...S.badge("notarget") }}>⚠️ تحت الحد الأدنى</span>
                    }
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, background: "#0f172a", borderRadius: 10, padding: "12px 8px", marginTop: 12, flexWrap: "wrap" }}>
                  <div style={S.dealNum}>
                    <div style={S.dealNumLabel}>التحصيل الإجمالي</div>
                    <div style={{ ...S.dealNumVal, color: "#10b981" }}>{fmt(b.collected)} ج</div>
                  </div>
                  <div style={S.dealNum}>
                    <div style={S.dealNumLabel}>نسبة البونص</div>
                    <div style={{ ...S.dealNumVal, color: "#a78bfa" }}>10%</div>
                  </div>
                  <div style={S.dealNum}>
                    <div style={S.dealNumLabel}>قيمة البونص</div>
                    <div style={{ ...S.dealNumVal, color: b.eligible ? "#a78bfa" : "#475569", fontSize: 20, fontWeight: 800 }}>
                      {b.eligible ? `${fmt(b.bonus)} ج` : "—"}
                    </div>
                    {!b.eligible && <div style={S.dealNumSub}>يحتاج +{fmt(ACQUISITION_BONUS_THRESHOLD - b.collected)} ج</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── AGENTS ── */}
      {tab === "agents" && (
        <div style={S.section}>
          <div style={S.sectionTitle}>تفاصيل المندوبين</div>
          <div style={S.agentGrid}>
            {agentSummary.map((a) => (
              <div key={a.agent} style={S.agentCard}>
                <div style={S.agentAvatar}>{a.agent.charAt(0)}</div>
                <div style={S.agentName}>{a.agent}</div>
                <div style={S.agentDeals}>{a.deals} صفقة</div>
                <div style={{ margin: "10px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                    <span style={{ color: "#94a3b8" }}>التارجت الشهري</span>
                    <span style={{ color: achColor(a.achPct), fontWeight: 700 }}>{pct(a.achPct)}</span>
                  </div>
                  <div style={{ height: 6, background: "#1e293b", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(a.achPct, 100)}%`, background: achColor(a.achPct), borderRadius: 99 }} />
                  </div>
                  <div style={{ fontSize: 10, color: "#64748b", marginTop: 3, textAlign: "center" }}>{fmt(a.monthlyCollected)} / {fmt(a.target)} ج</div>
                  <div style={{ textAlign: "center", marginTop: 6 }}>
                    <span style={{ background: achColor(a.achPct)+"22", color: achColor(a.achPct), border: `1px solid ${achColor(a.achPct)}`, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>معامل التارجت ×{a.targetMult}</span>
                  </div>
                </div>
                <div style={S.agentStats}>
                  <div style={S.agentStat}><span style={{ color: "#94a3b8", fontSize: 11 }}>كوميشن</span><br /><b style={{ color: "#f59e0b" }}>{fmt(a.pendingComm)} ج</b></div>
                  <div style={S.agentStat}><span style={{ color: "#94a3b8", fontSize: 11 }}>بونص إحضار</span><br /><b style={{ color: "#a78bfa" }}>{fmt(a.pendingBonus)} ج</b></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SETTINGS ── */}
      {tab === "tiers" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* تارجت المندوبين */}
          <div style={S.section}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={S.sectionTitle}>🎯 التارجت الشهري</div>
              <button onClick={() => { setEditTargets({...targets}); setShowTargetEditor(true); }} style={S.payBtn}>تعديل</button>
            </div>
            {Object.entries(targets).map(([a, t]) => (
              <div key={a} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#0f172a", borderRadius: 10, marginBottom: 8 }}>
                <span style={{ fontWeight: 700, color: "#e2e8f0" }}>{a}</span>
                <span style={{ color: "#f59e0b", fontWeight: 800 }}>{fmt(t)} ج / شهر</span>
              </div>
            ))}
          </div>
          {/* شرائح التارجت */}
          <div style={S.section}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={S.sectionTitle}>📊 شرائح معامل التارجت</div>
              <button onClick={() => { setEditTargetTiers(targetTiers); setShowTargetTierEd(true); }} style={S.payBtn}>تعديل</button>
            </div>
            {targetTiers.map((t, i) => {
              const colors = ["#ef4444","#f97316","#f59e0b","#10b981"];
              return (
                <div key={t.id} style={{ background: "#0f172a", borderRadius: 12, padding: "12px 16px", marginBottom: 8, borderRight: `4px solid ${colors[i]||"#8b5cf6"}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ color: "#e2e8f0", fontWeight: 700 }}>{t.from}% — {t.to !== null ? `${t.to}%` : "ما فوق"}</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: colors[i]||"#8b5cf6" }}>×{t.commMultiplier}</div>
                </div>
              );
            })}
          </div>
          {/* بونص الإحضار */}
          <div style={S.section}>
            <div style={S.sectionTitle}>🌟 إعدادات بونص الإحضار</div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", background: "#0f172a", borderRadius: 12, marginBottom: 8 }}>
              <span style={{ color: "#c4b5fd" }}>نسبة البونص</span>
              <span style={{ color: "#a78bfa", fontWeight: 800, fontSize: 20 }}>{ACQUISITION_BONUS_RATE * 100}%</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", background: "#0f172a", borderRadius: 12 }}>
              <span style={{ color: "#c4b5fd" }}>الحد الأدنى للتحصيل</span>
              <span style={{ color: "#a78bfa", fontWeight: 800 }}>{fmt(ACQUISITION_BONUS_THRESHOLD)} ج</span>
            </div>
            <div style={{ background: "#2e1065", border: "1px solid #7c3aed44", borderRadius: 10, padding: 12, marginTop: 10, color: "#c4b5fd", fontSize: 12 }}>
              💡 البونص لا يخضع للتارجت · يُصرف مرة واحدة فقط لأول صفقة مع العميل الجديد · بعد التكويد يصبح العميل قديماً
            </div>
          </div>
          {/* شرائح العمولة الأساسية */}
          <div style={S.section}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={S.sectionTitle}>⚙️ شرائح العمولة الأساسية</div>
              <button onClick={() => { setEditTiers(tiers); setShowTierEditor(true); }} style={S.payBtn}>تعديل</button>
            </div>
            {tiers.map((t, i) => (
              <div key={t.id} style={{ background: "#0f172a", borderRadius: 12, padding: "12px 16px", marginBottom: 8, borderRight: `4px solid ${["#3b82f6","#10b981","#f59e0b"][i]||"#8b5cf6"}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ color: "#e2e8f0", fontWeight: 700 }}>{fmt(t.from)} — {t.to !== null ? `${fmt(t.to)} ج` : "ما فوق"}</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: "#f59e0b" }}>{t.rate}%</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MODAL: صفقة جديدة ── */}
      {showAddDeal && (
        <div style={S.overlay} onClick={() => setShowAddDeal(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>➕ إضافة صفقة</div>
            {[["agent","اسم المندوب","text"],["project","اسم المشروع","text"],["saleValue","قيمة البيع (ج)","number"],["collected","المحصَّل (ج)","number"],["date","التاريخ","date"],["clientCode","كود العميل (اختياري)","text"]].map(([k,l,t]) => (
              <div key={k} style={{ marginBottom: 10 }}>
                <label style={S.label}>{l}</label>
                <input type={t} value={newDeal[k]} onChange={(e) => setNewDeal({ ...newDeal, [k]: e.target.value })} style={S.input} placeholder={l} />
              </div>
            ))}
            <div style={{ marginBottom: 14 }}>
              <label style={S.label}>نوع الصفقة</label>
              {DEAL_TYPES.map((dt) => (
                <div key={dt.key} onClick={() => setNewDeal({ ...newDeal, dealType: dt.key })}
                  style={{ background: newDeal.dealType === dt.key ? dt.color+"22" : "#0f172a", border: `2px solid ${newDeal.dealType === dt.key ? dt.color : "#334155"}`, borderRadius: 10, padding: "8px 12px", cursor: "pointer", marginTop: 6 }}>
                  <div style={{ color: newDeal.dealType === dt.key ? dt.color : "#e2e8f0", fontWeight: 700, fontSize: 13 }}>{dt.icon} {dt.label}</div>
                  <div style={{ color: "#64748b", fontSize: 11 }}>{dt.desc}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={addDeal} style={S.addBtn}>حفظ</button>
              <button onClick={() => setShowAddDeal(false)} style={{ ...S.addBtn, background: "#334155" }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: بونص إحضار ── */}
      {showAddBonus && (
        <div style={S.overlay} onClick={() => setShowAddBonus(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>🌟 تسجيل بونص إحضار عميل</div>
            <div style={{ background: "#2e1065", borderRadius: 10, padding: 12, marginBottom: 14, color: "#c4b5fd", fontSize: 12 }}>
              10% من التحصيل الإجمالي · الحد الأدنى {fmt(ACQUISITION_BONUS_THRESHOLD)} ج · مرة واحدة فقط · بدون تارجت
            </div>
            {[["clientCode","كود العميل في النظام","text"],["clientName","اسم العميل","text"],["agent","اسم المندوب","text"],["collected","إجمالي التحصيل (ج)","number"]].map(([k,l,t]) => (
              <div key={k} style={{ marginBottom: 10 }}>
                <label style={S.label}>{l}</label>
                <input type={t} value={newBonus[k]} onChange={(e) => setNewBonus({ ...newBonus, [k]: e.target.value })} style={S.input} placeholder={l} />
              </div>
            ))}
            {newBonus.collected && +newBonus.collected >= ACQUISITION_BONUS_THRESHOLD && (
              <div style={{ background: "#2e1065", borderRadius: 10, padding: 12, marginBottom: 14, color: "#a78bfa", fontWeight: 700, textAlign: "center" }}>
                قيمة البونص = {fmt(+newBonus.collected * ACQUISITION_BONUS_RATE)} ج
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={addBonus} style={{ ...S.addBtn, background: "#7c3aed" }}>تسجيل</button>
              <button onClick={() => setShowAddBonus(false)} style={{ ...S.addBtn, background: "#334155" }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: تارجت ── */}
      {showTargetEditor && (
        <div style={S.overlay} onClick={() => setShowTargetEditor(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>🎯 تعديل التارجت</div>
            {Object.entries(editTargets).map(([a, v]) => (
              <div key={a} style={{ marginBottom: 10 }}>
                <label style={S.label}>{a}</label>
                <input type="number" value={v} onChange={(e) => setEditTargets({ ...editTargets, [a]: +e.target.value })} style={S.input} />
              </div>
            ))}
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button onClick={() => { setTargets(editTargets); setShowTargetEditor(false); }} style={S.addBtn}>حفظ</button>
              <button onClick={() => setShowTargetEditor(false)} style={{ ...S.addBtn, background: "#334155" }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: شرائح التارجت ── */}
      {showTargetTierEd && (
        <div style={S.overlay} onClick={() => setShowTargetTierEd(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>📊 شرائح التارجت</div>
            {editTargetTiers.map((t, i) => (
              <div key={t.id} style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
                <input type="number" value={t.from} onChange={(e) => { const a=[...editTargetTiers]; a[i]={...a[i],from:+e.target.value}; setEditTargetTiers(a); }} style={{ ...S.input, width: 65 }} placeholder="من%" />
                <span style={{ color: "#94a3b8" }}>—</span>
                <input type="number" value={t.to||""} onChange={(e) => { const a=[...editTargetTiers]; a[i]={...a[i],to:e.target.value?+e.target.value:null}; setEditTargetTiers(a); }} style={{ ...S.input, width: 65 }} placeholder="إلى%" />
                <input type="number" step="0.05" value={t.commMultiplier} onChange={(e) => { const a=[...editTargetTiers]; a[i]={...a[i],commMultiplier:+e.target.value}; setEditTargetTiers(a); }} style={{ ...S.input, width: 60 }} />
                <button onClick={() => setEditTargetTiers(editTargetTiers.filter((_,j)=>j!==i))} style={{ background:"#7f1d1d",color:"#fff",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer" }}>✕</button>
              </div>
            ))}
            <button onClick={() => setEditTargetTiers([...editTargetTiers,{id:Date.now(),from:0,to:null,commMultiplier:1}])} style={{ ...S.payBtn, marginBottom: 12 }}>+ شريحة</button>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setTargetTiers(editTargetTiers); setShowTargetTierEd(false); }} style={S.addBtn}>حفظ</button>
              <button onClick={() => setShowTargetTierEd(false)} style={{ ...S.addBtn, background: "#334155" }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: شرائح العمولة ── */}
      {showTierEditor && (
        <div style={S.overlay} onClick={() => setShowTierEditor(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>⚙️ شرائح العمولة</div>
            {editTiers.map((t, i) => (
              <div key={t.id} style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
                <input type="number" value={t.from} onChange={(e) => { const a=[...editTiers]; a[i]={...a[i],from:+e.target.value}; setEditTiers(a); }} style={{ ...S.input, width: 90 }} />
                <span style={{ color:"#94a3b8" }}>—</span>
                <input type="number" value={t.to||""} onChange={(e) => { const a=[...editTiers]; a[i]={...a[i],to:e.target.value?+e.target.value:null}; setEditTiers(a); }} style={{ ...S.input, width: 90 }} placeholder="ما فوق" />
                <input type="number" value={t.rate} onChange={(e) => { const a=[...editTiers]; a[i]={...a[i],rate:+e.target.value}; setEditTiers(a); }} style={{ ...S.input, width: 55 }} />
                <span style={{ color:"#f59e0b" }}>%</span>
                <button onClick={() => setEditTiers(editTiers.filter((_,j)=>j!==i))} style={{ background:"#7f1d1d",color:"#fff",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer" }}>✕</button>
              </div>
            ))}
            <button onClick={() => setEditTiers([...editTiers,{id:Date.now(),from:0,to:null,rate:3}])} style={{ ...S.payBtn, marginBottom:12 }}>+ شريحة</button>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setTiers(editTiers); setShowTierEditor(false); }} style={S.addBtn}>حفظ</button>
              <button onClick={() => setShowTierEditor(false)} style={{ ...S.addBtn, background:"#334155" }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color, icon }) {
  return (
    <div style={{ background:"#1e293b", borderRadius:14, padding:"18px 20px", borderTop:`3px solid ${color}`, flex:1, minWidth:150 }}>
      <div style={{ fontSize:24 }}>{icon}</div>
      <div style={{ color:"#94a3b8", fontSize:12, marginTop:6 }}>{label}</div>
      <div style={{ color, fontSize:20, fontWeight:800, marginTop:4, direction:"ltr", textAlign:"right" }}>{value}</div>
    </div>
  );
}

const S = {
  root:        { background:"#0f172a", minHeight:"100vh", color:"#e2e8f0", fontFamily:"'Cairo','Segoe UI',sans-serif", direction:"rtl", padding:20, maxWidth:980, margin:"0 auto" },
  header:      { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24, paddingBottom:16, borderBottom:"1px solid #1e293b", flexWrap:"wrap", gap:10 },
  headerTitle: { fontSize:24, fontWeight:800, color:"#f1f5f9" },
  headerSub:   { fontSize:11, color:"#64748b", marginTop:2 },
  nav:         { display:"flex", gap:8, marginBottom:24, flexWrap:"wrap" },
  navBtn:      (a) => ({ background:a?"#3b82f6":"#1e293b", color:a?"#fff":"#94a3b8", border:"none", borderRadius:8, padding:"8px 14px", cursor:"pointer", fontFamily:"inherit", fontWeight:600, fontSize:13 }),
  cards:       { display:"flex", gap:14, marginBottom:16, flexWrap:"wrap" },
  section:     { background:"#1e293b", borderRadius:16, padding:20 },
  sectionTitle:{ fontSize:16, fontWeight:700, marginBottom:14, color:"#f1f5f9" },
  table:       { width:"100%" },
  tableHeader: { display:"grid", gap:8, padding:"10px 12px", background:"#0f172a", borderRadius:8, fontSize:11, color:"#64748b", marginBottom:6, fontWeight:700 },
  tableRow:    { display:"grid", gap:8, padding:"10px 12px", borderBottom:"1px solid #0f172a", fontSize:12, color:"#94a3b8" },
  dealsList:   { display:"flex", flexDirection:"column", gap:14 },
  dealCard:    (paid,eligible,type) => ({ background:paid?"#0f2a1a":type==="existing_routine"?"#111827":eligible?"#1a1f0a":"#0f172a", border:`1px solid ${paid?"#16a34a33":type==="existing_routine"?"#334155":eligible?"#d97706":"#1e293b"}`, borderRadius:14, padding:16 }),
  dealTop:     { display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 },
  dealName:    { fontWeight:700, fontSize:16, color:"#f1f5f9" },
  dealAgent:   { color:"#64748b", fontSize:12, marginTop:4, display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" },
  dealNumbers: { display:"flex", gap:8, background:"#0f172a", borderRadius:10, padding:"12px 8px", marginBottom:12, flexWrap:"wrap" },
  dealNum:     { textAlign:"center", flex:1, minWidth:70 },
  dealNumLabel:{ color:"#475569", fontSize:10, marginBottom:3 },
  dealNumVal:  { color:"#e2e8f0", fontSize:13, fontWeight:700 },
  dealNumSub:  { color:"#475569", fontSize:10, marginTop:2 },
  progressBar: { height:5, background:"#0f172a", borderRadius:99, overflow:"hidden" },
  progressFill:(r,p)=>({ height:"100%", width:`${Math.min(r,100)}%`, background:p?"#16a34a":r>=100?"#f59e0b":"#3b82f6", borderRadius:99 }),
  badge:       (t) => ({ padding:"3px 9px", borderRadius:20, fontSize:11, fontWeight:700,
    background: t==="paid"?"#16a34a22":t==="ready"?"#f59e0b22":t==="bonus"?"#7c3aed22":t==="notarget"?"#ef444422":"#3b82f622",
    color:      t==="paid"?"#16a34a"   :t==="ready"?"#f59e0b"   :t==="bonus"?"#a78bfa"   :t==="notarget"?"#ef4444"   :"#3b82f6",
    border:`1px solid ${t==="paid"?"#16a34a":t==="ready"?"#f59e0b":t==="bonus"?"#7c3aed":t==="notarget"?"#ef4444":"#3b82f6"}`,
  }),
  payBtn:      { background:"#d97706", color:"#fff", border:"none", borderRadius:8, padding:"6px 12px", cursor:"pointer", fontFamily:"inherit", fontWeight:700, fontSize:12 },
  addBtn:      { background:"#3b82f6", color:"#fff", border:"none", borderRadius:10, padding:"10px 16px", cursor:"pointer", fontFamily:"inherit", fontWeight:700, fontSize:14 },
  select:      { background:"#0f172a", color:"#e2e8f0", border:"1px solid #334155", borderRadius:8, padding:"6px 12px", fontFamily:"inherit", fontSize:13 },
  agentGrid:   { display:"flex", gap:14, flexWrap:"wrap" },
  agentCard:   { background:"#0f172a", borderRadius:14, padding:20, flex:1, minWidth:200, textAlign:"center" },
  agentAvatar: { width:50, height:50, borderRadius:"50%", background:"linear-gradient(135deg,#3b82f6,#8b5cf6)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, fontWeight:800, margin:"0 auto 10px" },
  agentName:   { fontSize:18, fontWeight:700, color:"#f1f5f9" },
  agentDeals:  { color:"#64748b", fontSize:13, marginBottom:4 },
  agentStats:  { display:"flex", justifyContent:"space-around", marginTop:10 },
  agentStat:   { fontSize:12, textAlign:"center" },
  overlay:     { position:"fixed", inset:0, background:"#00000088", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100, padding:20, overflowY:"auto" },
  modal:       { background:"#1e293b", borderRadius:16, padding:24, width:"90%", maxWidth:440, maxHeight:"90vh", overflowY:"auto" },
  modalTitle:  { fontSize:18, fontWeight:800, marginBottom:18, color:"#f1f5f9" },
  label:       { display:"block", fontSize:12, color:"#94a3b8", marginBottom:4 },
  input:       { background:"#0f172a", border:"1px solid #334155", borderRadius:8, color:"#e2e8f0", padding:"8px 12px", width:"100%", fontFamily:"inherit", fontSize:14, boxSizing:"border-box" },
};
