// src/lib/utils/audioAlert.ts

class AudioManager {
  private audioCtx: AudioContext | null = null;
  private soundEnabled: boolean = true;
  private currentAudioElement: HTMLAudioElement | null = null;
  private cachedVoices: SpeechSynthesisVoice[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('bakery_sound_enabled');
      this.soundEnabled = saved !== null ? saved === 'true' : true;

      // Tải và lắng nghe danh sách giọng đọc tiếng Việt của trình duyệt
      if ('speechSynthesis' in window) {
        const loadVoices = () => {
          try {
            this.cachedVoices = window.speechSynthesis.getVoices() || [];
          } catch {}
        };
        loadVoices();
        window.speechSynthesis.onvoiceschanged = loadVoices;
      }

      // Mở khóa AudioContext ngay khi người dùng chạm hoặc click vào màn hình lần đầu
      const unlockAudio = () => {
        try {
          if (!this.audioCtx) {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioContextClass) {
              this.audioCtx = new AudioContextClass();
            }
          }
          if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
          }
        } catch {}
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
      };

      window.addEventListener('click', unlockAudio, { once: true, passive: true });
      window.addEventListener('keydown', unlockAudio, { once: true, passive: true });
      window.addEventListener('touchstart', unlockAudio, { once: true, passive: true });
    }
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          this.audioCtx = new AudioContextClass();
        }
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      return this.audioCtx;
    } catch {
      return null;
    }
  }

  public isEnabled(): boolean {
    return this.soundEnabled;
  }

  public setEnabled(enabled: boolean) {
    this.soundEnabled = enabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem('bakery_sound_enabled', String(enabled));
      window.dispatchEvent(new CustomEvent('bakery_sound_toggle', { detail: { enabled } }));
    }
  }

  /**
   * Âm chuông "Đing Đoong" vui tươi báo có đơn hàng mới (POS & KDS)
   * Tone D5 (587Hz) -> Tone A5 (880Hz) mượt mà ấm áp
   */
  public playNewOrderChime() {
    if (!this.soundEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Note 1: 587.33 Hz (D5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.3, now + 0.03);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.55);

      // Note 2: 880.00 Hz (A5)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.18);
      gain2.gain.setValueAtTime(0, now + 0.18);
      gain2.gain.linearRampToValueAtTime(0.35, now + 0.22);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.18);
      osc2.stop(now + 0.95);
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  /**
   * Âm cảnh báo khẩn cấp (Urgent Delivery Alert)
   * 3 tiếng bíp dồn dập (1046.5 Hz - C6) để nhắc đơn bánh sắp đến giờ giao hoặc trễ hẹn
   */
  public playUrgentAlert() {
    if (!this.soundEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const beeps = [0, 0.15, 0.3];
      beeps.forEach((timeOffset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1046.5, now + timeOffset);
        gain.gain.setValueAtTime(0, now + timeOffset);
        gain.gain.linearRampToValueAtTime(0.3, now + timeOffset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + timeOffset + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + timeOffset);
        osc.stop(now + timeOffset + 0.13);
      });
    } catch (e) {
      console.warn('Urgent sound play error:', e);
    }
  }

  /**
   * Âm chuông "Ting Ting Ting" ngân vang báo nhận tiền chuyển khoản thành công
   * Hợp âm thăng tiến tươi sáng: C6 (1046.5Hz) -> E6 (1318.5Hz) -> G6 (1567.9Hz) -> C7 (2093Hz)
   */
  public playPaymentSuccessChime() {
    if (!this.soundEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const notes = [
        { freq: 1046.5, time: 0, dur: 0.35, gain: 0.25 },
        { freq: 1318.51, time: 0.1, dur: 0.4, gain: 0.28 },
        { freq: 1567.98, time: 0.2, dur: 0.5, gain: 0.32 },
        { freq: 2093.0, time: 0.32, dur: 0.9, gain: 0.35 },
      ];

      notes.forEach(({ freq, time, dur, gain: targetGain }) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + time);

        gainNode.gain.setValueAtTime(0, now + time);
        gainNode.gain.linearRampToValueAtTime(targetGain, now + time + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.0005, now + time + dur);

        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc.start(now + time);
        osc.stop(now + time + dur + 0.05);
      });
    } catch (e) {
      console.warn('Payment success sound play error:', e);
    }
  }

  /**
   * Lấy giọng đọc tiếng Việt tự nhiên và hay nhất trên thiết bị (ưu tiên các giọng Neural / Natural)
   */
  private getBestVietnameseVoice(): SpeechSynthesisVoice | null {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const voices = this.cachedVoices.length > 0 ? this.cachedVoices : window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    const viVoices = voices.filter((v) => v.lang === 'vi-VN' || v.lang.startsWith('vi'));
    if (viVoices.length === 0) return null;

    // Ưu tiên 1: Giọng Hoài My Online (Natural) của Microsoft Edge (Cực kỳ truyền cảm & chuẩn xác)
    const hoaiMy = viVoices.find((v) => v.name.includes('HoaiMy') || (v.name.includes('Natural') && v.name.includes('vi')));
    if (hoaiMy) return hoaiMy;

    // Ưu tiên 2: Giọng Nam Minh Online (Natural)
    const namMinh = viVoices.find((v) => v.name.includes('NamMinh'));
    if (namMinh) return namMinh;

    // Ưu tiên 3: Giọng Google Tiếng Việt (Google Chrome / Android)
    const googleVi = viVoices.find((v) => v.name.includes('Google'));
    if (googleVi) return googleVi;

    // Ưu tiên 4: Giọng Linh (Enhanced) trên Apple iOS / macOS
    const appleEnhanced = viVoices.find((v) => v.name.includes('Enhanced') || v.name.includes('Premium'));
    if (appleEnhanced) return appleEnhanced;

    // Ưu tiên 5: Bất kỳ giọng tiếng Việt nào sẵn có
    return viVoices[0];
  }

  /**
   * Phát âm thanh giọng đọc tiếng Việt qua API proxy Google Assistant (Âm thanh chuẩn người thật, mượt mà và tự nhiên)
   */
  private playOnlineTts(text: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          return resolve(false);
        }

        const audioUrl = `/api/tts?text=${encodeURIComponent(text)}`;
        const audio = new Audio(audioUrl);
        audio.playbackRate = 1.0;
        this.currentAudioElement = audio;

        let finished = false;
        const finalize = (ok: boolean) => {
          if (!finished) {
            finished = true;
            if (this.currentAudioElement === audio) {
              this.currentAudioElement = null;
            }
            resolve(ok);
          }
        };

        // Timeout 3 giây: nếu mạng yếu thì chuyển ngay sang Web Speech của máy để không bị trễ
        const timeoutId = setTimeout(() => finalize(false), 3000);

        audio.oncanplaythrough = () => {
          clearTimeout(timeoutId);
          audio.play().then(() => finalize(true)).catch(() => finalize(false));
        };

        audio.onerror = () => {
          clearTimeout(timeoutId);
          finalize(false);
        };
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * Phát qua Web Speech API khi offline hoặc dự phòng
   */
  private speakViaWebSpeech(text: string) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'vi-VN';
      utterance.rate = 0.98;
      utterance.pitch = 1.0;

      const bestVoice = this.getBestVietnameseVoice();
      if (bestVoice) {
        utterance.voice = bestVoice;
      }

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Web Speech fallback error:', e);
    }
  }

  /**
   * Đọc thông báo nhận tiền bằng tiếng Việt với giọng đọc tự nhiên, ấm áp và truyền cảm
   * - Loại bỏ hoàn toàn lỗi đọc "âm" mã đơn do dấu gạch ngang (DH-888 -> "đơn hàng 888")
   * - Đọc số tiền chuẩn văn phong giao dịch thu ngân (ví dụ: "150 nghìn đồng")
   * - Ưu tiên giọng nữ AI Google Assistant mượt mà, fallback sang giọng Microsoft Edge Natural / Web Speech
   */
  public async speakPaymentSuccess(amount: number, orderCode?: string): Promise<void> {
    if (!this.soundEnabled || typeof window === 'undefined') return;

    const formattedAmount = formatAmountForSpeech(amount);
    const cleanCode = cleanOrderCodeForSpeech(orderCode);

    let text = `Đã nhận thành công ${formattedAmount}`;
    if (cleanCode) {
      text += `, đơn hàng ${cleanCode}`;
    }

    // 1. Dừng âm thanh đang phát trước đó để không bị đè âm
    if (this.currentAudioElement) {
      try {
        this.currentAudioElement.pause();
        this.currentAudioElement.currentTime = 0;
      } catch {}
      this.currentAudioElement = null;
    }
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }

    // 2. Thử phát giọng đọc AI Google Assistant trực tuyến (chuẩn, ấm áp, không bị máy móc)
    const playedOnline = await this.playOnlineTts(text);
    if (playedOnline) return;

    // 3. Fallback: Phát qua Web Speech API trình duyệt với giọng tự nhiên nhất
    this.speakViaWebSpeech(text);
  }

  /**
   * Âm cảnh báo lỗi / sai sót
   */
  public playAlertTone() {
    this.playUrgentAlert();
  }

  /**
   * Âm báo thành công thao tác
   */
  public playSuccessTone() {
    this.playPaymentSuccessChime();
  }
}

