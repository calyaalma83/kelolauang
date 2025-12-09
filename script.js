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
let currentPage = 1;
const rowsPerPage = 10;
let transactionsData = [];

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

    let month = data.month;
    if (!month && data.date) {
      const dt = new Date(data.date);
      month = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    }

    if (!month) month = getCurrentMonth();
    if (!transactions[month]) transactions[month] = [];

    transactions[month].push({
      ...data,
      id: docItem.id,
      month: month
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
  // --- RESET BULANAN: cek apakah reset perlu dijalankan ---
  const today = new Date();
  const isFirstDay = today.getDate() === 1;

  const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const lastResetMonth = localStorage.getItem("last_reset_month");

  // Reset hanya sekali di tanggal 1
  const shouldReset = isFirstDay && lastResetMonth !== currentMonthKey;

  if (shouldReset) {
    localStorage.setItem("last_reset_month", currentMonthKey);

    const elTotalIncome = document.getElementById("total-income");
    const elTotalExpense = document.getElementById("total-expense");
    const elBalance = document.getElementById("balance");

    if (elTotalIncome) elTotalIncome.textContent = "Rp 0";
    if (elTotalExpense) elTotalExpense.textContent = "Rp 0";
    if (elBalance) elBalance.textContent = "Rp 0";

    const tbody = document.getElementById("transactions-body");
    if (tbody) tbody.innerHTML = "";

    transactionsData = [];
    currentPage = 1;
    renderPagination(0);

    const insightEl = document.getElementById("insight-content");
    if (insightEl) insightEl.innerHTML = "<p style='color:#777'>Belum ada data bulan ini</p>";

    return; // stop → tidak hitung transaksi bulan lalu
  }

  // --- LANJUT NORMAL ---
  const monthData = transactions[currentMonth] || [];
  const filterEl = document.getElementById("filter-method");
  const filterMethod = filterEl ? filterEl.value : "all";

  const filtered = filterMethod === "all"
    ? monthData
    : monthData.filter(t => t.payment === filterMethod);

  let totalIncome = 0;
  let totalExpense = 0;

  filtered.forEach(t => {
    if (t.type === "income") totalIncome += Number(t.amount || 0);
    else totalExpense += Number(t.amount || 0);
  });

  const elTotalIncome = document.getElementById("total-income");
  const elTotalExpense = document.getElementById("total-expense");
  const elBalance = document.getElementById("balance");

  if (elTotalIncome) elTotalIncome.textContent = formatCurrency(totalIncome);
  if (elTotalExpense) elTotalExpense.textContent = formatCurrency(totalExpense);
  if (elBalance) elBalance.textContent = formatCurrency(totalIncome - totalExpense);

  transactionsData = filtered.map(t => ({
    date: t.date,
    description: t.description,
    type: t.type,
    payment: t.payment,
    amount: t.amount,
    id: t.id
  }));

  currentPage = 1;
  renderTransactions();

  generateSmartInsight();
}

const filterEl = document.getElementById("filter-method");
if (filterEl) filterEl.addEventListener("change", updateDashboard);

function updateHistory() {
  const grid = document.getElementById("month-grid");
  if (!grid) return;
  grid.innerHTML = "";

  const keys = Object.keys(transactions).sort();

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

  const photo = localUser.photoURL || (user && user.photoURL) || `https://ui-avatars.com/api/?background=1976d2&color=fff&name=${encodeURIComponent(name)}`;

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
  let totalExpense = 0;

  Object.values(transactions).forEach(data => {
    totalTransactions += data.length;
    data.forEach(t => {
      methods[t.payment] = (methods[t.payment] || 0) + 1;
      if (t.type === "income") {
        totalIncome += Number(t.amount || 0);
      } else if (t.type === "expense") {
        totalExpense += Number(t.amount || 0);
      }
    });
  });

  const favMethod = Object.keys(methods).length
    ? Object.keys(methods).reduce((a, b) => (methods[a] > methods[b] ? a : b))
    : "-";

  const months = Object.keys(transactions).length;

  document.getElementById("profile-total-transactions").textContent = totalTransactions;
  document.getElementById("profile-total-months").textContent = months;
  document.getElementById("profile-fav-method").textContent = favMethod;

  document.getElementById("profile-total-income").textContent = formatCurrency(totalIncome);
  document.getElementById("profile-total-expense").textContent = formatCurrency(totalExpense);
  document.getElementById("profile-balance").textContent = formatCurrency(totalIncome - totalExpense);

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

  const balance = totalIncome - totalExpense;

  // Hitung metode favorit
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

  // Persentase sisa
  let percent = 0;
  if (totalIncome > 0) {
    percent = (balance / totalIncome) * 100;
  }

  let status = "";

  if (balance < 0) {
    status = `<p style="color:#d32f2f">❌ Pengeluaran lebih besar dari pemasukan! Awas overspending.</p>`;
  } 
  else if (percent < 1) {
    status = `<p style="color:#d32f2f">🔥 Sisa saldo hampir habis. Kamu perlu lebih mengontrol pengeluaran.</p>`;
  }
  else if (percent < 10) {
    status = `<p style="color:#ff9800">⚠️ Sisa saldo sangat tipis. Hati-hati ya.</p>`;
  }
  else if (percent < 30) {
    status = `<p style="color:#4caf50">🙂 Keuanganmu stabil, tetap pertahankan.</p>`;
  }
  else {
    status = `<p style="color:#2e7d32">👍 Keuanganmu sangat sehat bulan ini!</p>`;
  }

  const insight = `
    <p>📈 Pemasukan: <b>${formatCurrency(totalIncome)}</b></p>
    <p>📉 Pengeluaran: <b>${formatCurrency(totalExpense)}</b></p>
    <p>💳 Metode favorit: <b>${favMethod}</b></p>
    ${status}
  `;

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

  const dt = new Date(date);
  const monthKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;

  const newTrans = { date, description, type, payment, amount, month: monthKey }; // <-- FIX

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

function toggleTips() {
  const box = document.getElementById("tips-content");
  const arrow = document.getElementById("tips-arrow");

  if (box.style.display === "block") {
      box.style.display = "none";
      arrow.classList.remove("rotate");
  } else {
      box.style.display = "block";
      arrow.classList.add("rotate");
  }
}
window.toggleTips = toggleTips;

function toggleFAQ(element) {
  const faqItem = element.closest(".faq-item");
  if (!faqItem) return;

  const answer = faqItem.querySelector(".faq-answer");

  // Tutup FAQ lain
  document.querySelectorAll(".faq-item").forEach(item => {
    if (item !== faqItem) {
      item.classList.remove("faq-open");
      const a = item.querySelector(".faq-answer");
      if (a) a.style.display = "none";
    }
  });

  // Toggle yang diklik
  const isOpen = faqItem.classList.contains("faq-open");

  if (isOpen) {
    faqItem.classList.remove("faq-open");
    answer.style.display = "none";
  } else {
    faqItem.classList.add("faq-open");
    answer.style.display = "block";
  }
}

// WAJIB biar bisa dipanggil dari HTML
window.toggleFAQ = toggleFAQ;

function toggleFAQBox() {
  const faqBox = document.getElementById("faq-box");
  const arrow = document.getElementById("faq-main-arrow");

  if (!faqBox || !arrow) return;

  const isOpen = faqBox.style.display === "block";

  if (isOpen) {
      faqBox.style.display = "none";
      arrow.classList.remove("rotate");
  } else {
      faqBox.style.display = "block";
      arrow.classList.add("rotate");
  }
}
window.toggleFAQBox = toggleFAQBox;

document.getElementById("profile-image-input").addEventListener("change", async function () {
    const file = this.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const base64 = e.target.result; // hasil gambar base64

        // simpan ke localStorage
        let localUser = JSON.parse(localStorage.getItem("keloladuit_user") || "{}");
        localUser.photoURL = base64;
        localStorage.setItem("keloladuit_user", JSON.stringify(localUser));

        // update tampilan profil
        updateProfile();

        alert("Foto berhasil diperbarui (disimpan di perangkat kamu)!");
    };

    reader.readAsDataURL(file);
});

function toggleEditProfile() {
    const box = document.getElementById("edit-profile-box");
    const arrow = document.getElementById("edit-profile-arrow");

    if (box.style.display === "block") {
        box.style.display = "none";
        arrow.classList.remove("rotate");
    } else {
        box.style.display = "block";
        arrow.classList.add("rotate");

        // isi otomatis
        const user = window.getFirebaseUser();
        const localUser = JSON.parse(localStorage.getItem("keloladuit_user") || "{}");

        document.getElementById("edit-username-input").value =
            localUser.fullname || user?.displayName || "";

        document.getElementById("edit-email-input").value =
            localUser.email || user?.email || "";
    }
}
window.toggleEditProfile = toggleEditProfile;

document.getElementById("save-profile-btn").addEventListener("click", async () => {
    const newName = document.getElementById("edit-username-input").value.trim();
    const newEmail = document.getElementById("edit-email-input").value.trim();

    const user = window.getFirebaseUser();
    if (!user) return alert("Kamu belum login.");

    try {
        // Update Firebase Auth (username)
        if (newName && newName !== user.displayName) {
            await window.updateFirebaseProfile({ displayName: newName });
        }

        // Update Firebase Auth (email)
        if (newEmail && newEmail !== user.email) {
            await window.updateFirebaseEmail(newEmail);
        }

        // Simpan ke localStorage
        let localUser = JSON.parse(localStorage.getItem("keloladuit_user") || "{}");
        localUser.fullname = newName;
        localUser.email = newEmail;
        localStorage.setItem("keloladuit_user", JSON.stringify(localUser));

        updateProfile();
        alert("Profil berhasil diperbarui!");

    } catch (err) {
        console.error(err);
        alert("Gagal memperbarui profil.");
    }
});

function renderPagination(totalRows) {
  const totalPages = Math.ceil(totalRows / rowsPerPage);
  const paginationContainer = document.getElementById("pagination");

  paginationContainer.innerHTML = "";

  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    btn.className = "pagination-btn";

    if (i === currentPage) btn.classList.add("active");

    btn.addEventListener("click", () => {
      currentPage = i;
      renderTransactions();
    });

    paginationContainer.appendChild(btn);
  }
}

function renderTransactions() {
  const tbody = document.getElementById("transactions-body");
  tbody.innerHTML = "";

  transactionsData.sort((a, b) => new Date(a.date) - new Date(b.date));

  const start = (currentPage - 1) * rowsPerPage;
  const end = start + rowsPerPage;

  const pageItems = transactionsData.slice(start, end);

  pageItems.forEach((t) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${t.date}</td>
      <td>${t.description}</td>
      <td class="${t.type}">${t.type === "income" ? "Pemasukan" : "Pengeluaran"}</td>
      <td>${t.payment}</td>
      <td>${formatCurrency(t.amount)}</td>
      <td><button class="delete-btn" onclick="deleteTransaction('${t.id}')">Hapus</button></td>
    `;
    tbody.appendChild(row);
  });

  renderPagination(transactionsData.length);
}