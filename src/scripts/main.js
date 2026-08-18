// 站点交互脚本（移植自参考站 karfanjara.ge 的 app.js）
// 滚动进度条 / 顶栏毛玻璃 / 移动菜单 / 滚动揭示 / FAQ 手风琴 / 灯箱放大

(function () {
  const prog = document.getElementById('progress');
  const hdr = document.getElementById('hdr');
  const heroBg = document.getElementById('heroBg');
  let ticking = false;

  function onScroll() {
    const st = window.scrollY;
    const h = document.documentElement.scrollHeight - window.innerHeight;
    if (prog) prog.style.width = (st / h) * 100 + '%';
    if (hdr) hdr.classList.toggle('scrolled', st > 12);
    if (heroBg && st < window.innerHeight) {
      heroBg.style.transform = 'translateY(' + st * 0.16 + 'px)';
    }
    ticking = false;
  }
  addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        requestAnimationFrame(onScroll);
        ticking = true;
      }
    },
    { passive: true }
  );
  onScroll();

  // 入场动画标记
  document.body.classList.add('loaded');

  // 移动菜单
  const burger = document.getElementById('burger');
  if (burger) {
    burger.addEventListener('click', () =>
      document.body.classList.toggle('menu-open')
    );
    document
      .querySelectorAll('#mobileMenu a')
      .forEach((a) => a.addEventListener('click', () => document.body.classList.remove('menu-open')));
  }

  // 锚点导航：滚动完全交给浏览器原生行为（CSS scroll-behavior: smooth +
  // scroll-padding-top 补偿固定 header）。这样即使本脚本未加载/出错，
  // 锚点仍能正常工作（参考站 karfanjara.ge 即采用此健壮方案）。
  // 这里只在点击后关闭移动菜单，绝不拦截默认滚动。
  document.querySelectorAll('.nav a, .mobile-menu a').forEach((a) => {
    a.addEventListener('click', () => document.body.classList.remove('menu-open'));
  });

  // 滚动揭示
  const io = new IntersectionObserver(
    (es) => {
      es.forEach((e) => {
        if (e.isIntersecting) {
          const el = e.target;
          const sibs = [...el.parentElement.children].filter((c) =>
            c.classList.contains('reveal')
          );
          const idx = sibs.indexOf(el);
          el.style.transitionDelay = (idx > 0 ? idx * 0.08 : 0) + 's';
          el.classList.add('in');
          io.unobserve(el);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -8% 0px' }
  );
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  // FAQ 手风琴
  document.querySelectorAll('.q-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const q = btn.closest('.q');
      document
        .querySelectorAll('.q.open')
        .forEach((o) => {
          if (o !== q) o.classList.remove('open');
        });
      q.classList.toggle('open');
    });
  });

  // 灯箱：图集 / 案例墙 / 详情页主图
  const galNodes = [].slice.call(
    document.querySelectorAll('.rgal .item, .pmarquee .ptile')
  );
  const heroWrap = document.querySelector('.ihero');
  const heroImg = heroWrap ? heroWrap.querySelector('.ihero-bg img') : null;
  if (galNodes.length || heroImg) {
    const EN = document.documentElement.lang === 'en';
    const ES = document.documentElement.lang === 'es';
    const seen = {};
    const list = [];
    function add(s, alt) {
      if (!s) return -1;
      if (seen[s] == null) {
        seen[s] = list.length;
        list.push({ src: s, alt: alt || '' });
      }
      return seen[s];
    }
    const heroIdx = heroImg ? add(heroImg.getAttribute('src'), heroImg.getAttribute('alt')) : -1;
    galNodes.forEach((n) => {
      const im = n.querySelector('img');
      if (!im) return;
      n._i = add(im.getAttribute('src'), im.getAttribute('alt'));
    });

    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.setAttribute('aria-hidden', 'true');
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    lb.setAttribute('aria-label', EN ? 'Gallery' : ES ? 'Galería' : '图库');
    lb.innerHTML =
      '<button class="lb-close" type="button" aria-label="' +
      (EN ? 'Close' : ES ? 'Cerrar' : '关闭') +
      '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
      '<button class="lb-nav lb-prev" type="button" aria-label="' +
      (EN ? 'Previous' : ES ? 'Anterior' : '上一张') +
      '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>' +
      '<figure class="lb-stage"><img alt=""><figcaption class="lb-cap"></figcaption></figure>' +
      '<button class="lb-nav lb-next" type="button" aria-label="' +
      (EN ? 'Next' : ES ? 'Siguiente' : '下一张') +
      '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg></button>';
    document.body.appendChild(lb);

    const lim = lb.querySelector('img');
    const lcap = lb.querySelector('.lb-cap');
    let cur = 0;
    const single = list.length < 2;
    if (single) {
      lb.querySelector('.lb-prev').style.display = 'none';
      lb.querySelector('.lb-next').style.display = 'none';
    }
    function show(i) {
      cur = (i + list.length) % list.length;
      lim.src = list[cur].src;
      lim.alt = list[cur].alt;
      lcap.textContent = list[cur].alt;
    }
    function open(i) {
      show(i);
      lb.classList.add('open');
      lb.setAttribute('aria-hidden', 'false');
      document.body.classList.add('lb-open');
    }
    function close() {
      lb.classList.remove('open');
      lb.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('lb-open');
    }
    galNodes.forEach((n) => {
      n.addEventListener('click', (e) => {
        e.preventDefault();
        open(n._i);
      });
    });
    if (heroImg && heroIdx >= 0) {
      heroWrap.addEventListener('click', (e) => {
        if (e.target.closest('a,button,.btn,[role="button"],input,select,textarea,iframe,label'))
          return;
        open(heroIdx);
      });
    }
    lb.querySelector('.lb-close').addEventListener('click', close);
    lb.querySelector('.lb-prev').addEventListener('click', (e) => {
      e.stopPropagation();
      show(cur - 1);
    });
    lb.querySelector('.lb-next').addEventListener('click', (e) => {
      e.stopPropagation();
      show(cur + 1);
    });
    lb.addEventListener('click', (e) => {
      if (e.target === lb || e.target.tagName === 'FIGURE') close();
    });
    document.addEventListener('keydown', (e) => {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft' && !single) show(cur - 1);
      else if (e.key === 'ArrowRight' && !single) show(cur + 1);
    });
  }

  // 联系表单：Cloudflare Turnstile 校验 + 独立 Worker 提交（action 已在服务端渲染为 Worker 地址）
  const form = document.querySelector('form[data-contact]');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const ok = form.querySelector('.form-ok');
      const btn = form.querySelector('button[type="submit"]');
      const data = Object.fromEntries(new FormData(form).entries());
      btn.disabled = true;
      btn.textContent = '…';
      try {
        const res = await fetch(form.action, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (res.ok) {
          form.reset();
          if (ok) ok.style.display = 'block';
        } else {
          alert('提交失败，请稍后重试或直接通过电话 / WhatsApp 联系我们。');
        }
      } catch (err) {
        alert('网络错误，请稍后重试。');
      } finally {
        btn.disabled = false;
        btn.textContent = btn.dataset.label || '提交';
      }
    });
  }

  // 联系信息动态渲染：运行时 fetch /data/contact.json（由 Decap CMS 编辑）
  // 服务端已用 SITE 常量渲染默认值，这里用 CMS 值覆盖，实现"改 JSON 即生效"。
  function applyContactSettings() {
    const lang = document.documentElement.lang === 'zh-CN' ? 'zh' : document.documentElement.lang === 'es' ? 'es' : 'en';
    fetch('/data/contact.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (!c) return;
        // 文本字段（hours / tagline 按语言取对应值）
        document.querySelectorAll('[data-cfg]').forEach((el) => {
          const key = el.getAttribute('data-cfg');
          let val = c[key];
          if (key === 'hours') val = lang === 'zh' ? c.hoursZh : lang === 'es' ? c.hoursEs : c.hoursEn;
          else if (key === 'tagline') val = lang === 'zh' ? c.taglineZh : lang === 'es' ? c.taglineEs : c.taglineEn;
          if (val == null || val === '') return;
          if (key === 'hours') el.innerHTML = val.replace(',', '<br />');
          else el.textContent = val;
        });
        // 链接字段（tel / email / whatsapp / 社交）
        document.querySelectorAll('[data-cfg-link]').forEach((el) => {
          const kind = el.getAttribute('data-cfg-link');
          if (kind === 'tel' && c.phone) {
            el.href = 'tel:' + c.phone;
          } else if (kind === 'email' && c.email) {
            el.href = 'mailto:' + c.email;
          } else if (kind === 'whatsapp' && c.whatsapp) {
            const txt = lang === 'zh' ? c.waTextZh || '' : lang === 'es' ? c.waTextEs || '' : c.waTextEn || '';
            el.href = 'https://wa.me/' + c.whatsapp + '?text=' + encodeURIComponent(txt);
          } else if (
            (kind === 'facebook' || kind === 'instagram' || kind === 'tiktok' || kind === 'youtube') &&
            c[kind]
          ) {
            el.href = c[kind];
          }
        });
      })
      .catch(() => { /* 读取失败则保留服务端默认值 */ });
  }
  applyContactSettings();

  // 报价表单：提交到独立 Worker 的 /api/quote（KV 存储 + 邮件通知）
  const qfForm = document.querySelector('form[data-quote]');
  if (qfForm) {
    qfForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const okEl = qfForm.querySelector('.qf-ok');
      const btn = qfForm.querySelector('.qf-submit');
      const data = Object.fromEntries(new FormData(qfForm).entries());
      btn.disabled = true;
      btn.textContent = '…';
      try {
        const res = await fetch(qfForm.action, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const json = await res.json();
        if (json.ok) {
          qfForm.reset();
          if (okEl) { okEl.style.display = 'block'; }
        } else {
          alert(json.error || '提交失败，请稍后重试或直接联系我们。');
        }
      } catch (err) {
        alert('网络错误，请稍后重试。');
      } finally {
        btn.disabled = false;
        btn.textContent = btn.dataset.label || 'Submit';
      }
    });
  }
})();