export const soundManager = new AudioManager();

/**
 * Chuyển số tiền sang cách đọc tiếng Việt tự nhiên và chuẩn mực cho loa thông báo thu ngân.
 * Ví dụ: 150000 -> "150 nghìn đồng", 1250000 -> "1 triệu 250 nghìn đồng"
 */
export function formatAmountForSpeech(amount: number): string {
  const n = Math.round(Number(amount || 0));
  if (n <= 0) return '0 đồng';

  if (n >= 1000000) {
    const millions = Math.floor(n / 1000000);
    const remainder = n % 1000000;
    const thousands = Math.floor(remainder / 1000);
    const sub = remainder % 1000;
    let res = `${millions} triệu`;
    if (thousands > 0) res += ` ${thousands} nghìn`;
    if (sub > 0) res += ` ${sub}`;
    return `${res} đồng`;
  }

  if (n >= 1000) {
    const thousands = Math.floor(n / 1000);
    const remainder = n % 1000;
    let res = `${thousands} nghìn`;
    if (remainder > 0) res += ` ${remainder}`;
    return `${res} đồng`;
  }

  return `${n} đồng`;
}

/**
 * Chuẩn hóa mã đơn hàng để giọng đọc phát âm chuẩn tiếng Việt:
 * - Với mã đơn có chuỗi ngày tháng như #BK-20260919-653: tự động bóc tách lấy 3-4 số đuôi "653" để đọc ngắn gọn, rõ ràng
 * - Tuyệt đối loại bỏ dấu gạch nối để không bao giờ bị đọc nhầm thành số "âm"
 * - Ví dụ: "#BK-20260919-653" -> "653", "DH-888" -> "888"
 */
