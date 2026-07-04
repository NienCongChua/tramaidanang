const STORAGE_KEY = "tram_ai_commune_posts";
const AUTH_KEY = "tram_ai_admin_authenticated";
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "xa@2026";

const defaultPosts = [
  {
    id: "seed-main",
    title: "Ngày mai vào lúc 07:00 họp dân tại Nhà Văn Hóa bản",
    body: "Kính đề nghị bà con sắp xếp thời gian tham dự đầy đủ.",
    time: "02/07/2026",
    type: "meeting",
    featured: true,
    createdAt: "2026-07-01T10:25:00.000Z"
  },
  {
    id: "seed-health",
    title: "Lịch tiêm phòng cho đàn gia súc đợt 2",
    body: "Thời gian: 05/07/2026",
    time: "05/07/2026",
    type: "health",
    featured: false,
    createdAt: "2026-07-01T09:10:00.000Z"
  },
  {
    id: "seed-weather",
    title: "Cảnh báo nguy cơ sạt lở đất",
    body: "Từ ngày 03/07 - 05/07, hạn chế đi qua taluy cao khi mưa lớn.",
    time: "03/07 - 05/07",
    type: "weather",
    featured: false,
    createdAt: "2026-07-01T08:15:00.000Z"
  },
  {
    id: "seed-agri",
    title: "Hướng dẫn phòng trừ sâu bệnh hại ngô",
    body: "Xem chi tiết tại trạm hoặc liên hệ cán bộ nông nghiệp.",
    time: "Trong tuần",
    type: "agriculture",
    featured: false,
    createdAt: "2026-07-01T07:40:00.000Z"
  }
];

const loginScreen = document.querySelector("#loginScreen");
const adminApp = document.querySelector("#adminApp");
const loginForm = document.querySelector("#loginForm");
const usernameInput = document.querySelector("#usernameInput");
const passwordInput = document.querySelector("#passwordInput");
const loginError = document.querySelector("#loginError");
const logoutButton = document.querySelector("#logoutButton");
const form = document.querySelector("#noticeForm");
const formTitle = document.querySelector("#formTitle");
const titleInput = document.querySelector("#titleInput");
const bodyInput = document.querySelector("#bodyInput");
const timeInput = document.querySelector("#timeInput");
const typeInput = document.querySelector("#typeInput");
const featuredInput = document.querySelector("#featuredInput");
const resetButton = document.querySelector("#resetButton");
const seedButton = document.querySelector("#seedButton");
const adminList = document.querySelector("#adminList");
const postCountText = document.querySelector("#postCountText");

let editingId = null;

function isAuthenticated() {
  return sessionStorage.getItem(AUTH_KEY) === "true";
}

function showLogin() {
  loginScreen.hidden = false;
  adminApp.hidden = true;
  usernameInput.focus();
}

function showAdmin() {
  loginScreen.hidden = true;
  adminApp.hidden = false;
  ensureSeedPosts();
  renderAdminList();
}

function handleLogin(event) {
  event.preventDefault();
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    sessionStorage.setItem(AUTH_KEY, "true");
    loginError.textContent = "";
    loginForm.reset();
    showAdmin();
    return;
  }

  loginError.textContent = "Sai tài khoản hoặc mật khẩu.";
}

function handleLogout() {
  sessionStorage.removeItem(AUTH_KEY);
  resetForm();
  showLogin();
}

function ensureSeedPosts() {
  if (!localStorage.getItem(STORAGE_KEY)) {
    savePosts(defaultPosts);
  }
}

function loadPosts() {
  ensureSeedPosts();
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function savePosts(posts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function typeName(type) {
  return {
    meeting: "Họp dân",
    health: "Y tế",
    weather: "Cảnh báo",
    agriculture: "Nông nghiệp",
    general: "Thông tin chung"
  }[type] || "Thông tin chung";
}

function resetForm() {
  editingId = null;
  formTitle.textContent = "Tạo thông báo mới";
  form.reset();
  featuredInput.checked = false;
  form.querySelector(".primary-button").textContent = "Đăng thông báo";
}

function renderAdminList() {
  const posts = loadPosts().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  postCountText.textContent = `${posts.length} thông báo`;

  if (!posts.length) {
    adminList.innerHTML = `<div class="empty-state">Chưa có thông báo nào</div>`;
    return;
  }

  adminList.innerHTML = posts
    .map((post) => `
      <article class="admin-item">
        <div>
          <h3>${escapeHtml(post.title)}</h3>
          <p>${escapeHtml(post.body)}</p>
        </div>
        <div class="item-meta">
          <span class="pill">${typeName(post.type)}</span>
          ${post.featured ? '<span class="pill">Đang ghim</span>' : ""}
          <span>${escapeHtml(post.time || "Không đặt thời gian")}</span>
        </div>
        <div class="item-actions">
          <button class="tiny-button" type="button" data-action="edit" data-id="${post.id}">Sửa</button>
          <button class="tiny-button" type="button" data-action="pin" data-id="${post.id}">Ghim</button>
          <button class="tiny-button delete" type="button" data-action="delete" data-id="${post.id}">Xóa</button>
        </div>
      </article>
    `)
    .join("");
}

function upsertPost(event) {
  event.preventDefault();
  if (!isAuthenticated()) {
    showLogin();
    return;
  }

  const posts = loadPosts();
  const isFeatured = featuredInput.checked;
  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();
  const time = timeInput.value.trim();
  const type = typeInput.value;

  if (!title || !body) return;

  const normalized = isFeatured ? posts.map((post) => ({ ...post, featured: false })) : posts;

  if (editingId) {
    const updated = normalized.map((post) =>
      post.id === editingId
        ? {
            ...post,
            title,
            body,
            time,
            type,
            featured: isFeatured,
            updatedAt: new Date().toISOString()
          }
        : post
    );
    savePosts(updated);
  } else {
    savePosts([
      {
        id: `post-${Date.now()}`,
        title,
        body,
        time,
        type,
        featured: isFeatured,
        createdAt: new Date().toISOString()
      },
      ...normalized
    ]);
  }

  resetForm();
  renderAdminList();
}

function handleListClick(event) {
  if (!isAuthenticated()) {
    showLogin();
    return;
  }

  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const { action, id } = button.dataset;
  const posts = loadPosts();
  const post = posts.find((item) => item.id === id);
  if (!post) return;

  if (action === "edit") {
    editingId = id;
    formTitle.textContent = "Sửa thông báo";
    titleInput.value = post.title;
    bodyInput.value = post.body;
    timeInput.value = post.time || "";
    typeInput.value = post.type || "general";
    featuredInput.checked = Boolean(post.featured);
    form.querySelector(".primary-button").textContent = "Lưu thay đổi";
    titleInput.focus();
  }

  if (action === "pin") {
    savePosts(posts.map((item) => ({ ...item, featured: item.id === id })));
    renderAdminList();
  }

  if (action === "delete") {
    savePosts(posts.filter((item) => item.id !== id));
    if (editingId === id) resetForm();
    renderAdminList();
  }
}

loginForm.addEventListener("submit", handleLogin);
logoutButton.addEventListener("click", handleLogout);
form.addEventListener("submit", upsertPost);
resetButton.addEventListener("click", resetForm);
seedButton.addEventListener("click", () => {
  if (!isAuthenticated()) {
    showLogin();
    return;
  }
  savePosts(defaultPosts);
  resetForm();
  renderAdminList();
});
adminList.addEventListener("click", handleListClick);

if (isAuthenticated()) {
  showAdmin();
} else {
  showLogin();
}
