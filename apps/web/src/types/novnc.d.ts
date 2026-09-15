declare module "@novnc/novnc/lib/rfb.js" {
  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, url: string, options?: { credentials?: { password?: string } });
    disconnect(): void;
    scaleViewport: boolean;
    resizeSession: boolean;
    viewOnly: boolean;
  }
}
