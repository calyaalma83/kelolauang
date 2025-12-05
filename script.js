import {
  getFirestore,
  doc,
  deleteDoc,
  collection,
  addDoc,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import { getApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";

const app = getApp();
const db = getFirestore(app);

let transactions = {};
let currentMonth = "";
let expenseChart = null;

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatCurrency(amount) {
  if (!amount && amount !== 0) amount = 0;
  return "Rp " + amount.toLocaleString("id-ID");
}

function formatJoinDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function getMonthName(monthKey) {
  const [year, month] = monthKey.split("-");
  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  const idx = Math.max(0, Math.min(11, parseInt(month) - 1));
  return `${months[idx]} ${year}`;
}

async function loadTransactionsFromFirestore() {
  const user = window.getFirebaseUser();
  if (!user) return;

  const uid = user.uid;
  const userTransCol = collection(db, "users", uid, "transactions");
  const snapshot = await getDocs(userTransCol);

  transactions = {}; // reset data

  snapshot.forEach(docItem => {
    const data = docItem.data();
    const month = data.month || getCurrentMonth();

    if (!transactions[month]) transactions[month] = [];

    transactions[month].push({
      ...data,
      id: docItem.id
    });
  });

  if (!transactions[currentMonth]) {
    transactions[currentMonth] = [];
  }

  updateDashboard();
  updateHistory();
  updateProfile();
  updateExpenseChart();
}

async function saveTransactionToFirestore(t) {
  const user = window.getFirebaseUser();
  if (!user) return;
  const uid = user.uid;

  // Tentukan bulan berdasarkan tanggal transaksi
  const dt = new Date(t.date);
  const monthKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;

  const docRef = await addDoc(collection(db, "users", uid, "transactions"), {
    ...t,
    month: monthKey
  });

  t.month = monthKey; // simpan juga di memory
  t.id = docRef.id;
}

async function deleteTransaction(docId) {
  if (!confirm("Yakin ingin menghapus transaksi ini?")) return;

  const user = window.getFirebaseUser();
  if (!user) return;

  const uid = user.uid;

  try {
    // Hapus dari Firestore
    await deleteDoc(doc(db, "users", uid, "transactions", docId));
  } catch (err) {
    console.error("Gagal menghapus di Firestore:", err);
    // tetap lanjut coba hapus dari memory agar UI sinkron
  }

  // Hapus dari memory lokal (cari di semua bulan)
  for (const monthKey of Object.keys(transactions)) {
    const idx = transactions[monthKey].findIndex(it => it.id === docId);
    if (idx !== -1) {
      transactions[monthKey].splice(idx, 1);
      break;
    }
  }

  // refresh UI
  updateDashboard();
  updateHistory();
  updateProfile();
  updateExpenseChart();
}

window.deleteTransaction = deleteTransaction;

function initializeApp() {
  currentMonth = getCurrentMonth();
  const dateEl = document.getElementById("date");
  if (dateEl) dateEl.valueAsDate = new Date();
  loadTransactionsFromFirestore();
}

window.startFinanceApp = initializeApp;

function showPage(pageId) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  const target = document.getElementById(pageId);
  if (target) target.classList.add("active");

  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));

  if (pageId === "dashboard-page") {
    document.querySelectorAll(".nav-item")[0]?.classList.add("active");
    updateDashboard();
  } else if (pageId === "history-page") {
    document.querySelectorAll(".nav-item")[1]?.classList.add("active");
    updateHistory();
  } else if (pageId === "profile-page") {
    document.querySelectorAll(".nav-item")[2]?.classList.add("active");
    updateProfile();
  }
}

window.showPage = showPage;

