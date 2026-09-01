(function(){
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------- year ---------- */
  var yearEl = document.getElementById("year");
  if(yearEl){ yearEl.textContent = new Date().getFullYear(); }

  /* ---------- mobile menu ---------- */
  var menu = document.getElementById("mobileMenu");
  var openBtn = document.getElementById("menuOpen");
  var closeBtn = document.getElementById("menuClose");
  if(!menu || !openBtn || !closeBtn){ menu = null; }

  function setMenu(open){
    if(!menu) return;
    menu.dataset.open = String(open);
    openBtn.setAttribute("aria-expanded", String(open));
    document.body.style.overflow = open ? "hidden" : "";
    if(open){ closeBtn.focus(); } else { openBtn.focus(); }
  }
  if(menu){
  openBtn.addEventListener("click", function(){ setMenu(true); });
  closeBtn.addEventListener("click", function(){ setMenu(false); });
  menu.addEventListener("click", function(e){
    if(e.target.tagName === "A"){ setMenu(false); }
  });
  document.addEventListener("keydown", function(e){
    if(e.key === "Escape" && menu.dataset.open === "true"){ setMenu(false); }
  });
  /* keep focus inside the open menu */
  menu.addEventListener("keydown", function(e){
    if(e.key !== "Tab" || menu.dataset.open !== "true") return;
    var f = menu.querySelectorAll("a[href], button");
    if(!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  });
  }

  /* ---------- waitlist forms ---------- */
  document.querySelectorAll("form[data-waitlist]").forEach(function(form){
    var input  = form.querySelector('input[type="email"]');
    var btn    = form.querySelector('button[type="submit"]');
    var label  = btn.querySelector("[data-label]");
    var status = form.querySelector(".form-status");
    var idle   = label.textContent;

    function say(msg, tone){
      status.textContent = msg;
      if(tone){ status.dataset.tone = tone; } else { delete status.dataset.tone; }
    }
    function busy(on){
      btn.disabled = on;
      label.textContent = on ? "Sending" : idle;
      var sp = btn.querySelector(".spinner");
      if(on && !sp){
        sp = document.createElement("span");
        sp.className = "spinner";
        sp.setAttribute("aria-hidden","true");
        btn.insertBefore(sp, label);
      } else if(!on && sp){ sp.remove(); }
    }

    input.addEventListener("input", function(){
      if(status.textContent){ say(""); }
      input.setAttribute("aria-invalid","false");
    });

    form.addEventListener("submit", function(e){
      var action = form.getAttribute("action") || "";

      /* Not wired up yet: say so plainly instead of failing silently. */
      if(action.indexOf("YOUR_FORM_ID") !== -1){
        e.preventDefault();
        say("This form is not connected yet. Add your Formspree ID in index.html.", "err");
        return;
      }
      if(!input.value || !input.checkValidity()){
        e.preventDefault();
        input.setAttribute("aria-invalid","true");
        say("Please enter a valid email address.", "err");
        input.focus();
        return;
      }
      /* fetch submit so the page never navigates away */
      e.preventDefault();
      busy(true);
      say("");
      fetch(action, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" }
      }).then(function(res){
        if(res.ok){
          form.querySelector(".field-row").style.display = "none";
          var note = form.querySelector(".form-note");
          if(note){ note.style.display = "none"; }
          say("You are on the list. We will email you once, when the founding batch opens.", "ok");
        } else {
          return res.json().then(function(d){
            throw new Error((d.errors && d.errors[0] && d.errors[0].message) || "Something went wrong.");
          });
        }
      }).catch(function(err){
        busy(false);
        say(err.message + " Please try again, or email us directly.", "err");
      });
    });
  });

  /* ---------- carousels ---------- */
  document.querySelectorAll("[data-rail]").forEach(function(rail){
    var prev = document.querySelector('[data-rail-prev="' + rail.id + '"]');
    var next = document.querySelector('[data-rail-next="' + rail.id + '"]');
    if(!prev || !next) return;

    function step(){
      var item = rail.firstElementChild;
      if(!item) return 320;
      var gap = parseFloat(getComputedStyle(rail).columnGap) || 16;
      return item.getBoundingClientRect().width + gap;
    }
    function syncNav(){
      var first = rail.firstElementChild, last = rail.lastElementChild;
      if(!first || !last) return;
      var cs = getComputedStyle(rail);
      var padL = parseFloat(cs.paddingLeft) || 0;
      var padR = parseFloat(cs.paddingRight) || 0;
      var rr = rail.getBoundingClientRect();
      var atStart = first.getBoundingClientRect().left >= rr.left + padL - 2;
      var atEnd   = last.getBoundingClientRect().right <= rr.right - padR + 2;
      prev.disabled = atStart;
      next.disabled = atEnd;
      /* everything already fits: hide the controls rather than show two
         permanently dead buttons */
      prev.parentNode.style.visibility = (atStart && atEnd) ? "hidden" : "";
    }
    function go(dir){
      rail.scrollBy({ left: dir * step(), behavior: reduce.matches ? "auto" : "smooth" });
    }
    prev.addEventListener("click", function(){ go(-1); });
    next.addEventListener("click", function(){ go(1); });
    rail.addEventListener("scroll", function(){ window.requestAnimationFrame(syncNav); }, { passive:true });
    window.addEventListener("resize", syncNav, { passive:true });
    syncNav();
  });

  /* ---------- measurement marquee ----------
     One row at every width. If the seven items fit, they are centred and left
     alone: there is nothing to scroll past, so scrolling would be noise. If
     they would overflow, the set is cloned until the track is at least twice
     the viewport, so a full set is always waiting off-screen, and the track
     travels exactly one set width. That is what makes the wrap invisible.
     Clones are aria-hidden, so the list is announced once.               */
  document.querySelectorAll("[data-marquee]").forEach(function(viewport){
    var track = viewport.querySelector(".specs-track");
    if(!track) return;

    var originals = [].slice.call(track.children);
    if(!originals.length) return;
    var SPEED = 45;                     /* px per second */
    var clones = [];

    function measureSet(){
      var w = 0;
      originals.forEach(function(li){ w += li.getBoundingClientRect().width; });
      return w;
    }

    function build(){
      lastWidth = viewport.clientWidth;
      clones.forEach(function(c){ c.remove(); });
      clones = [];
      track.classList.remove("is-running");
      track.style.removeProperty("--marquee-distance");
      track.style.removeProperty("--marquee-duration");

      var setWidth = measureSet();
      if(!setWidth) return;

      /* fits: centre the row, no clones, no animation */
      if(setWidth <= viewport.clientWidth){
        viewport.classList.remove("is-marquee");
        track.classList.add("is-static");
        return;
      }

      /* overflows: mask the edges either way, so the cut reads as a fade */
      track.classList.remove("is-static");
      viewport.classList.add("is-marquee");

      /* reduced motion: leave it as a row the reader scrolls by hand */
      if(reduce.matches) return;

      var needed = Math.max(2, Math.ceil((viewport.clientWidth * 2) / setWidth) + 1);
      for(var copy = 1; copy < needed; copy++){
        originals.forEach(function(li){
          var c = li.cloneNode(true);
          c.setAttribute("aria-hidden", "true");
          track.appendChild(c);
          clones.push(c);
        });
      }
      track.style.setProperty("--marquee-distance", setWidth + "px");
      track.style.setProperty("--marquee-duration", (setWidth / SPEED) + "s");
      track.classList.add("is-running");
    }

    var t, lastWidth = -1;
    /* Only width matters here: the clone count, the distance and the duration
       are all derived from widths. Height must be ignored, because mobile
       browsers fire resize every time the URL bar slides in or out during a
       scroll. Rebuilding on that re-adds .is-running, which restarts the
       animation at translateX(0), and the row visibly snaps back to the start
       the moment the reader lifts their finger. */
    window.addEventListener("resize", function(){
      if(Math.abs(viewport.clientWidth - lastWidth) <= 1) return;
      window.clearTimeout(t);
      t = window.setTimeout(build, 200);
    }, { passive:true });

    if(reduce.addEventListener){ reduce.addEventListener("change", build); }

    /* fonts change the measured width, so rebuild once they have loaded */
    if(document.fonts && document.fonts.ready){ document.fonts.ready.then(build); }
    build();
  });

  /* ---------- email addresses ----------
     The address is stored reversed so no address-shaped string sits in the
     markup for a harvester to regex out, and is assembled here into a real
     mailto link. Anyone running a scraper with a JS engine will still get it;
     this only stops the naive ones. Without JS the readable "sales at canary
     dot earth" text stays, which a person can still use.              */
  document.querySelectorAll("[data-mail]").forEach(function(el){
    var parts = el.getAttribute("data-mail").split("").reverse().join("").split(":");
    if(parts.length !== 2) return;
    var addr = parts[0] + String.fromCharCode(64) + parts[1];
    var a = document.createElement("a");
    a.href = "mailto:" + addr;
    a.textContent = addr;
    a.className = el.className;
    el.parentNode.replaceChild(a, el);
  });

  /* ---------- device readout carousel ----------
     The device is static; the readouts slide behind its window. Every
     transition writes its own final state, so hammering the buttons can
     never leave a slide stranded mid-animation.                        */
  document.querySelectorAll("[data-carousel]").forEach(function(root){
    var slides = [].slice.call(root.querySelectorAll("[data-slide]"));
    var caps   = [].slice.call(root.querySelectorAll("[data-cap]"));
    var dots   = [].slice.call(root.querySelectorAll("[data-dot]"));
    var prev   = root.querySelector("[data-prev]");
    var next   = root.querySelector("[data-next]");
    var play   = root.querySelector("[data-play]");
    var pLabel = root.querySelector("[data-play-label]");
    var iPause = root.querySelector("[data-icon-pause]");
    var iPlay  = root.querySelector("[data-icon-play]");
    var status = root.querySelector("[data-status]");
    var count  = root.querySelector("[data-count]");
    var n = slides.length;
    if(!n) return;

    var active = 0, timer = null, userPaused = false, onScreen = false;
    var DELAY = 4500, OFFSET = 7;   /* % the readouts travel */

    function park(el, pct){
      el.style.transition = "none";
      el.style.transform  = "translateX(" + pct + "%)";
      el.style.opacity    = "0";
      void el.offsetHeight;          /* flush, so the next change animates */
      el.style.transition = "";
    }
    function show(i, dir, announce){
      i = ((i % n) + n) % n;
      if(i === active && slides[i].hasAttribute("data-active")) return;
      var incoming = slides[i], outgoing = slides[active];

      if(outgoing && outgoing !== incoming){
        outgoing.removeAttribute("data-active");
        outgoing.style.transform = "translateX(" + (dir > 0 ? -OFFSET : OFFSET) + "%)";
        outgoing.style.opacity = "0";
        outgoing.style.zIndex = "1";
        outgoing.setAttribute("aria-hidden", "true");
      }
      park(incoming, dir > 0 ? OFFSET : -OFFSET);
      incoming.setAttribute("data-active", "");
      incoming.style.transform = "translateX(0)";
      incoming.style.opacity = "1";
      incoming.style.zIndex = "2";
      incoming.setAttribute("aria-hidden", "false");

      active = i;
      caps.forEach(function(c, k){
        if(k === active){ c.setAttribute("data-active",""); } else { c.removeAttribute("data-active"); }
      });
      dots.forEach(function(d, k){ d.setAttribute("aria-current", k === active ? "true" : "false"); });
      if(count){ count.textContent = (active + 1) + " / " + n; }
      if(announce && status){
        var tag = caps[active].querySelector(".sensor-tag");
        status.textContent = (active + 1) + " of " + n + ": " + (tag ? tag.textContent : "");
      }
    }
    function stop(){ if(timer){ window.clearInterval(timer); timer = null; } }
    function start(){
      stop();
      if(userPaused || reduce.matches || !onScreen) return;
      timer = window.setInterval(function(){ show(active + 1, 1, false); }, DELAY);
    }
    function setPaused(paused){
      userPaused = paused;
      play.setAttribute("aria-pressed", String(paused));
      pLabel.textContent = paused ? "Play the readout carousel" : "Pause the readout carousel";
      iPause.style.display = paused ? "none" : "";
      iPlay.style.display  = paused ? "" : "none";
      if(paused){ stop(); } else { start(); }
    }

    prev.addEventListener("click", function(){ show(active - 1, -1, true); start(); });
    next.addEventListener("click", function(){ show(active + 1,  1, true); start(); });
    dots.forEach(function(d, k){
      d.addEventListener("click", function(){
        show(k, k > active ? 1 : -1, true); start();
      });
    });
    play.addEventListener("click", function(){ setPaused(!userPaused); });

    root.addEventListener("mouseenter", stop);
    root.addEventListener("mouseleave", start);
    root.addEventListener("focusin", stop);
    root.addEventListener("focusout", function(e){
      if(!root.contains(e.relatedTarget)) start();
    });
    root.addEventListener("keydown", function(e){
      if(e.key === "ArrowLeft"){ e.preventDefault(); show(active - 1, -1, true); }
      else if(e.key === "ArrowRight"){ e.preventDefault(); show(active + 1, 1, true); }
    });

    /* swipe across the device */
    var dragX = null;
    root.addEventListener("pointerdown", function(e){ dragX = e.clientX; });
    root.addEventListener("pointerup", function(e){
      if(dragX === null) return;
      var dx = e.clientX - dragX; dragX = null;
      if(Math.abs(dx) > 40){ show(active + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1, true); start(); }
    });
    root.addEventListener("pointercancel", function(){ dragX = null; });

    if("IntersectionObserver" in window){
      new IntersectionObserver(function(es){
        onScreen = es[0].isIntersecting;
        if(onScreen){ start(); } else { stop(); }
      }, { threshold: 0.25 }).observe(root);
    } else { onScreen = true; }

    if(reduce.addEventListener){
      reduce.addEventListener("change", function(){
        if(reduce.matches){ setPaused(true); } else { start(); }
      });
    }

    slides.forEach(function(el, k){
      el.setAttribute("aria-hidden", k === 0 ? "false" : "true");
    });
    /* show() short-circuits for the slide that is already active, so seed
       the counter here rather than leaving it blank until the first change */
    if(count){ count.textContent = "1 / " + n; }
    if(reduce.matches){ setPaused(true); } else { start(); }
  });

  /* ---------- scroll reveal ---------- */
  var targets = document.querySelectorAll(".reveal");
  if(reduce.matches || !("IntersectionObserver" in window)){
    targets.forEach(function(el){ el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(en.isIntersecting){ en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });
    targets.forEach(function(el){ io.observe(el); });
    window.setTimeout(function(){
      targets.forEach(function(el){
        var r = el.getBoundingClientRect();
        if(r.top < window.innerHeight && r.bottom > 0){ el.classList.add("in"); }
      });
    }, 1200);
  }
})();
