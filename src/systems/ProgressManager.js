/**
 * Stars / XP / level, persisted through StorageManager.
 * Emits on the shared bus: 'progress' and 'level:up' { level, reward }.
 * (Missions, gifts and unlocks build on this in Phase 6.)
 */
export class ProgressManager {
  constructor(storage, bus) {
    this.storage = storage;
    this.bus = bus;
  }

  get p() {
    return this.storage.data.progress;
  }

  get stars() {
    return this.p.stars;
  }

  get xp() {
    return this.p.xp;
  }

  get level() {
    return this.p.level;
  }

  xpForLevel(level = this.p.level) {
    return 100 + (level - 1) * 50;
  }

  get xpFraction() {
    return Math.min(1, this.p.xp / this.xpForLevel());
  }

  addXP(amount) {
    const p = this.p;
    p.xp += amount;
    p.totalXp += amount;
    let need = this.xpForLevel();
    while (p.xp >= need) {
      p.xp -= need;
      p.level += 1;
      const reward = 10 + p.level * 2;
      p.stars += reward;
      this.bus.emit('level:up', { level: p.level, reward });
      need = this.xpForLevel();
    }
    this._changed();
  }

  addStars(amount) {
    this.p.stars += amount;
    this._changed();
  }

  spendStars(amount) {
    if (this.p.stars < amount) return false;
    this.p.stars -= amount;
    this._changed();
    return true;
  }

  recordLaunch() {
    this.p.totalLaunches += 1;
    this.storage.save();
  }

  reset() {
    this.storage.reset();
    this.bus.resolveSettings();
    this.bus.emit('progress');
    this.bus.emit('settings', 'reset', null);
  }

  _changed() {
    this.storage.save();
    this.bus.emit('progress');
  }
}
