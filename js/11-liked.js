// ===== Yêu thích (Liked): nút trái tim cạnh nút Lyric + lưu danh sách bài đã thích =====
(function () {
    const LIKE_KEY = 'mp_liked_v1';
    const keyOf = (t) => (t && (t.nativeLocation || t.rawName || t.name || '')).toLowerCase();
    let likedSet = new Set();
    try { likedSet = new Set(JSON.parse(localStorage.getItem(LIKE_KEY) || '[]')); } catch (e) {}
    const save = () => { try { localStorage.setItem(LIKE_KEY, JSON.stringify(Array.from(likedSet))); } catch (e) {} };

    window.__isLiked = (t) => !!t && likedSet.has(keyOf(t));
    window.__toggleLiked = function (t) {
        if (!t) return false;
        const k = keyOf(t); if (!k) return false;
        const on = !likedSet.has(k);
        if (on) likedSet.add(k); else likedSet.delete(k);
        save();
        syncBtn();
        document.dispatchEvent(new Event('mp-liked-changed'));
        return on;
    };

    const btn = document.getElementById('like-btn');
    function syncBtn() {
        if (!btn) return;
        const t = (typeof playlist !== 'undefined' && typeof currentIndex !== 'undefined') ? playlist[currentIndex] : null;
        const on = window.__isLiked(t);
        btn.classList.toggle('liked', on);
        btn.disabled = !t;
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    window.__syncLikeBtn = syncBtn;
    if (btn) {
        btn.addEventListener('click', () => {
            const t = playlist[currentIndex];
            if (!t) return;
            const on = window.__toggleLiked(t);
            const isEn = /^en/i.test(localStorage.getItem('settings_language') || '');
            try { showToast(on ? (isEn ? 'Added to Liked' : 'Đã thêm vào Yêu thích') : (isEn ? 'Removed from Liked' : 'Đã bỏ khỏi Yêu thích'), on ? 'favorite' : 'heart_minus', 1800); } catch (e) {}
        });
    }
    ['loadedmetadata', 'play', 'emptied'].forEach(ev => { try { audio.addEventListener(ev, syncBtn); } catch (e) {} });
    syncBtn();
})();
