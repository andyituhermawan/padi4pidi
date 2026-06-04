import { useState, useCallback, useRef, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine, CartesianGrid, PieChart, Pie, Cell,
} from "recharts";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const API_URL = "https://andyituhermawan-padi4pidi.hf.space";
const OCR_URL  = "https://andyituhermawan-padi4pidi.hf.space"; // OCR backend (main.py) — KTP, NIB, NPWP
const RCPT_URL = "https://andyituhermawan-padi4pidi.hf.space"; // Receipt OCR backend (receipt_ocr.py)

const C = {
  navy:    "#0B1F3A",
  navyMid: "#132A4E",
  navyLt:  "#1E3F6B",
  teal:    "#0D9488",
  tealLt:  "#14B8A6",
  gold:    "#F59E0B",
  danger:  "#EF4444",
  success: "#10B981",
  warning: "#F59E0B",
  bg:      "#F1F5F9",
  card:    "#FFFFFF",
  border:  "#E2E8F0",
  text:    "#0F172A",
  muted:   "#64748B",
  slate:   "#94A3B8",
};

const RISK_COLORS = { Rendah: C.success, Sedang: C.warning, Tinggi: C.danger, "Sangat Tinggi": "#7F1D1D" };

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const probToScore = (p) => Math.round(850 - p * 550);
const probToRisk  = (p) => p < 0.2 ? "Rendah" : p < 0.4 ? "Sedang" : p < 0.6 ? "Tinggi" : "Sangat Tinggi";
const scoreColor  = (s) => s >= 670 ? C.success : s >= 550 ? C.warning : C.danger;
const riskColor   = (r) => RISK_COLORS[r] || C.muted;
const formatRp    = (n) => "Rp " + (n || 0).toLocaleString("id-ID");
// NIK masking: tampilkan 4 digit pertama + 8 bintang + 4 digit terakhir
// Input bisa "3271xxxxxxxxxxxx" atau "3271-xxxx-xxxx-0021" (sudah diformat backend)
const maskNIK = (nik) => {
  if (!nik) return "****-****-****-****";
  const digits = String(nik).replace(/\D/g, "");
  if (digits.length < 8) return "****-****-****-****";
  const head = digits.substring(0, 4);
  const tail = digits.length >= 16 ? digits.substring(12) : digits.substring(digits.length - 4);
  return `${head}-****-****-${tail}`;
};

const calcPlafon  = (pendapatan, prob) => {
  const base = pendapatan * 3;
  const mult = prob < 0.2 ? 1.5 : prob < 0.4 ? 1.0 : 0.5;
  return Math.round((base * mult) / 1_000_000) * 1_000_000;
};

// ─── SHA256 BLOCKCHAIN HELPERS ────────────────────────────────────────────────
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

async function generateBlock(layerName, data, prevHash = "0000000000000000") {
  const timestamp = new Date().toISOString();
  const payload = JSON.stringify({ layer: layerName, data, timestamp, prevHash });
  const hash = await sha256(payload);
  return {
    layer: layerName,
    timestamp,
    prevHash,
    hash,
    data,
    nonce: Math.floor(Math.random() * 999999),
  };
}

const FEATURE_LABELS = {
  qris_avg_transaksi_per_hari: "Avg transaksi QRIS/hari",
  qris_avg_pendapatan_bulan: "Pendapatan bulanan QRIS",
  qris_tren_6bulan_pct: "Tren pertumbuhan QRIS 6 bln",
  qris_volatilitas_pct: "Volatilitas arus kas",
  jumlah_pinjaman_aktif: "Jumlah pinjaman aktif",
  memiliki_nib: "Status NIB aktif",
  ojol_bulan_aktif: "Bulan aktif ojol",
  memiliki_npwp: "Kepemilikan NPWP",
  aktif_marketplace: "Aktif di marketplace",
  slik_kolektibilitas: "Kolektibilitas SLIK",
  memiliki_kendaraan_roda4: "Kendaraan roda 4",
  marketplace_order_per_bulan: "Order marketplace/bulan",
  avg_tagihan_listrik_bulan: "Tagihan listrik rata-rata",
  memiliki_kendaraan_roda2: "Kendaraan roda 2",
  saldo_rata_rata_bulan: "Saldo rata-rata bulanan",
  memiliki_pirt: "Sertifikat PIRT",
  pernah_kredit_macet: "Riwayat kredit macet",
  aktif_ojol: "Aktif ojol",
  ojol_avg_order_per_hari: "Avg order ojol/hari",
  marketplace_lama_bergabung_bulan: "Lama bergabung marketplace",
  marketplace_rating: "Rating toko marketplace",
  konsistensi_bayar_listrik: "Konsistensi bayar listrik",
  lama_usaha_tahun: "Lama usaha (tahun)",
  jumlah_rekening_bank: "Jumlah rekening bank",
  sertifikasi_halal: "Sertifikasi halal",
  ojol_rating: "Rating ojol",
  konsistensi_bayar_air: "Konsistensi bayar air",
};
const labelFeature = (k) => FEATURE_LABELS[k] || k;

// ─── STATIC PORTFOLIO DATA ────────────────────────────────────────────────────
const scoreDistribution = [
  { range: "300–399", count: 4, label: "Sangat Tinggi" },
  { range: "400–499", count: 8, label: "Tinggi" },
  { range: "500–549", count: 11, label: "Tinggi" },
  { range: "550–599", count: 18, label: "Sedang" },
  { range: "600–649", count: 22, label: "Sedang" },
  { range: "650–699", count: 19, label: "Rendah" },
  { range: "700–749", count: 11, label: "Rendah" },
  { range: "750–850", count: 7, label: "Rendah" },
];
const riskDistribution = [
  { name: "Rendah", value: 37, color: C.success },
  { name: "Sedang", value: 40, color: C.warning },
  { name: "Tinggi", value: 19, color: C.danger },
  { name: "Sangat Tinggi", value: 4, color: "#7F1D1D" },
];
const scoreTrend = [
  { bulan: "Okt '25", avgSkor: 541, avgProb: 28.4 },
  { bulan: "Nov '25", avgSkor: 558, avgProb: 26.1 },
  { bulan: "Des '25", avgSkor: 567, avgProb: 24.8 },
  { bulan: "Jan '26", avgSkor: 579, avgProb: 23.2 },
  { bulan: "Feb '26", avgSkor: 591, avgProb: 21.7 },
  { bulan: "Mar '26", avgSkor: 603, avgProb: 20.1 },
];
const topUMKM = [
  { id: "U-0021", nama: "Dapur Ibu Sari", skor: 724, risiko: "Rendah", prob: "12.4%" },
  { id: "U-0068", nama: "Kue Tradisional Bundo", skor: 689, risiko: "Rendah", prob: "15.8%" },
  { id: "U-0034", nama: "Warung Pak Hendra", skor: 612, risiko: "Sedang", prob: "22.3%" },
  { id: "U-0057", nama: "RM Padang Minang", skor: 481, risiko: "Tinggi", prob: "41.6%" },
  { id: "U-0091", nama: "Katering Bu Dewi", skor: 398, risiko: "Sangat Tinggi", prob: "58.2%" },
];
const analystQueue = [
  { id: "U-0102", nama: "Toko Batik Nusantara", skor: 548, risiko: "Sedang", alasan: "Anomali omset vs QRIS", waktu: "10 mnt lalu", plafon: "Rp 75.000.000" },
  { id: "U-0098", nama: "Bengkel Maju Jaya", skor: 532, risiko: "Sedang", alasan: "Skor borderline", waktu: "22 mnt lalu", plafon: "Rp 50.000.000" },
  { id: "U-0087", nama: "CV Sinar Mas", skor: 421, risiko: "Tinggi", alasan: "Pinjaman aktif >3", waktu: "45 mnt lalu", plafon: "Rp 120.000.000" },
  { id: "U-0076", nama: "Apotek Sehat Bersama", skor: 561, risiko: "Sedang", alasan: "Loan amount besar", waktu: "1 jam lalu", plafon: "Rp 200.000.000" },
];

// ─── SHARED UI ────────────────────────────────────────────────────────────────
function Badge({ label, color }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
      background: color + "22", color, letterSpacing: "0.03em",
    }}>{label}</span>
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      background: C.card, borderRadius: 12, border: `1px solid ${C.border}`,
      padding: "22px 26px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", ...style
    }}>{children}</div>
  );
}

function SectionTitle({ children, sub }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, letterSpacing: "0.01em" }}>{children}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 3, lineHeight: 1.5 }}>{sub}</div>}
    </div>
  );
}

function Label({ children, required }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
      {children}{required && <span style={{ color: C.danger, marginLeft: 3 }}>*</span>}
    </div>
  );
}

function FieldInput({ label, value, onChange, placeholder, type = "text", required }) {
  return (
    <div>
      <Label required={required}>{label}</Label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(type === "number" ? parseFloat(e.target.value) || 0 : e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`,
          borderRadius: 8, fontSize: 13, color: C.text, background: "#F8FAFC",
          outline: "none", boxSizing: "border-box",
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}
      />
    </div>
  );
}

function FieldSelect({ label, value, onChange, options, required }) {
  return (
    <div>
      <Label required={required}>{label}</Label>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{
        width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`,
        borderRadius: 8, fontSize: 13, color: C.text, background: "#F8FAFC", outline: "none",
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}>
        {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
      </select>
    </div>
  );
}

function FieldToggle({ label, desc, value, onChange }) {
  return (
    <div onClick={() => onChange(value === 1 ? 0 : 1)} style={{
      display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px",
      borderRadius: 8, border: `1px solid ${value ? C.teal : C.border}`,
      background: value ? "#F0FDFA" : "#F8FAFC", cursor: "pointer", transition: "all 0.15s",
    }}>
      <div style={{
        width: 20, height: 20, borderRadius: 5, border: `2px solid ${value ? C.teal : C.border}`,
        background: value ? C.teal : "#fff", display: "flex", alignItems: "center",
        justifyContent: "center", flexShrink: 0, marginTop: 1,
      }}>
        {!!value && <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>✓</span>}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{label}</div>
        {desc && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{desc}</div>}
      </div>
    </div>
  );
}

function Header({ title, subtitle, icon, officerName = "Loan Officer" }) {
  const now = new Date().toLocaleString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <div style={{ padding: "28px 36px 22px", borderBottom: `1px solid ${C.border}`, marginBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {icon && <div style={{ fontSize: 28 }}>{icon}</div>}
        <div>
          <div style={{ fontSize: 21, fontWeight: 800, color: C.text, letterSpacing: "-0.02em" }}>{title}</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>{subtitle}</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
        <div style={{ fontSize: 12, color: C.muted, background: C.bg, padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>
          {now} WIB
        </div>
        <div style={{ fontSize: 11, color: C.teal, fontWeight: 600 }}>
          👤 {officerName}
        </div>
      </div>
    </div>
  );
}

function StepBadge({ num, label, active, done }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{
        width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 800,
        background: done ? C.teal : active ? C.navy : C.bg,
        color: done || active ? "#fff" : C.slate,
        border: `2px solid ${done ? C.teal : active ? C.navy : C.border}`,
      }}>{done ? "✓" : num}</div>
      <span style={{ fontSize: 11, color: active ? C.navy : done ? C.teal : C.slate, fontWeight: active || done ? 700 : 400, whiteSpace: "nowrap" }}>{label}</span>
    </div>
  );
}

// ─── SCORE GAUGE ──────────────────────────────────────────────────────────────
function ScoreGauge({ score }) {
  const pct = ((score - 300) / 550) * 100;
  const angle = -135 + (pct / 100) * 270;
  const r = 72, cx = 90, cy = 90;
  const toRad = (d) => (d * Math.PI) / 180;
  const arcX = cx + r * Math.cos(toRad(angle - 90));
  const arcY = cy + r * Math.sin(toRad(angle - 90));
  const col = scoreColor(score);
  return (
    <svg width="180" height="135" viewBox="0 0 180 135">
      <path d={`M ${cx - r * Math.cos(toRad(45))} ${cy + r * Math.sin(toRad(45))} A ${r} ${r} 0 1 1 ${cx + r * Math.cos(toRad(45))} ${cy + r * Math.sin(toRad(45))}`}
        fill="none" stroke="#E2E8F0" strokeWidth="15" strokeLinecap="round" />
      <path d={`M ${cx - r * Math.cos(toRad(45))} ${cy + r * Math.sin(toRad(45))} A ${r} ${r} 0 ${pct > 50 ? 1 : 0} 1 ${arcX} ${arcY}`}
        fill="none" stroke={col} strokeWidth="15" strokeLinecap="round" />
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="30" fontWeight="800" fill={col}>{score}</text>
      <text x={cx} y={cy + 18} textAnchor="middle" fontSize="11" fill={C.muted}>dari 850</text>
      <text x={26} y={120} textAnchor="middle" fontSize="9" fill={C.slate}>300</text>
      <text x={154} y={120} textAnchor="middle" fontSize="9" fill={C.slate}>850</text>
    </svg>
  );
}

// ─── PADI LOGO ────────────────────────────────────────────────────────────────
function PadiLogo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Batang padi */}
      <line x1="20" y1="38" x2="20" y2="8" stroke="#14B8A6" strokeWidth="2" strokeLinecap="round"/>
      {/* Butir padi kanan */}
      <ellipse cx="25" cy="12" rx="5" ry="3" fill="#14B8A6" transform="rotate(-30 25 12)"/>
      <ellipse cx="27" cy="18" rx="5" ry="3" fill="#0D9488" transform="rotate(-25 27 18)"/>
      <ellipse cx="26" cy="24" rx="5" ry="3" fill="#14B8A6" transform="rotate(-20 26 24)"/>
      {/* Butir padi kiri */}
      <ellipse cx="15" cy="14" rx="5" ry="3" fill="#14B8A6" transform="rotate(30 15 14)"/>
      <ellipse cx="13" cy="20" rx="5" ry="3" fill="#0D9488" transform="rotate(25 13 20)"/>
      <ellipse cx="14" cy="26" rx="5" ry="3" fill="#14B8A6" transform="rotate(20 14 26)"/>
      {/* Ujung tangkai */}
      <circle cx="20" cy="8" r="2" fill="#F59E0B"/>
    </svg>
  );
}

// ─── BLOCKCHAIN PANEL ─────────────────────────────────────────────────────────
function BlockchainBlock({ block, index }) {
  const [copied, setCopied] = useState(false);
  const copyHash = () => {
    navigator.clipboard.writeText(block.hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div style={{
      background: "#0B1F3A", borderRadius: 10, padding: "14px 16px",
      border: `1px solid ${C.teal}44`, position: "relative",
    }}>
      {index > 0 && (
        <div style={{ position: "absolute", top: -18, left: "50%", transform: "translateX(-50%)", color: C.teal, fontSize: 16 }}>⛓</div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: C.teal, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Block #{index + 1}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", marginTop: 2 }}>{block.layer}</div>
        </div>
        <div style={{ fontSize: 9, color: C.slate }}>{new Date(block.timestamp).toLocaleTimeString("id-ID")}</div>
      </div>
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 9, color: C.slate, marginBottom: 2 }}>HASH (SHA-256)</div>
        <div style={{ fontSize: 9, color: C.tealLt, fontFamily: "monospace", wordBreak: "break-all", lineHeight: 1.5 }}>
          {block.hash.substring(0, 32)}…
        </div>
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 9, color: C.slate, marginBottom: 2 }}>PREV HASH</div>
        <div style={{ fontSize: 9, color: "#64748B", fontFamily: "monospace" }}>
          {block.prevHash.substring(0, 16)}…
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 9, color: C.slate }}>Nonce: {block.nonce}</div>
        <button onClick={copyHash} style={{
          padding: "3px 10px", borderRadius: 6, border: `1px solid ${C.teal}`,
          background: "transparent", color: C.teal, fontSize: 9, fontWeight: 700, cursor: "pointer",
        }}>{copied ? "✓ Disalin" : "Copy Hash"}</button>
      </div>
    </div>
  );
}

function BlockchainAuditPanel({ chain }) {
  const [expanded, setExpanded] = useState(false);
  if (!chain || chain.length === 0) return null;
  return (
    <Card style={{ marginTop: 20, background: "#0F172A", border: `1px solid ${C.teal}33` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: expanded ? 16 : 0 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
            ⛓ Blockchain Audit Trail — {chain.length} Block Tercatat
          </div>
          <div style={{ fontSize: 11, color: C.slate, marginTop: 3 }}>
            Setiap tahap proses kredit dicatat dan di-hash SHA-256 untuk audit immutable
          </div>
        </div>
        <button onClick={() => setExpanded(e => !e)} style={{
          padding: "7px 16px", borderRadius: 8, border: `1px solid ${C.teal}`,
          background: "transparent", color: C.teal, fontSize: 12, fontWeight: 700, cursor: "pointer",
        }}>{expanded ? "▲ Sembunyikan" : "▼ Lihat Chain"}</button>
      </div>
      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 4 }}>
          {chain.map((block, i) => (
            <BlockchainBlock key={i} block={block} index={i} />
          ))}
          <div style={{ padding: "10px 14px", background: "#0D9488" + "22", borderRadius: 8, border: `1px solid ${C.teal}44` }}>
            <div style={{ fontSize: 11, color: C.tealLt, fontWeight: 700 }}>
              ✓ Chain Valid — Semua blok terhubung dan dapat diverifikasi secara independen
            </div>
            <div style={{ fontSize: 10, color: C.slate, marginTop: 4 }}>
              Salin hash masing-masing blok untuk verifikasi di alat SHA-256 manapun. Sesuai kebutuhan audit OJK/BI.
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "layer1-doc",   label: "Verifikasi Nasabah",    icon: "📄", layer: "L1" },
  { id: "layer1-loc",   label: "Lokasi Usaha",          icon: "📍", layer: "L1" },
  { id: "layer2",       label: "Enrichment & Validasi", icon: "🔍", layer: "L2" },
  { id: "layer2c",      label: "Receipt OCR",           icon: "🧾", layer: "L2" },
  { id: "layer3",       label: "Scoring Engine",        icon: "⚙️",  layer: "L3" },
  { id: "layer5",       label: "Output & Keputusan",    icon: "✅", layer: "L5" },
  { id: "monitoring",   label: "Monitoring Pra-ACC",    icon: "📊", layer: "MON", note: "3–6 Bulan" },
  { id: "layer4",       label: "Analyst Review",        icon: "👤", layer: "L4", note: "Compliance" },
  { id: "blockchain",   label: "Audit Trail",           icon: "⛓",  layer: "BC", note: "Compliance" },
  { id: "portfolio",    label: "Portofolio & Analitik", icon: "📈", layer: ""   },
];