export function cleanOrderCodeForSpeech(orderCode?: string): string {
  if (!orderCode) return '';
  let str = String(orderCode).trim().replace(/^#+/, '').trim();

  // 1. Định dạng mã đơn tiệm bánh kèm ngày tháng: BK-20260919-653, BK-SHIP-20260919-653, DH-20260919-888
  // Bóc tách lấy đúng số thứ tự đơn trong ngày (ví dụ: '653') để loa quầy gọi đúng số trên hóa đơn
  const dateSuffixMatch = str.match(/(?:20\d{2}[-_]?\d{2}[-_]?\d{2})[-_]+([A-Za-z0-9]+)$/i);
  if (dateSuffixMatch && dateSuffixMatch[1]) {
    return dateSuffixMatch[1];
  }

  // 2. Loại bỏ các tiền tố thông dụng kèm gạch nối: DH-, BK-SHIP-, BK-PRE-, BK-, POS-, ORD-, HD-, ĐH-, DON-
  let clean = str
    .replace(/^(DH|BK-SHIP-|BK-PRE-|BK|POS|ORD|HD|ĐH|DON|ĐƠN)[-_ ]*/i, '')
    .trim();

  // 3. Thay thế toàn bộ dấu gạch ngang (-), gạch dưới (_), chấm (.) bằng khoảng trắng
  // để TTS tuyệt đối không bao giờ nhận diện thành số âm
  clean = clean.replace(/[-_./\\]+/g, ' ').trim();

  return clean;
}

