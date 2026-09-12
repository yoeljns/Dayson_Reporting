"use client";

/** Speak Turkish text with the device voice; resolves when done (or immediately when unsupported). */
export function speak(text: string, opts: { rate?: number } = {}): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !text) return resolve();
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "tr-TR";
      u.rate = opts.rate ?? 1;
      const tr = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith("tr"));
      if (tr) u.voice = tr;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      u.onend = finish;
      u.onerror = finish;
      window.speechSynthesis.speak(u);
      // Safety net: some engines never fire onend.
      setTimeout(finish, Math.min(20000, 1500 + text.length * 90));
    } catch {
      resolve();
    }
  });
}

export function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}
