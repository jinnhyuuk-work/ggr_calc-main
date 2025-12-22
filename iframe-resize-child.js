(() => {
  const MESSAGE_TYPE = "GGR_IFRAME_SIZE";
  const PARENT_ORIGIN = "https://ggr.kr";

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
      window.parent?.postMessage(
        { type: MESSAGE_TYPE, height },
        PARENT_ORIGIN
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
