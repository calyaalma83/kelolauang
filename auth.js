import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  deleteDoc,
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDhZ9g5_Y7y-fh5eQupLip9GPeDDD4FlJY",
  authDomain: "keloladuit-bae7e.firebaseapp.com",
  projectId: "keloladuit-bae7e",
  storageBucket: "keloladuit-bae7e.firebasestorage.app",
  messagingSenderId: "749191863742",
  appId: "1:749191863742:web:3381fc36a9f6cf6052edef"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore();

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isStrongPassword(password) {
  return password.length >= 8;
}

function saveUserData(userData) {
  localStorage.setItem("keloladuit_user", JSON.stringify(userData));
}

function getUserData() {
  const userData = localStorage.getItem("keloladuit_user");
  return userData ? JSON.parse(userData) : null;
}

function showNotification(message, type = "success") {
  const existingNotif = document.querySelector(".notification");
  if (existingNotif) existingNotif.remove();

  const notification = document.createElement("div");
  notification.className = `notification ${type}`;
  notification.innerHTML = `
    <span>${message}</span>
    <button class="close-notif">&times;</button>
  `;

  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === "success" ? "#43a047" : "#d32f2f"};
    color: white;
    padding: 16px 20px;
    border-radius: 10px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    z-index: 10000;
    display: flex;
    align-items: center;
    gap: 15px;
    font-family: 'Inter', sans-serif;
    font-size: 14px;
    font-weight: 500;
    animation: slideInRight 0.3s ease-out;
    max-width: 350px;
  `;

  document.body.appendChild(notification);

  if (!document.getElementById("notification-styles")) {
    const style = document.createElement("style");
    style.id = "notification-styles";
    style.textContent = `
      @keyframes slideInRight {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOutRight {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
      }
      .close-notif {
        background: none;
        border: none;
        color: white;
        font-size: 24px;
        cursor: pointer;
        padding: 0;
        line-height: 1;
      }
      .close-notif:hover { opacity: 0.8; }
    `;
    document.head.appendChild(style);
  }

  setTimeout(() => {
    notification.style.animation = "slideOutRight 0.3s ease-out";
    setTimeout(() => notification.remove(), 300);
  }, 4000);

  notification.querySelector(".close-notif").addEventListener("click", () => {
    notification.style.animation = "slideOutRight 0.3s ease-out";
    setTimeout(() => notification.remove(), 300);
  });
}

onAuthStateChanged(auth, (user) => {
  const currentPath = window.location.pathname;
  const isLoginPage = currentPath.includes("login.html");
  const isRegisterPage = currentPath.includes("register.html");
  const isIndexPage = currentPath.includes("index.html") || currentPath.endsWith("/");

  if (!user && isIndexPage) {
    showNotification("Silakan login terlebih dahulu!", "error");
    setTimeout(() => (window.location.href = "login.html"), 800);
    return;
  }

  if (user && (isLoginPage || isRegisterPage)) {
    showNotification("Anda sudah login!", "success");
    setTimeout(() => (window.location.href = "index.html"), 800);
    return;
  }

  if (user && isIndexPage) {
    // simpan minimal info ke localStorage agar script utama bisa menampilkan nama/foto
    const userData = {
      email: user.email || "",
      uid: user.uid || "",
      displayName: user.displayName || null,
      photoURL: user.photoURL || null
    };

    // jika displayName kosong tapi ada fullname di localStorage (mis. registrasi lokal), gunakan itu
    const local = getUserData();
    if (!userData.displayName && local && (local.fullname || local.displayName)) {
      userData.displayName = local.fullname || local.displayName;
    }

    saveUserData(userData);

    if (window.startFinanceApp) {
      window.startFinanceApp();
    }
    if (window.updateProfile) {
        window.updateProfile();
    }
  }
});

const loginForm = document.getElementById("login-form");
if (loginForm) {
  loginForm.addEventListener("submit", function (e) {
    e.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const remember = document.getElementById("remember")?.checked || false;

    if (!isValidEmail(email)) {
      showNotification("Format email tidak valid!", "error");
      return;
    }
    if (password.length < 6) {
      showNotification("Password minimal 6 karakter!", "error");
      return;
    }

    const submitButton = loginForm.querySelector(".btn-primary");
    const originalText = submitButton?.textContent || "Masuk";
    if (submitButton) {
      submitButton.textContent = "Memproses...";
      submitButton.disabled = true;
    }

    signInWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        const user = userCredential.user;

        // simpan data user ke localStorage (ambil displayName kalau ada)
        const userData = {
          email: user.email,
          uid: user.uid,
          displayName: user.displayName || null,
          photoURL: user.photoURL || null,
          remember
        };

        // kalau displayName kosong, coba ambil dari localStorage sebelumnya (mis. registrasi)
        const local = getUserData();
        if (!userData.displayName && local && (local.fullname || local.displayName)) {
          userData.displayName = local.fullname || local.displayName;
        }

        saveUserData(userData);

        showNotification("Login berhasil! Selamat datang kembali 🎉", "success");
        setTimeout(() => (window.location.href = "index.html"), 900);
      })
      .catch((error) => {
        if (submitButton) {
          submitButton.textContent = originalText;
          submitButton.disabled = false;
        }
        console.error("Login error:", error);
        if (error.code === "auth/user-not-found") {
          showNotification("Akun tidak ditemukan! Silakan daftar terlebih dahulu.", "error");
        } else if (error.code === "auth/wrong-password") {
          showNotification("Password salah! Coba lagi.", "error");
        } else if (error.code === "auth/too-many-requests") {
          showNotification("Terlalu banyak percobaan. Coba lagi nanti.", "error");
        } else {
          showNotification("Error: " + error.message, "error");
        }
      });
  });
}

const googleButtons = document.querySelectorAll(".btn-google");
googleButtons.forEach((googleButton) => {
  googleButton.addEventListener("click", function () {
    const provider = new GoogleAuthProvider();

    signInWithPopup(auth, provider)
      .then((result) => {
        const user = result.user;

        // simpan data user lengkap
        const userData = {
          email: user.email || "",
          uid: user.uid || "",
          displayName: user.displayName || "",
          photoURL: user.photoURL || ""
        };

        saveUserData(userData);
        showNotification("Login dengan Google berhasil 🎉", "success");
        setTimeout(() => (window.location.href = "index.html"), 900);
      })
      .catch((error) => {
        console.error("Google login error:", error);
        if (error.code === "auth/popup-closed-by-user") {
          showNotification("Login dibatalkan", "error");
        } else {
          showNotification("Google Login Error: " + error.message, "error");
        }
      });
  });
});

const registerForm = document.getElementById("register-form");
if (registerForm) {
  registerForm.addEventListener("submit", async function (e) {
    e.preventDefault();

    const fullname = document.getElementById("fullname").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirm-password").value;
    const termsAccepted = document.getElementById("terms")?.checked || false;

    if (fullname.length < 3) {
      showNotification("Nama lengkap minimal 3 karakter!", "error");
      return;
    }
    if (!isValidEmail(email)) {
      showNotification("Format email tidak valid!", "error");
      return;
    }
    if (!isStrongPassword(password)) {
      showNotification("Password minimal 8 karakter!", "error");
      return;
    }
    if (password !== confirmPassword) {
      showNotification("Konfirmasi password tidak sama!", "error");
      return;
    }
    if (!termsAccepted) {
      showNotification("Harap setujui syarat & ketentuan!", "error");
      return;
    }

    const submitButton = registerForm.querySelector(".btn-primary");
    const originalText = submitButton?.textContent || "Daftar";
    if (submitButton) {
      submitButton.textContent = "Mendaftar...";
      submitButton.disabled = true;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // update displayName di Firebase Auth agar user.displayName terisi
      await updateProfile(user, { displayName: fullname });

      // simpan juga ke localStorage
      saveUserData({
        fullname,
        email: user.email,
        uid: user.uid,
        displayName: fullname
      });

      showNotification("Registrasi berhasil! Selamat datang di KelolaDuit 🎉", "success");
      setTimeout(() => (window.location.href = "index.html"), 1000);
    } catch (error) {
      if (submitButton) {
        submitButton.textContent = originalText;
        submitButton.disabled = false;
      }
      console.error("Registration error:", error);
      if (error.code === "auth/email-already-in-use") {
        showNotification("Email sudah terdaftar! Silakan login.", "error");
      } else if (error.code === "auth/weak-password") {
        showNotification("Password terlalu lemah!", "error");
      } else {
        showNotification("Error: " + error.message, "error");
      }
    }
  });

  // Real-time password validation (UI)
  const passwordInput = document.getElementById("password");
  const confirmPasswordInput = document.getElementById("confirm-password");
  if (confirmPasswordInput && passwordInput) {
    confirmPasswordInput.addEventListener("input", function () {
      if (this.value && passwordInput.value !== this.value) {
        this.style.borderColor = "#d32f2f";
      } else if (this.value && passwordInput.value === this.value) {
        this.style.borderColor = "#43a047";
      } else {
        this.style.borderColor = "#e0e0e0";
      }
    });
  }
}

window.getFirebaseUser = function () {
  return auth.currentUser;
};

window.logoutUser = function () {
  if (confirm("Yakin ingin keluar?")) {
    signOut(auth)
      .then(() => {
        localStorage.removeItem("keloladuit_user");
        showNotification("Logout berhasil!", "success");
        setTimeout(() => (window.location.href = "login.html"), 800);
      })
      .catch((error) => {
        console.error("Logout error:", error);
        showNotification("Error logout: " + error.message, "error");
      });
  }
};

/* Toggle password (jika elemen ada di halaman auth) */
const toggleEls = document.querySelectorAll(".toggle-password");
toggleEls.forEach((el) => {
  el.addEventListener("click", () => {
    const targetId = el.dataset.target;
    const fld = document.getElementById(targetId);
    if (fld) fld.type = fld.type === "password" ? "text" : "password";
  });
});

window.deleteUserAccount = async function () {
  const user = auth.currentUser;
  if (!user) return alert("User tidak ditemukan!");

  if (!confirm("⚠️ Yakin ingin menghapus akun Anda? Semua data akan hilang permanen.")) {
    return;
  }

  const uid = user.uid;

  try {
    const transCol = collection(db, "users", uid, "transactions");
    const snapshot = await getDocs(transCol);

    const deletePromises = [];
    snapshot.forEach(docItem => {
      deletePromises.push(deleteDoc(docItem.ref));
    });

    await Promise.all(deletePromises);
    await deleteDoc(doc(db, "users", uid));
    await deleteUser(user);

    alert("Akun berhasil dihapus permanen.");
    window.location.href = "login.html";
  }

  catch (err) {
    console.error(err);
    if (err.code === "auth/requires-recent-login") {
      alert("⚠️ Anda harus login ulang sebelum bisa menghapus akun.");
    } else {
      alert("Gagal menghapus akun.Coba lagi.")
    }
  }
};