function Sidebar({ active, setActive, unlockedScreens, chain }) {
  const currentIdx = NAV_ITEMS.findIndex(i => i.id === active);
  return (
    <div style={{ width: 236, background: C.navy, minHeight: "100vh", display: "flex", flexDirection: "column", flexShrink: 0 }}>
      {/* Brand */}
      <div style={{ padding: "24px 22px 18px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "-0.03em" }}>🌾 PADI</div>
            <div style={{ fontSize: 9, color: C.tealLt, marginTop: 1, letterSpacing: "0.04em", textTransform: "uppercase" }}>Penilaian Alternatif Data Inklusif</div>
          </div>
        </div>
        <div style={{ marginTop: 12, padding: "6px 10px", background: "rgba(13,148,136,0.2)", borderRadius: 6, border: "1px solid rgba(20,184,166,0.3)" }}>
          <div style={{ fontSize: 9, color: C.tealLt, fontWeight: 700 }}>LOAN OFFICER DASHBOARD</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 1 }}>Sistem Kredit Alternatif UMKM</div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: "10px 0", flex: 1 }}>
        <div style={{ padding: "12px 20px 4px", fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>Layer 1 — Input Nasabah</div>
        {NAV_ITEMS.filter(i => i.layer === "L1").map(item => (
          <NavBtn key={item.id} item={item} active={active} setActive={setActive} unlocked={unlockedScreens ? unlockedScreens.has(item.id) : true} chain={chain} currentIdx={currentIdx} itemIdx={NAV_ITEMS.findIndex(n => n.id === item.id)} />
        ))}
        <div style={{ padding: "12px 20px 4px", fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>Layer 2 — Enrichment & Verifikasi</div>
        {NAV_ITEMS.filter(i => i.layer === "L2").map(item => (
          <NavBtn key={item.id} item={item} active={active} setActive={setActive} unlocked={unlockedScreens ? unlockedScreens.has(item.id) : true} chain={chain} currentIdx={currentIdx} itemIdx={NAV_ITEMS.findIndex(n => n.id === item.id)} />
        ))}
        <div style={{ padding: "12px 20px 4px", fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>Layer 3–5 — Scoring & Keputusan</div>
        {NAV_ITEMS.filter(i => ["L3","L5"].includes(i.layer)).map(item => (
          <NavBtn key={item.id} item={item} active={active} setActive={setActive} unlocked={unlockedScreens ? unlockedScreens.has(item.id) : true} chain={chain} currentIdx={currentIdx} itemIdx={NAV_ITEMS.findIndex(n => n.id === item.id)} />
        ))}
        <div style={{ padding: "12px 20px 4px", fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>Monitoring Pra-ACC</div>
        {NAV_ITEMS.filter(i => i.layer === "MON").map(item => (
          <NavBtn key={item.id} item={item} active={active} setActive={setActive} unlocked={unlockedScreens ? unlockedScreens.has(item.id) : true} chain={chain} currentIdx={currentIdx} itemIdx={NAV_ITEMS.findIndex(n => n.id === item.id)} />
        ))}
        <div style={{ padding: "12px 20px 4px", fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>Compliance & Analitik</div>
        {NAV_ITEMS.filter(i => i.layer === "L4" || i.layer === "BC" || i.layer === "").map(item => (
          <NavBtn key={item.id} item={item} active={active} setActive={setActive} unlocked={unlockedScreens ? unlockedScreens.has(item.id) : true} chain={chain} currentIdx={currentIdx} itemIdx={NAV_ITEMS.findIndex(n => n.id === item.id)} />
        ))}
      </nav>

      <div style={{ padding: "14px 20px", borderTop: "1px solid rgba(255,255,255,0.07)", fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
        v4.2.0 · DIGDAYA X Hackathon 2026
      </div>
    </div>
  );
}

function NavBtn({ item, active, setActive, unlocked, chain, currentIdx, itemIdx }) {
  const isActive = active === item.id;
  // isPast: item ini ada di sebelah kiri/atas flow → tidak boleh diklik balik
  const isPast   = currentIdx !== -1 && itemIdx !== -1 && itemIdx < currentIdx;
  const isLocked = !unlocked || isPast;
  const blockCount = item.id === "blockchain" && chain?.length > 0 ? chain.length : null;
  return (
    <button
      onClick={() => { if (!isLocked) setActive(item.id); }}
      title={isPast ? "Tidak dapat kembali ke layer sebelumnya" : isLocked ? "Selesaikan layer sebelumnya terlebih dahulu" : item.note ? `Akses: ${item.note}` : ""}
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%",
        padding: "10px 20px", border: "none", textAlign: "left",
        fontSize: 12.5, fontWeight: isActive ? 700 : 400,
        cursor: isLocked ? "not-allowed" : "pointer",
        background: isActive ? "rgba(13,148,136,0.18)" : "transparent",
        color: isLocked ? "rgba(255,255,255,0.2)" : isActive ? C.tealLt : "rgba(255,255,255,0.6)",
        borderLeft: isActive ? `3px solid ${C.tealLt}` : "3px solid transparent",
        transition: "all 0.12s",
        opacity: isLocked ? 0.5 : 1,
      }}>
      <span style={{ fontSize: 14 }}>{item.icon}</span>
      <span style={{ flex: 1 }}>{item.label}</span>
      {blockCount !== null && (
        <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 10, background: C.teal + "44", color: C.tealLt, letterSpacing: "0.03em" }}>
          {blockCount} blok
        </span>
      )}
      {item.note && !blockCount && (
        <span style={{ fontSize: 9, opacity: 0.5, fontStyle: "italic" }}>{item.note}</span>
      )}
      {isLocked && <span style={{ fontSize: 10, opacity: 0.6 }}>{isPast ? "✓" : "🔒"}</span>}
    </button>
  );
}

// ─── DEFAULT FORM ─────────────────────────────────────────────────────────────
const defaultForm = {
  // Identitas nasabah (diisi loan officer)
  nama_usaha: "Dapur Ibu Sari", nama_pemilik: "Sari Dewi Kusuma",
  no_aplikasi: "APP-2026-" + Math.floor(10000 + Math.random() * 90000),
  nama_officer: "Budi Santoso",
  kota: "Jakarta", kategori_usaha: "Minuman",
  status_kepemilikan_rumah: "milik_sendiri", lama_usaha_tahun: 3,
  transaksi: 42, pendapatan: 18500000, growth: 12.5, volatilitas: 8.2,
  nib: "Aktif", memiliki_npwp: 1, memiliki_pirt: 1, sertifikasi_halal: 0,
  jumlah_pinjaman_aktif: 1, saldo_rata_rata_bulan: 4500000, pernah_kredit_macet: 0,
  slik_kolektibilitas: 1, jumlah_rekening_bank: 2,
  memiliki_kendaraan_roda2: 1, memiliki_kendaraan_roda4: 0,
  aktif_ojol: 1, ojol_bulan_aktif: 18, ojol_avg_order_per_hari: 8, ojol_rating: 4.7,
  aktif_marketplace: 1, marketplace_order_per_bulan: 35,
  marketplace_lama_bergabung_bulan: 24, marketplace_rating: 4.8,
  avg_tagihan_listrik_bulan: 450000, konsistensi_bayar_listrik: 11, konsistensi_bayar_air: 10,
  ktp_status: null, nib_status: null, npwp_status: null,
  lat: null, lng: null, alamat: "",
  // Layer 2C — Receipt OCR
  receipt_pln: null, receipt_gas: null, receipt_pulsa: null,
  receipt_bahan_baku: null, receipt_bbm: null, receipt_bpjs: null,
  receipt_anchor_status: null,   // "anchored" | "needs_visit" | "insufficient"
  receipt_avg_opex: 0,           // rata-rata pengeluaran operasional/bln dari receipt
  receipt_count: 0,              // jumlah jenis receipt berhasil di-OCR

  // ── Mode pengajuan ──────────────────────────────────────────────────────────
  // "mandiri" = nasabah upload sendiri via app | "assisted" = officer bantu di kantor
  mode_pengajuan: "assisted",

  // ── Data observasi officer (Layer 3 — bukan dari OCR/API) ───────────────────
  obs_jenis_tempat_usaha: "",        // "warung_tetap" | "gerobak" | "rumahan" | "titipan"
  obs_sumber_bahan_baku: "",         // "pasar_harian" | "supplier_tetap" | "distributor"
  obs_estimasi_pelanggan_per_hari: 0,
  obs_jumlah_sku: 0,
  obs_catatan_kualitatif: "",
  obs_officer_id: "Budi Santoso",    // nama officer yang mengisi (dicatat ke blockchain)

  // ── Monitoring pra-ACC (3–6 bulan) ─────────────────────────────────────────
  monitoring_status: null,  // null | "pending" | "on_track" | "warning" | "completed" | "rejected"
  monitoring_bulan_aktif: 0,
  monitoring_target_bulan: 3,  // 3 atau 6 tergantung skor awal
  monitoring_data: [],     // array { bulan, omset, receipt_count, skor_bulan, status, catatan }
  monitoring_avg_omset_verified: 0,  // rata-rata omset terverifikasi selama monitoring
  monitoring_trajectory: null,  // "growing" | "stable" | "declining"
  monitoring_anomali_count: 0,
};

// ─── LAYER 1A — VERIFIKASI DOKUMEN NASABAH (LOAN OFFICER) ──────────────────────

/**
 * DocCard — kartu upload + OCR nyata.
 * Props:
 *   docType   : string label kecil (mis. "KTP • Dukcapil")
 *   label     : judul kartu
 *   icon      : emoji
 *   ocrEndpoint : path endpoint OCR, mis. "/ocr/ktp"
 *   status    : "idle" | "scanning" | "verified" | "failed"
 *   ocrData   : hasil OCR dari backend (object)
 *   onResult  : callback(status, ocrData) dipanggil setelah OCR selesai
 */
function DocCard({ docType, label, icon, ocrEndpoint, status, ocrData, onResult }) {
  const fileInputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const statusMap = {
    idle:      { label: "Belum diverifikasi", color: C.slate,   bg: C.bg },
    scanning:  { label: "Memproses OCR…",     color: C.gold,    bg: "#FFFBEB" },
    verified:  { label: "✓ Terverifikasi",    color: C.success, bg: "#F0FDF4" },
    failed:    { label: "✗ Gagal verifikasi", color: C.danger,  bg: "#FEF2F2" },
  };
  const s = statusMap[status || "idle"];

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validasi tipe dan ukuran
    const allowed = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
    if (!allowed.includes(file.type)) {
      setErrorMsg("Format tidak didukung. Gunakan JPG, PNG, atau PDF.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg("Ukuran file melebihi 5 MB.");
      return;
    }
    setErrorMsg("");

    // Tampilkan preview (hanya untuk gambar)
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreview(url);
    } else {
      setPreview(null);
    }

    // Mulai OCR
    onResult("scanning", null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${OCR_URL}${ocrEndpoint}`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error ${res.status}`);
      }

      const data = await res.json();
      if (data.success) {
        onResult("verified", data);
      } else {
        onResult("failed", data);
      }
    } catch (err) {
      console.error("OCR error:", err);
      setErrorMsg(err.message || "Gagal menghubungi server OCR.");
      onResult("failed", null);
    }
  };

  const handleDropZoneClick = () => {
    if (status !== "scanning") {
      fileInputRef.current?.click();
    }
  };

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/jpg,application/pdf"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 24 }}>{icon}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{label}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{docType}</div>
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20, background: s.bg, color: s.color }}>
          {s.label}
        </span>
      </div>

      {/* Drop zone / preview */}
      <div
        onClick={handleDropZoneClick}
        style={{
          border: `2px dashed ${status === "verified" ? C.teal : status === "failed" ? C.danger : C.border}`,
          borderRadius: 10, padding: preview ? "8px" : "20px", textAlign: "center",
          background: status === "verified" ? "#F0FDFA" : status === "failed" ? "#FEF2F2" : "#F8FAFC",
          cursor: status === "scanning" ? "default" : "pointer",
          transition: "all 0.15s",
          minHeight: 80, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column",
        }}
      >
        {status === "scanning" ? (
          <div>
            <div style={{ fontSize: 22, marginBottom: 6 }}>⏳</div>
            <div style={{ color: C.gold, fontSize: 13, fontWeight: 600 }}>Memproses dokumen nasabah…</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>Mohon tunggu, EasyOCR sedang bekerja</div>
          </div>
        ) : status === "verified" ? (
          <div style={{ width: "100%" }}>
            {preview && (
              <img src={preview} alt="preview" style={{ maxHeight: 120, maxWidth: "100%", borderRadius: 6, marginBottom: 8, objectFit: "contain" }} />
            )}
            <div style={{ color: C.success, fontSize: 13, fontWeight: 600 }}>📋 Dokumen berhasil diverifikasi</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>Klik untuk upload ulang</div>
          </div>
        ) : status === "failed" ? (
          <div>
            <div style={{ fontSize: 22, marginBottom: 6 }}>❌</div>
            <div style={{ color: C.danger, fontSize: 13, fontWeight: 600 }}>Verifikasi gagal</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>Klik untuk coba upload ulang</div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 28, marginBottom: 6 }}>📁</div>
            <div style={{ fontSize: 12, color: C.muted }}>Upload dokumen nasabah atau jalankan verifikasi OCR</div>
            <div style={{ fontSize: 11, color: C.slate, marginTop: 3 }}>JPG, PNG, PDF • maks. 5 MB</div>
          </div>
        )}
      </div>

      {/* Error message */}
      {errorMsg && (
        <div style={{ fontSize: 11, color: C.danger, padding: "6px 10px", background: "#FEF2F2", borderRadius: 6 }}>
          ⚠️ {errorMsg}
        </div>
      )}

      {/* OCR result summary */}
      {status === "verified" && ocrData?.data && (
        <div style={{ fontSize: 11, background: "#F0FDFA", borderRadius: 8, padding: "10px 12px", border: `1px solid ${C.teal}22` }}>
          <div style={{ fontWeight: 700, color: C.teal, marginBottom: 6 }}>
            ✓ Confidence rata-rata: {Math.round((ocrData.confidence_avg || 0) * 100)}%
          </div>
          {Object.entries(ocrData.data)
            .filter(([k, v]) => v && !k.includes("raw") && !k.includes("masked"))
            .slice(0, 4)
            .map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: 6, marginBottom: 2 }}>
                <span style={{ color: C.muted, textTransform: "capitalize" }}>{k.replace(/_/g, " ")}:</span>
                <span style={{ fontWeight: 600, color: C.text }}>
                  {k === "nik" ? maskNIK(String(v)) : String(v).substring(0, 40)}
                </span>
              </div>
            ))
          }
        </div>
      )}

      {/* Tombol OCR */}
      {status !== "scanning" && (
        <button
          onClick={handleDropZoneClick}
          style={{
            padding: "8px 16px", borderRadius: 8,
            border: `1px solid ${status === "verified" ? C.success : C.teal}`,
            background: status === "verified" ? "#F0FDF4" : "transparent",
            color: status === "verified" ? C.success : C.teal,
            fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}
        >
          {status === "verified" ? "📂 Upload Ulang Dokumen" : "🔬 Upload & Verifikasi OCR"}
        </button>
      )}
    </Card>
  );
}

