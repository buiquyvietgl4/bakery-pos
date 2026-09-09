// src/lib/utils/wakeLock.ts

class ScreenWakeLockService {
  private sentinel: any = null;
  private isRequested: boolean = false;

  public async requestWakeLock(): Promise<boolean> {
    if (typeof window === 'undefined' || !('wakeLock' in navigator)) {
      return false;
    }

    try {
      this.sentinel = await (navigator as any).wakeLock.request('screen');
      this.isRequested = true;

      this.sentinel.addEventListener('release', () => {
        this.sentinel = null;
        this.isRequested = false;
        console.log('WakeLock released');
      });

      console.log('✅ Screen WakeLock active - Màn hình điện thoại sẽ luôn sáng không bị khóa');
      return true;
    } catch (err) {
      console.warn('WakeLock request error:', err);
      return false;
    }
  }

  public releaseWakeLock() {
    if (this.sentinel) {
      try {
        this.sentinel.release();
      } catch {}
      this.sentinel = null;
      this.isRequested = false;
      console.log('Screen WakeLock released');
    }
  }

  public isActive(): boolean {
    return this.isRequested && this.sentinel !== null;
  }
}

export const screenWakeLock = new ScreenWakeLockService();
