// Supabase authentication: login screen with "Continue with Google",
// plus showing the signed-in user's name and profile picture.
(() => {
  const SUPABASE_URL = "https://oyffhrvjiyzkmkoahkvx.supabase.co";
  // Publishable key: safe to expose in the browser (access is governed by RLS).
  const SUPABASE_KEY = "sb_publishable_gEm0GmFP06Pr7RoCKX7Zdw_ZW_s3m45";
  const GUEST_KEY = "fau-weather:guest";

  const $ = (id) => document.getElementById(id);
  const screen = $("login-screen");
  const googleBtn = $("google-btn");
  const guestBtn = $("guest-btn");
  const loginError = $("login-error");
  const userChip = $("user-chip");
  const signOutBtn = $("signout-btn");
  const signInBtn = $("signin-btn");

  const storage = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };

  const showLogin = () => { screen.hidden = false; document.body.classList.add("login-open"); };
  const hideLogin = () => { screen.hidden = true; document.body.classList.remove("login-open"); };

  function profileFrom(user) {
    if (!user) return null;
    const m = user.user_metadata || {};
    return {
      name: m.full_name || m.name || (user.email ? user.email.split("@")[0] : "Owl"),
      firstName: (m.full_name || m.name || "").split(" ")[0] || null,
      avatar: m.avatar_url || m.picture || null,
      email: user.email || "",
    };
  }

  function setAvatar(img, profile) {
    if (profile && profile.avatar) {
      img.src = profile.avatar;
      img.alt = `${profile.name}'s profile picture`;
      img.hidden = false;
    } else {
      img.removeAttribute("src");
      img.hidden = true;
    }
  }

  function render(user) {
    const profile = profileFrom(user);
    window.fauUser = profile;

    if (profile) {
      storage.del(GUEST_KEY);
      hideLogin();
      userChip.hidden = false;
      signInBtn.hidden = true;
      $("user-name").textContent = profile.name;
      setAvatar($("user-avatar"), profile);
      setAvatar($("welcome-avatar"), profile);
      document.querySelector(".welcome").classList.toggle("has-avatar", !!profile.avatar);
    } else {
      userChip.hidden = true;
      signInBtn.hidden = false;
      setAvatar($("welcome-avatar"), null);
      document.querySelector(".welcome").classList.remove("has-avatar");
      if (storage.get(GUEST_KEY)) hideLogin(); else showLogin();
    }
    document.dispatchEvent(new CustomEvent("fau:user", { detail: profile }));
  }

  // Guest mode works even if the Supabase library fails to load.
  guestBtn.addEventListener("click", () => { storage.set(GUEST_KEY, "1"); render(null); });
  signInBtn.addEventListener("click", () => { storage.del(GUEST_KEY); showLogin(); });

  if (!window.supabase || !window.supabase.createClient) {
    googleBtn.disabled = true;
    loginError.textContent = "Sign-in is unavailable right now. You can continue as a guest.";
    render(null);
    return;
  }

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true },
  });

  googleBtn.addEventListener("click", async () => {
    loginError.textContent = "";
    googleBtn.disabled = true;
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (error) {
      googleBtn.disabled = false;
      loginError.textContent = error.message || "Couldn't start Google sign-in.";
    }
  });

  signOutBtn.addEventListener("click", async () => {
    await client.auth.signOut();
    storage.del(GUEST_KEY);
    render(null);
  });

  // Surface OAuth errors returned in the redirect URL.
  const params = new URLSearchParams(window.location.search + "&" + window.location.hash.slice(1));
  if (params.get("error_description")) loginError.textContent = params.get("error_description");

  client.auth.onAuthStateChange((event, session) => {
    // Clean the ?code=… from the address bar after the OAuth redirect.
    if (event === "SIGNED_IN" && /[?&](code|error)=/.test(window.location.search)) {
      history.replaceState(null, "", window.location.pathname);
    }
    render(session ? session.user : null);
  });
})();