function updateDashboard() {
  const monthData = transactions[currentMonth] || [];
  const filterEl = document.getElementById("filter-method");
  const filterMethod = filterEl ? filterEl.value : "all";

  // FILTER DATA
  const filtered = filterMethod === "all"
    ? monthData
    : monthData.filter(t => t.payment === filterMethod);

  // Hitung total income & expense
  let totalIncome = 0;
  let totalExpense = 0;

  filtered.forEach(t => {
    if (t.type === "income") totalIncome += Number(t.amount || 0);
    else totalExpense += Number(t.amount || 0);
  });

  // Update card summary
  const elTotalIncome = document.getElementById("total-income");
  const elTotalExpense = document.getElementById("total-expense");
  const elBalance = document.getElementById("balance");
  if (elTotalIncome) elTotalIncome.textContent = formatCurrency(totalIncome);
  if (elTotalExpense) elTotalExpense.textContent = formatCurrency(totalExpense);
  if (elBalance) elBalance.textContent = formatCurrency(totalIncome - totalExpense);

  // Render table
  const tbody = document.getElementById("transactions-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="6" style="text-align:center;color:#999;padding:20px;">
        Tidak ada transaksi untuk metode ini
      </td></tr>`;
    // refresh insight too
    generateSmartInsight();
    return;
  }

  filtered.forEach((t) => {
    const row = tbody.insertRow();
    row.innerHTML = `
      <td>${formatDate(t.date)}</td>
      <td>${t.description}</td>
      <td><span class="${t.type}">${t.type === "income" ? "Pemasukan" : "Pengeluaran"}</span></td>
      <td>${t.payment}</td>
      <td class="${t.type}">${formatCurrency(Number(t.amount || 0))}</td>
      <td>
        <button class="delete-btn" onclick="deleteTransaction('${t.id}')">
          Hapus
        </button>
      </td>
    `;
  });

  // update insight
  generateSmartInsight();
}

const filterEl = document.getElementById("filter-method");
if (filterEl) filterEl.addEventListener("change", updateDashboard);

function updateHistory() {
  const grid = document.getElementById("month-grid");
  if (!grid) return;
  grid.innerHTML = "";

  const keys = Object.keys(transactions)
    .filter(m => m !== currentMonth)  
    .sort();

  if (keys.length === 0) {
    grid.innerHTML = `
      <p style="text-align:center;color:#999;padding:40px;">
        Belum ada data bulan lainnya
      </p>`;
    const chartCanvas = document.getElementById("expenseChart");
    if (chartCanvas) chartCanvas.style.display = "none";
    return;
  }

  // Tampilkan grafik (jika ada)
  const chartCanvas = document.getElementById("expenseChart");
  if (chartCanvas) chartCanvas.style.display = "";

  updateExpenseChart(); // build chart berdasarkan data (termasuk currentMonth)

  keys.forEach(monthKey => {
    const data = transactions[monthKey] || [];
    let income = 0;
    let expense = 0;

    data.forEach(t => {
      if (t.type === "income") income += Number(t.amount || 0);
      else expense += Number(t.amount || 0);
    });

    const card = document.createElement("div");
    card.className = "month-card";
    card.onclick = () => showMonthDetail(monthKey);
    card.innerHTML = `
      <h3>📅 ${getMonthName(monthKey)}</h3>
      <div class="stat"><span>Pemasukan:</span> <span class="income">${formatCurrency(income)}</span></div>
      <div class="stat"><span>Pengeluaran:</span> <span class="expense">${formatCurrency(expense)}</span></div>
      <div class="stat"><span>Saldo:</span> <span style="font-weight:bold;color:#1976d2;">${formatCurrency(income - expense)}</span></div>
      <div class="stat"><span>Transaksi:</span> <span>${data.length} data</span></div>
    `;
    grid.appendChild(card);
  });
}

// perbaikan: fungsi menerima monthKey sebagai parameter
function showMonthDetail(monthKey) {
  if (!monthKey) return;
  showPage("month-detail-page");
  const data = transactions[monthKey] || [];

  document.getElementById("month-detail-title").textContent = "Detail - " + getMonthName(monthKey);

  let income = 0;
  let expense = 0;

  data.forEach(t => {
    if (t.type === "income") income += Number(t.amount || 0);
    else expense += Number(t.amount || 0);
  });

  document.getElementById("month-detail-income").textContent = formatCurrency(income);
  document.getElementById("month-detail-expense").textContent = formatCurrency(expense);
  document.getElementById("month-detail-balance").textContent = formatCurrency(income - expense);

  const tbody = document.getElementById("month-detail-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:#777;">Tidak ada transaksi bulan ini</td></tr>`;
    return;
  }

  data.forEach(t => {
    const row = tbody.insertRow();
    row.innerHTML = `
      <td>${formatDate(t.date)}</td>
      <td>${t.description}</td>
      <td>${t.type === "income" ? "Pemasukan" : "Pengeluaran"}</td>
      <td>${t.payment}</td>
      <td>${formatCurrency(Number(t.amount || 0))}</td>
    `;
  });
}

function updateExpenseChart() {
  // ambil semua month keys yang ada data, urutkan, ambil max 12 (terakhir)
  const allMonths = Object.keys(transactions)
    .filter(k => (transactions[k] && transactions[k].length > 0))
    .sort();

  // ambil 12 terakhir
  const last12 = allMonths.slice(Math.max(0, allMonths.length - 12));

  // jika tidak ada data, hide chart
  if (last12.length === 0) {
    const canvas = document.getElementById("expenseChart");
    if (canvas) canvas.style.display = "none";
    return;
  }

  const labels = [];
  const expenseValues = [];

  last12.forEach(m => {
    const data = transactions[m] || [];
    const totalExpense = data
      .filter(t => t.type === "expense")
      .reduce((a, b) => a + Number(b.amount || 0), 0);

    labels.push(getMonthName(m));
    expenseValues.push(totalExpense);
  });

  if (expenseChart !== null) {
    expenseChart.destroy();
    expenseChart = null;
  }

  const ctx = document.getElementById("expenseChart");
  if (!ctx) return;

  const chartCtx = ctx.getContext("2d");

  expenseChart = new Chart(chartCtx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Pengeluaran (Rp)",
          data: expenseValues,
          borderWidth: 3,
          tension: 0.3,
          fill: false,
          pointRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: true }
      },
      scales: {
        y: {
          ticks: {
            callback: function (value) {
              return "Rp " + Number(value).toLocaleString("id-ID");
            }
          }
        }
      }
    }
  });
}

