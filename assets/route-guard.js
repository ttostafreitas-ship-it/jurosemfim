(() => {
  if (document.body.dataset.page === "login") return;
  document.documentElement.style.visibility = "hidden";
  supabase.auth.getSession().then(({ data, error }) => {
    if (error || !data.session) {
      window.location.replace("login.html");
      return;
    }
    document.documentElement.style.visibility = "visible";
  });
})();
