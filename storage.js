(function () {
  const config = window.TRAM_AI_CONFIG || {};
  const supabaseUrl = String(config.supabaseUrl || "").replace(/\/+$/, "");
  const supabaseAnonKey = String(config.supabaseAnonKey || "");
  const hasSupabase = Boolean(supabaseUrl && supabaseAnonKey);

  const LOCAL_NOTICE_API_URL = "/api/notices";
  const LOCAL_NOTICE_AUDIO_CLAIM_URL = "/api/notice-audio/claim";

  function toPost(row) {
    return {
      id: row.id,
      title: row.title || "",
      body: row.body || "",
      time: row.notice_time || row.time || "",
      type: row.type || "general",
      featured: Boolean(row.featured),
      audioEnabled: Boolean(row.audio_enabled ?? row.audioEnabled),
      audioRepeatCount: Number(row.audio_repeat_count ?? row.audioRepeatCount ?? 1),
      audioPlayAt: row.audio_play_at || row.audioPlayAt || "",
      createdAt: row.created_at || row.createdAt || new Date().toISOString(),
      updatedAt: row.updated_at || row.updatedAt || ""
    };
  }

  function toNoticeRow(post) {
    return {
      id: String(post.id),
      title: String(post.title || "").trim(),
      body: String(post.body || "").trim(),
      notice_time: String(post.time || "").trim(),
      type: post.type || "general",
      featured: Boolean(post.featured),
      audio_enabled: Boolean(post.audioEnabled),
      audio_repeat_count: normalizeAudioRepeat(post.audioRepeatCount),
      audio_play_at: post.audioPlayAt || null,
      created_at: post.createdAt || new Date().toISOString(),
      updated_at: post.updatedAt || null
    };
  }

  function normalizeAudioRepeat(value) {
    const count = Number(value || 1);
    if (!Number.isFinite(count)) return 1;
    return Math.min(Math.max(Math.round(count), 1), 10);
  }

  async function parseJsonResponse(response) {
    const text = await response.text().catch(() => "");
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return { error: text.slice(0, 200) };
    }
  }

  async function localRequest(path, options) {
    const response = await fetch(path, options);
    const json = await parseJsonResponse(response);
    if (!response.ok) {
      throw new Error(json?.error || `Lỗi máy chủ: ${response.status}`);
    }
    return json;
  }

  async function supabaseRequest(path, options = {}) {
    const response = await fetch(`${supabaseUrl}${path}`, {
      ...options,
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        ...(options.headers || {})
      }
    });
    const json = await parseJsonResponse(response);
    if (!response.ok) {
      const message = Array.isArray(json) ? "" : json?.message || json?.error;
      throw new Error(message || `Lỗi Supabase: ${response.status}`);
    }
    return json;
  }

  async function fetchNotices() {
    if (!hasSupabase) {
      const posts = await localRequest(LOCAL_NOTICE_API_URL, { cache: "no-store" });
      if (!Array.isArray(posts)) throw new Error("Dữ liệu thông báo không hợp lệ.");
      return posts;
    }

    const rows = await supabaseRequest("/rest/v1/notices?select=*&order=created_at.desc", {
      method: "GET"
    });
    if (!Array.isArray(rows)) throw new Error("Dữ liệu thông báo không hợp lệ.");
    return rows.map(toPost);
  }

  async function saveNotices(posts) {
    if (!Array.isArray(posts)) throw new Error("Dữ liệu thông báo không hợp lệ.");

    if (!hasSupabase) {
      const saved = await localRequest(LOCAL_NOTICE_API_URL, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(posts)
      });
      if (!Array.isArray(saved)) throw new Error("Không lưu được thông báo.");
      return saved;
    }

    const rows = posts.map(toNoticeRow);
    const ids = rows.map((row) => row.id);

    if (rows.length) {
      await supabaseRequest("/rest/v1/notices?on_conflict=id", {
        method: "POST",
        body: JSON.stringify(rows)
      });
    }

    const deletePath = ids.length
      ? `/rest/v1/notices?id=not.in.(${ids.map(encodeURIComponent).join(",")})`
      : "/rest/v1/notices?id=not.is.null";
    await supabaseRequest(deletePath, {
      method: "DELETE",
      headers: {
        Prefer: "return=minimal"
      }
    });

    return fetchNotices();
  }

  async function claimNoticeAudio() {
    if (!hasSupabase) {
      return localRequest(LOCAL_NOTICE_AUDIO_CLAIM_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });
    }

    const result = await supabaseRequest("/rest/v1/rpc/claim_notice_audio", {
      method: "POST",
      body: JSON.stringify({})
    });

    return {
      post: result?.post ? toPost(result.post) : null,
      played: Number(result?.played || 0),
      repeatCount: Number(result?.repeatCount || result?.repeat_count || 0),
      nextPlayAt: result?.nextPlayAt || result?.next_play_at || null
    };
  }

  window.TramAiStore = {
    hasSupabase,
    fetchNotices,
    saveNotices,
    claimNoticeAudio
  };
})();
