/** Abstracted clock for testability */
export interface Clock {
  now(): Date;
  isoNow(): string;
}

class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  isoNow(): string {
    return new Date().toISOString();
  }
}

class FixedClock implements Clock {
  constructor(private readonly fixed: Date) {}

  now(): Date {
    return new Date(this.fixed.getTime());
  }

  isoNow(): string {
    return this.fixed.toISOString();
  }
}

let _clock: Clock = new SystemClock();

export function getClock(): Clock {
  return _clock;
}

export function setClock(clock: Clock): void {
  _clock = clock;
}

export function setFixedClock(date: Date): void {
  _clock = new FixedClock(date);
}

export function resetClock(): void {
  _clock = new SystemClock();
}