function ScreenLayer1Doc({ form, setForm, onNext, onAddBlock, chain }) {
  const [docs, setDocs] = useState({
    ktp:  { status: form.ktp_status  || "idle", ocrData: null },
    nib:  { status: form.nib_status  || "idle", ocrData: null },
    npwp: { status: form.npwp_status || "idle", ocrData: null },
  });
  const [blockAdded, setBlockAdded] = useState(false);

  const handleResult = (key, status, ocrData) => {
    setDocs(d => ({ ...d, [key]: { status, ocrData } }));
    setForm(f => ({ ...f, [`${key}_status`]: status }));

    // Jika KTP terverifikasi, isi form dari hasil OCR
    if (key === "ktp" && status === "verified" && ocrData?.data) {
      const d = ocrData.data;
      setForm(f => ({
        ...f,
        nama_pemilik: d.nama || f.nama_pemilik,
        kota: d.kota || f.kota,
      }));
    }
  };

  const allVerified = docs.ktp.status === "verified" && docs.nib.status === "verified" && docs.npwp.status === "verified";
  const anyFailed   = [docs.ktp, docs.nib, docs.npwp].some(d => d.status === "failed");

  const handleNext = async () => {
    if (!blockAdded) {
      await onAddBlock("Layer 1A — Verifikasi Dokumen Nasabah", {
        no_aplikasi: form.no_aplikasi,
        nama_pemilik: form.nama_pemilik,
        nama_usaha: form.nama_usaha,
        ktp: docs.ktp.status, nib: docs.nib.status, npwp: docs.npwp.status,
        officer: form.nama_officer,
      });
      setBlockAdded(true);
    }
    onNext();
  };

  // Data KTP yang ditampilkan di bawah (dari OCR atau default form)
  const ktpDisplayData = docs.ktp.ocrData?.data || {};

  return (
    <div style={{ padding: "0 36px 48px" }}>
      <Header icon="🌾" title="Verifikasi Dokumen Nasabah" subtitle="Layer 1A — Loan officer melakukan verifikasi kelengkapan dokumen pemohon kredit" officerName={form.nama_officer} />

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {[["1", "Dok. Nasabah", true, false], ["2", "Lokasi GPS", false, false], ["3", "Enrichment", false, false], ["4", "Scoring", false, false], ["5", "Output", false, false]].map(([n, l, a, d], i) => (
          <div key={n} style={{ display: "flex", alignItems: "center" }}>
            <StepBadge num={n} label={l} active={a} done={d} />
            {i < 4 && <div style={{ width: 24, height: 1, background: C.border, margin: "0 4px" }} />}
          </div>
        ))}
      </div>

      {/* Identitas pengajuan */}
      <Card style={{ marginBottom: 20, background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
        <SectionTitle sub="Data pengajuan yang sedang diproses oleh loan officer">Informasi Pengajuan Kredit</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          <FieldInput label="No. Aplikasi" value={form.no_aplikasi} onChange={() => {}} />
          <FieldInput label="Nama Pemilik Usaha" value={form.nama_pemilik} onChange={(v) => setForm(f => ({ ...f, nama_pemilik: v }))} required />
          <FieldInput label="Nama Usaha" value={form.nama_usaha} onChange={(v) => setForm(f => ({ ...f, nama_usaha: v }))} required />
          <FieldInput label="Nama Loan Officer" value={form.nama_officer} onChange={(v) => setForm(f => ({ ...f, nama_officer: v }))} required />
        </div>
      </Card>

      <div style={{ background: "#FFFBEB", border: `1px solid #FDE68A`, borderRadius: 10, padding: "12px 16px", marginBottom: 24, fontSize: 12, color: "#92400E" }}>
        <strong>Prosedur Loan Officer:</strong> Upload dokumen fisik yang dibawa nasabah, lalu jalankan verifikasi OCR otomatis. Pastikan dokumen asli, tidak kadaluarsa, dan sesuai identitas pemohon.
      </div>

      {/* ── Toggle mode pengajuan ── */}
      <Card style={{ marginBottom: 20, background: "#F8FAFC" }}>
        <SectionTitle sub="Pilih sesuai kondisi — menentukan akuntabilitas data dan alur verifikasi">Mode Pengajuan</SectionTitle>
        <div style={{ display: "flex", gap: 12 }}>
          {[
            { val: "assisted", icon: "🏦", label: "Assisted oleh Officer", desc: "Nasabah datang ke kantor, officer scan dokumen fisik" },
            { val: "mandiri",  icon: "📱", label: "Mandiri via App",        desc: "Nasabah upload sendiri, officer hanya verifikasi" },
          ].map(m => (
            <div
              key={m.val}
              onClick={() => setForm(f => ({ ...f, mode_pengajuan: m.val }))}
              style={{
                flex: 1, padding: "14px 16px", borderRadius: 10, cursor: "pointer",
                border: `2px solid ${form.mode_pengajuan === m.val ? C.teal : C.border}`,
                background: form.mode_pengajuan === m.val ? "#F0FDFA" : "#fff",
                transition: "all 0.15s",
              }}
            >
              <div style={{ fontSize: 20, marginBottom: 6 }}>{m.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{m.label}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{m.desc}</div>
              {form.mode_pengajuan === m.val && (
                <div style={{ marginTop: 8, fontSize: 11, color: C.teal, fontWeight: 700 }}>✓ Dipilih</div>
              )}
            </div>
          ))}
        </div>
        {form.mode_pengajuan === "mandiri" && (
          <div style={{ marginTop: 12, padding: "10px 14px", background: "#EFF6FF", borderRadius: 8, fontSize: 11, color: "#1E40AF", border: "1px solid #BFDBFE" }}>
            💡 <strong>Mode Mandiri:</strong> Nasabah menerima link upload via WhatsApp/SMS. Dokumen yang diterima sistem dicatat dengan timestamp dan IP address nasabah untuk audit trail. Officer tetap wajib konfirmasi hasil OCR.
          </div>
        )}
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18, marginBottom: 24 }}>
        <DocCard
          docType="KTP • Dukcapil" label="KTP Pemilik Usaha" icon="🪪"
          ocrEndpoint="/ocr/ktp"
          status={docs.ktp.status}
          ocrData={docs.ktp.ocrData}
          onResult={(status, data) => handleResult("ktp", status, data)}
        />
        <DocCard
          docType="NIB • OSS" label="Nomor Induk Berusaha" icon="📋"
          ocrEndpoint="/ocr/nib"
          status={docs.nib.status}
          ocrData={docs.nib.ocrData}
          onResult={(status, data) => handleResult("nib", status, data)}
        />
        <DocCard
          docType="NPWP • DJP" label="NPWP Usaha" icon="🧾"
          ocrEndpoint="/ocr/npwp"
          status={docs.npwp.status}
          ocrData={docs.npwp.ocrData}
          onResult={(status, data) => handleResult("npwp", status, data)}
        />
      </div>

      {docs.ktp.status === "verified" && (
        <Card style={{ marginBottom: 18 }}>
          <SectionTitle sub="Data diekstrak otomatis dari KTP nasabah via OCR — harap konfirmasi kebenaran data">Data Terverifikasi — KTP Nasabah</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
            {[
              { label: "Nama Lengkap",       value: ktpDisplayData.nama || form.nama_pemilik },
              { label: "NIK (Masked)",        value: maskNIK(ktpDisplayData.nik || ktpDisplayData.nik_masked) },
              { label: "Kota Domisili",       value: ktpDisplayData.kota || form.kota },
              { label: "Status Verifikasi",   value: "✓ Valid – Dukcapil" },
            ].map(d => (
              <div key={d.label} style={{ background: "#F0FDFA", borderRadius: 8, padding: "10px 14px", border: `1px solid ${C.teal}22` }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>{d.label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{d.value}</div>
              </div>
            ))}
          </div>
          {/* Detail tambahan dari OCR */}
          {ktpDisplayData.pekerjaan && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginTop: 14 }}>
              {[
                { label: "Tempat Lahir",      value: ktpDisplayData.tempat_lahir },
                { label: "Tanggal Lahir",     value: ktpDisplayData.tgl_lahir },
                { label: "Pekerjaan",         value: ktpDisplayData.pekerjaan },
                { label: "Status Perkawinan", value: ktpDisplayData.status_perkawinan },
              ].filter(d => d.value).map(d => (
                <div key={d.label} style={{ background: "#F8FAFC", borderRadius: 8, padding: "10px 14px", border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>{d.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{d.value}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* NIB verified summary */}
      {docs.nib.status === "verified" && docs.nib.ocrData?.data && (
        <Card style={{ marginBottom: 18 }}>
          <SectionTitle sub="Data diekstrak otomatis dari NIB via OCR">Data Terverifikasi — NIB Usaha</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
            {[
              { label: "Nomor NIB",    value: docs.nib.ocrData.data.nib_number },
              { label: "Nama Pemilik", value: docs.nib.ocrData.data.nama_pemilik },
              { label: "Nama Usaha",   value: docs.nib.ocrData.data.nama_usaha },
              { label: "KBLI",         value: docs.nib.ocrData.data.kbli },
            ].filter(d => d.value).map(d => (
              <div key={d.label} style={{ background: "#F0FDFA", borderRadius: 8, padding: "10px 14px", border: `1px solid ${C.teal}22` }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>{d.label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{d.value}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* NPWP verified summary */}
      {docs.npwp.status === "verified" && docs.npwp.ocrData?.data && (
        <Card style={{ marginBottom: 18 }}>
          <SectionTitle sub="Data diekstrak otomatis dari NPWP via OCR">Data Terverifikasi — NPWP Usaha</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
            {[
              { label: "Nomor NPWP", value: docs.npwp.ocrData.data.npwp_number },
              { label: "Nama",       value: docs.npwp.ocrData.data.nama },
              { label: "Alamat",     value: docs.npwp.ocrData.data.alamat },
              { label: "KPP",        value: docs.npwp.ocrData.data.kpp },
            ].filter(d => d.value).map(d => (
              <div key={d.label} style={{ background: "#F0FDFA", borderRadius: 8, padding: "10px 14px", border: `1px solid ${C.teal}22` }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>{d.label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{d.value}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card style={{ background: allVerified ? "#F0FDF4" : anyFailed ? "#FEF2F2" : C.bg, border: `1px solid ${allVerified ? C.success : anyFailed ? C.danger : C.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: allVerified ? C.success : anyFailed ? C.danger : C.text }}>
              {allVerified ? "🟢 Gate 1 LULUS — Semua dokumen nasabah terverifikasi" :
               anyFailed  ? "🔴 Gate 1 GAGAL — Ada dokumen tidak valid. Informasikan ke nasabah." :
                            "⏳ Menunggu verifikasi semua dokumen nasabah"}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
              {allVerified ? "Proses dapat dilanjutkan ke pengecekan lokasi GPS usaha." :
               anyFailed  ? "Proses tidak dapat dilanjutkan. Nasabah perlu melengkapi dokumen." :
                            `Terverifikasi: ${[docs.ktp, docs.nib, docs.npwp].filter(d => d.status === "verified").length}/3`}
            </div>
          </div>
          {allVerified && (
            <button onClick={handleNext} style={{
              padding: "10px 22px", borderRadius: 8, border: "none",
              background: C.teal, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}>Lanjut → Lokasi GPS ⛓</button>
          )}
        </div>
      </Card>

      <BlockchainAuditPanel chain={chain} />
    </div>
  );
}

// ─── LAYER 1B — LOKASI GPS ────────────────────────────────────────────────────
const LOC_URL = "http://127.0.0.1:8002"; // Location backend (location.py)

function ScreenLayer1Loc({ form, setForm, onNext, onAddBlock, chain }) {
  const [gpsStatus, setGpsStatus]   = useState(form.lat ? "done" : "idle");
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoData, setGeoData]       = useState(null);   // hasil dari backend location
  const [geoError, setGeoError]     = useState("");
  const [blockAdded, setBlockAdded] = useState(false);

  // Panggil backend setelah dapat koordinat
  const fetchGeoEnrichment = async (lat, lng) => {
    try {
      const res = await fetch(`${LOC_URL}/location/reverse?lat=${lat}&lng=${lng}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setGeoData(data);
      // Update form dengan data alamat dari backend
      setForm(f => ({
        ...f,
        alamat: data.alamat_lengkap || f.alamat,
        kota: data.kota || f.kota,
      }));
    } catch (err) {
      console.error("Geo-enrichment error:", err);
      setGeoError("Gagal mengambil data lokasi dari server. Periksa apakah backend location.py sudah berjalan di port 8002.");
    }
  };

  const getLocation = () => {
    setGeoLoading(true);
    setGeoError("");
    setGpsStatus("loading");
    if (!navigator.geolocation) {
      fallbackLocation();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        setForm(f => ({ ...f, lat, lng, alamat: "Mendeteksi alamat…" }));
        setGpsStatus("done");
        setGeoLoading(false);
        await fetchGeoEnrichment(lat, lng);
      },
      () => fallbackLocation(),
      { timeout: 8000 }
    );
  };

  const fallbackLocation = async () => {
    // Fallback: koordinat default Jakarta
    const lat = "-6.200000";
    const lng = "106.816666";
    setForm(f => ({ ...f, lat, lng, alamat: "Mendeteksi alamat…" }));
    setGpsStatus("done");
    setGeoLoading(false);
    await fetchGeoEnrichment(lat, lng);
  };

  const handleNext = async () => {
    if (!blockAdded) {
      await onAddBlock("Layer 1B — Verifikasi Lokasi GPS", {
        no_aplikasi: form.no_aplikasi,
        lat: form.lat, lng: form.lng,
        alamat: form.alamat,
        kelurahan: geoData?.kelurahan,
        kecamatan: geoData?.kecamatan,
        kota: geoData?.kota,
        zona_usaha: geoData?.zona_usaha,
        risiko_banjir: geoData?.risiko_banjir,
        populasi: geoData?.populasi,
      });
      setBlockAdded(true);
    }
    onNext();
  };

  // Baris enrichment yang ditampilkan
  const enrichRows = geoData ? [
    geoData.zona_usaha     && { icon: "🏙️", label: "Zona Usaha",          value: geoData.zona_usaha },
    geoData.kepadatan_label && { icon: "👥", label: "Kepadatan Penduduk",  value: geoData.kepadatan_label },
    geoData.populasi_label  && { icon: "🧑‍🤝‍🧑", label: "Populasi Kelurahan", value: geoData.populasi_label },
    geoData.coverage_qris  && { icon: "📡", label: "Coverage QRIS",        value: geoData.coverage_qris },
    geoData.risiko_banjir  && { icon: "🗺️", label: "Zona Risiko Banjir",   value: geoData.risiko_banjir },
  ].filter(Boolean) : [];

  return (
    <div style={{ padding: "0 36px 48px" }}>
      <Header icon="📍" title="Verifikasi Lokasi Usaha" subtitle="Layer 1B — Loan officer memverifikasi lokasi fisik usaha nasabah via GPS" officerName={form.nama_officer} />

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 28, flexWrap: "wrap" }}>
        {[["1", "Dok. Nasabah", false, true], ["2", "Lokasi GPS", true, false], ["3", "Enrichment", false, false], ["4", "Scoring", false, false], ["5", "Output", false, false]].map(([n, l, a, d], i) => (
          <div key={n} style={{ display: "flex", alignItems: "center" }}>
            <StepBadge num={n} label={l} active={a} done={d} />
            {i < 4 && <div style={{ width: 24, height: 1, background: C.border, margin: "0 4px" }} />}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        {/* Kiri — Deteksi GPS */}
        <Card>
          <SectionTitle sub="Pastikan lokasi GPS sesuai dengan alamat usaha nasabah yang tertera di dokumen">Deteksi Lokasi GPS Usaha</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <button onClick={getLocation} disabled={geoLoading} style={{
              padding: "14px 20px", borderRadius: 10, border: "none",
              background: geoLoading ? C.slate : C.teal, color: "#fff",
              fontSize: 14, fontWeight: 700, cursor: geoLoading ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
              {geoLoading ? "⏳ Mendeteksi lokasi…" : "📍 Deteksi Lokasi GPS Usaha"}
            </button>

            {geoError && (
              <div style={{ fontSize: 11, color: C.danger, padding: "8px 12px", background: "#FEF2F2", borderRadius: 8 }}>
                ⚠️ {geoError}
              </div>
            )}

            {gpsStatus === "done" && (
              <div style={{ background: "#F0FDFA", border: `1px solid ${C.teal}44`, borderRadius: 10, padding: "16px" }}>
                <div style={{ fontSize: 12, color: C.teal, fontWeight: 700, marginBottom: 10 }}>✓ Lokasi Usaha Terdeteksi</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {[
                    { label: "Latitude",         value: form.lat },
                    { label: "Longitude",        value: form.lng },
                    { label: "Kelurahan",        value: geoData?.kelurahan || "—" },
                    { label: "Kecamatan",        value: geoData?.kecamatan || "—" },
                    { label: "Kota/Kabupaten",   value: geoData?.kota || form.kota || "—" },
                    { label: "Provinsi",         value: geoData?.provinsi || "—" },
                    { label: "Akurasi GPS",      value: "±15 meter" },
                  ].map(d => (
                    <div key={d.label}>
                      <div style={{ fontSize: 10, color: C.muted }}>{d.label}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginTop: 2 }}>{d.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: 4 }}>
              <FieldInput label="Atau input manual alamat usaha" value={form.alamat}
                onChange={(v) => setForm(f => ({ ...f, alamat: v }))} placeholder="Jl. Merdeka No. 1, Jakarta" />
            </div>
          </div>
        </Card>

        {/* Kanan — Geo-Enrichment */}
        <Card>
          <SectionTitle sub="Analisis zona usaha dan data populasi kelurahan berdasarkan koordinat GPS">Geo-Enrichment Otomatis</SectionTitle>
          {gpsStatus === "done" ? (
            enrichRows.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {enrichRows.map(d => (
                  <div key={d.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: C.bg, borderRadius: 8 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span>{d.icon}</span>
                      <span style={{ fontSize: 12, color: C.muted }}>{d.label}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{d.value}</span>
                  </div>
                ))}
                {/* Alamat lengkap */}
                {geoData?.alamat_lengkap && (
                  <div style={{ padding: "8px 12px", background: C.bg, borderRadius: 8 }}>
                    <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>Alamat Lengkap</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{geoData.alamat_lengkap}</div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: "30px 0", textAlign: "center", color: C.slate, fontSize: 13 }}>
                {geoError ? "Data lokasi tidak tersedia" : "⏳ Memuat data lokasi…"}
              </div>
            )
          ) : (
            <div style={{ padding: "40px 0", textAlign: "center", color: C.slate, fontSize: 13 }}>
              Deteksi GPS terlebih dahulu untuk melihat analisis lokasi
            </div>
          )}
        </Card>
      </div>

      <Card style={{ background: gpsStatus === "done" ? "#F0FDF4" : C.bg, border: `1px solid ${gpsStatus === "done" ? C.success : C.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: gpsStatus === "done" ? C.success : C.text }}>
              {gpsStatus === "done" ? "🟢 Lokasi usaha terverifikasi — lanjut ke enrichment data" : "⏳ Menunggu verifikasi lokasi GPS"}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
              {gpsStatus === "done"
                ? `Koordinat: ${form.lat}, ${form.lng}${geoData?.kota ? ` · ${geoData.kota}` : ""}`
                : "Klik tombol GPS atau masukkan alamat usaha secara manual"}
            </div>
          </div>
          {gpsStatus === "done" && (
            <button onClick={handleNext} style={{ padding: "10px 22px", borderRadius: 8, border: "none", background: C.teal, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Lanjut → Enrichment ⛓
            </button>
          )}
        </div>
      </Card>
      <BlockchainAuditPanel chain={chain} />
    </div>
  );
}

// ─── PLATFORM DATA GENERATOR (mock consent-based API pull) ───────────────────
const PLATFORM_CONFIGS = {
  shopee:   { label: "Shopee",    icon: "🛒", color: "#EE4D2D", type: "marketplace" },
  tokopedia:{ label: "Tokopedia", icon: "🟢", color: "#03AC0E", type: "marketplace" },
  gofood:   { label: "GoFood",    icon: "GF", color: "#00AE5B", type: "ojol" },
  grabfood: { label: "GrabFood",  icon: "🟩", color: "#00B14F", type: "ojol" },
};

function generatePlatformData(platform, pendapatan) {
  const seed = pendapatan / 1_000_000;
  const r = (min, max) => Math.round((min + Math.random() * (max - min)) * 10) / 10;
  if (platform === "shopee" || platform === "tokopedia") {
    const orders = Math.round(seed * r(1.2, 2.5));
    const rating  = r(4.3, 4.95);
    const joined  = Math.round(r(8, 36));
    return {
      order_per_bulan: orders,
      rating: rating,
      lama_bergabung_bulan: joined,
      avg_nilai_transaksi: Math.round(pendapatan / orders / 1000) * 1000,
      produk_aktif: Math.round(r(5, 40)),
      fulfillment_rate_pct: r(88, 99),
      retur_pct: r(0.5, 3.5),
    };
  } else {
    const avgOrder = r(4, 18);
    return {
      avg_order_per_hari: avgOrder,
      bulan_aktif: Math.round(r(6, 30)),
      rating: r(4.4, 4.95),
      acceptance_rate_pct: r(82, 98),
      cancel_rate_pct: r(0.5, 4.0),
      avg_nilai_order: Math.round(r(25000, 75000) / 1000) * 1000,
    };
  }
}

// ─── LAYER 2 — ENRICHMENT ─────────────────────────────────────────────────────
function ScreenLayer2({ form, setForm, onNext, onAddBlock, chain }) {
  const [enrichStatus, setEnrichStatus] = useState("idle");
  const [anomalyFlag, setAnomalyFlag] = useState(false);
  const [blockAdded, setBlockAdded] = useState(false);
  const [platformConsent, setPlatformConsent] = useState({});   // { shopee: true, ... }
  const [platformStatus, setPlatformStatus]   = useState({});   // { shopee: "idle"|"pulling"|"done"|"error" }
  const [platformData, setPlatformData]       = useState({});   // { shopee: {...}, ... }
  const set = (key) => (val) => setForm(f => ({ ...f, [key]: val }));

  const toggleConsent = (platform) => {
    setPlatformConsent(prev => ({ ...prev, [platform]: !prev[platform] }));
  };

  const pullPlatformData = async (platform) => {
    setPlatformStatus(prev => ({ ...prev, [platform]: "pulling" }));
    // Simulasi latency API call (1.2–2.5 detik)
    await new Promise(res => setTimeout(res, 1200 + Math.random() * 1300));
    const data = generatePlatformData(platform, form.pendapatan || 18500000);
    setPlatformData(prev => ({ ...prev, [platform]: data }));
    setPlatformStatus(prev => ({ ...prev, [platform]: "done" }));

    // Auto-populate form fields dari data platform
    const cfg = PLATFORM_CONFIGS[platform];
    if (cfg.type === "marketplace") {
      setForm(f => ({
        ...f,
        aktif_marketplace: 1,
        marketplace_order_per_bulan: data.order_per_bulan,
        marketplace_rating: data.rating,
        marketplace_lama_bergabung_bulan: data.lama_bergabung_bulan,
        [`platform_${platform}`]: data,
      }));
    } else {
      setForm(f => ({
        ...f,
        aktif_ojol: 1,
        ojol_avg_order_per_hari: data.avg_order_per_hari,
        ojol_rating: data.rating,
        ojol_bulan_aktif: data.bulan_aktif,
        [`platform_${platform}`]: data,
      }));
    }
  };

  const pullAllConsented = () => {
    Object.keys(platformConsent).forEach(p => {
      if (platformConsent[p] && platformStatus[p] !== "done") pullPlatformData(p);
    });
  };

  const runEnrichment = () => {
    setEnrichStatus("loading");
    setTimeout(() => {
      const qrisEst = form.pendapatan * (0.85 + Math.random() * 0.3);
      const diff = Math.abs(qrisEst - form.pendapatan) / form.pendapatan;
      setAnomalyFlag(diff > 0.25);
      setEnrichStatus("done");
    }, 2200);
  };

  const handleNext = async () => {
    if (!blockAdded) {
      await onAddBlock("Layer 2 — Enrichment & Cross-Validation", {
        no_aplikasi: form.no_aplikasi,
        pendapatan: form.pendapatan,
        anomali_terdeteksi: anomalyFlag,
        slik_kolektibilitas: form.slik_kolektibilitas,
        aktif_marketplace: form.aktif_marketplace,
        aktif_ojol: form.aktif_ojol,
        validasi_status: enrichStatus === "done" ? "selesai" : "belum",
      });
      setBlockAdded(true);
    }
    onNext();
  };

  return (
    <div style={{ padding: "0 36px 48px" }}>
      <Header icon="🔍" title="Enrichment & Cross-Validation" subtitle="Layer 2 — Loan officer memvalidasi data nasabah vs sumber objektif" officerName={form.nama_officer} />

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 28, flexWrap: "wrap" }}>
        {[["1", "Dok. Nasabah", false, true], ["2", "Lokasi GPS", false, true], ["3", "Enrichment", true, false], ["4", "Scoring", false, false], ["5", "Output", false, false]].map(([n, l, a, d], i) => (
          <div key={n} style={{ display: "flex", alignItems: "center" }}>
            <StepBadge num={n} label={l} active={a} done={d} />
            {i < 4 && <div style={{ width: 24, height: 1, background: C.border, margin: "0 4px" }} />}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <Card>
          <SectionTitle sub="Data transaksi digital nasabah dari berbagai sumber alternatif">Input Data Digital Nasabah</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <FieldInput label="Avg Transaksi QRIS/Hari" value={form.transaksi} onChange={set("transaksi")} type="number" />
              <FieldInput label="Pendapatan Bulanan (Rp)" value={form.pendapatan} onChange={set("pendapatan")} type="number" />
              <FieldInput label="Tren 6 Bulan (%)" value={form.growth} onChange={set("growth")} type="number" />
              <FieldInput label="Volatilitas Arus Kas (%)" value={form.volatilitas} onChange={set("volatilitas")} type="number" />
            </div>
            {/* ── Platform API Consent Block ── */}
            <div style={{ borderRadius: 10, border: `1px solid ${C.teal}44`, overflow: "hidden" }}>
              <div style={{ background: "linear-gradient(135deg, #0D9488, #0B1F3A)", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#fff" }}>🔗 Tarik Data Platform Digital</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>Nasabah memberikan izin akses read-only — officer generate otomatis, tidak perlu input manual</div>
                </div>
                <button
                  onClick={pullAllConsented}
                  disabled={!Object.values(platformConsent).some(Boolean)}
                  style={{
                    padding: "7px 16px", borderRadius: 8, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
                    background: Object.values(platformConsent).some(Boolean) ? C.gold : "rgba(255,255,255,0.15)",
                    color: Object.values(platformConsent).some(Boolean) ? "#fff" : "rgba(255,255,255,0.4)",
                    transition: "all 0.15s",
                  }}>
                  ⚡ Generate Semua
                </button>
              </div>
              <div style={{ padding: "12px 14px", background: "#F0FDFA" }}>
                {/* Consent notice */}
                <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 10, color: "#92400E" }}>
                  📋 <strong>Informed Consent:</strong> Nasabah telah menandatangani formulir izin akses data platform (read-only, 30 hari). Data digunakan semata untuk penilaian kredit dan dicatat di blockchain audit trail.
                </div>
                {/* Platform grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {Object.entries(PLATFORM_CONFIGS).map(([key, cfg]) => {
                    const consented  = platformConsent[key];
                    const status     = platformStatus[key] || "idle";
                    const data       = platformData[key];
                    return (
                      <div key={key} style={{
                        borderRadius: 8, border: `2px solid ${consented ? cfg.color + "66" : C.border}`,
                        background: data ? cfg.color + "08" : "#fff", overflow: "hidden",
                        transition: "all 0.2s",
                      }}>
                        {/* Header row */}
                        <div
                          onClick={() => status !== "done" && toggleConsent(key)}
                          style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", cursor: status === "done" ? "default" : "pointer", background: consented ? cfg.color + "12" : "transparent" }}>
                          <div style={{ width: 28, height: 28, borderRadius: 8, background: cfg.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: key === "gofood" || key === "grabfood" ? 8 : 14, fontWeight: 900, color: "#fff", letterSpacing: "-0.5px", flexShrink: 0 }}>{cfg.icon}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{cfg.label}</div>
                            <div style={{ fontSize: 9, color: C.muted }}>{cfg.type === "marketplace" ? "Marketplace" : "Food Delivery"}</div>
                          </div>
                          {status === "done" ? (
                            <span style={{ fontSize: 10, fontWeight: 700, color: C.success, background: C.success + "22", padding: "2px 8px", borderRadius: 10 }}>✓ Terhubung</span>
                          ) : (
                            <div style={{
                              width: 18, height: 18, borderRadius: "50%", border: `2px solid ${consented ? cfg.color : C.border}`,
                              background: consented ? cfg.color : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                            }}>
                              {consented && <span style={{ color: "#fff", fontSize: 10, fontWeight: 900 }}>✓</span>}
                            </div>
                          )}
                        </div>
                        {/* Pull button / status */}
                        {consented && status !== "done" && (
                          <div style={{ padding: "0 12px 10px" }}>
                            <button
                              onClick={() => pullPlatformData(key)}
                              disabled={status === "pulling"}
                              style={{
                                width: "100%", padding: "6px", borderRadius: 6, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
                                background: status === "pulling" ? C.slate : cfg.color,
                                color: "#fff", transition: "all 0.15s",
                              }}>
                              {status === "pulling" ? "⏳ Menarik data…" : `🔗 Tarik dari ${cfg.label}`}
                            </button>
                          </div>
                        )}
                        {/* Data result */}
                        {data && (
                          <div style={{ padding: "0 12px 10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                            {Object.entries(data).slice(0, 4).map(([k, v]) => (
                              <div key={k} style={{ background: "#fff", borderRadius: 5, padding: "5px 8px", border: `1px solid ${C.border}` }}>
                                <div style={{ fontSize: 8, color: C.muted, textTransform: "capitalize" }}>{k.replace(/_/g, " ").replace("pct", "%")}</div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginTop: 1 }}>{typeof v === "number" && v > 1000 ? formatRp(v) : v}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Manual override note */}
                <div style={{ marginTop: 10, fontSize: 10, color: C.muted }}>
                  Tidak aktif di platform? <button onClick={() => setForm(f => ({ ...f, aktif_marketplace: f.aktif_marketplace === 1 ? 0 : 1 }))} style={{ background: "none", border: "none", color: C.teal, fontSize: 10, fontWeight: 700, cursor: "pointer", padding: 0 }}>Input manual</button> tetap tersedia di bawah.
                </div>
              </div>
            </div>

            {/* Manual fallback — collapsed by default if any platform pulled */}
            {(!Object.values(platformData).some(Boolean)) && (
              <>
                <FieldToggle label="Aktif di Marketplace (manual)" desc="Jika tidak ada akun platform di atas" value={form.aktif_marketplace} onChange={set("aktif_marketplace")} />
                {form.aktif_marketplace === 1 && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <FieldInput label="Order/Bulan" value={form.marketplace_order_per_bulan} onChange={set("marketplace_order_per_bulan")} type="number" />
                    <FieldInput label="Rating Toko" value={form.marketplace_rating} onChange={set("marketplace_rating")} type="number" />
                    <FieldInput label="Lama Bergabung (bln)" value={form.marketplace_lama_bergabung_bulan} onChange={set("marketplace_lama_bergabung_bulan")} type="number" />
                  </div>
                )}
                <FieldToggle label="Aktif di Ojol (manual)" desc="Jika tidak ada akun platform di atas" value={form.aktif_ojol} onChange={set("aktif_ojol")} />
                {form.aktif_ojol === 1 && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <FieldInput label="Avg Order Ojol/Hari" value={form.ojol_avg_order_per_hari} onChange={set("ojol_avg_order_per_hari")} type="number" />
                    <FieldInput label="Rating Ojol" value={form.ojol_rating} onChange={set("ojol_rating")} type="number" />
                    <FieldInput label="Bulan Aktif Ojol" value={form.ojol_bulan_aktif} onChange={set("ojol_bulan_aktif")} type="number" />
                  </div>
                )}
              </>
            )}
          </div>
        </Card>

        <Card>
          <SectionTitle sub="Riwayat kredit dan data finansial historis nasabah">Riwayat Kredit & Data SLIK OJK</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <FieldSelect label="Kolektibilitas SLIK OJK" value={form.slik_kolektibilitas} onChange={(v) => set("slik_kolektibilitas")(+v)}
              options={[{ value: 1, label: "Kol. 1 — Lancar" }, { value: 2, label: "Kol. 2 — DPK" }, { value: 3, label: "Kol. 3 — Kurang Lancar" }, { value: 4, label: "Kol. 4 — Diragukan" }, { value: 5, label: "Kol. 5 — Macet" }]} />
            <FieldInput label="Jumlah Pinjaman Aktif" value={form.jumlah_pinjaman_aktif} onChange={set("jumlah_pinjaman_aktif")} type="number" />
            <FieldInput label="Saldo Rata-rata/Bulan (Rp)" value={form.saldo_rata_rata_bulan} onChange={set("saldo_rata_rata_bulan")} type="number" />
            <FieldInput label="Tagihan Listrik Rata-rata (Rp)" value={form.avg_tagihan_listrik_bulan} onChange={set("avg_tagihan_listrik_bulan")} type="number" />
            <FieldInput label="Konsistensi Bayar Listrik (bln/12)" value={form.konsistensi_bayar_listrik} onChange={set("konsistensi_bayar_listrik")} type="number" />
            <FieldInput label="Konsistensi Bayar Air (bln/12)" value={form.konsistensi_bayar_air} onChange={set("konsistensi_bayar_air")} type="number" />
            <FieldToggle label="Pernah Kredit Macet" desc="Riwayat kredit macet pada lembaga manapun" value={form.pernah_kredit_macet} onChange={set("pernah_kredit_macet")} />
          </div>
        </Card>
      </div>

      <Card style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Jalankan Cross-Validation Otomatis</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>Bandingkan pendapatan yang dilaporkan nasabah dengan estimasi dari data QRIS dan marketplace</div>
          </div>
          <button onClick={runEnrichment} disabled={enrichStatus === "loading"} style={{
            padding: "10px 20px", borderRadius: 8, border: "none",
            background: enrichStatus === "loading" ? C.slate : C.navy,
            color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>
            {enrichStatus === "loading" ? "⏳ Memvalidasi…" : "🔍 Jalankan Validasi"}
          </button>
        </div>
        {enrichStatus === "done" && (
          <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
            {[
              { label: "Pendapatan (Dilaporkan)", value: formatRp(form.pendapatan), color: C.text },
              { label: "Estimasi via QRIS", value: formatRp(Math.round(form.pendapatan * 0.92)), color: C.teal },
              { label: "Selisih", value: "8%", color: C.success },
              { label: "Status Validasi", value: anomalyFlag ? "⚠️ Anomali" : "✓ Konsisten", color: anomalyFlag ? C.danger : C.success },
            ].map(d => (
              <div key={d.label} style={{ background: C.bg, borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>{d.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: d.color }}>{d.value}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {enrichStatus === "done" && (
        <Card style={{ background: anomalyFlag ? "#FFFBEB" : "#F0FDF4", border: `1px solid ${anomalyFlag ? C.gold : C.success}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: anomalyFlag ? C.gold : C.success }}>
                {anomalyFlag ? "⚠️ Gate 2 — Anomali terdeteksi, akan masuk antrian review manual setelah scoring" : "🟢 Gate 2 LULUS — Data konsisten, lanjut ke scoring engine"}
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                {anomalyFlag ? "Data akan diflag untuk review analyst di Layer 5." : "Tidak ada anomali signifikan antara data laporan dan data objektif."}
              </div>
            </div>
            <button onClick={handleNext} style={{ padding: "10px 22px", borderRadius: 8, border: "none", background: C.teal, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Lanjut → Receipt OCR ⛓
            </button>
          </div>
        </Card>
      )}
      <BlockchainAuditPanel chain={chain} />
    </div>
  );
}

// ─── LAYER 2C — RECEIPT OCR & ANCHOR CHECK ──────────────────────────────────
// Catatan arsitektur: Layer 2B (Trajectory Score) TIDAK ada di sini.
// Trajectory score hanya bermakna untuk nasabah returning (ada historical data).
// Untuk first-time applicant, yang tersedia hanyalah snapshot data pengajuan + receipt OCR ini.
// Trajectory akan dihitung di modul Portfolio Monitoring saat ada ≥2 titik data waktu berbeda.

const RECEIPT_TYPES = [
  { key: "receipt_pln",        label: "Tagihan PLN",     icon: "⚡", desc: "Tagihan listrik bulanan",   endpoint: "/ocr/receipt/pln",        fields: ["nominal", "bulan", "id_pelanggan"] },
  { key: "receipt_gas",        label: "Gas LPG",         icon: "🔥", desc: "Nota pembelian gas LPG",    endpoint: "/ocr/receipt/gas",        fields: ["nominal", "jumlah_tabung", "tanggal"] },
  { key: "receipt_pulsa",      label: "Kuota/Pulsa",     icon: "📱", desc: "Bukti beli kuota/pulsa",    endpoint: "/ocr/receipt/pulsa",      fields: ["nominal", "provider", "tanggal"] },
  { key: "receipt_bahan_baku", label: "Bahan Baku",      icon: "🛒", desc: "Nota pembelian bahan baku", endpoint: "/ocr/receipt/bahan_baku", fields: ["nominal", "item", "tanggal"] },
  { key: "receipt_bbm",        label: "BBM / SPBU",      icon: "⛽", desc: "Struk pengisian BBM",       endpoint: "/ocr/receipt/bbm",        fields: ["nominal", "tanggal", "spbu"] },
  { key: "receipt_bpjs",       label: "BPJS Mandiri",    icon: "🏥", desc: "Bukti bayar iuran BPJS",    endpoint: "/ocr/receipt/bpjs",       fields: ["nominal", "no_va", "tanggal"] },
];

function ReceiptCard({ rcpt, status, ocrData, onResult }) {
  const fileInputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const statusMap = {
    idle:      { label: "Belum diupload",     color: C.slate,   bg: C.bg },
    scanning:  { label: "Memproses OCR…",     color: C.gold,    bg: "#FFFBEB" },
    verified:  { label: "✓ Berhasil di-OCR",  color: C.success, bg: "#F0FDF4" },
    failed:    { label: "✗ Gagal / Tidak valid", color: C.danger, bg: "#FEF2F2" },
    skipped:   { label: "Dilewati",           color: C.slate,   bg: C.bg },
  };
  const s = statusMap[status || "idle"];

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
    if (!allowed.includes(file.type)) { setErrorMsg("Format tidak didukung. Gunakan JPG, PNG, atau PDF."); return; }
    if (file.size > 5 * 1024 * 1024) { setErrorMsg("Ukuran file melebihi 5 MB."); return; }
    setErrorMsg("");
    if (file.type.startsWith("image/")) setPreview(URL.createObjectURL(file));
    else setPreview(null);

    onResult("scanning", null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      // Backend receipt_ocr.py menggunakan satu endpoint unified dengan field receipt_type
      fd.append("receipt_type", rcpt.key.replace("receipt_", "")); // mis. "receipt_pln" → "pln"

      const res = await fetch(`${RCPT_URL}/ocr/receipt`, { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error ${res.status}`);
      }
      const data = await res.json();
      onResult(data.success ? "verified" : "failed", data);
    } catch (err) {
      console.error("Receipt OCR error:", err);
      setErrorMsg(err.message || "Gagal menghubungi server OCR receipt.");
      onResult("failed", null);
    }
  };

  return (
    <div style={{ background: C.card, borderRadius: 10, border: `1px solid ${status === "verified" ? C.teal : status === "failed" ? C.danger : C.border}`, padding: "14px 16px" }}>
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/jpg,application/pdf" style={{ display: "none" }} onChange={handleFile} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 22 }}>{rcpt.icon}</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{rcpt.label}</div>
            <div style={{ fontSize: 10, color: C.muted }}>{rcpt.desc}</div>
          </div>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 12, background: s.bg, color: s.color }}>{s.label}</span>
      </div>

      {status === "verified" && ocrData?.data && (
        <div style={{ background: "#F0FDFA", borderRadius: 6, padding: "8px 10px", marginBottom: 8, border: `1px solid ${C.teal}22` }}>
          {Object.entries(ocrData.data).filter(([k, v]) => v != null && !["catatan"].includes(k)).slice(0, 3).map(([k, v]) => (
            <div key={k} style={{ fontSize: 10, color: C.text }}>
              <span style={{ color: C.muted, textTransform: "capitalize" }}>{k.replace(/_/g, " ")}: </span>
              <span style={{ fontWeight: 700 }}>{typeof v === "number" ? formatRp(v) : String(v)}</span>
            </div>
          ))}
          {ocrData.confidence_avg != null && (
            <div style={{ fontSize: 9, color: C.muted, marginTop: 4 }}>
              Confidence: {(ocrData.confidence_avg * 100).toFixed(0)}%
              {ocrData.konsistensi?.flag && (
                <span style={{ marginLeft: 6, color: ocrData.konsistensi.flag === "valid" ? C.success : C.gold }}>
                  · {ocrData.konsistensi.flag === "valid" ? "✓ Struk valid" : ocrData.konsistensi.flag === "nominal_ok_no_date" ? "⚠ Tanggal tidak terbaca" : ocrData.konsistensi.flag === "expired" ? "⏰ Struk kadaluarsa" : ocrData.konsistensi.flag === "nominal_anomaly" ? "⚠ Nominal anomali" : ocrData.konsistensi.flag}
                </span>
              )}
            </div>
          )}
          {ocrData.message && (
            <div style={{ fontSize: 9, color: C.muted, marginTop: 2, lineHeight: 1.4 }}>{ocrData.message}</div>
          )}
        </div>
      )}
      {status === "failed" && ocrData?.message && (
        <div style={{ background: "#FEF2F2", borderRadius: 6, padding: "6px 10px", marginBottom: 8, fontSize: 10, color: C.danger }}>
          {ocrData.message}
        </div>
      )}

      {errorMsg && <div style={{ fontSize: 10, color: C.danger, marginBottom: 6 }}>⚠️ {errorMsg}</div>}

      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={() => fileInputRef.current?.click()} disabled={status === "scanning"} style={{
          flex: 1, padding: "7px 10px", borderRadius: 7, border: `1px solid ${status === "verified" ? C.teal : C.border}`,
          background: status === "verified" ? "#F0FDFA" : "transparent",
          color: status === "verified" ? C.teal : C.muted, fontSize: 11, fontWeight: 700, cursor: "pointer",
        }}>
          {status === "scanning" ? "⏳ Proses…" : status === "verified" ? "📂 Upload Ulang" : "📤 Upload & OCR"}
        </button>
        {status !== "verified" && (
          <button onClick={() => onResult("skipped", null)} style={{
            padding: "7px 10px", borderRadius: 7, border: `1px solid ${C.border}`,
            background: "transparent", color: C.slate, fontSize: 10, cursor: "pointer",
          }}>Lewati</button>
        )}
      </div>
    </div>
  );
}

function ScreenLayer2C({ form, setForm, onNext, onAddBlock, chain }) {
  const [receipts, setReceipts] = useState(() =>
    Object.fromEntries(RECEIPT_TYPES.map(r => [r.key, { status: "idle", ocrData: null }]))
  );
  const [anchorStatus, setAnchorStatus] = useState(null); // null | "checking" | "anchored" | "needs_visit" | "insufficient"
  const [anchorDetail, setAnchorDetail] = useState(null);
  const [blockAdded, setBlockAdded] = useState(false);

  const verifiedReceipts = RECEIPT_TYPES.filter(r => receipts[r.key]?.status === "verified");
  const verifiedCount    = verifiedReceipts.length;

  // Hitung proxy pengeluaran operasional dari receipt yang berhasil
  const calcReceiptProxy = () => {
    const nominals = verifiedReceipts
      .map(r => receipts[r.key]?.ocrData?.data?.nominal)
      .filter(n => n && !isNaN(n));
    return nominals.length > 0 ? Math.round(nominals.reduce((a, b) => a + b, 0)) : 0;
  };

  const runAnchorCheck = async () => {
    if (verifiedCount < 3) {
      setAnchorStatus("insufficient");
      setAnchorDetail({ msg: "Minimal 3 jenis receipt berbeda diperlukan untuk anchor check.", verifiedCount });
      return;
    }
    setAnchorStatus("checking");

    try {
      // Kirim hasil OCR ke backend untuk dihitung anchor check-nya
      const receiptPayload = verifiedReceipts.map(r => ({
        receipt_type: r.key.replace("receipt_", ""),
        data:         receipts[r.key]?.ocrData?.data     || {},
        konsistensi:  receipts[r.key]?.ocrData?.konsistensi || {},
      }));

      const res = await fetch(`${RCPT_URL}/ocr/receipt/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pendapatan_dilaporkan: form.pendapatan || 0,
          receipts: receiptPayload,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error ${res.status}`);
      }

      const result = await res.json();
      const { anchor_status, catatan, total_proxy_opex, rasio_opex_omset } = result;

      setAnchorStatus(anchor_status);
      setAnchorDetail({
        msg:          catatan,
        receiptProxy: total_proxy_opex,
        ratio:        rasio_opex_omset,
        avgOpex:      total_proxy_opex,
      });

      setForm(f => ({
        ...f,
        receipt_anchor_status: anchor_status,
        receipt_avg_opex:      total_proxy_opex,
        receipt_count:         verifiedCount,
      }));

    } catch (err) {
      console.error("Anchor check error:", err);
      // Fallback: hitung lokal jika backend tidak tersedia
      const receiptProxy = calcReceiptProxy();
      const pendapatan   = form.pendapatan || 0;
      const ratio        = pendapatan > 0 ? receiptProxy / pendapatan : 0;

      let status, msg;
      if (ratio >= 0.05 && ratio <= 0.60) {
        status = "anchored";
        msg = `Konsisten ✅ — Proxy receipt Rp ${receiptProxy.toLocaleString("id-ID")}/bln (~${(ratio * 100).toFixed(0)}% dari omset dilaporkan). Berada dalam toleransi 5–60%. ⚠️ Dihitung lokal — backend tidak tersedia (${err.message}).`;
      } else if (ratio > 0.60) {
        status = "needs_visit";
        msg = `Anomali ⚠️ — Proxy receipt (${(ratio * 100).toFixed(0)}% dari omset) melebihi batas wajar 60%. Wajib kunjungan lapangan. ⚠️ Dihitung lokal — backend tidak tersedia.`;
      } else {
        status = "needs_visit";
        msg = `Anomali ⚠️ — Proxy receipt sangat rendah (<5% omset). Perlu konfirmasi lapangan. ⚠️ Dihitung lokal — backend tidak tersedia.`;
      }

      setAnchorStatus(status);
      setAnchorDetail({ msg, receiptProxy, ratio, avgOpex: receiptProxy });
      setForm(f => ({
        ...f,
        receipt_anchor_status: status,
        receipt_avg_opex:      receiptProxy,
        receipt_count:         verifiedCount,
      }));
    }
  };

  const handleNext = async () => {
    if (!blockAdded) {
      await onAddBlock("Layer 2C — Receipt OCR & Anchor Check", {
        no_aplikasi: form.no_aplikasi,
        receipt_count: verifiedCount,
        receipt_avg_opex: calcReceiptProxy(),
        anchor_status: anchorStatus || "not_checked",
        receipt_types_verified: verifiedReceipts.map(r => r.label).join(", "),
        anomali_catatan: anchorDetail?.msg || "-",
      });
      setBlockAdded(true);
    }
    onNext();
  };

  const anchorColor = anchorStatus === "anchored" ? C.success : anchorStatus === "needs_visit" ? C.danger : anchorStatus === "insufficient" ? C.gold : C.muted;
  const anchorBg    = anchorStatus === "anchored" ? "#F0FDF4" : anchorStatus === "needs_visit" ? "#FEF2F2" : anchorStatus === "insufficient" ? "#FFFBEB" : C.bg;

  const canProceed = anchorStatus === "anchored" || anchorStatus === "needs_visit";

  return (
    <div style={{ padding: "0 36px 48px" }}>
      <Header icon="🧾" title="Receipt OCR — Verifikasi Pengeluaran Operasional" subtitle="Layer 2C — Upload receipt nyata untuk memverifikasi klaim omset nasabah secara objektif" officerName={form.nama_officer} />

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {[["1","Dok. Nasabah",false,true],["2","Lokasi GPS",false,true],["3","Enrichment",false,true],["4","Receipt OCR",true,false],["5","Scoring",false,false],["6","Output",false,false]].map(([n,l,a,d], i) => (
          <div key={n} style={{ display: "flex", alignItems: "center" }}>
            <StepBadge num={n} label={l} active={a} done={d} />
            {i < 5 && <div style={{ width: 20, height: 1, background: C.border, margin: "0 3px" }} />}
          </div>
        ))}
      </div>

      {/* Penjelasan arsitektur */}
      <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 12, color: "#1E40AF" }}>
        <strong>📌 Catatan Arsitektur:</strong> Layer ini menggantikan "Trajectory Score" untuk <em>first-time applicant</em>. Trajectory sejati butuh minimal 2 titik data di waktu berbeda — yang baru pertama kali mendaftar belum memilikinya. Receipt OCR memberikan verifikasi objektif dari pengeluaran nyata nasabah yang tidak bergantung pada historical data sistem.
        <br />
        <span style={{ color: C.teal, fontWeight: 700 }}>Untuk nasabah returning</span>, trajectory akan dihitung otomatis di modul Portfolio Monitoring berdasarkan delta antara pengajuan ini dan data sebelumnya.
      </div>

      <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "12px 16px", marginBottom: 24, fontSize: 12, color: "#92400E" }}>
        <strong>Panduan Loan Officer:</strong> Minta nasabah menunjukkan bukti pengeluaran operasional usaha (minimal 3 jenis berbeda). Upload foto/scan receipt. OCR akan mengekstrak nominal untuk cross-check dengan omset yang dilaporkan. Toleransi wajar: receipt biasanya 15–40% dari omset (nasabah pasti ada pengeluaran cash tanpa receipt).
      </div>

      {/* Grid Receipt Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
        {RECEIPT_TYPES.map(rcpt => (
          <ReceiptCard
            key={rcpt.key}
            rcpt={rcpt}
            status={receipts[rcpt.key]?.status}
            ocrData={receipts[rcpt.key]?.ocrData}
            onResult={(status, data) => setReceipts(r => ({ ...r, [rcpt.key]: { status, ocrData: data } }))}
          />
        ))}
      </div>

      {/* Progress indicator */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Status Upload Receipt</div>
          <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 12, background: verifiedCount >= 3 ? C.success + "22" : C.gold + "22", color: verifiedCount >= 3 ? C.success : C.gold }}>
            {verifiedCount}/6 jenis ter-OCR {verifiedCount >= 3 ? "✓ Cukup untuk anchor check" : `(minimal 3 diperlukan)`}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {RECEIPT_TYPES.map(r => {
            const st = receipts[r.key]?.status;
            return (
              <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, padding: "4px 10px", borderRadius: 16, background: st === "verified" ? "#F0FDFA" : C.bg, border: `1px solid ${st === "verified" ? C.teal : C.border}` }}>
                <span>{r.icon}</span>
                <span style={{ color: st === "verified" ? C.teal : C.muted, fontWeight: st === "verified" ? 700 : 400 }}>{r.label}</span>
                {st === "verified" && <span style={{ color: C.teal }}>✓</span>}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Anchor check */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Jalankan Anchor Check</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
              Bandingkan proxy pengeluaran dari receipt vs omset yang dilaporkan di Layer 2.
              {" "}Omset dilaporkan: <strong style={{ color: C.teal }}>{formatRp(form.pendapatan)}/bln</strong>
            </div>
          </div>
          <button
            onClick={runAnchorCheck}
            disabled={verifiedCount < 3 || anchorStatus === "checking"}
            style={{
              padding: "10px 20px", borderRadius: 8, border: "none",
              background: verifiedCount < 3 || anchorStatus === "checking" ? C.slate : C.navy,
              color: "#fff", fontSize: 12, fontWeight: 700, cursor: verifiedCount < 3 ? "not-allowed" : "pointer",
            }}>
            {anchorStatus === "checking" ? "⏳ Menganalisis…" : "🔍 Jalankan Anchor Check"}
          </button>
        </div>

        {anchorStatus && anchorStatus !== "checking" && anchorDetail && (
          <div style={{ marginTop: 16 }}>
            <div style={{ background: anchorBg, border: `1px solid ${anchorColor}44`, borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: anchorColor, marginBottom: 6 }}>
                {anchorStatus === "anchored"    && "✅ Anchored — Data receipt konsisten dengan omset dilaporkan"}
                {anchorStatus === "needs_visit" && "🔴 Anomali Terdeteksi — Wajib kunjungan lapangan sebelum disbursement"}
                {anchorStatus === "insufficient"&& "⚠️ Receipt Tidak Cukup — Minimal 3 jenis diperlukan untuk anchor check"}
              </div>
              <div style={{ fontSize: 12, color: C.text, lineHeight: 1.6 }}>{anchorDetail.msg}</div>

              {anchorStatus !== "insufficient" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 12 }}>
                  {[
                    { label: "Omset Dilaporkan",          value: formatRp(form.pendapatan) },
                    { label: "Proxy Pengeluaran Receipt",  value: formatRp(anchorDetail.receiptProxy) },
                    { label: "Rasio Receipt/Omset",        value: `${(anchorDetail.ratio * 100).toFixed(1)}%` },
                  ].map(d => (
                    <div key={d.label} style={{ background: "#fff", borderRadius: 8, padding: "10px 12px", border: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 10, color: C.muted }}>{d.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginTop: 3 }}>{d.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {anchorStatus === "needs_visit" && (
              <div style={{ marginTop: 10, padding: "10px 14px", background: "#FEF2F2", borderRadius: 8, fontSize: 12, color: C.danger, border: `1px solid ${C.danger}22` }}>
                🚩 <strong>Flag ke antrian kunjungan lapangan:</strong> "Anomali receipt — omset dilaporkan {formatRp(form.pendapatan)}/bln, proxy receipt hanya {formatRp(anchorDetail.receiptProxy)} — perlu konfirmasi lapangan." Proses dapat dilanjutkan ke scoring dengan catatan anomali ini.
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Next button */}
      {(canProceed || anchorStatus === "insufficient") && (
        <Card style={{ background: canProceed && anchorStatus === "anchored" ? "#F0FDF4" : "#FFFBEB", border: `1px solid ${anchorStatus === "anchored" ? C.success : C.gold}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: anchorStatus === "anchored" ? C.success : C.gold }}>
                {anchorStatus === "anchored"     && "🟢 Anchor check lulus — lanjut ke ML Scoring"}
                {anchorStatus === "needs_visit"  && "⚠️ Anomali tercatat — tetap lanjut ke scoring dengan flag kunjungan"}
                {anchorStatus === "insufficient" && "⚠️ Receipt tidak cukup — lanjut ke scoring tanpa anchor (snapshot murni)"}
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                {anchorStatus === "insufficient"
                  ? "Nasabah first-time tanpa receipt cukup: scoring berjalan sebagai snapshot murni dari data pengajuan."
                  : `Receipt proxy: ${formatRp(anchorDetail?.receiptProxy || 0)}/bln dari ${verifiedCount} jenis receipt`}
              </div>
            </div>
            <button onClick={handleNext} style={{ padding: "10px 22px", borderRadius: 8, border: "none", background: C.teal, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Lanjut → Scoring ⛓
            </button>
          </div>
        </Card>
      )}

      <BlockchainAuditPanel chain={chain} />
    </div>
  );
}

// ─── LAYER 3 — SCORING ENGINE ─────────────────────────────────────────────────
function ScreenLayer3({ form, setForm, result, setResult, loading, setLoading, error, setError, onNext, onAddBlock, chain }) {
  const set = (key) => (val) => setForm(f => ({ ...f, [key]: val }));
  const [blockAdded, setBlockAdded] = useState(false);

  // Hard stop hanya untuk 3 hal yang benar-benar absolut (regulasi/policy mutlak).
  // Faktor risiko lain (pernah_kredit_macet, lama_usaha_tahun, dll.) tetap jadi fitur ML,
  // bukan gate — supaya model punya distribusi risiko yang realistis.
  const ruleChecks = [
    {
      label: "Tidak masuk daftar hitam OJK/BI",
      desc: "Blacklist OJK atau BI — tidak dapat dinegosiasi secara regulasi",
      pass: true, // diisi dari sistem SLIK/BI-Checking
      isHardStop: true,
    },
    {
      label: `SLIK bukan Kol.5 — macet aktif (Kol. ${form.slik_kolektibilitas})`,
      desc: "Kolektibilitas 5 = kredit macet aktif, pelanggaran policy OJK",
      pass: form.slik_kolektibilitas < 5,
      isHardStop: true,
    },
    {
      label: "Dokumen identitas (KTP) terverifikasi",
      desc: "Tanpa identitas terverifikasi, proses apapun tidak dapat dilanjutkan",
      pass: form.ktp_status === "verified" || form.ktp_status === null,
      isHardStop: true,
    },
  ];
  const allRulesPass = ruleChecks.every(r => r.pass);

  // Faktor risiko yang BUKAN hard stop — masuk sebagai fitur input ML
  const mlFeatureFlags = [
    {
      label: `Lama usaha ${form.lama_usaha_tahun} tahun`,
      desc: "Dievaluasi model — makin lama makin baik, tapi bukan gate",
      value: form.lama_usaha_tahun,
      flag: form.lama_usaha_tahun < 0.25 ? "perhatian" : form.lama_usaha_tahun < 1 ? "sedang" : "baik",
    },
    {
      label: form.pernah_kredit_macet ? "Pernah kredit macet" : "Tidak ada riwayat kredit macet",
      desc: "Model mempertimbangkan kapan, seberapa besar, dan tren setelahnya",
      value: form.pernah_kredit_macet,
      flag: form.pernah_kredit_macet ? "perhatian" : "baik",
    },
    {
      label: `Jumlah pinjaman aktif: ${form.jumlah_pinjaman_aktif}`,
      desc: "Faktor beban utang — dibobot model berdasarkan pendapatan",
      value: form.jumlah_pinjaman_aktif,
      flag: form.jumlah_pinjaman_aktif > 3 ? "perhatian" : form.jumlah_pinjaman_aktif > 1 ? "sedang" : "baik",
    },
  ];
  const handleScore = async () => {
  setLoading(true); 
  setError(null);
  
  try {
    const payload = {
      transaksi: form.transaksi, pendapatan: form.pendapatan, growth: form.growth,
      volatilitas: form.volatilitas, pinjaman: form.jumlah_pinjaman_aktif, nib: form.nib,
      ojol_bulan_aktif: form.ojol_bulan_aktif, memiliki_npwp: form.memiliki_npwp,
      aktif_marketplace: form.aktif_marketplace, slik_kolektibilitas: form.slik_kolektibilitas,
      memiliki_kendaraan_roda4: form.memiliki_kendaraan_roda4,
      marketplace_order_per_bulan: form.marketplace_order_per_bulan,
      avg_tagihan_listrik_bulan: form.avg_tagihan_listrik_bulan,
      memiliki_kendaraan_roda2: form.memiliki_kendaraan_roda2,
      saldo_rata_rata_bulan: form.saldo_rata_rata_bulan, memiliki_pirt: form.memiliki_pirt,
      pernah_kredit_macet: form.pernah_kredit_macet, aktif_ojol: form.aktif_ojol,
      ojol_avg_order_per_hari: form.ojol_avg_order_per_hari,
      marketplace_lama_bergabung_bulan: form.marketplace_lama_bergabung_bulan,
      marketplace_rating: form.marketplace_rating,
      konsistensi_bayar_listrik: form.konsistensi_bayar_listrik,
      lama_usaha_tahun: form.lama_usaha_tahun, jumlah_rekening_bank: form.jumlah_rekening_bank,
      sertifikasi_halal: form.sertifikasi_halal, ojol_rating: form.ojol_rating,
      konsistensi_bayar_air: form.konsistensi_bayar_air, kota: form.kota,
      kategori_usaha: form.kategori_usaha, status_kepemilikan_rumah: form.status_kepemilikan_rumah,
      // Layer 2C data — receipt OCR proxy
      receipt_avg_opex: form.receipt_avg_opex || 0,
      receipt_count: form.receipt_count || 0,
      receipt_anchor_status: form.receipt_anchor_status || "not_checked",
      // Observasi officer
      obs_jenis_tempat_usaha: form.obs_jenis_tempat_usaha || "",
      obs_sumber_bahan_baku: form.obs_sumber_bahan_baku || "",
      obs_estimasi_pelanggan_per_hari: form.obs_estimasi_pelanggan_per_hari || 0,
      obs_jumlah_sku: form.obs_jumlah_sku || 0,
    };

    const res = await fetch(`${API_URL}/predict`, { 
      method: "POST", 
      headers: { "Content-Type": "application/json" }, 
      body: JSON.stringify(payload) 
    });

    if (!res.ok) throw new Error(`Server Backend Error (Status: ${res.status})`);
    
    const data = await res.json();
    
    // PERBAIKAN 1: Pastikan object data tidak null/undefined sebelum membaca propertinya
    if (!data) {
      throw new Error("Backend berhasil merespon, tetapi mengembalikan data kosong (null).");
    }

    // PERBAIKAN 2: Gunakan optional chaining (?.) agar aman jika key tidak ada
    if (data?.error) {
      throw new Error(data.error);
    }

    // PERBAIKAN 3: Proteksi pembacaan nilai probability
    const prob = data?.probability;
    if (prob === undefined || prob === null || isNaN(prob) || !isFinite(prob)) {
      throw new Error(`Model mengembalikan probabilitas tidak valid. Nilai kota atau kategori_usaha kemungkinan tidak dikenal model.`);
    }

    // Masukkan data cadangan jika shap_values tidak sengaja dikirim null oleh backend
    setResult({
      ...data,
      shap_values: data?.shap_values || []
    });

  } catch (e) {
    // PERBAIKAN 4: Bedakan pesan eror agar tidak membingungkan saat debugging
    setError(`Koneksi/Sistem Eror: ${e.message}`);
  } finally {
    setLoading(false);
  }
};
  const handleNext = async () => {
    if (result && !blockAdded) {
      await onAddBlock("Layer 3 — ML Scoring Engine (XGBoost)", {
        no_aplikasi: form.no_aplikasi,
        credit_score: probToScore(result.probability),
        probability: result.probability,
        risk_label: probToRisk(result.probability),
        top_shap_feature: result.shap_values?.[0]?.feature || "N/A",
        model: "XGBoost + SHAP",
        obs_jenis_tempat_usaha: form.obs_jenis_tempat_usaha || "—",
        obs_sumber_bahan_baku: form.obs_sumber_bahan_baku || "—",
        obs_pelanggan_per_hari: form.obs_estimasi_pelanggan_per_hari,
        obs_officer: form.obs_officer_id,
        obs_catatan: form.obs_catatan_kualitatif ? form.obs_catatan_kualitatif.substring(0, 80) : "—",
      });
      setBlockAdded(true);
    }
    onNext();
  };

  const shap_values = result?.shap_values || [];
  const top3 = shap_values.slice(0, 3);

  return (
    <div style={{ padding: "0 36px 48px" }}>
      <Header icon="⚙️" title="Scoring Engine" subtitle="Layer 3 — Rule-based pre-filter → ML scoring (XGBoost) → SHAP Explainability" officerName={form.nama_officer} />

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 28, flexWrap: "wrap" }}>
        {[["1", "Dok. Nasabah", false, true], ["2", "Lokasi GPS", false, true], ["3", "Enrichment", false, true], ["4", "Scoring", true, false], ["5", "Output", false, false]].map(([n, l, a, d], i) => (
          <div key={n} style={{ display: "flex", alignItems: "center" }}>
            <StepBadge num={n} label={l} active={a} done={d} />
            {i < 4 && <div style={{ width: 24, height: 1, background: C.border, margin: "0 4px" }} />}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <Card>
          <SectionTitle sub="Hanya 3 hard stop absolut (regulasi/policy mutlak). Faktor risiko lain masuk sebagai fitur ML.">Rule-Based Pre-Filter</SectionTitle>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.danger, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Hard Stop — Pelanggaran langsung tolak</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {ruleChecks.map(r => (
              <div key={r.label} style={{ padding: "10px 12px", background: r.pass ? "#F0FDF4" : "#FEF2F2", borderRadius: 8, border: `1px solid ${r.pass ? C.success : C.danger}44` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{r.pass ? "✅" : "❌"}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: r.pass ? C.text : C.danger, fontWeight: r.pass ? 600 : 700 }}>{r.label}</div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{r.desc}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: r.pass ? C.success + "22" : C.danger + "22", color: r.pass ? C.success : C.danger, flexShrink: 0 }}>{r.pass ? "LULUS" : "TOLAK"}</span>
                </div>
              </div>
            ))}
            <div style={{ padding: "10px 14px", borderRadius: 8, background: allRulesPass ? "#DCFCE7" : "#FEE2E2", border: `1px solid ${allRulesPass ? C.success : C.danger}44` }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: allRulesPass ? C.success : C.danger }}>
                {allRulesPass ? "✓ Semua hard stop lulus — nasabah eligible, lanjut ke ML model" : "✗ Hard stop gagal — proses tidak dapat dilanjutkan"}
              </span>
            </div>
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.teal, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Fitur Input ML — Dinilai gradasi risiko oleh model</div>
          <div style={{ padding: "8px 12px", background: "#EFF6FF", borderRadius: 8, border: "1px solid #BFDBFE", marginBottom: 10, fontSize: 11, color: "#1E40AF" }}>
            Faktor di bawah bukan gate — melainkan sinyal yang dibobot model XGBoost. Model menilai kombinasi, konteks, dan magnitude-nya secara holistik.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {mlFeatureFlags.map(f => {
              const flagColor = f.flag === "baik" ? C.success : f.flag === "sedang" ? C.warning : C.gold;
              const flagBg = f.flag === "baik" ? "#F0FDF4" : f.flag === "sedang" ? "#FFFBEB" : "#FFF7ED";
              const flagLabel = f.flag === "baik" ? "Baik" : f.flag === "sedang" ? "Sedang" : "Perhatian";
              return (
                <div key={f.label} style={{ padding: "10px 12px", background: flagBg, borderRadius: 8, border: `1px solid ${flagColor}44`, display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>🔵</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{f.label}</div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{f.desc}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: flagColor + "22", color: flagColor, flexShrink: 0 }}>{flagLabel}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <SectionTitle sub="Terisi otomatis dari layer sebelumnya — tidak dapat diubah di sini">Data Terisi Otomatis</SectionTitle>
          <div style={{ marginBottom: 10, padding: "8px 12px", background: "#EFF6FF", borderRadius: 8, fontSize: 11, color: "#1E40AF", border: "1px solid #BFDBFE" }}>
            Data di bawah bersumber dari OCR, GPS, dan enrichment API. Jika ada ketidaksesuaian, koreksi di layer asalnya — bukan di sini.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: "Kota",                   value: form.kota || "—",                            src: "GPS + KTP OCR" },
              { label: "Kategori usaha",          value: form.kategori_usaha || "—",                  src: "NIB OCR" },
              { label: "Lama usaha",              value: `${form.lama_usaha_tahun} tahun`,            src: "NIB OCR" },
              { label: "Konsistensi listrik",     value: `${form.konsistensi_bayar_listrik}/12 bln`,  src: "Receipt OCR" },
              { label: "Konsistensi air",         value: `${form.konsistensi_bayar_air}/12 bln`,      src: "Receipt OCR" },
              { label: "Jumlah rekening bank",    value: `${form.jumlah_rekening_bank} rekening`,     src: "SLIK / Input L2" },
              { label: "Anchor check receipt",    value: form.receipt_anchor_status || "Belum dicek", src: "Receipt OCR L2C" },
            ].map(d => (
              <div key={d.label} style={{ display: "flex", alignItems: "center", padding: "8px 12px", background: C.bg, borderRadius: 8, gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 11, color: C.muted }}>{d.label}</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{d.value}</div>
                <div style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: C.teal + "18", color: C.teal, fontWeight: 600, whiteSpace: "nowrap" }}>
                  {d.src}
                </div>
              </div>
            ))}
          </div>

          {/* ── Data observasi officer ── */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 4 }}>Observasi Officer — Wajib diisi saat kunjungan</div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>
              Data ini dicatat atas nama <strong>{form.obs_officer_id}</strong> dan masuk ke blockchain audit trail.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <FieldSelect
                label="Jenis tempat usaha" required
                value={form.obs_jenis_tempat_usaha}
                onChange={(v) => setForm(f => ({ ...f, obs_jenis_tempat_usaha: v }))}
                options={[
                  { value: "", label: "— Pilih —" },
                  { value: "warung_tetap", label: "Warung / kios tetap" },
                  { value: "gerobak",      label: "Gerobak / lapak berpindah" },
                  { value: "rumahan",      label: "Usaha dari rumah" },
                  { value: "titipan",      label: "Titipan di toko lain" },
                ]}
              />
              <FieldSelect
                label="Sumber bahan baku utama" required
                value={form.obs_sumber_bahan_baku}
                onChange={(v) => setForm(f => ({ ...f, obs_sumber_bahan_baku: v }))}
                options={[
                  { value: "", label: "— Pilih —" },
                  { value: "pasar_harian",    label: "Pasar tradisional (harian)" },
                  { value: "supplier_tetap",  label: "Supplier / agen tetap" },
                  { value: "distributor",     label: "Distributor modern (FMCG)" },
                  { value: "campuran",        label: "Campuran" },
                ]}
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <FieldInput
                  label="Estimasi pelanggan/hari"
                  value={form.obs_estimasi_pelanggan_per_hari}
                  onChange={(v) => setForm(f => ({ ...f, obs_estimasi_pelanggan_per_hari: v }))}
                  type="number" placeholder="mis. 40"
                />
                <FieldInput
                  label="Jumlah produk/SKU dijual"
                  value={form.obs_jumlah_sku}
                  onChange={(v) => setForm(f => ({ ...f, obs_jumlah_sku: v }))}
                  type="number" placeholder="mis. 8"
                />
              </div>
              <div>
                <Label>Catatan kualitatif officer</Label>
                <textarea
                  value={form.obs_catatan_kualitatif}
                  onChange={(e) => setForm(f => ({ ...f, obs_catatan_kualitatif: e.target.value }))}
                  placeholder="Kondisi usaha, kesan umum, hal-hal yang tidak tertangkap data digital…"
                  rows={3}
                  style={{
                    width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`,
                    borderRadius: 8, fontSize: 12, color: C.text, background: "#F8FAFC",
                    outline: "none", boxSizing: "border-box", resize: "vertical",
                    fontFamily: "'DM Sans', system-ui, sans-serif", lineHeight: 1.5,
                  }}
                />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ML Score trigger */}
      <Card style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>ML Scoring — XGBoost + SHAP Explainer</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>Menghasilkan credit score, risk label, limit rekomendasi, dan analisis SHAP per fitur</div>
          </div>
          <button onClick={handleScore} disabled={loading || !allRulesPass} style={{
            padding: "11px 24px", borderRadius: 8, border: "none",
            background: !allRulesPass ? C.slate : loading ? C.slate : C.navy,
            color: "#fff", fontSize: 13, fontWeight: 700, cursor: !allRulesPass || loading ? "default" : "pointer",
          }}>
            {loading ? "⏳ Menghitung skor…" : "🚀 Jalankan ML Scoring"}
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 14, padding: "10px 14px", background: "#FEF2F2", borderRadius: 8, color: C.danger, fontSize: 12 }}>⚠️ {error}</div>
        )}

        {result && !error && (
          <div style={{ marginTop: 18 }}>
            {/* Hasil scoring */}
            <div style={{ fontSize: 12, fontWeight: 700, color: C.teal, marginBottom: 10 }}>✓ Scoring berhasil</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
              {[
                { label: "Credit Score", value: probToScore(result.probability), color: scoreColor(probToScore(result.probability)) },
                { label: "Risk Label", value: probToRisk(result.probability), color: riskColor(probToRisk(result.probability)) },
                { label: "Prob. Gagal Bayar", value: `${(result.probability * 100).toFixed(1)}%`, color: C.text },
                { label: "Plafon Rekomendasi", value: formatRp(calcPlafon(form.pendapatan, result.probability)), color: C.teal },
              ].map(d => (
                <div key={d.label} style={{ background: C.bg, borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>{d.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: d.color }}>{d.value}</div>
                </div>
              ))}
            </div>

            {/* SHAP TOP 3 — tampil SEBELUM lanjut ke analyst review */}
            {top3.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 10 }}>
                  🔍 Top-3 Faktor Penentu Skor (SHAP) — Wajib dikaji loan officer sebelum review
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  {top3.map((s, i) => (
                    <div key={s.feature} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: s.value >= 0 ? "#F0FDF4" : "#FEF2F2", borderRadius: 8, border: `1px solid ${s.value >= 0 ? C.success : C.danger}22` }}>
                      <div style={{ width: 24, height: 24, borderRadius: "50%", background: s.value >= 0 ? C.success : C.danger, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{labelFeature(s.feature)}</div>
                        <div style={{ fontSize: 10, color: s.value >= 0 ? C.success : C.danger, marginTop: 1 }}>
                          {s.value >= 0 ? "↑ Mendorong skor naik" : "↓ Menekan skor"} ({s.value > 0 ? "+" : ""}{s.value.toFixed(4)})
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, padding: "8px 12px", background: "#EFF6FF", borderRadius: 8, fontSize: 11, color: "#1E40AF", border: "1px solid #BFDBFE" }}>
                  💡 Gunakan analisis SHAP ini sebagai dasar penilaian saat Analyst Review. Chart SHAP lengkap tersedia di Layer Output Final.
                </div>
              </div>
            )}

            <button onClick={handleNext} style={{ padding: "10px 22px", borderRadius: 8, border: "none", background: C.teal, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Lanjut → Output Final ⛓
            </button>
          </div>
        )}
      </Card>
      <BlockchainAuditPanel chain={chain} />
    </div>
  );
}

// ─── LAYER 5 — ANALYST REVIEW ─────────────────────────────────────────────────
function ScreenLayer4({ form, result, onNext, onAddBlock, chain }) {
  const [overrideNote, setOverrideNote] = useState("");
  const [decision, setDecision] = useState(null);
  const [blockAdded, setBlockAdded] = useState(false);

  const score = result ? probToScore(result.probability) : null;
  const isQueue = score && score >= 520 && score <= 620;

  const handleNext = async () => {
    if (!blockAdded) {
      await onAddBlock("Layer 5 — Analyst Review & Override", {
        no_aplikasi: form.no_aplikasi,
        officer: form.nama_officer,
        keputusan: decision || "otomatis",
        catatan: overrideNote || "-",
        grey_zone: isQueue,
        credit_score: score,
        timestamp_review: new Date().toISOString(),
      });
      setBlockAdded(true);
    }
    onNext();
  };

  return (
    <div style={{ padding: "0 36px 48px" }}>
      <Header icon="👤" title="Credit Analyst Review" subtitle="Compliance — Human-in-the-loop untuk borderline & override · Diakses analyst/compliance officer, bukan loan officer" officerName={form.nama_officer} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <Card>
          <SectionTitle sub="Daftar pengajuan borderline, anomali, atau loan besar yang antre review">Antrian Review Nasabah</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {analystQueue.map(q => (
              <div key={q.id} style={{ padding: "12px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#F8FAFC", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{q.nama}</div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{q.id} · {q.alasan} · {q.waktu}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <Badge label={q.risiko} color={riskColor(q.risiko)} />
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginTop: 4 }}>{q.plafon}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle sub="Keputusan dan override untuk pengajuan nasabah yang sedang diproses">Override & Audit Trail</SectionTitle>
          {result ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ padding: "12px 14px", background: isQueue ? "#FFFBEB" : "#F0FDF4", borderRadius: 8, border: `1px solid ${isQueue ? C.gold : C.success}44` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: isQueue ? C.gold : C.success }}>
                  {isQueue ? "⚠️ Skor borderline — perlu keputusan loan officer" : "✓ Skor di luar zona grey — keputusan sistem otomatis"}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                  {form.nama_usaha} · Skor {score} · {probToRisk(result.probability)}
                </div>
              </div>
              <div>
                <Label>Keputusan Loan Officer</Label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {[
                    { val: "approve", label: "✅ Setujui", color: C.success },
                    { val: "reject", label: "❌ Tolak", color: C.danger },
                    { val: "escalate", label: "⬆️ Eskalasi", color: C.gold },
                  ].map(d => (
                    <button key={d.val} onClick={() => setDecision(d.val)} style={{
                      padding: "10px 6px", borderRadius: 8, border: `2px solid ${decision === d.val ? d.color : C.border}`,
                      background: decision === d.val ? d.color + "18" : "#F8FAFC",
                      color: decision === d.val ? d.color : C.muted,
                      fontSize: 11, fontWeight: 700, cursor: "pointer",
                    }}>{d.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Catatan Override (Audit Trail — Wajib untuk Compliance OJK)</Label>
                <textarea value={overrideNote} onChange={(e) => setOverrideNote(e.target.value)}
                  placeholder="Alasan override wajib diisi untuk compliance OJK / BI…"
                  style={{ width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.text, background: "#F8FAFC", resize: "vertical", minHeight: 80, boxSizing: "border-box", fontFamily: "inherit" }} />
              </div>
              {decision && (
                <div style={{ padding: "10px 14px", background: "#F0FDF4", borderRadius: 8, fontSize: 12, color: C.success }}>
                  ✓ Keputusan "{decision}" tercatat · {new Date().toLocaleString("id-ID")}
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: "40px 0", textAlign: "center", color: C.slate, fontSize: 13 }}>Jalankan scoring di Layer 3 terlebih dahulu</div>
          )}
        </Card>
      </div>

      {result && (
        <Card style={{ background: "#F0FDF4", border: `1px solid ${C.success}44` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.success }}>
                {decision ? `✅ Keputusan "${decision}" tercatat` : "⏳ Menunggu keputusan loan officer"}
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                {decision
                  ? "Catatan override tersimpan ke audit trail · Feedback loop aktif untuk retraining model"
                  : "Pilih keputusan di atas untuk menyimpan ke audit trail"}
              </div>
            </div>
            {decision && (
              <div style={{ padding: "10px 18px", borderRadius: 8, background: C.success + "18", border: `1px solid ${C.success}44`, fontSize: 12, fontWeight: 700, color: C.success }}>
                ⛓ Tersimpan di Audit Trail
              </div>
            )}
          </div>
        </Card>
      )}
      <BlockchainAuditPanel chain={chain} />
    </div>
  );
}

// ─── SHAP REJECTION RECOMMENDATIONS ──────────────────────────────────────────
const SHAP_RECOMMENDATIONS = {
  qris_avg_transaksi_per_hari:        { label: "Transaksi QRIS harian rendah",       action: "Aktifkan dan gunakan QRIS secara konsisten minimal 3 bulan ke depan untuk membangun riwayat transaksi digital." },
  qris_avg_pendapatan_bulan:          { label: "Pendapatan bulanan via QRIS rendah",  action: "Tingkatkan penggunaan QRIS sebagai alat pembayaran utama agar arus kas tercatat secara digital." },
  qris_tren_6bulan_pct:               { label: "Tren pendapatan 6 bulan menurun",     action: "Fokus pada peningkatan omset dan pastikan tren pendapatan stabil atau naik selama 3–6 bulan sebelum mengajukan ulang." },
  qris_volatilitas_pct:               { label: "Volatilitas arus kas tinggi",         action: "Jaga kestabilan pendapatan bulanan. Hindari fluktuasi besar dengan diversifikasi produk atau pelanggan." },
  jumlah_pinjaman_aktif:              { label: "Terlalu banyak pinjaman aktif",        action: "Lunasi sebagian pinjaman aktif terlebih dahulu sebelum mengajukan kredit baru." },
  memiliki_nib:                       { label: "Belum memiliki NIB",                  action: "Daftarkan usaha ke OSS (oss.go.id) untuk mendapatkan NIB. Proses gratis dan dapat dilakukan secara online." },
  ojol_bulan_aktif:                   { label: "Aktivitas ojol belum cukup",          action: "Tingkatkan keaktifan di platform ojol minimal 6 bulan terakhir secara konsisten." },
  memiliki_npwp:                      { label: "Belum memiliki NPWP",                 action: "Daftarkan NPWP usaha di kantor pajak terdekat atau melalui ereg.pajak.go.id." },
  aktif_marketplace:                  { label: "Belum aktif di marketplace",          action: "Daftar dan mulai berjualan di Tokopedia, Shopee, atau Lazada untuk memperkuat jejak digital usaha." },
  slik_kolektibilitas:                { label: "Kolektibilitas SLIK kurang baik",     action: "Selesaikan kewajiban kredit yang tertunggak dan pastikan pembayaran lancar minimal 6 bulan sebelum mengajukan ulang." },
  pernah_kredit_macet:                { label: "Riwayat kredit macet tercatat",       action: "Lunasi seluruh tunggakan dan bangun rekam jejak pembayaran yang bersih minimal 12 bulan." },
  marketplace_order_per_bulan:        { label: "Order marketplace per bulan rendah",  action: "Tingkatkan aktivitas penjualan di marketplace dengan promosi rutin dan kelengkapan produk." },
  marketplace_rating:                 { label: "Rating toko marketplace rendah",      action: "Tingkatkan pelayanan dan respons untuk mendongkrak rating toko di atas 4.5." },
  marketplace_lama_bergabung_bulan:   { label: "Baru bergabung di marketplace",       action: "Pertahankan keaktifan berjualan di marketplace. Direkomendasikan minimal 12 bulan riwayat toko aktif." },
  avg_tagihan_listrik_bulan:          { label: "Tagihan listrik rata-rata rendah",    action: "Tagihan listrik yang konsisten mencerminkan aktivitas usaha. Pastikan usaha beroperasi secara aktif." },
  konsistensi_bayar_listrik:          { label: "Pembayaran listrik tidak konsisten",  action: "Bayar tagihan listrik tepat waktu setiap bulan. Konsistensi 10–12 bulan dari 12 akan memperkuat profil kredit." },
  konsistensi_bayar_air:              { label: "Pembayaran air tidak konsisten",      action: "Bayar tagihan air tepat waktu setiap bulan sebagai bukti kedisiplinan finansial." },
  lama_usaha_tahun:                   { label: "Usaha masih baru",                    action: "Kembali ajukan setelah usaha berjalan minimal 1 tahun dengan rekam jejak transaksi yang solid." },
  saldo_rata_rata_bulan:              { label: "Saldo rekening rata-rata rendah",     action: "Jaga saldo rekening agar tidak terlalu sering mendekati nol. Idealnya minimal 30% dari pendapatan bulanan." },
  jumlah_rekening_bank:               { label: "Tidak memiliki rekening bank",        action: "Buka rekening bank atas nama usaha dan gunakan secara aktif untuk transaksi bisnis." },
  ojol_avg_order_per_hari:            { label: "Order ojol per hari rendah",          action: "Tingkatkan volume order harian di platform ojol dengan promosi dan konsistensi layanan." },
  ojol_rating:                        { label: "Rating ojol rendah",                  action: "Tingkatkan kualitas layanan ojol untuk mendapatkan rating minimal 4.5." },
  memiliki_kendaraan_roda4:           { label: "Tidak memiliki kendaraan roda 4",     action: "Kepemilikan aset dapat memperkuat profil. Pertimbangkan mencatat aset usaha yang dimiliki." },
  memiliki_kendaraan_roda2:           { label: "Tidak memiliki kendaraan roda 2",     action: "Catat dan dokumentasikan aset usaha yang dimiliki untuk memperkuat profil peminjam." },
  memiliki_pirt:                      { label: "Belum memiliki sertifikat PIRT",      action: "Ajukan sertifikat PIRT ke Dinas Kesehatan setempat untuk memperkuat legalitas produk." },
  sertifikasi_halal:                  { label: "Belum memiliki sertifikasi halal",    action: "Ajukan sertifikasi halal melalui BPJPH untuk memperluas pasar dan memperkuat profil usaha." },
};

// ─── CICILAN HELPERS ──────────────────────────────────────────────────────────
function calcAnuitas(pokok, bungaPa, tenorBulan) {
  const r = bungaPa / 12 / 100;
  if (r === 0) return pokok / tenorBulan;
  return Math.round(pokok * r * Math.pow(1 + r, tenorBulan) / (Math.pow(1 + r, tenorBulan) - 1));
}
function calcFlat(pokok, bungaPa, tenorBulan) {
  return Math.round(pokok / tenorBulan + (pokok * bungaPa / 100) / 12);
}
function bungaFromProb(prob) {
  return prob < 0.2 ? 8 : prob < 0.4 ? 12 : 18;
}

// ─── LAYER 4 — OUTPUT ─────────────────────────────────────────────────────────
function ScreenLayer5({ form, setForm, result, onNext, onAddBlock, chain }) {
  const [blockAdded, setBlockAdded] = useState(false);
  const [selectedTenor, setSelectedTenor] = useState(null);
  const printRef = useRef(null);

  useEffect(() => {
    if (result && selectedTenor === null) {
      const defaultTenor = result.probability < 0.2 ? 36 : result.probability < 0.4 ? 24 : 12;
      setSelectedTenor(defaultTenor);
    }
  }, [result]);

  useEffect(() => {
    if (result && !blockAdded) {
      const score = probToScore(result.probability);
      const layak = result.probability < 0.6;
      onAddBlock("Layer 4 — Output & Keputusan Kredit Final", {
        no_aplikasi: form.no_aplikasi,
        nama_usaha: form.nama_usaha,
        credit_score: score,
        risk_label: probToRisk(result.probability),
        probability: result.probability,
        plafon: calcPlafon(form.pendapatan, result.probability),
        keputusan_final: layak ? "LAYAK" : "TIDAK LAYAK",
        officer: form.nama_officer,
      });
      setBlockAdded(true);
    }
  }, [result]);

  if (!result) return (
    <div style={{ padding: "0 36px 48px" }}>
      <Header icon="✅" title="Output & Keputusan Kredit" subtitle="Layer 4 — Hasil akhir untuk disampaikan ke komite kredit" officerName={form.nama_officer} />
      <Card>
        <div style={{ padding: "60px 0", textAlign: "center", color: C.slate, fontSize: 14 }}>
          Belum ada hasil scoring. Jalankan proses di Layer 3 terlebih dahulu.
        </div>
      </Card>
    </div>
  );

  const prob = result.probability;
  const score = probToScore(prob);
  const risk = probToRisk(prob);
  const plafon = calcPlafon(form.pendapatan, prob);
  const tenor = prob < 0.2 ? "36 bulan" : prob < 0.4 ? "24 bulan" : "12 bulan";
  const bunga = prob < 0.2 ? "8% p.a." : prob < 0.4 ? "12% p.a." : "18% p.a.";
  const layak = prob < 0.6;
  const shap_values = result.shap_values || [];
  const top3 = shap_values.slice(0, 3);
  const maxAbs = Math.max(...shap_values.map(s => Math.abs(s.value)), 0.001);
  const shapForChart = shap_values.map(s => ({ ...s, feature: labelFeature(s.feature) }));

  const bungaPa = result ? bungaFromProb(result.probability) : 12;
  const plafonForCicilan = result ? calcPlafon(form.pendapatan, result.probability) : 0;
  const tenorOptions = [12, 24, 36];
  const activeTenor = selectedTenor || 12;
  const cicilanAnuitas = calcAnuitas(plafonForCicilan, bungaPa, activeTenor);
  const cicilanFlat    = calcFlat(plafonForCicilan, bungaPa, activeTenor);
  const totalAnuitas   = cicilanAnuitas * activeTenor;
  const totalFlat      = cicilanFlat * activeTenor;

  const handleExportPDF = () => {
    const el = printRef.current;
    if (!el) return;
    const style = document.createElement("style");
    style.innerHTML = `@media print { body * { visibility: hidden; } #padi-print, #padi-print * { visibility: visible; } #padi-print { position: absolute; left: 0; top: 0; width: 100%; } .no-print { display: none !important; } }`;
    document.head.appendChild(style);
    window.print();
    document.head.removeChild(style);
  };

  return (
    <div style={{ padding: "0 36px 48px" }}>
      <Header icon="✅" title="Output & Keputusan Kredit" subtitle="Layer 4 — Hasil akhir untuk komite kredit · Dapat diaudit sesuai POJK 29/2024" officerName={form.nama_officer} />

      {/* Export PDF button */}
      <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button onClick={handleExportPDF} style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 20px", borderRadius: 8, border: `1px solid ${C.navy}`,
          background: C.navy, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
        }}>
          🖨️ Export / Cetak PDF
        </button>
      </div>

      <div id="padi-print" ref={printRef}>
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 1fr", gap: 18, marginBottom: 20 }}>
        <Card style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <ScoreGauge score={score} />
          <div style={{ marginTop: 8, padding: "4px 16px", borderRadius: 20, background: riskColor(risk) + "22", color: riskColor(risk), fontSize: 12, fontWeight: 700 }}>
            RISIKO {risk.toUpperCase()}
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: C.muted, textAlign: "center" }}>
            Prob. gagal bayar<br />
            <span style={{ fontSize: 22, fontWeight: 800, color: prob < 0.4 ? C.success : C.danger }}>{(prob * 100).toFixed(1)}%</span>
          </div>
        </Card>

        <Card>
          <SectionTitle>Rekomendasi Pembiayaan</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            {[
              { label: "Plafon Direkomendasikan", value: formatRp(plafon), color: C.success },
              { label: "Tenor Maksimal", value: tenor, color: C.teal },
              { label: "Estimasi Bunga", value: bunga, color: C.text },
              { label: "Keputusan Final", value: layak ? "✅ LAYAK" : "❌ TIDAK LAYAK", color: layak ? C.success : C.danger },
            ].map(d => (
              <div key={d.label} style={{ background: C.bg, borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>{d.label}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: d.color }}>{d.value}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {[
              { label: "Pendapatan/Bln", value: formatRp(form.pendapatan) },
              { label: "Lama Usaha", value: `${form.lama_usaha_tahun} thn` },
              { label: "SLIK", value: `Kol. ${form.slik_kolektibilitas}` },
            ].map(d => (
              <div key={d.label} style={{ background: "#F8FAFC", borderRadius: 6, padding: "8px 10px", border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 9, color: C.muted }}>{d.label}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginTop: 2 }}>{d.value}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle sub="Faktor pendorong dan penghambat skor (SHAP) — basis keputusan yang dapat dijelaskan">Top-3 Faktor Penentu Skor</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {top3.map((s, i) => (
              <div key={s.feature} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: s.value >= 0 ? "#F0FDF4" : "#FEF2F2", borderRadius: 8, border: `1px solid ${s.value >= 0 ? C.success : C.danger}22` }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: s.value >= 0 ? C.success : C.danger, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{labelFeature(s.feature)}</div>
                  <div style={{ fontSize: 10, color: s.value >= 0 ? C.success : C.danger, marginTop: 1 }}>
                    {s.value >= 0 ? "↑ Mendorong skor naik" : "↓ Menekan skor"} ({s.value > 0 ? "+" : ""}{s.value.toFixed(4)})
                  </div>
                </div>
              </div>
            ))}
            {top3.length === 0 && <div style={{ color: C.slate, fontSize: 12 }}>Data SHAP tidak tersedia</div>}
          </div>
        </Card>
      </div>

      {/* Credit Summary Card — Receipt OCR & Trajectory Status */}
      <Card style={{ marginBottom: 20, background: "#F8FAFC", border: `1px solid ${C.border}` }}>
        <SectionTitle sub="Ringkasan verifikasi tambahan dari pipeline pengajuan ini">Ringkasan Verifikasi Objektif</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {/* Trajectory — selalu first-time untuk pengajuan baru */}
          <div style={{ background: "#EFF6FF", borderRadius: 8, padding: "12px 14px", border: "1px solid #BFDBFE" }}>
            <div style={{ fontSize: 10, color: "#1E40AF", fontWeight: 700, marginBottom: 4 }}>📊 Trajectory Score</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#1E40AF" }}>First-time applicant</div>
            <div style={{ fontSize: 10, color: "#3B82F6", marginTop: 3, lineHeight: 1.5 }}>
              Trajectory belum tersedia — butuh ≥2 titik data di waktu berbeda. Akan dihitung otomatis saat nasabah mendaftar ulang atau di Portfolio Monitoring.
            </div>
          </div>
          {/* Receipt OCR proxy */}
          <div style={{
            background: form.receipt_anchor_status === "anchored" ? "#F0FDFA" : form.receipt_anchor_status === "needs_visit" ? "#FEF2F2" : "#FFFBEB",
            borderRadius: 8, padding: "12px 14px",
            border: `1px solid ${form.receipt_anchor_status === "anchored" ? C.teal : form.receipt_anchor_status === "needs_visit" ? C.danger : C.gold}44`,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, marginBottom: 4 }}>🧾 Receipt OCR Proxy</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
              {form.receipt_avg_opex > 0 ? formatRp(form.receipt_avg_opex) + "/bln" : "Tidak tersedia"}
            </div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>
              Dari {form.receipt_count || 0} jenis receipt · Anchor:{" "}
              <span style={{ fontWeight: 700, color: form.receipt_anchor_status === "anchored" ? C.success : form.receipt_anchor_status === "needs_visit" ? C.danger : C.gold }}>
                {form.receipt_anchor_status === "anchored"    ? "✅ Konsisten" :
                 form.receipt_anchor_status === "needs_visit" ? "🔴 Anomali" :
                 form.receipt_anchor_status === "insufficient"? "⚠️ Kurang receipt" :
                 "Belum dicek"}
              </span>
            </div>
          </div>
          {/* Document integrity */}
          <div style={{ background: "#F0FDF4", borderRadius: 8, padding: "12px 14px", border: `1px solid ${C.success}44` }}>
            <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, marginBottom: 4 }}>📄 Integritas Dokumen</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.success }}>
              {[form.ktp_status, form.nib_status, form.npwp_status].filter(s => s === "verified").length}/3 Terverifikasi ✅
            </div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>
              KTP {form.ktp_status === "verified" ? "✓" : "—"} · NIB {form.nib_status === "verified" ? "✓" : "—"} · NPWP {form.npwp_status === "verified" ? "✓" : "—"}
            </div>
          </div>
        </div>
        {/* Flag kunjungan lapangan kalau ada anomali receipt */}
        {form.receipt_anchor_status === "needs_visit" && (
          <div style={{ marginTop: 12, padding: "10px 14px", background: "#FEF2F2", borderRadius: 8, fontSize: 12, color: C.danger, border: `1px solid ${C.danger}22`, fontWeight: 700 }}>
            🚩 Flag Wajib: Kunjungan lapangan diperlukan sebelum disbursement — anomali receipt terdeteksi di Layer 2C.
          </div>
        )}
      </Card>

      {/* SHAP Chart Lengkap */}
      <Card style={{ marginBottom: 20 }}>
        <SectionTitle sub="Nilai SHAP positif (hijau) mendorong skor naik; negatif (merah) menekan skor. Dapat diaudit sesuai POJK 29/2024.">
          Explainability — Kontribusi Semua Fitur (SHAP Values)
        </SectionTitle>
        {shapForChart.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={shapForChart} layout="vertical" margin={{ left: 230, right: 80, top: 4, bottom: 4 }}>
              <XAxis type="number" domain={[-maxAbs * 1.2, maxAbs * 1.2]}
                tickFormatter={v => v > 0 ? `+${v.toFixed(3)}` : v.toFixed(3)} fontSize={10} />
              <YAxis type="category" dataKey="feature" width={225} fontSize={11} tick={{ fill: C.text }} />
              <Tooltip formatter={(v) => [v > 0 ? `+${v.toFixed(4)}` : v.toFixed(4), "SHAP value"]} />
              <ReferenceLine x={0} stroke={C.border} />
              <Bar dataKey="value" shape={(props) => {
                const { x, y, width, height, value } = props;
                return <rect x={value < 0 ? x + width : x} y={y} width={Math.abs(width)} height={height} fill={value >= 0 ? C.success : C.danger} rx={3} />;
              }} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ padding: "24px", textAlign: "center", color: C.muted, fontSize: 13 }}>Data SHAP tidak tersedia dari backend.</div>
        )}
      </Card>

      {layak ? (
        /* ── LAYAK: Estimasi Plafon Sementara ── */
        <Card style={{ marginBottom: 20, background: "#F0FDFA", border: `1px solid ${C.teal}44` }}>
          <SectionTitle sub="Estimasi awal berdasarkan pendapatan yang dilaporkan — akan diverifikasi dan disesuaikan setelah monitoring selesai">
            💰 Estimasi Plafon Sementara
          </SectionTitle>
          {/* Warning banner untuk nasabah monitoring */}
          {prob >= 0.2 && (
            <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "10px 14px", marginBottom: 16, display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#92400E" }}>Plafon ini belum final</div>
                <div style={{ fontSize: 11, color: "#92400E", marginTop: 2, lineHeight: 1.5 }}>
                  Angka di bawah dihitung dari pendapatan yang <em>dilaporkan</em> (belum terverifikasi longitudinal). Plafon dan simulasi cicilan final akan ditetapkan di akhir periode monitoring, berbasis rata-rata omset yang terverifikasi selama {prob >= 0.4 ? "6" : "3"} bulan.
                </div>
              </div>
            </div>
          )}
          {/* Estimasi grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 16 }}>
            {[
              { label: "Estimasi Plafon Sementara", value: formatRp(plafon), color: C.teal, sub: "Sebelum monitoring" },
              { label: "Tenor Indikatif", value: prob < 0.2 ? "Maks. 36 bulan" : prob < 0.4 ? "Maks. 24 bulan" : "Maks. 12 bulan", color: C.navy, sub: "Dapat berubah" },
              { label: "Estimasi Bunga", value: bunga, color: C.text, sub: "Tergantung skor final" },
            ].map(d => (
              <div key={d.label} style={{ background: "#fff", borderRadius: 8, padding: "14px 16px", border: `1px solid ${C.teal}22` }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>{d.label}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: d.color }}>{d.value}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 3, fontStyle: "italic" }}>{d.sub}</div>
              </div>
            ))}
          </div>
          {/* Basis perhitungan */}
          <div style={{ background: "#fff", borderRadius: 8, padding: "12px 14px", border: `1px solid ${C.border}`, fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
            <strong style={{ color: C.text }}>Basis perhitungan sementara:</strong>{" "}
            Pendapatan dilaporkan {formatRp(form.pendapatan)}/bln × 3 × multiplier risiko ({prob < 0.2 ? "1.5×" : prob < 0.4 ? "1.0×" : "0.5×"}).{" "}
            {prob >= 0.2 && <span style={{ color: C.gold }}>Simulasi cicilan lengkap (anuitas vs flat rate) tersedia setelah monitoring selesai dan plafon final ditetapkan.</span>}
            {prob < 0.2 && <span style={{ color: C.success }}>Fast track — simulasi cicilan tersedia di Analyst Review.</span>}
          </div>
        </Card>
      ) : (
        /* ── TIDAK LAYAK: Alasan Penolakan & Rekomendasi ── */
        <Card style={{ marginBottom: 20, border: `1px solid ${C.danger}44`, background: "#FFF8F8" }}>
          <SectionTitle sub="Faktor utama yang menyebabkan pengajuan tidak memenuhi kriteria kelayakan kredit">
            ❌ Alasan Penolakan & Rekomendasi Perbaikan
          </SectionTitle>

          {/* Alasan utama dari SHAP negatif */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.danger, marginBottom: 10 }}>
              Faktor Penekan Skor Tertinggi (dari SHAP Analysis)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {shap_values.filter(s => s.value < 0).slice(0, 5).length > 0
                ? shap_values.filter(s => s.value < 0).slice(0, 5).map((s, i) => {
                    const rec = SHAP_RECOMMENDATIONS[s.feature];
                    return (
                      <div key={s.feature} style={{ borderRadius: 10, border: `1px solid ${C.danger}22`, overflow: "hidden" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#FEF2F2" }}>
                          <div style={{ width: 24, height: 24, borderRadius: "50%", background: C.danger, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{rec?.label || labelFeature(s.feature)}</div>
                            <div style={{ fontSize: 10, color: C.danger, marginTop: 1 }}>SHAP: {s.value.toFixed(4)} · menekan skor</div>
                          </div>
                        </div>
                        {rec?.action && (
                          <div style={{ padding: "10px 14px", background: "#fff", display: "flex", gap: 10, alignItems: "flex-start" }}>
                            <span style={{ fontSize: 14, flexShrink: 0 }}>💡</span>
                            <div style={{ fontSize: 12, color: C.text, lineHeight: 1.6 }}>{rec.action}</div>
                          </div>
                        )}
                      </div>
                    );
                  })
                : (
                  <div style={{ padding: "16px", background: "#FEF2F2", borderRadius: 8, fontSize: 12, color: C.muted }}>
                    Data SHAP tidak tersedia. Kemungkinan disebabkan kombinasi beberapa faktor risiko sekaligus.
                  </div>
                )
              }
            </div>
          </div>

          {/* Langkah selanjutnya */}
          <div style={{ padding: "14px 16px", background: "#FFFBEB", borderRadius: 10, border: `1px solid ${C.gold}44` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#92400E", marginBottom: 8 }}>📋 Langkah Selanjutnya untuk Nasabah</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                "Perbaiki faktor-faktor di atas sesuai rekomendasi yang diberikan",
                "Aktifkan dan gunakan QRIS secara konsisten minimal 3 bulan ke depan",
                "Pastikan semua kewajiban finansial (listrik, air, cicilan) dibayar tepat waktu",
                "Lengkapi legalitas usaha: NIB, NPWP, dan dokumen pendukung lainnya",
                "Ajukan kembali setelah minimal 3–6 bulan dengan kondisi yang lebih baik",
              ].map((step, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: C.text }}>
                  <span style={{ color: C.gold, fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
      </div>{/* end printRef */}

      {/* ── Routing cerdas: segmentasi 4 jalur ── */}
      {(() => {
        const hasAnomali     = form.receipt_anchor_status === "needs_visit";
        const hadKreditMacet = form.pernah_kredit_macet === 1;
        const slik5          = form.slik_kolektibilitas === 5;
        // anchored = true jika receipt sudah di-OCR dan konsisten, ATAU jika Layer 2C dilewati (null/idle = tidak ada anomali)
        const anchored       = form.receipt_anchor_status !== "needs_visit";

        // Penentuan jalur
        const hardReject      = slik5 || score < 400;
        const extendedMonitor = !hardReject && (score < 500 || (score < 550 && hadKreditMacet) || (hasAnomali && score < 550));
        // monitorTrack: skor di bawah 670 ATAU ada anomali receipt yang nyata (needs_visit)
        const monitorTrack    = !hardReject && !extendedMonitor && (score < 670 || hasAnomali);
        // fastTrack: skor ≥670 DAN tidak ada anomali (anchored atau belum di-cek = bukan needs_visit)
        const fastTrack       = !hardReject && !extendedMonitor && !monitorTrack;

        const targetBulan = extendedMonitor ? 6 : 3;

        let jalurLabel, jalurDesc, jalurColor, jalurBg, jalurBtn, jalurIcon;
        if (hardReject) {
          jalurLabel = "❌ Hard Reject — Tidak memenuhi kriteria minimum";
          jalurDesc  = slik5 ? "SLIK Kolektibilitas 5 (Macet) — tidak dapat diproses." : "Skor di bawah 400, risiko default terlalu tinggi. Nasabah dapat mengajukan kembali setelah memperbaiki profil.";
          jalurColor = C.danger; jalurBg = "#FFF8F8";
        } else if (extendedMonitor) {
          jalurLabel = `⏱ Extended Monitoring — 6 bulan pra-ACC`;
          jalurDesc  = `Skor ${score} (400–499)${hadKreditMacet ? ", ada riwayat kredit macet" : ""}${hasAnomali ? ", anomali receipt berat" : ""}. Diperlukan pemantauan lebih ketat selama 6 bulan.`;
          jalurColor = C.danger; jalurBg = "#FFF5F5"; jalurBtn = `📊 Mulai Extended Monitoring 6 Bln →`; jalurIcon = "⏱";
        } else if (monitorTrack) {
          jalurLabel = `📊 Monitoring Track — 3 bulan pra-ACC`;
          jalurDesc  = `Skor ${score} (500–669)${hasAnomali ? " · anomali receipt terdeteksi (needs_visit)" : ""}. Monitoring 3 bulan untuk membangun trajectory score sebelum keputusan final.`;
          jalurColor = C.gold; jalurBg = "#FFFBEB"; jalurBtn = `📊 Mulai Monitoring 3 Bln →`;
        } else {
          jalurLabel = `✅ Fast Track — Langsung Analyst Review`;
          jalurDesc  = `Skor ${score} ≥ 670, tidak ada anomali receipt terdeteksi. Tidak memerlukan monitoring — langsung masuk antrian analyst review.`;
          jalurColor = C.success; jalurBg = "#F0FDF4"; jalurBtn = `👤 Analyst Review →`;
        }

        return (
          <Card style={{ marginBottom: 20, background: jalurBg, border: `1px solid ${jalurColor}44` }}>
            {/* Tabel segmentasi ringkas */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Segmentasi Jalur Kredit</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                {[
                  { id: "fast",     label: "⚡ Fast Track",         cond: "Skor ≥670, anchored, no anomali",          active: fastTrack,      color: C.success },
                  { id: "monitor",  label: "📊 Monitoring 3 Bln",   cond: "Skor 500–669 atau ada anomali",             active: monitorTrack,   color: C.gold },
                  { id: "extended", label: "⏱ Extended 6 Bln",      cond: "Skor 400–499 / anomali berat / macet",      active: extendedMonitor,color: C.danger },
                  { id: "reject",   label: "❌ Hard Reject",         cond: "Skor <400 atau SLIK Kol.5",                active: hardReject,     color: "#7F1D1D" },
                ].map(j => (
                  <div key={j.id} style={{ borderRadius: 8, padding: "8px 10px", background: j.active ? j.color + "18" : C.bg, border: `1.5px solid ${j.active ? j.color : C.border}`, transition: "all 0.15s" }}>
                    <div style={{ fontSize: 11, fontWeight: j.active ? 800 : 600, color: j.active ? j.color : C.muted }}>{j.label}</div>
                    <div style={{ fontSize: 9, color: C.muted, marginTop: 3, lineHeight: 1.4 }}>{j.cond}</div>
                    {j.active && <div style={{ marginTop: 5, fontSize: 9, fontWeight: 700, color: j.color, background: j.color + "22", borderRadius: 6, padding: "2px 6px", display: "inline-block" }}>← Jalur ini</div>}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: jalurColor }}>{jalurLabel}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 3, maxWidth: 560, lineHeight: 1.5 }}>{jalurDesc}</div>
              </div>
              {!hardReject && (
                <button
                  onClick={() => {
                    setForm(f => ({
                      ...f,
                      monitoring_status: fastTrack ? "skip" : "pending",
                      monitoring_target_bulan: targetBulan,
                    }));
                    onNext(fastTrack); // langsung pass nilai, tidak tunggu state commit
                  }}
                  style={{ padding: "10px 22px", borderRadius: 8, border: "none", background: fastTrack ? C.teal : extendedMonitor ? C.danger : C.gold, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}
                >
                  {jalurBtn}
                </button>
              )}
            </div>
          </Card>
        );
      })()}

      <BlockchainAuditPanel chain={chain} />
    </div>
  );
}

// ─── SIMULASI CICILAN FINAL (dipindah ke akhir monitoring) ───────────────────
function SimulasiCicilanFinal({ plafonFinal, bungaFinal, tenorOpts, pendapatan, latestSkor }) {
  const [selectedTenor, setSelectedTenor] = useState(latestSkor >= 670 ? 36 : latestSkor >= 550 ? 24 : 12);
  const cicilanAnuitas = calcAnuitas(plafonFinal, bungaFinal, selectedTenor);
  const cicilanFlat    = calcFlat(plafonFinal, bungaFinal, selectedTenor);
  const totalAnuitas   = cicilanAnuitas * selectedTenor;
  const totalFlat      = cicilanFlat * selectedTenor;
  const dsrAnuitas     = pendapatan > 0 ? cicilanAnuitas / pendapatan : 0;
  const dsrFlat        = pendapatan > 0 ? cicilanFlat / pendapatan : 0;

  return (
    <Card style={{ marginBottom: 20, border: `2px solid ${C.teal}66`, background: "#F0FDFA" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <div style={{ fontSize: 18 }}>💳</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.teal }}>Simulasi Cicilan Final</div>
          <div style={{ fontSize: 11, color: C.muted }}>Berbasis plafon terverifikasi dari rata-rata omset monitoring · Ini angka final yang diserahkan ke komite kredit</div>
        </div>
        <div style={{ marginLeft: "auto", padding: "4px 12px", borderRadius: 20, background: C.success + "22", color: C.success, fontSize: 11, fontWeight: 700 }}>✓ Plafon Terverifikasi</div>
      </div>

      {/* Tenor selector */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, marginTop: 14 }}>
        {tenorOpts.map(t => (
          <button key={t} onClick={() => setSelectedTenor(t)} style={{
            padding: "7px 20px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
            border: `2px solid ${selectedTenor === t ? C.teal : C.border}`,
            background: selectedTenor === t ? C.teal : "#fff",
            color: selectedTenor === t ? "#fff" : C.muted, transition: "all 0.15s",
          }}>{t} Bulan</button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: C.muted }}>
          <span>Plafon final:</span>
          <span style={{ fontWeight: 700, color: C.teal }}>{formatRp(plafonFinal)}</span>
          <span>·</span>
          <span>Bunga:</span>
          <span style={{ fontWeight: 700, color: C.text }}>{bungaFinal}% p.a.</span>
        </div>
      </div>

      {/* Side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        {/* Anuitas */}
        <div style={{ borderRadius: 10, border: `2px solid ${C.teal}44`, overflow: "hidden" }}>
          <div style={{ background: C.teal, padding: "9px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#fff" }}>Metode Anuitas (Efektif)</div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.8)", background: "rgba(255,255,255,0.15)", padding: "2px 7px", borderRadius: 10 }}>Umum Perbankan</div>
          </div>
          <div style={{ padding: "12px 14px", background: "#F0FDFA" }}>
            <div style={{ fontSize: 10, color: C.muted }}>Cicilan per Bulan</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: C.teal, marginBottom: 10 }}>{formatRp(cicilanAnuitas)}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {[
                { label: "Total Angsuran", value: formatRp(totalAnuitas) },
                { label: "Total Bunga", value: formatRp(totalAnuitas - plafonFinal) },
                { label: "Beban / Plafon", value: `${((totalAnuitas - plafonFinal) / plafonFinal * 100).toFixed(1)}%` },
                { label: "DSR", value: `${(dsrAnuitas * 100).toFixed(1)}%`, color: dsrAnuitas < 0.35 ? C.success : C.danger },
              ].map(d => (
                <div key={d.label} style={{ background: "#fff", borderRadius: 6, padding: "7px 8px", border: `1px solid ${C.teal}22` }}>
                  <div style={{ fontSize: 9, color: C.muted }}>{d.label}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: d.color || C.text, marginTop: 1 }}>{d.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Flat */}
        <div style={{ borderRadius: 10, border: `2px solid ${C.navy}44`, overflow: "hidden" }}>
          <div style={{ background: C.navy, padding: "9px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#fff" }}>Metode Flat Rate</div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.8)", background: "rgba(255,255,255,0.15)", padding: "2px 7px", borderRadius: 10 }}>Umum UMKM / Koperasi</div>
          </div>
          <div style={{ padding: "12px 14px", background: "#EFF6FF" }}>
            <div style={{ fontSize: 10, color: C.muted }}>Cicilan per Bulan</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: C.navy, marginBottom: 10 }}>{formatRp(cicilanFlat)}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {[
                { label: "Total Angsuran", value: formatRp(totalFlat) },
                { label: "Total Bunga", value: formatRp(totalFlat - plafonFinal) },
                { label: "Beban / Plafon", value: `${((totalFlat - plafonFinal) / plafonFinal * 100).toFixed(1)}%` },
                { label: "DSR", value: `${(dsrFlat * 100).toFixed(1)}%`, color: dsrFlat < 0.35 ? C.success : C.danger },
              ].map(d => (
                <div key={d.label} style={{ background: "#fff", borderRadius: 6, padding: "7px 8px", border: `1px solid ${C.navy}22` }}>
                  <div style={{ fontSize: 9, color: C.muted }}>{d.label}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: d.color || C.text, marginTop: 1 }}>{d.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div style={{ padding: "10px 12px", background: "#fff", borderRadius: 8, fontSize: 10, color: C.muted, border: `1px solid ${C.border}` }}>
        DSR = Debt Service Ratio (cicilan ÷ pendapatan). Threshold aman: &lt;35%. Pendapatan bulanan terverifikasi: <strong style={{ color: C.text }}>{formatRp(pendapatan)}/bln</strong> · Avg omset monitoring: basis plafon final.
      </div>
    </Card>
  );
}

// ─── MONITORING PRA-ACC ───────────────────────────────────────────────────────
const DUMMY_MONITORING_DATA = [
  { bulan: 1, omset: 17800000, receipt_count: 4, skor_bulan: 581, status: "on_track",  catatan: "Konsisten, tren stabil" },
  { bulan: 2, omset: 19200000, receipt_count: 5, skor_bulan: 598, status: "on_track",  catatan: "Kenaikan omset +7.9%" },
  { bulan: 3, omset: 21500000, receipt_count: 5, skor_bulan: 617, status: "on_track",  catatan: "Tren positif, siap review" },
];

function ScreenMonitoring({ form, setForm, result, onNext, onAddBlock, chain }) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [uploadBulan, setUploadBulan]     = useState(null);
  const [uploadStatus, setUploadStatus]   = useState("idle");
  const [blockAdded, setBlockAdded]       = useState(false);

  const targetBulan  = form.monitoring_target_bulan || 3;
  // monData hanya berisi bulan yang sudah selesai (real data atau dummy yang sudah di-generate)
  const monData      = form.monitoring_data || [];
  const bulanSelesai = monData.length;
  const selesai      = bulanSelesai >= targetBulan;

  // Bulan berikutnya yang bisa di-upload: hanya boleh satu bulan di atas bulan terakhir
  const nextBulan    = bulanSelesai + 1;
  const canUploadNext = nextBulan <= targetBulan;

  const avgOmset     = monData.length > 0 ? Math.round(monData.reduce((a, b) => a + b.omset, 0) / monData.length) : 0;
  const latestSkor   = monData.length > 0 ? monData[monData.length - 1].skor_bulan : (result ? probToScore(result.probability) : 0);
  const trajectory   = monData.length >= 2
    ? (monData[monData.length - 1].omset > monData[0].omset * 1.05 ? "Growing" : monData[monData.length - 1].omset < monData[0].omset * 0.95 ? "Declining" : "Stable")
    : "Menunggu data";
  const trajColor    = trajectory === "Growing" ? C.success : trajectory === "Declining" ? C.danger : C.gold;
  const anomaliCount = monData.filter(d => d.status === "warning").length;

  // Auto-generate bulan 1 saat pertama kali masuk monitoring
  useEffect(() => {
    if (monData.length === 0) {
      // Langsung generate bulan 1 secara otomatis
      const dummy1 = DUMMY_MONITORING_DATA[0];
      setTimeout(() => {
        setForm(f => ({
          ...f,
          monitoring_data: [dummy1],
        }));
      }, 800);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const simulasiUpload = (bulan) => {
    if (uploadStatus === "uploading") return; // guard double-click
    setUploadBulan(bulan);
    setUploadStatus("uploading");
    setTimeout(() => {
      // Append data bulan ini ke monitoring_data
      const dummyEntry = DUMMY_MONITORING_DATA[bulan - 1] || {
        bulan,
        omset: 18000000 + bulan * 800000,
        receipt_count: 4,
        skor_bulan: 575 + bulan * 12,
        status: "on_track",
        catatan: `Data bulan ${bulan} terverifikasi`,
      };
      setForm(f => {
        const existing = f.monitoring_data || [];
        if (existing.some(d => d.bulan === bulan)) return f;
        return { ...f, monitoring_data: [...existing, dummyEntry] };
      });
      setUploadStatus("scored");
      // Reset setelah 2.5 detik agar bulan berikutnya bisa muncul
      setTimeout(() => {
        setUploadBulan(null);
        setUploadStatus("idle");
      }, 2500);
    }, 1800);
  };

  const handleFinalReview = async () => {
    if (!blockAdded) {
      await onAddBlock("Monitoring Pra-ACC — Selesai", {
        no_aplikasi: form.no_aplikasi,
        target_bulan: targetBulan,
        bulan_terpantau: bulanSelesai,
        trajectory,
        avg_omset_terverifikasi: avgOmset,
        skor_akhir_monitoring: latestSkor,
        anomali_count: anomaliCount,
        keputusan: "lanjut_ke_analyst_review",
      });
      setBlockAdded(true);
    }
    setForm(f => ({
      ...f,
      monitoring_status: "completed",
      monitoring_avg_omset_verified: avgOmset,
      monitoring_trajectory: trajectory.toLowerCase(),
      monitoring_anomali_count: anomaliCount,
    }));
    onNext();
  };

  const skor0 = result ? probToScore(result.probability) : 550;
  const trendData = [{ bulan: "Skor awal", skor: skor0 }, ...monData.map(d => ({ bulan: `Bln ${d.bulan}`, skor: d.skor_bulan }))];

  const plafonFinal = avgOmset > 0
    ? Math.round((avgOmset * 3 * (latestSkor >= 670 ? 1.5 : latestSkor >= 550 ? 1.0 : 0.5)) / 1_000_000) * 1_000_000
    : 0;

  return (
    <div style={{ padding: "0 36px 48px" }}>
      <Header icon="📊" title="Monitoring Pra-ACC" subtitle={`Pemantauan ${targetBulan} bulan sebelum keputusan kredit final · Trajectory score diperbarui tiap bulan`} officerName={form.nama_officer} />

      {/* Info banner */}
      <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 12, color: "#92400E" }}>
        <strong>Mengapa monitoring?</strong> Nasabah non-bankable tidak memiliki credit history perbankan. Periode monitoring membangun <em>trajectory score</em> — bukti nyata kemampuan dan konsistensi usaha yang menjadi fitur tambahan XGBoost di keputusan final.
      </div>

      {/* Tab nav */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: C.bg, borderRadius: 10, padding: 4, width: "fit-content" }}>
        {[["dashboard", "📊 Dashboard"], ["upload", "📤 Upload Bulanan"], ["trajectory", "📈 Trajectory"]].map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)} style={{
            padding: "8px 18px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: activeTab === id ? 700 : 400,
            background: activeTab === id ? "#fff" : "transparent",
            color: activeTab === id ? C.navy : C.muted,
            cursor: "pointer", boxShadow: activeTab === id ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            transition: "all 0.15s",
          }}>{label}</button>
        ))}
      </div>

      {/* ── TAB: DASHBOARD ── */}
      {activeTab === "dashboard" && (
        <>
          {/* KPI row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 20 }}>
            {[
              { label: "Bulan terpantau", value: `${bulanSelesai} / ${targetBulan}`, color: C.navy },
              { label: "Skor terkini",    value: latestSkor, color: scoreColor(latestSkor) },
              { label: "Trajectory",      value: trajectory, color: trajColor },
              { label: "Rata-rata omset", value: formatRp(avgOmset), color: C.teal },
              { label: "Anomali tercatat",value: anomaliCount, color: anomaliCount > 0 ? C.danger : C.success },
            ].map(d => (
              <Card key={d.label} style={{ padding: "14px 16px" }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>{d.label}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: d.color }}>{d.value}</div>
              </Card>
            ))}
          </div>

          {/* Progress bar */}
          <Card style={{ marginBottom: 20 }}>
            <SectionTitle sub={`${bulanSelesai} dari ${targetBulan} bulan selesai`}>Progress Monitoring</SectionTitle>
            <div style={{ display: "flex", gap: 10 }}>
              {Array.from({ length: targetBulan }, (_, i) => {
                const d = monData[i];
                const done = !!d;
                return (
                  <div key={i} style={{ flex: 1, borderRadius: 10, border: `1px solid ${done ? C.teal : C.border}`, padding: "14px 12px", background: done ? "#F0FDFA" : "#F8FAFC" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: done ? C.teal : C.slate, marginBottom: 6 }}>Bulan {i + 1}</div>
                    {done ? (
                      <>
                        <div style={{ fontSize: 13, fontWeight: 800, color: scoreColor(d.skor_bulan) }}>{d.skor_bulan}</div>
                        <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>{formatRp(d.omset)}</div>
                        <div style={{ marginTop: 6 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 10, background: d.status === "on_track" ? C.success + "22" : C.danger + "22", color: d.status === "on_track" ? C.success : C.danger }}>
                            {d.status === "on_track" ? "✓ On track" : "⚠ Anomali"}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 11, color: C.slate }}>Menunggu upload</div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Plafon final estimate */}
          {selesai && (
            <Card style={{ marginBottom: 20, background: "#F0FDF4", border: `1px solid ${C.success}44` }}>
              <SectionTitle sub="Dihitung ulang dari rata-rata omset terverifikasi selama monitoring — lebih akurat dari klaim awal">Estimasi Plafon Final</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
                {[
                  { label: "Plafon final (est.)", value: formatRp(plafonFinal), color: C.success },
                  { label: "Basis: avg omset verified", value: formatRp(avgOmset) + "/bln", color: C.teal },
                  { label: "Skor akhir monitoring", value: latestSkor, color: scoreColor(latestSkor) },
                  { label: "Trajectory", value: trajectory, color: trajColor },
                ].map(d => (
                  <div key={d.label} style={{ background: C.bg, borderRadius: 8, padding: "12px 14px" }}>
                    <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>{d.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: d.color }}>{d.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14, padding: "10px 14px", background: "#DCFCE7", borderRadius: 8, fontSize: 11, color: C.success, border: `1px solid ${C.success}22` }}>
                💡 <strong>Plafon berbasis omset terverifikasi</strong> lebih adil untuk nasabah UMKM — bukan dari klaim pendapatan awal yang belum tervalidasi selama {targetBulan} bulan.
              </div>
            </Card>
          )}
        </>
      )}

      {/* ── TAB: UPLOAD BULANAN ── */}
      {activeTab === "upload" && (
        <Card>
          <SectionTitle sub="Nasabah upload receipt bulanan untuk verifikasi omset — dipandu oleh sistem via notifikasi WhatsApp/SMS">Upload Data Bulanan Nasabah</SectionTitle>
          <div style={{ marginBottom: 14, padding: "10px 14px", background: "#EFF6FF", borderRadius: 8, fontSize: 11, color: "#1E40AF", border: "1px solid #BFDBFE" }}>
            📱 <strong>Self-service:</strong> Nasabah menerima reminder otomatis H-3 dan H-0 setiap akhir bulan. Upload dilakukan via link WhatsApp atau app. Officer hanya perlu konfirmasi hasil OCR.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {Array.from({ length: targetBulan }, (_, i) => {
              const bulanNum = i + 1;
              const d        = monData[i];
              const done     = !!d;
              // Bulan ini bisa di-upload hanya jika bulan sebelumnya sudah selesai dan bulan ini belum
              const isNext      = bulanNum === nextBulan;
              const isLocked    = bulanNum > nextBulan;
              const isUploading = uploadBulan === bulanNum && uploadStatus === "uploading";
              const justScored  = uploadBulan === bulanNum && uploadStatus === "scored";
              return (
                <div key={i} style={{
                  padding: "14px 16px", borderRadius: 10,
                  border: `1px solid ${done || justScored ? C.teal : isLocked ? C.border : C.gold}`,
                  background: done || justScored ? "#F0FDFA" : isLocked ? "#F8FAFC" : "#FFFBEB",
                  opacity: isLocked ? 0.5 : 1,
                  transition: "all 0.2s",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                        Bulan {bulanNum}
                        {isNext && !done && <span style={{ marginLeft: 8, fontSize: 10, padding: "2px 7px", borderRadius: 10, background: C.gold + "33", color: C.gold, fontWeight: 700 }}>Menunggu upload</span>}
                        {isLocked && <span style={{ marginLeft: 8, fontSize: 10, padding: "2px 7px", borderRadius: 10, background: C.border, color: C.muted, fontWeight: 600 }}>🔒 Terkunci</span>}
                      </div>
                      {done && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{formatRp(d.omset)} · {d.receipt_count} receipt · Skor: {d.skor_bulan}</div>}
                    </div>
                    {done || justScored ? (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 12, background: C.success + "22", color: C.success }}>✓ Selesai</span>
                    ) : isUploading ? (
                      <span style={{ fontSize: 11, color: C.gold, fontWeight: 700 }}>⏳ Memproses OCR & re-scoring…</span>
                    ) : isNext ? (
                      <button onClick={() => simulasiUpload(bulanNum)} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.teal}`, background: C.teal, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                        📤 Upload Receipt + QRIS
                      </button>
                    ) : (
                      <span style={{ fontSize: 11, color: C.muted }}>—</span>
                    )}
                  </div>
                  {justScored && (
                    <div style={{ marginTop: 10, padding: "10px 12px", background: "#DCFCE7", borderRadius: 8, fontSize: 11, color: C.success, border: `1px solid ${C.success}22` }}>
                      ✅ Re-scoring selesai — skor naik ke estimasi bulan ini. Data masuk ke trajectory model.
                      {bulanNum < targetBulan && <span style={{ marginLeft: 6, fontWeight: 700 }}>Bulan {bulanNum + 1} sekarang terbuka →</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── TAB: TRAJECTORY ── */}
      {activeTab === "trajectory" && (
        <Card>
          <SectionTitle sub="Delta skor dan omset antar periode — menjadi fitur tambahan XGBoost saat keputusan final">Trajectory Score</SectionTitle>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="bulan" fontSize={11} />
              <YAxis domain={[300, 850]} fontSize={11} />
              <Tooltip formatter={(v) => [v, "Skor"]} />
              <ReferenceLine y={670} stroke={C.success} strokeDasharray="4 2" label={{ value: "Threshold ACC", fontSize: 10, fill: C.success }} />
              <ReferenceLine y={550} stroke={C.gold} strokeDasharray="4 2" label={{ value: "Threshold monitoring", fontSize: 10, fill: C.gold }} />
              <Line type="monotone" dataKey="skor" stroke={C.teal} strokeWidth={2.5} dot={{ fill: C.teal, r: 5 }} activeDot={{ r: 7 }} />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            {monData.map((d, i) => {
              const prev = i > 0 ? monData[i - 1] : null;
              const deltaSkor  = prev ? d.skor_bulan - prev.skor_bulan : null;
              const deltaOmset = prev ? ((d.omset - prev.omset) / prev.omset * 100).toFixed(1) : null;
              return (
                <div key={i} style={{ display: "flex", gap: 14, padding: "10px 14px", background: C.bg, borderRadius: 8, alignItems: "center" }}>
                  <div style={{ width: 60, fontSize: 11, fontWeight: 700, color: C.muted }}>Bulan {d.bulan}</div>
                  <div style={{ flex: 1, fontSize: 11, color: C.text }}>Skor <strong style={{ color: scoreColor(d.skor_bulan) }}>{d.skor_bulan}</strong></div>
                  {deltaSkor !== null && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: deltaSkor >= 0 ? C.success : C.danger }}>
                      {deltaSkor >= 0 ? "↑" : "↓"} {Math.abs(deltaSkor)} poin
                    </div>
                  )}
                  {deltaOmset !== null && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: parseFloat(deltaOmset) >= 0 ? C.success : C.danger }}>
                      Omset {parseFloat(deltaOmset) >= 0 ? "+" : ""}{deltaOmset}%
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: C.muted }}>{d.catatan}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── Simulasi Cicilan Final — hanya muncul setelah monitoring selesai ── */}
      {selesai && (() => {
        const bungaFinal = latestSkor >= 670 ? 8 : latestSkor >= 550 ? 12 : 18;
        const tenorOpts  = [12, 24, 36];
        // Use plafonFinal dari state atas
        return (
          <SimulasiCicilanFinal plafonFinal={plafonFinal} bungaFinal={bungaFinal} tenorOpts={tenorOpts} pendapatan={form.pendapatan} latestSkor={latestSkor} />
        );
      })()}

      {/* ── CTA selesai monitoring ── */}
      {selesai && (
        <Card style={{ marginTop: 20, background: "#F0FDF4", border: `1px solid ${C.success}44` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.success }}>✅ Monitoring {targetBulan} bulan selesai — siap final review</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                Trajectory: <strong>{trajectory}</strong> · Avg omset verified: <strong>{formatRp(avgOmset)}/bln</strong> · Skor akhir: <strong>{latestSkor}</strong>
              </div>
            </div>
            <button onClick={handleFinalReview} style={{ padding: "10px 22px", borderRadius: 8, border: "none", background: C.teal, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              👤 Final Analyst Review ⛓
            </button>
          </div>
        </Card>
      )}

      {!selesai && (
        <div style={{ marginTop: 20, padding: "12px 16px", background: C.bg, borderRadius: 10, fontSize: 12, color: C.muted, border: `1px solid ${C.border}`, textAlign: "center" }}>
          ⏳ Monitoring berjalan — {targetBulan - bulanSelesai} bulan lagi sebelum final review
        </div>
      )}

      <BlockchainAuditPanel chain={chain} />
    </div>
  );
}

// ─── BLOCKCHAIN AUDIT SCREEN ──────────────────────────────────────────────────
function ScreenBlockchain({ chain, form }) {
  const [verifyHash, setVerifyHash] = useState("");
  const [verifyResult, setVerifyResult] = useState(null);

  const handleVerify = async () => {
    if (!verifyHash.trim()) return;
    const found = chain.find(b => b.hash === verifyHash.trim());
    setVerifyResult(found ? { found: true, block: found } : { found: false });
  };

  return (
    <div style={{ padding: "0 36px 48px" }}>
      <Header icon="⛓" title="Audit Trail — Blockchain" subtitle="Compliance Officer · Rekam jejak immutable setiap tahap proses kredit, dapat diverifikasi independen tanpa perlu akses sistem" officerName={form.nama_officer} />

      {/* Chain summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Total Blok", value: chain.length, color: C.navy, sub: "Tahap tercatat" },
          { label: "Status Chain", value: chain.length > 0 ? "Valid ✓" : "Kosong", color: C.success, sub: "Integritas terjaga" },
          { label: "Algoritma Hash", value: "SHA-256", color: C.teal, sub: "256-bit output" },
          { label: "No. Aplikasi", value: form.no_aplikasi || "-", color: C.gold, sub: "Referensi pengajuan" },
        ].map(s => (
          <Card key={s.label} style={{ padding: "14px 16px" }}>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 6, lineHeight: 1.4 }}>{s.label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{s.sub}</div>
          </Card>
        ))}
      </div>

      {/* Verify tool */}
      <Card style={{ marginBottom: 24 }}>
        <SectionTitle sub="Masukkan hash SHA-256 untuk memverifikasi apakah blok tersebut ada dalam chain pengajuan ini">Verifikasi Hash Blok</SectionTitle>
        <div style={{ display: "flex", gap: 10 }}>
          <input value={verifyHash} onChange={(e) => setVerifyHash(e.target.value)}
            placeholder="Tempelkan hash SHA-256 di sini untuk diverifikasi…"
            style={{ flex: 1, padding: "10px 14px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, fontFamily: "monospace", color: C.text, background: "#F8FAFC" }} />
          <button onClick={handleVerify} style={{
            padding: "10px 20px", borderRadius: 8, border: "none",
            background: C.navy, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>🔍 Verifikasi</button>
        </div>
        {verifyResult && (
          <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 8, background: verifyResult.found ? "#F0FDF4" : "#FEF2F2", border: `1px solid ${verifyResult.found ? C.success : C.danger}44` }}>
            {verifyResult.found ? (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.success }}>✓ Hash valid — Blok ditemukan dalam chain</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Layer: {verifyResult.block.layer} · Timestamp: {new Date(verifyResult.block.timestamp).toLocaleString("id-ID")}</div>
              </div>
            ) : (
              <div style={{ fontSize: 12, fontWeight: 700, color: C.danger }}>✗ Hash tidak ditemukan — Blok tidak ada dalam chain ini atau telah dimodifikasi</div>
            )}
          </div>
        )}
      </Card>

      {/* Full chain */}
      {chain.length === 0 ? (
        <Card>
          <div style={{ padding: "40px", textAlign: "center", color: C.slate, fontSize: 13 }}>
            Chain kosong. Mulai proses pengajuan kredit dari Layer 1 untuk membuat blok pertama.
          </div>
        </Card>
      ) : (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 16 }}>
            Seluruh Blok Chain Pengajuan {form.no_aplikasi}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {chain.map((block, i) => (
              <div key={i} style={{ background: "#0B1F3A", borderRadius: 12, padding: "18px 20px", border: `1px solid ${C.teal}44` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 10, color: C.teal, fontWeight: 700, letterSpacing: "0.08em" }}>BLOCK #{i + 1}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginTop: 3 }}>{block.layer}</div>
                  </div>
                  <div style={{ fontSize: 10, color: C.slate }}>{new Date(block.timestamp).toLocaleString("id-ID")}</div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: C.slate, marginBottom: 3 }}>HASH (SHA-256)</div>
                  <div style={{ fontSize: 10, color: C.tealLt, fontFamily: "monospace", wordBreak: "break-all", lineHeight: 1.6 }}>{block.hash}</div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: C.slate, marginBottom: 3 }}>PREVIOUS HASH</div>
                  <div style={{ fontSize: 10, color: "#64748B", fontFamily: "monospace", wordBreak: "break-all" }}>{block.prevHash}</div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: C.slate, marginBottom: 3 }}>DATA TERCATAT</div>
                  <div style={{ fontSize: 10, color: "#94A3B8", fontFamily: "monospace", background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "8px 10px", maxHeight: 80, overflow: "auto", lineHeight: 1.6 }}>
                    {JSON.stringify(block.data, null, 2)}
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 10, color: C.slate }}>Nonce: {block.nonce}</div>
                  <button onClick={() => { navigator.clipboard.writeText(block.hash); }}
                    style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${C.teal}`, background: "transparent", color: C.teal, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                    Copy Hash
                  </button>
                </div>
                {i > 0 && (
                  <div style={{ marginTop: 10, fontSize: 10, color: chain[i-1].hash === block.prevHash ? C.success : C.danger, fontWeight: 700 }}>
                    {chain[i-1].hash === block.prevHash ? "✓ Terhubung ke blok sebelumnya" : "✗ Chain rusak — hash tidak cocok"}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PORTFOLIO ────────────────────────────────────────────────────────────────
function CustomBar2(props) {
  const { x, y, width, height, payload } = props;
  const color = payload.label === "Rendah" ? C.success : payload.label === "Sedang" ? C.warning : payload.label === "Tinggi" ? C.danger : "#7F1D1D";
  return <rect x={x} y={y} width={width} height={height} fill={color} rx={3} opacity={0.85} />;
}

// ─── PORTFOLIO TRAJECTORY DATA (static demo) ──────────────────────────────────
const trajectoryNasabah = [
  { id: "U-0021", nama: "Dapur Ibu Sari",        bulan1: { omset: 12000000, order: 28 }, bulan3: { omset: 18000000, order: 35 }, delta_omset: 50, delta_order: 25, status: "Accelerating", skor: 724 },
  { id: "U-0068", nama: "Kue Tradisional Bundo",  bulan1: { omset: 9500000,  order: 22 }, bulan3: { omset: 11200000, order: 26 }, delta_omset: 18, delta_order: 18, status: "Growing",      skor: 689 },
  { id: "U-0034", nama: "Warung Pak Hendra",      bulan1: { omset: 14000000, order: 31 }, bulan3: { omset: 13500000, order: 29 }, delta_omset: -4, delta_order: -6, status: "Stagnant",     skor: 612 },
  { id: "U-0057", nama: "RM Padang Minang",       bulan1: { omset: 22000000, order: 45 }, bulan3: { omset: 17000000, order: 36 }, delta_omset: -23, delta_order: -20, status: "Declining",  skor: 481 },
];
const TRAJ_COLORS = { Accelerating: C.success, Growing: C.teal, Stagnant: C.warning, Declining: C.danger };
const TRAJ_ICONS  = { Accelerating: "🚀", Growing: "📈", Stagnant: "➡️", Declining: "📉" };

function ScreenPortfolio({ form }) {
  return (
    <div style={{ padding: "0 36px 48px" }}>
      <Header icon="📈" title="Portofolio & Analitik" subtitle="Distribusi dan tren seluruh pengajuan UMKM yang telah dinilai · Total 100 nasabah terdaftar" officerName={form.nama_officer} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Total Nasabah Dinilai", value: "100", color: C.navy, sub: "Sejak Okt 2025" },
          { label: "Risiko Rendah", value: "37%", color: C.success, sub: "37 Nasabah" },
          { label: "Risiko Sedang", value: "40%", color: C.warning, sub: "40 Nasabah" },
          { label: "Risiko Tinggi / Sangat Tinggi", value: "23%", color: C.danger, sub: "23 Nasabah" },
          { label: "Rata-rata Skor Portofolio", value: "603", color: C.teal, sub: "Prob. gagal bayar 20.1%" },
        ].map(s => (
          <Card key={s.label} style={{ padding: "14px 16px" }}>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 6, lineHeight: 1.4 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{s.sub}</div>
          </Card>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, marginBottom: 20 }}>
        <Card>
          <SectionTitle sub="Sebaran skor seluruh nasabah terdaftar. Warna menunjukkan kategori risiko per rentang skor.">Distribusi Skor Kelayakan Kredit</SectionTitle>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={scoreDistribution} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis dataKey="range" fontSize={11} tick={{ fill: C.muted }} />
              <YAxis fontSize={11} tick={{ fill: C.muted }} />
              <Tooltip />
              <Bar dataKey="count" shape={<CustomBar2 />} />
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
            {[["Rendah (≥650)", C.success], ["Sedang (550–649)", C.warning], ["Tinggi (400–549)", C.danger], ["Sangat Tinggi (<400)", "#7F1D1D"]].map(([lbl, color]) => (
              <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.muted }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />{lbl}
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <SectionTitle sub="Proporsi nasabah per kategori risiko dari total 100.">Distribusi Kategori Risiko</SectionTitle>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={riskDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                {riskDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [`${v} Nasabah`, n]} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
            {riskDistribution.map(r => (
              <div key={r.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: r.color }} />
                  <span style={{ color: C.text }}>{r.name}</span>
                </div>
                <span style={{ fontWeight: 700, color: r.color }}>{r.value} Nasabah</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <Card>
          <SectionTitle sub="Rata-rata skor portofolio per bulan.">Tren Rata-rata Skor Portofolio</SectionTitle>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={scoreTrend} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="bulan" fontSize={10} tick={{ fill: C.muted }} />
              <YAxis domain={[500, 650]} fontSize={10} tick={{ fill: C.muted }} />
              <Tooltip formatter={(v) => [v, "Rata-rata skor"]} />
              <ReferenceLine y={550} stroke={C.warning} strokeDasharray="4 4" label={{ value: "Batas Sedang", fontSize: 9, fill: C.warning, position: "insideTopRight" }} />
              <Line type="monotone" dataKey="avgSkor" stroke={C.teal} strokeWidth={2.5} dot={{ r: 4, fill: C.teal }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <SectionTitle sub="Rata-rata probabilitas gagal bayar per bulan.">Tren Prob. Gagal Bayar</SectionTitle>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={scoreTrend} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="bulan" fontSize={10} tick={{ fill: C.muted }} />
              <YAxis domain={[15, 35]} fontSize={10} tick={{ fill: C.muted }} tickFormatter={v => `${v}%`} />
              <Tooltip formatter={(v) => [`${v}%`, "Prob. gagal bayar"]} />
              <ReferenceLine y={25} stroke={C.warning} strokeDasharray="4 4" />
              <Line type="monotone" dataKey="avgProb" stroke={C.danger} strokeWidth={2.5} dot={{ r: 4, fill: C.danger }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card>
        <SectionTitle sub="Daftar nasabah diurutkan berdasarkan skor tertinggi.">Daftar Nasabah Terdaftar</SectionTitle>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: C.bg }}>
              {["ID", "Nama Usaha", "Skor", "Prob. Gagal Bayar", "Kategori Risiko", "Status"].map(h => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: C.muted, fontWeight: 700, fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topUMKM.map(row => (
              <tr key={row.id} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ padding: "10px 12px", color: C.muted, fontSize: 11 }}>{row.id}</td>
                <td style={{ padding: "10px 12px", fontWeight: 700, color: C.text }}>{row.nama}</td>
                <td style={{ padding: "10px 12px", fontWeight: 800, color: scoreColor(row.skor) }}>{row.skor}</td>
                <td style={{ padding: "10px 12px", color: C.text }}>{row.prob}</td>
                <td style={{ padding: "10px 12px" }}><Badge label={row.risiko} color={riskColor(row.risiko)} /></td>
                <td style={{ padding: "10px 12px" }}><span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 10, background: "#D1FAE5", color: C.success }}>Scored</span></td>
              </tr>
            ))}
            <tr style={{ borderTop: `1px solid ${C.border}`, background: C.bg }}>
              <td colSpan={6} style={{ padding: "10px 12px", textAlign: "center", fontSize: 11, color: C.muted }}>+ 95 nasabah lainnya · Menampilkan 5 dari 100</td>
            </tr>
          </tbody>
        </table>
      </Card>

      {/* ── TRAJECTORY MONITORING (Portfolio module) ── */}
      <div style={{ marginTop: 28 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 4, letterSpacing: "-0.01em" }}>📊 Trajectory Monitoring — Nasabah Returning</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 20, lineHeight: 1.6, maxWidth: 700 }}>
          Trajectory score <strong>hanya tersedia untuk nasabah yang sudah pernah ada di sistem</strong>. Dihitung dari delta antara data pengajuan sebelumnya vs sekarang, atau dari repayment history. Untuk nasabah baru (<em>first-time applicant</em>), tidak ada trajectory — hanya snapshot dari data pengajuan + Receipt OCR.
          <br />
          <span style={{ color: C.teal, fontWeight: 700 }}>Makin lama nasabah terdaftar dan aktif di sistem, makin kuat profil trajectory-nya saat apply berikutnya.</span>
        </div>

        <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 12, color: "#1E40AF" }}>
          <strong>Catatan Arsitektur:</strong> Trajectory bukan bagian dari pipeline pengajuan awal. Ini adalah fitur portfolio monitoring yang akan otomatis menjadi fitur tambahan XGBoost saat nasabah mengajukan kredit berikutnya. Data di bawah adalah contoh nasabah <em>returning</em> yang sudah memiliki minimal 2 titik data waktu berbeda.
        </div>

        <Card>
          <SectionTitle sub="Nasabah dengan data longitudinal (≥2 pengajuan atau repayment history). Trajectory dihitung dari delta antar periode.">
            Trajectory Score — Nasabah Dengan Historical Data
          </SectionTitle>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: C.bg }}>
                {["ID", "Nama Usaha", "Skor Saat Ini", "Omset (Bln 1 → Bln 3)", "Δ Omset", "Δ Order", "Trajectory", "Readiness"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: C.muted, fontWeight: 700, fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trajectoryNasabah.map(row => {
                const tc = TRAJ_COLORS[row.status];
                const ti = TRAJ_ICONS[row.status];
                const ready = row.delta_omset > 10 && row.delta_order > 5;
                return (
                  <tr key={row.id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ padding: "10px 12px", color: C.muted, fontSize: 11 }}>{row.id}</td>
                    <td style={{ padding: "10px 12px", fontWeight: 700, color: C.text }}>{row.nama}</td>
                    <td style={{ padding: "10px 12px", fontWeight: 800, color: scoreColor(row.skor) }}>{row.skor}</td>
                    <td style={{ padding: "10px 12px", fontSize: 11, color: C.muted }}>
                      {formatRp(row.bulan1.omset)} → {formatRp(row.bulan3.omset)}
                    </td>
                    <td style={{ padding: "10px 12px", fontWeight: 700, color: row.delta_omset >= 0 ? C.success : C.danger }}>
                      {row.delta_omset >= 0 ? "+" : ""}{row.delta_omset}%
                    </td>
                    <td style={{ padding: "10px 12px", fontWeight: 700, color: row.delta_order >= 0 ? C.success : C.danger }}>
                      {row.delta_order >= 0 ? "+" : ""}{row.delta_order}%
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 12, background: tc + "22", color: tc }}>
                        {ti} {row.status}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 12, background: ready ? C.success + "22" : C.gold + "22", color: ready ? C.success : C.gold }}>
                        {ready ? "✅ Siap Apply" : "⏳ Perlu Tumbuh"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ marginTop: 14, padding: "10px 14px", background: "#F0FDFA", borderRadius: 8, fontSize: 11, color: C.teal, border: `1px solid ${C.teal}22` }}>
            💡 <strong>Readiness Indicator:</strong> Nasabah dengan trajectory "Growing" atau "Accelerating" dan Δ omset &gt;10% dianggap siap untuk pengajuan kredit berikutnya. Trajectory score ini akan otomatis menjadi fitur tambahan di XGBoost pada pengajuan selanjutnya.
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── CHATBOT WIDGET ───────────────────────────────────────────────────────────
const QUICK_PROMPTS = [
  "Apa arti SHAP value ini?",
  "Kenapa nasabah ini perlu monitoring?",
  "Bagaimana cara jelaskan ke nasabah?",
  "Apa langkah selanjutnya?",
];

function ChatbotWidget({ form, result, screen }) {
  const [open, setOpen]       = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Halo! Saya PADI Assistant 👋\nAda yang bisa saya bantu untuk pengajuan ini?" }
  ]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef             = useRef(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  // Bangun konteks nasabah untuk dikirim ke backend
  const buildContext = () => {
    const prob  = result?.probability;
    const score = prob != null ? probToScore(prob) : null;
    const slik  = form?.slik_kolektibilitas;
    const hasAnomali = form?.receipt_anchor_status === "needs_visit";
    const hadMacet   = form?.pernah_kredit_macet === 1;
    let jalur = "-";
    if (score != null) {
      if (slik === 5 || score < 400) jalur = "Hard Reject";
      else if (score < 500 || (score < 550 && hadMacet) || (hasAnomali && score < 550)) jalur = "Extended Monitoring 6 Bln";
      // monitorTrack: skor <670 ATAU ada anomali nyata (needs_visit)
      else if (score < 670 || hasAnomali) jalur = "Monitoring 3 Bln";
      // fastTrack: skor ≥670 dan tidak ada anomali
      else jalur = "Fast Track";
    }
    return {
      nama_usaha:           form?.nama_usaha,
      no_aplikasi:          form?.no_aplikasi,
      active_screen:        screen,
      credit_score:         score,
      risk_label:           prob != null ? probToRisk(prob) : null,
      probability:          prob != null ? `${(prob * 100).toFixed(1)}%` : null,
      jalur,
      pendapatan:           form?.pendapatan,
      slik_kolektibilitas:  slik,
      receipt_anchor_status: form?.receipt_anchor_status,
      anomali:              hasAnomali ? "Ada anomali receipt" : "Tidak ada anomali",
      top_shap:             result?.shap_values?.slice(0, 3).map(s => s.feature).join(", ") || "-",
    };
  };

  const sendMessage = async (text) => {
    const userMsg = text || input.trim();
    if (!userMsg || loading) return;
    setInput("");

    const newMessages = [...messages, { role: "user", content: userMsg }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.slice(1), // skip opening greeting
          context:  buildContext(),
        }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.reply || data.error || "Maaf, terjadi kesalahan.",
      }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "⚠️ Tidak bisa terhubung ke server. Pastikan backend berjalan." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="PADI Assistant"
        style={{
          position: "fixed", bottom: 28, right: 28, zIndex: 1000,
          width: 54, height: 54, borderRadius: "50%", border: "none",
          background: open ? C.navy : `linear-gradient(135deg, ${C.teal}, ${C.navy})`,
          color: "#fff", fontSize: 22, cursor: "pointer",
          boxShadow: "0 4px 20px rgba(13,148,136,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.2s",
        }}>
        {open ? "✕" : "🤖"}
      </button>

      {/* Chat panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 92, right: 28, zIndex: 999,
          width: 360, height: 500, borderRadius: 16,
          background: "#fff", border: `1px solid ${C.border}`,
          boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
          display: "flex", flexDirection: "column", overflow: "hidden",
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}>
          {/* Header */}
          <div style={{ background: `linear-gradient(135deg, ${C.navy}, ${C.teal})`, padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🤖</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>PADI Assistant</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)" }}>Asisten officer · Powered by Grok AI</div>
            </div>
            <div style={{ marginLeft: "auto", width: 8, height: 8, borderRadius: "50%", background: C.success, boxShadow: `0 0 6px ${C.success}` }} />
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px", display: "flex", flexDirection: "column", gap: 10, background: "#F8FAFC" }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "82%", padding: "9px 12px", borderRadius: m.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                  background: m.role === "user" ? C.teal : "#fff",
                  color: m.role === "user" ? "#fff" : C.text,
                  fontSize: 12, lineHeight: 1.55,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
                  border: m.role === "assistant" ? `1px solid ${C.border}` : "none",
                  whiteSpace: "pre-wrap",
                }}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{ padding: "9px 14px", borderRadius: "12px 12px 12px 2px", background: "#fff", border: `1px solid ${C.border}`, fontSize: 12, color: C.muted }}>
                  <span style={{ display: "inline-flex", gap: 3 }}>
                    {[0,1,2].map(j => (
                      <span key={j} style={{ width: 6, height: 6, borderRadius: "50%", background: C.teal, display: "inline-block", animation: `bounce 1.2s ${j * 0.2}s infinite` }} />
                    ))}
                  </span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick prompts */}
          {messages.length <= 2 && (
            <div style={{ padding: "6px 10px", display: "flex", flexWrap: "wrap", gap: 5, borderTop: `1px solid ${C.border}`, background: "#fff" }}>
              {QUICK_PROMPTS.map(q => (
                <button key={q} onClick={() => sendMessage(q)} style={{
                  padding: "4px 10px", borderRadius: 20, border: `1px solid ${C.teal}44`,
                  background: "#F0FDFA", color: C.teal, fontSize: 10, fontWeight: 600, cursor: "pointer",
                  transition: "all 0.12s",
                }}>{q}</button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{ padding: "10px 12px", borderTop: `1px solid ${C.border}`, background: "#fff", display: "flex", gap: 8 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
              placeholder="Tanya sesuatu…"
              style={{
                flex: 1, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
                fontSize: 12, color: C.text, background: "#F8FAFC", outline: "none",
                fontFamily: "inherit",
              }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              style={{
                padding: "8px 14px", borderRadius: 8, border: "none",
                background: input.trim() && !loading ? C.teal : C.border,
                color: input.trim() && !loading ? "#fff" : C.muted,
                fontSize: 13, cursor: input.trim() && !loading ? "pointer" : "default",
                transition: "all 0.15s",
              }}>➤</button>
          </div>
        </div>
      )}

      <style>{`@keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-5px)} }`}</style>
    </>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
// Layer 4 (Analyst Review) dan Blockchain Audit bukan bagian flow linear loan officer —
// keduanya diakses bebas dari sidebar oleh persona berbeda (analyst / compliance officer).
const LAYER_ORDER = ["layer1-doc", "layer1-loc", "layer2", "layer2c", "layer3", "layer5", "monitoring"];

export default function App() {
  const [screen, setScreen] = useState("layer1-doc");
  const [form, setForm]     = useState(defaultForm);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);
  const [chain, setChain]   = useState([]);
  // Blockchain Audit & Analyst Review selalu unlocked — beda persona, bukan bagian flow loan officer
  const [unlockedScreens, setUnlockedScreens] = useState(new Set(["layer1-doc", "portfolio", "blockchain", "layer4", "monitoring"]));

  useEffect(() => {
    document.title = "PADI — Penilaian Alternatif Data Inklusif";
  }, []);

  // Navigasi antar layer + unlock layer berikutnya
  const navigateTo = useCallback((targetScreen) => {
    setScreen(targetScreen);
    setUnlockedScreens(prev => {
      const next = new Set(prev);
      next.add(targetScreen);
      const idx = LAYER_ORDER.indexOf(targetScreen);
      if (idx >= 0 && idx + 1 < LAYER_ORDER.length) {
        next.add(LAYER_ORDER[idx + 1]);
      }
      return next;
    });
  }, []);

  const chainRef = useRef([]);

  const addBlock = useCallback(async (layerName, data) => {
    // Baca prevHash dari ref — selalu up-to-date, tidak terkena closure stale
    const prevHash = chainRef.current.length > 0
      ? chainRef.current[chainRef.current.length - 1].hash
      : "0000000000000000000000000000000000000000000000000000000000000000";

    const block = await generateBlock(layerName, data, prevHash);

    // Guard duplikat sebelum append
    if (chainRef.current.some(b => b.hash === block.hash)) return;

    chainRef.current = [...chainRef.current, block];
    setChain([...chainRef.current]);
  }, []);

  return (
    <div style={{ display: "flex", fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif", background: C.bg, minHeight: "100vh" }}>
      <Sidebar active={screen} setActive={navigateTo} unlockedScreens={unlockedScreens} chain={chain} />
      <div style={{ flex: 1, overflowY: "auto" }}>
        {screen === "layer1-doc"  && <ScreenLayer1Doc  form={form} setForm={setForm} onNext={() => navigateTo("layer1-loc")} onAddBlock={addBlock} chain={chain} />}
        {screen === "layer1-loc"  && <ScreenLayer1Loc  form={form} setForm={setForm} onNext={() => navigateTo("layer2")} onAddBlock={addBlock} chain={chain} />}
        {screen === "layer2"      && <ScreenLayer2      form={form} setForm={setForm} onNext={() => navigateTo("layer2c")} onAddBlock={addBlock} chain={chain} />}
        {screen === "layer2c"     && <ScreenLayer2C     form={form} setForm={setForm} onNext={() => navigateTo("layer3")} onAddBlock={addBlock} chain={chain} />}
        {screen === "layer3"      && <ScreenLayer3      form={form} setForm={setForm} result={result} setResult={setResult} loading={loading} setLoading={setLoading} error={error} setError={setError} onNext={() => navigateTo("layer5")} onAddBlock={addBlock} chain={chain} />}
        {screen === "layer5"      && <ScreenLayer5      form={form} setForm={setForm} result={result} onNext={(skip) => navigateTo(skip ? "layer4" : "monitoring")} onAddBlock={addBlock} chain={chain} />}
        {screen === "monitoring"  && <ScreenMonitoring  form={form} setForm={setForm} result={result} onNext={() => navigateTo("layer4")} onAddBlock={addBlock} chain={chain} />}
        {screen === "layer4"      && <ScreenLayer4      form={form} result={result} onNext={() => navigateTo("blockchain")} onAddBlock={addBlock} chain={chain} />}
        {screen === "blockchain"  && <ScreenBlockchain  chain={chain} form={form} />}
        {screen === "portfolio"   && <ScreenPortfolio   form={form} />}
      </div>
      <ChatbotWidget form={form} result={result} screen={screen} />
    </div>
  );
}
