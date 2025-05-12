(function () {
  const FINDIP_TOKEN = "REPLACEME";
  const ipRegex = /([0-9]{1,3}(?:\.[0-9]{1,3}){3})/;
  const seenIPs = new Set();

  function isValidPublicIPv4(ip) {
    const octets = ip.split('.').map(Number);
    if (octets.length !== 4 || octets.some(o => o < 0 || o > 255)) return false;
    const [a, b] = octets;
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    ) return false;
    return true;
  }

  const originalRTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;
  if (!originalRTCPeerConnection) {
    console.warn("[X] WebRTC not supported in this browser.");
    return;
  }

  async function geoLookup(ip) {
    if (seenIPs.has(ip)) return;
    seenIPs.add(ip);
    try {
      const target = encodeURIComponent(`https://api.findip.net/${ip}/?token=${FINDIP_TOKEN}`);
      const proxyUrl = `https://corsproxy.io/?url=${target}`;
      const res = await fetch(proxyUrl);
      if (!res.ok) {
        console.error(`[X] HTTP error ${res.status} fetching location for IP ${ip}`);
        return;
      }
      let data;
      try {
        data = await res.json();
      } catch (parseErr) {
        console.error(`[X] Failed to parse JSON for IP ${ip}:`, parseErr);
        return;
      }

      const city = data?.city?.names?.en ?? "Unknown City";
      const country = data?.country?.names?.en ?? "Unknown Country";

      console.log(`[+] WebRTC IP: ${ip} — ${city}, ${country}`);
    } catch (err) {
      console.error(`[X] Failed to fetch location for IP ${ip}:`, err);
    }
  }

  function hookICE(pc) {
    const origAddIce = pc.addIceCandidate;
    pc.addIceCandidate = function (candidate, ...args) {
      if (candidate && candidate.candidate) {
        const match = ipRegex.exec(candidate.candidate);
        if (match && match[1]) {
          const ip = match[1];
          if (isValidPublicIPv4(ip)) {
            geoLookup(ip);
          } else {
            console.log(`[!] Skipped non-public IP: ${ip}`);
          }
        }
      }
      return origAddIce.call(this, candidate, ...args);
    };
  }

  window.RTCPeerConnection = function (...args) {
    const pc = new originalRTCPeerConnection(...args);
    hookICE(pc);
    return pc;
  };
  window.RTCPeerConnection.prototype = originalRTCPeerConnection.prototype;

  console.log("[+] WebRTC IP monitor initialized (only public IPv4 addresses via CORS proxy)");
})();