function updateProfile() {
  const user = window.getFirebaseUser();
  const localUser = JSON.parse(localStorage.getItem("keloladuit_user") || "{}");

  const name =
    (user && user.displayName) ||
    localUser.fullname ||
    localUser.displayName ||
    "Pengguna KelolaDuit";

  const photo =
    (user && user.photoURL) ||
    localUser.photoURL ||
    `https://ui-avatars.com/api/?background=1976d2&color=fff&name=${encodeURIComponent(name)}`;

  const titleEl = document.querySelector(".profile-info h2");
  if (titleEl) titleEl.textContent = name;

  const avatarEl = document.querySelector(".profile-avatar");
  if (avatarEl) {
    avatarEl.innerHTML = `<img src="${photo}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;">`;
  }

  let joinDate = user?.metadata?.creationTime
    ? formatJoinDate(user.metadata.creationTime)
    : "-";

  const joinEl = document.getElementById("profile-join-date");
  if (joinEl) joinEl.textContent = joinDate;

  let totalTransactions = 0;
  let totalIncome = 0;
  let methods = {};

  Object.values(transactions).forEach(data => {
    totalTransactions += data.length;
    data.forEach(t => {
      methods[t.payment] = (methods[t.payment] || 0) + 1;
      if (t.type === "income") totalIncome += Number(t.amount || 0);
    });
  });

  const favMethod = Object.keys(methods).length
    ? Object.keys(methods).reduce((a, b) => (methods[a] > methods[b] ? a : b))
    : "-";

  const months = Object.keys(transactions).length;

  document.getElementById("profile-total-transactions").textContent = totalTransactions;
  document.getElementById("profile-total-months").textContent = months;
  document.getElementById("profile-fav-method").textContent = favMethod;
  document.getElementById("profile-avg-month").textContent = formatCurrency(
    months ? Math.round(totalIncome / months) : 0
  );
}

function generateSmartInsight() {
  const monthData = transactions[currentMonth] || [];

  if (monthData.length === 0) {
    const el = document.getElementById("insight-content");
    if (el) el.innerHTML = "<p style='color:#777'>Belum ada data bulan ini</p>";
    return;
  }

  const totalIncome = monthData
    .filter(t => t.type === "income")
    .reduce((a, b) => a + Number(b.amount || 0), 0);

  const totalExpense = monthData
    .filter(t => t.type === "expense")
    .reduce((a, b) => a + Number(b.amount || 0), 0);

  const methods = {};
  monthData.forEach(t => {
    methods[t.payment] = (methods[t.payment] || 0) + 1;
  });

  const favMethod =
    Object.keys(methods).length === 0
      ? "-"
      : Object.keys(methods).reduce((a, b) =>
          methods[a] > methods[b] ? a : b
        );

  let insight = `
    <p>📈 Pemasukan: <b>${formatCurrency(totalIncome)}</b></p>
    <p>📉 Pengeluaran: <b>${formatCurrency(totalExpense)}</b></p>
    <p>💳 Metode favorit: <b>${favMethod}</b></p>
  `;

  if (totalExpense > totalIncome) {
    insight += `<p style="color:#d32f2f">⚠️ Pengeluaran lebih besar dari pemasukan.</p>`;
  } else {
    insight += `<p style="color:#2e7d32">👍 Keuanganmu sehat bulan ini.</p>`;
  }

  const el = document.getElementById("insight-content");
  if (el) el.innerHTML = insight;
}

document.getElementById("transaction-form").addEventListener("submit", async function (e) {
  e.preventDefault();

  const description = document.getElementById("description").value;
  const amount = parseFloat(document.getElementById("amount").value) || 0;
  const type = document.getElementById("type").value;
  const payment = document.getElementById("payment-method").value;
  const date = document.getElementById("date").value;

  const newTrans = { date, description, type, payment, amount };

  const dt = new Date(date);
  const monthKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;

  if (!transactions[monthKey]) transactions[monthKey] = [];
  transactions[monthKey].push(newTrans);

  await saveTransactionToFirestore(newTrans);

  this.reset();
  const dateEl = document.getElementById("date");
  if (dateEl) dateEl.valueAsDate = new Date();

  updateDashboard();
  updateHistory();
  updateProfile();
});

const exportBtn = document.getElementById("exportPDF");
if (exportBtn) {
  exportBtn.addEventListener("click", () => {
    exportCurrentMonthPDF();
  });
}

function exportCurrentMonthPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("p", "pt", "a4");

  doc.setFontSize(18);
  doc.text("Laporan Transaksi Bulan Ini", 40, 50);

  let y = 90;
  const monthData = transactions[currentMonth] || [];

  monthData.forEach(t => {
    doc.setFontSize(12);
    doc.text(
      `${formatDate(t.date)} | ${t.description} | ${t.payment} | ${formatCurrency(Number(t.amount || 0))}`,
      40,
      y
    );
    y += 20;
    // jika melebihi halaman, tambahkan halaman baru
    if (y > 750) {
      doc.addPage();
      y = 40;
    }
  });

  doc.save("Laporan-Bulan-Ini.pdf");
}