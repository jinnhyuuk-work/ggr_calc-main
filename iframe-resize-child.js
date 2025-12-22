(() => {
  const MESSAGE_TYPE = "GGR_IFRAME_SIZE";
  const DEFAULT_PARENT_ORIGIN = "https://ggr.kr";
  const parentOrigin = (() => {
    const referrer = typeof document === "undefined" ? "" : document.referrer;
    if (!referrer) return DEFAULT_PARENT_ORIGIN;
    try {
      return new URL(referrer).origin;
    } catch {
      return DEFAULT_PARENT_ORIGIN;
    }
  })();

  function calcDocHeight() {
    const de = document.documentElement;
    const b = document.body;
    return Math.max(
      de.scrollHeight, de.offsetHeight,
      b ? b.scrollHeight : 0,
      b ? b.offsetHeight : 0
    );
  }

  function createHeightSender() {
    let lastHeight = 0;
    let scheduled = false;

    const sendHeight = () => {
      scheduled = false;
      const height = calcDocHeight();
      if (height === lastHeight) return;
      lastHeight = height;
      if (!window.parent || window.parent === window) return;
      window.parent.postMessage(
        { type: MESSAGE_TYPE, height },
        parentOrigin
      );
    };

    return () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(sendHeight);
    };
  }

  if (typeof window === "undefined") return;

  const scheduleSendHeight = createHeightSender();

  window.addEventListener("load", scheduleSendHeight);
  window.addEventListener("resize", scheduleSendHeight);

  if ("ResizeObserver" in window) {
    const ro = new ResizeObserver(() => scheduleSendHeight());
    ro.observe(document.documentElement);
  }

  setTimeout(scheduleSendHeight, 300);
  setTimeout(scheduleSendHeight, 1000);
})();
